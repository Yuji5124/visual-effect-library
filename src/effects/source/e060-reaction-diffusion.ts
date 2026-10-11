import * as THREE from 'three';
import { FullscreenQuad, makeShader } from '../../engine/fullscreen';
import { PingPong } from '../../engine/gpgpu';
import { GLSL_HASH } from '../../engine/glsl';
import { hexToVec3 } from '../../engine/shaderEffect';
import type { SourceEffect } from '../../engine/types';

const PRESETS: Record<string, [number, number]> = {
  coral: [0.0545, 0.062],
  mitosis: [0.0367, 0.0649],
  maze: [0.029, 0.057],
  spots: [0.035, 0.065],
  waves: [0.014, 0.045],
};

const INIT = /* glsl */ `
${GLSL_HASH}
uniform vec2 uGrid;
uniform float uSeed;
varying vec2 vUv;
void main() {
  vec2 c = floor(vUv * uGrid / 12.0);
  float b = step(0.93, hash12(c + uSeed));
  gl_FragColor = vec4(1.0, b, 0.0, 1.0);
}
`;

const STEP = /* glsl */ `
uniform sampler2D tState;
uniform vec2 uTexel;
uniform float uFeed;
uniform float uKill;
uniform vec3 uBrush; // xy: 位置(0..1), z: 半径(0..1, 0で無効)
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 s = texture2D(tState, vUv).rg;
  vec2 lap = -s;
  lap += 0.2 * (texture2D(tState, vUv + vec2(uTexel.x, 0.0)).rg + texture2D(tState, vUv - vec2(uTexel.x, 0.0)).rg
              + texture2D(tState, vUv + vec2(0.0, uTexel.y)).rg + texture2D(tState, vUv - vec2(0.0, uTexel.y)).rg);
  lap += 0.05 * (texture2D(tState, vUv + uTexel).rg + texture2D(tState, vUv - uTexel).rg
               + texture2D(tState, vUv + vec2(uTexel.x, -uTexel.y)).rg + texture2D(tState, vUv + vec2(-uTexel.x, uTexel.y)).rg);
  float a = s.r, b = s.g;
  float abb = a * b * b;
  float na = a + (1.0 * lap.r - abb + uFeed * (1.0 - a));
  float nb = b + (0.5 * lap.g + abb - (uKill + uFeed) * b);
  if (uBrush.z > 0.0) {
    vec2 d = (vUv - uBrush.xy) * vec2(uAspect, 1.0);
    if (length(d) < uBrush.z) nb = 0.9;
  }
  gl_FragColor = vec4(clamp(na, 0.0, 1.0), clamp(nb, 0.0, 1.0), 0.0, 1.0);
}
`;

const DISPLAY = /* glsl */ `
uniform sampler2D tState;
uniform vec2 uTexel;
uniform vec3 uColorA;
uniform vec3 uColorB;
varying vec2 vUv;
void main() {
  float b = texture2D(tState, vUv).g;
  float bx = texture2D(tState, vUv + vec2(uTexel.x, 0.0)).g - texture2D(tState, vUv - vec2(uTexel.x, 0.0)).g;
  float by = texture2D(tState, vUv + vec2(0.0, uTexel.y)).g - texture2D(tState, vUv - vec2(0.0, uTexel.y)).g;
  vec3 n = normalize(vec3(-bx * 6.0, -by * 6.0, 1.0));
  float v = smoothstep(0.1, 0.4, b);
  vec3 col = mix(uColorA, uColorB, v);
  float light = 0.6 + 0.5 * dot(n, normalize(vec3(-0.5, 0.6, 0.6)));
  float spec = pow(max(dot(reflect(vec3(0.0, 0.0, -1.0), n), normalize(vec3(-0.5, 0.6, 0.6))), 0.0), 20.0);
  gl_FragColor = vec4(col * light + spec * 0.4 * v, 1.0);
}
`;

