import * as THREE from 'three';
import { FullscreenQuad, makeShader } from '../../engine/fullscreen';
import { GLSL_HASH } from '../../engine/glsl';
import { hexToVec3 } from '../../engine/shaderEffect';
import type { SourceEffect } from '../../engine/types';

const INIT_POS = /* glsl */ `
${GLSL_HASH}
uniform float uSeed;
varying vec2 vUv;
void main() {
  vec2 r = hash22(vUv * 913.0 + uSeed);
  float a = r.x * 6.28318;
  float d = 0.15 + pow(r.y, 0.7) * 1.6;
  float y = (hash12(vUv * 517.0 + uSeed) - 0.5) * 0.06;
  float mass = 0.5 + hash12(vUv * 77.0 + uSeed) * 1.0;
  gl_FragColor = vec4(cos(a) * d, y, sin(a) * d, mass);
}
`;
const INIT_VEL = /* glsl */ `
uniform sampler2D tPos;
uniform float uCentral;
uniform float uSpin;
varying vec2 vUv;
void main() {
  vec3 p = texture2D(tPos, vUv).xyz;
  float r = length(p.xz);
  // 中心質量のまわりのほぼ円軌道
  float v = sqrt(uCentral / max(r, 0.1)) * uSpin;
  vec3 tangent = normalize(vec3(-p.z, 0.0, p.x));
  gl_FragColor = vec4(tangent * v, 1.0);
}
`;
const VEL = /* glsl */ `
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uSize;
uniform float uG;
uniform float uCentral;
uniform float uDt;
uniform float uSoft;
varying vec2 vUv;
void main() {
  vec3 p = texture2D(tPos, vUv).xyz;
  vec3 v = texture2D(tVel, vUv).xyz;
  vec3 acc = -p * uCentral / pow(dot(p, p) + uSoft * 4.0, 1.5);
  for (int y = 0; y < 64; y++) {
    if (float(y) >= uSize) break;
    for (int x = 0; x < 64; x++) {
      if (float(x) >= uSize) break;
      vec4 o = texture2D(tPos, (vec2(float(x), float(y)) + 0.5) / uSize);
      vec3 d = o.xyz - p;
      float r2 = dot(d, d) + uSoft;
      acc += d * (uG * o.w / (r2 * sqrt(r2)));
    }
  }
  gl_FragColor = vec4(v + acc * uDt, 1.0);
}
`;
const POS = /* glsl */ `
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uDt;
varying vec2 vUv;
void main() {
  vec4 p = texture2D(tPos, vUv);
  gl_FragColor = vec4(p.xyz + texture2D(tVel, vUv).xyz * uDt, p.w);
}
`;
const PT_VERT = /* glsl */ `
uniform sampler2D tPos;
uniform sampler2D tVel;
uniform float uPoint;
attribute vec2 aRef;
varying float vSpeed;
varying float vMass;
void main() {
  vec4 p = texture2D(tPos, aRef);
  vSpeed = length(texture2D(tVel, aRef).xyz);
  vMass = p.w;
  vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uPoint * (0.6 + p.w * 0.5) * (3.0 / max(-mv.z, 0.5));
}
`;
const PT_FRAG = /* glsl */ `
uniform vec3 uSlow;
uniform vec3 uFast;
varying float vSpeed;
varying float vMass;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = exp(-d * d * 14.0);
  vec3 c = mix(uSlow, uFast, clamp(vSpeed * 0.9, 0.0, 1.0));
  gl_FragColor = vec4(c * a, 1.0);
}
`;

