import * as THREE from 'three';
import { FullscreenQuad, makeShader } from './fullscreen';
import { PingPong } from './gpgpu';

/**
 * GPU上の2D流体ソルバー（Jos Stam「Stable Fluids」系の半ラグランジュ法）。
 *   1. 速度場の移流 → 2. 外力（スプラット・浮力）→ 3. 渦度強調
 *   4. 発散を計算 → 5. 圧力をヤコビ反復で解く → 6. 圧力勾配を引いて非圧縮化
 *   7. 染料（色）を速度場で移流
 * すべて半精度浮動小数点テクスチャのピンポンで計算する。
 */
const COMMON = /* glsl */ `
uniform vec2 uTexel;
varying vec2 vUv;
`;

const ADVECT = /* glsl */ `
${COMMON}
uniform sampler2D tVelocity;
uniform sampler2D tSource;
uniform float uDt;
uniform float uDissipation;
uniform vec2 uVelTexel;
void main() {
  vec2 coord = vUv - uDt * texture2D(tVelocity, vUv).xy * uVelTexel;
  gl_FragColor = vec4(texture2D(tSource, coord).rgb / (1.0 + uDissipation * uDt), 1.0);
}
`;

const SPLAT = /* glsl */ `
${COMMON}
uniform sampler2D tState;
uniform vec2 uPoint;
uniform vec3 uValue;
uniform float uRadius;
uniform float uAspect;
void main() {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 base = texture2D(tState, vUv).rgb;
  gl_FragColor = vec4(base + uValue * exp(-dot(p, p) / uRadius), 1.0);
}
`;

const CURL = /* glsl */ `
${COMMON}
uniform sampler2D tState;
void main() {
  float L = texture2D(tState, vUv - vec2(uTexel.x, 0.0)).y;
  float R = texture2D(tState, vUv + vec2(uTexel.x, 0.0)).y;
  float T = texture2D(tState, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture2D(tState, vUv - vec2(0.0, uTexel.y)).x;
  gl_FragColor = vec4(0.5 * (R - L - T + B), 0.0, 0.0, 1.0);
}
`;

const VORTICITY = /* glsl */ `
${COMMON}
uniform sampler2D tState;
uniform sampler2D tCurl;
uniform float uCurl;
uniform float uDt;
uniform sampler2D tDye;
uniform float uBuoyancy;
void main() {
  float L = texture2D(tCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(tCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture2D(tCurl, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture2D(tCurl, vUv - vec2(0.0, uTexel.y)).x;
  float C = texture2D(tCurl, vUv).x;
  vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
  force /= length(force) + 1e-4;
  force *= uCurl * C;
  force.y *= -1.0;
  vec2 vel = texture2D(tState, vUv).xy + force * uDt;
  vel.y += uBuoyancy * dot(texture2D(tDye, vUv).rgb, vec3(0.33)) * uDt;
  gl_FragColor = vec4(clamp(vel, -1000.0, 1000.0), 0.0, 1.0);
}
`;

const DIVERGENCE = /* glsl */ `
${COMMON}
uniform sampler2D tState;
void main() {
  float L = texture2D(tState, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(tState, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture2D(tState, vUv + vec2(0.0, uTexel.y)).y;
  float B = texture2D(tState, vUv - vec2(0.0, uTexel.y)).y;
  vec2 C = texture2D(tState, vUv).xy;
  // 壁では速度を反転させて境界条件とする
  if (vUv.x - uTexel.x < 0.0) L = -C.x;
  if (vUv.x + uTexel.x > 1.0) R = -C.x;
  if (vUv.y + uTexel.y > 1.0) T = -C.y;
  if (vUv.y - uTexel.y < 0.0) B = -C.y;
  gl_FragColor = vec4(0.5 * (R - L + T - B), 0.0, 0.0, 1.0);
}
`;

const PRESSURE = /* glsl */ `
${COMMON}
uniform sampler2D tState;
uniform sampler2D tDivergence;
void main() {
  float L = texture2D(tState, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(tState, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture2D(tState, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture2D(tState, vUv - vec2(0.0, uTexel.y)).x;
  float div = texture2D(tDivergence, vUv).x;
  gl_FragColor = vec4((L + R + B + T - div) * 0.25, 0.0, 0.0, 1.0);
}
`;

const GRADIENT = /* glsl */ `
${COMMON}
uniform sampler2D tState;
uniform sampler2D tPressure;
void main() {
  float L = texture2D(tPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float R = texture2D(tPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float T = texture2D(tPressure, vUv + vec2(0.0, uTexel.y)).x;
  float B = texture2D(tPressure, vUv - vec2(0.0, uTexel.y)).x;
  vec2 vel = texture2D(tState, vUv).xy - vec2(R - L, T - B);
  gl_FragColor = vec4(vel, 0.0, 1.0);
}
`;

const SCALE = /* glsl */ `
${COMMON}
uniform sampler2D tState;
uniform float uScale;
void main() { gl_FragColor = vec4(texture2D(tState, vUv).rgb * uScale, 1.0); }
`;

export interface FluidStepOptions {
  velocityDissipation?: number;
  dyeDissipation?: number;
  curl?: number;
  pressureIterations?: number;
  buoyancy?: number;
}