const effect: SourceEffect = {
  id: '060',
  kind: 'source',
  status: 'implemented',
  params: [
    {
      key: 'preset',
      label: 'プリセット',
      type: 'select',
      options: [
        { value: 'coral', label: 'サンゴ' },
        { value: 'mitosis', label: '細胞分裂' },
        { value: 'maze', label: '迷路' },
        { value: 'spots', label: '斑点' },
        { value: 'waves', label: '波' },
        { value: 'custom', label: 'カスタム（下の値）' },
      ],
      default: 'coral',
    },
    { key: 'feed', label: 'Feed率', type: 'number', min: 0.005, max: 0.1, step: 0.0005, default: 0.0545 },
    { key: 'kill', label: 'Kill率', type: 'number', min: 0.03, max: 0.075, step: 0.0005, default: 0.062 },
    { key: 'iterations', label: '1フレームの反復数', type: 'number', min: 1, max: 24, step: 1, default: 10 },
    { key: 'colorA', label: '地の色', type: 'color', default: '#071a2b' },
    { key: 'colorB', label: '模様の色', type: 'color', default: '#7dffe0' },
  ],
  notes:
    'Gray-Scottモデル（物質A・Bの反応と拡散）を半精度浮動小数点テクスチャ上で反復計算。画面をドラッグすると物質Bを注入できる。周期境界（トーラス）で端も途切れない。',
  create(ctx) {
    const scale = ctx.quality === 'high' ? 2 : 3;
    const gw = () => Math.max(64, Math.floor(ctx.width / scale));
    const gh = () => Math.max(64, Math.floor(ctx.height / scale));
    const sim = new PingPong(gw(), gh(), { float: true, wrap: true });
    const quad = new FullscreenQuad();
    const init = makeShader(INIT, { uGrid: { value: new THREE.Vector2() }, uSeed: { value: 0 } });
    const step = makeShader(STEP, {
      tState: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uFeed: { value: 0.0545 },
      uKill: { value: 0.062 },
      uBrush: { value: new THREE.Vector3() },
      uAspect: { value: 1 },
    });
    const display = makeShader(DISPLAY, {
      tState: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uColorA: { value: new THREE.Vector3() },
      uColorB: { value: new THREE.Vector3() },
    });
    const brush = { x: 0, y: 0, down: false };
    let auto = 0;

    const seed = () => {
      init.uniforms.uGrid.value.set(sim.width, sim.height);
      init.uniforms.uSeed.value = Math.random() * 100;
      sim.fill(ctx.renderer, init);
    };
    seed();

    return {
      render(target, params, frame) {
        const preset = PRESETS[String(params.preset)];
        const [f, k] = preset ?? [Number(params.feed), Number(params.kill)];
        const u = step.uniforms;
        u.uFeed.value = f;
        u.uKill.value = k;
        u.uTexel.value.set(1 / sim.width, 1 / sim.height);
        u.uAspect.value = sim.width / sim.height;
        // 何も操作がない時も時々自動で注入し、模様が止まらないようにする
        auto += frame.dt;
        let autoDrop = false;
        if (auto > 4) {
          auto = 0;
          autoDrop = true;
        }
        const iters = Math.round(Number(params.iterations) * (ctx.quality === 'high' ? 1 : 0.6));
        for (let i = 0; i < iters; i++) {
          if (brush.down) u.uBrush.value.set(brush.x, brush.y, 0.025);
          else if (autoDrop && i === 0) u.uBrush.value.set(Math.random(), Math.random(), 0.02);
          else u.uBrush.value.set(0, 0, 0);
          sim.step(ctx.renderer, step);
        }
        display.uniforms.tState.value = sim.read.texture;
        display.uniforms.uTexel.value.set(1 / sim.width, 1 / sim.height);
        hexToVec3(String(params.colorA), display.uniforms.uColorA.value);
        hexToVec3(String(params.colorB), display.uniforms.uColorB.value);
        quad.render(ctx.renderer, display, target);
      },
      resize() {
        sim.resize(gw(), gh());
        seed();
      },
      pointer(x, y, down) {
        brush.x = x;
        brush.y = y;
        brush.down = down;
      },
      dispose() {
        sim.dispose();
        quad.dispose();
        init.dispose();
        step.dispose();
        display.dispose();
      },
    };
  },
};

export default effect;