const effect: SourceEffect = {
  id: '213',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'gravity', label: '粒子どうしの引力 G', type: 'number', min: 0, max: 0.002, step: 0.00001, default: 0.0004 },
    { key: 'central', label: '中心の星の質量', type: 'number', min: 0, max: 2, step: 0.01, default: 0.6 },
    { key: 'spin', label: '初期の回転（1で円軌道）', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.9 },
    { key: 'timeScale', label: '時間の速さ', type: 'number', min: 0, max: 3, step: 0.01, default: 1 },
    { key: 'slow', label: '遅い粒子の色', type: 'color', default: '#ff7a3d' },
    { key: 'fast', label: '速い粒子の色', type: 'color', default: '#7ad8ff' },
  ],
  notes:
    '粒子の位置と速度を浮動小数点テクスチャに保存し、速度更新シェーダーの中で「全粒子 × 全粒子」の万有引力をGPUで総当たり計算する（高品質 64×64=4096粒子で約1677万組/フレーム）。近距離の発散を防ぐため軟化パラメータを入れ、中心の星のまわりの円盤から渦状腕や塊が生まれる様子を見られる。ドラッグで初期状態からやり直す。（着想: three.js examples の webgl_gpgpu_protoplanet。実装は独自）',
  create(ctx) {
    const r = ctx.renderer;
    const S = ctx.quality === 'high' ? 64 : 32;
    const type = r.extensions.has('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
    const rt = () =>
      new THREE.WebGLRenderTarget(S, S, { type, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false });
    let pos = [rt(), rt()];
    let vel = [rt(), rt()];
    const quad = new FullscreenQuad();
    const initPos = makeShader(INIT_POS, { uSeed: { value: 0 } });
    const initVel = makeShader(INIT_VEL, { tPos: { value: null }, uCentral: { value: 0.6 }, uSpin: { value: 0.9 } });
    const velMat = makeShader(VEL, {
      tPos: { value: null },
      tVel: { value: null },
      uSize: { value: S },
      uG: { value: 0.0004 },
      uCentral: { value: 0.6 },
      uDt: { value: 0.01 },
      uSoft: { value: 0.002 },
    });
    const posMat = makeShader(POS, { tPos: { value: null }, tVel: { value: null }, uDt: { value: 0.01 } });
    const reset = (central: number, spin: number) => {
      initPos.uniforms.uSeed.value = Math.random() * 100;
      quad.render(r, initPos, pos[0]);
      initVel.uniforms.tPos.value = pos[0].texture;
      initVel.uniforms.uCentral.value = central;
      initVel.uniforms.uSpin.value = spin;
      quad.render(r, initVel, vel[0]);
    };
    reset(0.6, 0.9);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02020a).convertLinearToSRGB();
    const camera = new THREE.PerspectiveCamera(50, ctx.width / ctx.height, 0.05, 50);
    const refs = new Float32Array(S * S * 2);
    for (let y = 0; y < S; y++)
      for (let x = 0; x < S; x++) {
        refs[(y * S + x) * 2] = (x + 0.5) / S;
        refs[(y * S + x) * 2 + 1] = (y + 0.5) / S;
      }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('aRef', new THREE.BufferAttribute(refs, 2));
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(S * S * 3), 3));
    const ptMat = new THREE.ShaderMaterial({
      vertexShader: PT_VERT,
      fragmentShader: PT_FRAG,
      uniforms: { tPos: { value: null }, tVel: { value: null }, uPoint: { value: 4 }, uSlow: { value: new THREE.Vector3() }, uFast: { value: new THREE.Vector3() } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, ptMat);
    points.frustumCulled = false;
    scene.add(points);
    const star = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.9, 0.6) }));
    scene.add(star);
    let t = 0;
    let resetRequested = false;
    return {
      render(target, params, frame) {
        if (resetRequested) {
          reset(Number(params.central), Number(params.spin));
          resetRequested = false;
        }
        const dt = Math.min(frame.dt, 1 / 30) * Number(params.timeScale) * 0.5;
        velMat.uniforms.uG.value = Number(params.gravity);
        velMat.uniforms.uCentral.value = Number(params.central);
        for (let k = 0; k < 2; k++) {
          velMat.uniforms.uDt.value = dt / 2;
          velMat.uniforms.tPos.value = pos[0].texture;
          velMat.uniforms.tVel.value = vel[0].texture;
          quad.render(r, velMat, vel[1]);
          vel = [vel[1], vel[0]];
          posMat.uniforms.uDt.value = dt / 2;
          posMat.uniforms.tPos.value = pos[0].texture;
          posMat.uniforms.tVel.value = vel[0].texture;
          quad.render(r, posMat, pos[1]);
          pos = [pos[1], pos[0]];
        }
        t += frame.dt;
        camera.aspect = ctx.width / ctx.height;
        camera.updateProjectionMatrix();
        camera.position.set(Math.sin(t * 0.05) * 3.2, 1.6 + Math.sin(t * 0.07) * 0.6, Math.cos(t * 0.05) * 3.2);
        camera.lookAt(0, 0, 0);
        ptMat.uniforms.tPos.value = pos[0].texture;
        ptMat.uniforms.tVel.value = vel[0].texture;
        ptMat.uniforms.uPoint.value = (S === 64 ? 3.5 : 5) * (ctx.height / 700);
        hexToVec3(String(params.slow), ptMat.uniforms.uSlow.value);
        hexToVec3(String(params.fast), ptMat.uniforms.uFast.value);
        r.setRenderTarget(target);
        r.render(scene, camera);
      },
      pointer(_x, _y, down) {
        if (down) resetRequested = true;
      },
      dispose() {
        [...pos, ...vel].forEach((t) => t.dispose());
        [initPos, initVel, velMat, posMat].forEach((m) => m.dispose());
        quad.dispose();
        geo.dispose();
        ptMat.dispose();
        star.geometry.dispose();
        (star.material as THREE.Material).dispose();
      },
    };
  },
};

export default effect;