export class FluidSim {
  readonly velocity: PingPong;
  readonly dye: PingPong;
  private readonly pressure: PingPong;
  private readonly divergence: PingPong;
  private readonly curlField: PingPong;
  private readonly quad = new FullscreenQuad();
  private readonly mats: THREE.ShaderMaterial[] = [];
  private readonly advect: THREE.ShaderMaterial;
  private readonly splatMat: THREE.ShaderMaterial;
  private readonly curlMat: THREE.ShaderMaterial;
  private readonly vortMat: THREE.ShaderMaterial;
  private readonly divMat: THREE.ShaderMaterial;
  private readonly presMat: THREE.ShaderMaterial;
  private readonly gradMat: THREE.ShaderMaterial;
  private readonly scaleMat: THREE.ShaderMaterial;
  aspect: number;

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    simW: number,
    simH: number,
    dyeW: number,
    dyeH: number,
  ) {
    this.aspect = simW / simH;
    this.velocity = new PingPong(simW, simH, { float: true });
    this.pressure = new PingPong(simW, simH, { float: true });
    this.divergence = new PingPong(simW, simH, { float: true });
    this.curlField = new PingPong(simW, simH, { float: true });
    this.dye = new PingPong(dyeW, dyeH, { float: true });
    const m = (frag: string, u: Record<string, THREE.IUniform>) => {
      const mat = makeShader(frag, { uTexel: { value: new THREE.Vector2(1 / simW, 1 / simH) }, ...u });
      this.mats.push(mat);
      return mat;
    };
    this.advect = m(ADVECT, {
      tVelocity: { value: null },
      tSource: { value: null },
      uDt: { value: 0 },
      uDissipation: { value: 0 },
      uVelTexel: { value: new THREE.Vector2(1 / simW, 1 / simH) },
    });
    this.splatMat = m(SPLAT, {
      tState: { value: null },
      uPoint: { value: new THREE.Vector2() },
      uValue: { value: new THREE.Vector3() },
      uRadius: { value: 0.001 },
      uAspect: { value: this.aspect },
    });
    this.curlMat = m(CURL, { tState: { value: null } });
    this.vortMat = m(VORTICITY, {
      tState: { value: null },
      tCurl: { value: null },
      uCurl: { value: 20 },
      uDt: { value: 0 },
      tDye: { value: null },
      uBuoyancy: { value: 0 },
    });
    this.divMat = m(DIVERGENCE, { tState: { value: null } });
    this.presMat = m(PRESSURE, { tState: { value: null }, tDivergence: { value: null } });
    this.gradMat = m(GRADIENT, { tState: { value: null }, tPressure: { value: null } });
    this.scaleMat = m(SCALE, { tState: { value: null }, uScale: { value: 0.8 } });
  }

  /** 位置(0..1)に速度 force と染料 color を同時に注入する */
  splat(x: number, y: number, fx: number, fy: number, color: THREE.Vector3 | null, radius = 0.0025): void {
    const u = this.splatMat.uniforms;
    u.uPoint.value.set(x, y);
    u.uRadius.value = radius;
    u.uAspect.value = this.aspect;
    u.uValue.value.set(fx, fy, 0);
    this.velocity.step(this.renderer, this.splatMat);
    if (color) {
      u.uValue.value.copy(color);
      this.dye.step(this.renderer, this.splatMat);
    }
  }

  /** 外部テクスチャの内容で染料を置き換える／混ぜる用に、染料バッファへ直接描画する */
  drawDye(material: THREE.ShaderMaterial): void {
    material.uniforms.tState.value = this.dye.read.texture;
    this.quad.render(this.renderer, material, this.dye.write);
    const t = this.dye.read;
    this.dye.read = this.dye.write;
    this.dye.write = t;
  }

  step(dt: number, o: FluidStepOptions = {}): void {
    const r = this.renderer;
    // 渦度強調＋浮力
    this.curlMat.uniforms.tState.value = this.velocity.read.texture;
    this.quad.render(r, this.curlMat, this.curlField.read);
    const v = this.vortMat.uniforms;
    v.tCurl.value = this.curlField.read.texture;
    v.uCurl.value = o.curl ?? 20;
    v.uDt.value = dt;
    v.tDye.value = this.dye.read.texture;
    v.uBuoyancy.value = o.buoyancy ?? 0;
    this.velocity.step(r, this.vortMat);
    // 非圧縮化
    this.divMat.uniforms.tState.value = this.velocity.read.texture;
    this.quad.render(r, this.divMat, this.divergence.read);
    this.scaleMat.uniforms.uScale.value = 0.8;
    this.pressure.step(r, this.scaleMat);
    this.presMat.uniforms.tDivergence.value = this.divergence.read.texture;
    const iters = o.pressureIterations ?? 20;
    for (let i = 0; i < iters; i++) this.pressure.step(r, this.presMat);
    this.gradMat.uniforms.tPressure.value = this.pressure.read.texture;
    this.velocity.step(r, this.gradMat);
    // 移流
    const a = this.advect.uniforms;
    a.uDt.value = dt;
    a.tVelocity.value = this.velocity.read.texture;
    a.tSource.value = this.velocity.read.texture;
    a.uDissipation.value = o.velocityDissipation ?? 0.2;
    this.velocity.step(r, this.advect, 'tSource');
    a.tVelocity.value = this.velocity.read.texture;
    a.uDissipation.value = o.dyeDissipation ?? 0.5;
    this.dye.step(r, this.advect, 'tSource');
  }

  dispose(): void {
    [this.velocity, this.dye, this.pressure, this.divergence, this.curlField].forEach((p) => p.dispose());
    this.mats.forEach((m) => m.dispose());
    this.quad.dispose();
  }
}
