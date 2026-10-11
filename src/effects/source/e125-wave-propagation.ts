import * as THREE from 'three';
import { FullscreenQuad, makeShader } from '../../engine/fullscreen';
import { PingPong } from '../../engine/gpgpu';
import { GLSL_WORLD_B } from '../../engine/glsl';
import type { SourceEffect } from '../../engine/types';

const STEP = /* glsl */ `
uniform sampler2D tState;
uniform vec2 uTexel;
uniform float uSpeed;
uniform float uDamping;
uniform vec4 uDrop; // xy 位置, z 半径, w 強さ
uniform float uAspect;
varying vec2 vUv;
void main() {
  vec2 s = texture2D(tState, vUv).rg; // r: 現在の高さ, g: 1つ前の高さ
  float lap = texture2D(tState, vUv + vec2(uTexel.x, 0.0)).r + texture2D(tState, vUv - vec2(uTexel.x, 0.0)).r
            + texture2D(tState, vUv + vec2(0.0, uTexel.y)).r + texture2D(tState, vUv - vec2(0.0, uTexel.y)).r - 4.0 * s.r;
  float h = (2.0 * s.r - s.g + uSpeed * lap) * uDamping;
  if (uDrop.z > 0.0) {
    float d = length((vUv - uDrop.xy) * vec2(uAspect, 1.0));
    h += uDrop.w * exp(-d * d / (uDrop.z * uDrop.z));
  }
  // 端は固定端（反射）
  vec2 e = step(uTexel, vUv) * step(vUv, 1.0 - uTexel);
  h *= e.x * e.y;
  gl_FragColor = vec4(h, s.r, 0.0, 1.0);
}
`;

const DISPLAY = /* glsl */ `
${GLSL_WORLD_B}
uniform sampler2D tState;
uniform vec2 uTexel;
uniform float uTime;
uniform float uAspect;
uniform float uMode;
varying vec2 vUv;
void main() {
  float h = texture2D(tState, vUv).r;
  float hx = texture2D(tState, vUv + vec2(uTexel.x, 0.0)).r - texture2D(tState, vUv - vec2(uTexel.x, 0.0)).r;
  float hy = texture2D(tState, vUv + vec2(0.0, uTexel.y)).r - texture2D(tState, vUv - vec2(0.0, uTexel.y)).r;
  vec3 n = normalize(vec3(-hx * 6.0, -hy * 6.0, 1.0));
  vec3 l = normalize(vec3(-0.4, 0.5, 0.8));
  float spec = pow(max(dot(reflect(-l, n), vec3(0.0, 0.0, 1.0)), 0.0), 40.0);
  vec3 col;
  if (uMode < 0.5) {
    // 水面：下の景色を屈折させて見せる
    vec3 under = worldB(clamp(vUv + n.xy * 0.08, 0.0, 1.0), uTime * 0.2, uAspect);
    col = under * (0.75 + 0.25 * n.z) + spec * 0.9;
  } else {
    // 弾性膜：高さを色で表示
    vec3 pos = vec3(1.0, 0.35, 0.15), neg = vec3(0.1, 0.45, 1.0);
    col = mix(vec3(0.05, 0.05, 0.08), h > 0.0 ? pos : neg, clamp(abs(h) * 3.0, 0.0, 1.0));
    col *= 0.6 + 0.6 * max(dot(n, l), 0.0);
    col += spec * 0.6;
  }
  gl_FragColor = vec4(col, 1.0);
}
`;

const effect: SourceEffect = {
  id: '125',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'speed', label: '波の速さ', type: 'number', min: 0.05, max: 0.5, step: 0.005, default: 0.35 },
    { key: 'damping', label: '減衰（大きいほど長く残る）', type: 'number', min: 0.95, max: 0.9995, step: 0.0005, default: 0.995 },
    { key: 'rain', label: '自動の衝撃頻度', type: 'number', min: 0, max: 10, step: 0.1, default: 2 },
    {
      key: 'mode',
      label: '表示',
      type: 'select',
      options: [
        { value: 'water', label: '水面（屈折）' },
        { value: 'membrane', label: '弾性膜（高さを色で）' },
      ],
      default: 'water',
    },
  ],
  notes:
    '2次元の波動方程式 ∂²h/∂t² = c²∇²h を「現在と1つ前の高さ」を持つテクスチャで陽的に解く（Verlet形式）。端は固定端なので波が反射して干渉する。速さ c²·Δt²/Δx² は安定条件の0.5未満に制限。ドラッグで衝撃を与えられる。',
  create(ctx) {
    const r = ctx.renderer;
    const hi = ctx.quality === 'high';
    const aspect = ctx.width / ctx.height;
    const sh = hi ? 360 : 220;
    const sw = Math.round(sh * aspect);
    const sim = new PingPong(sw, sh, { float: true });
    const quad = new FullscreenQuad();
    const step = makeShader(STEP, {
      tState: { value: null },
      uTexel: { value: new THREE.Vector2(1 / sw, 1 / sh) },
      uSpeed: { value: 0.35 },
      uDamping: { value: 0.995 },
      uDrop: { value: new THREE.Vector4() },
      uAspect: { value: aspect },
    });
    const display = makeShader(DISPLAY, {
      tState: { value: null },
      uTexel: { value: new THREE.Vector2(1 / sw, 1 / sh) },
      uTime: { value: 0 },
      uAspect: { value: aspect },
      uMode: { value: 0 },
    });
    const ptr = { x: 0, y: 0, down: false, wasDown: false };
    let acc = 0;
    return {
      render(target, params, frame) {
        step.uniforms.uSpeed.value = Math.min(0.49, Number(params.speed));
        step.uniforms.uDamping.value = Number(params.damping);
        acc += frame.dt * Number(params.rain);
        const iters = 2;
        for (let i = 0; i < iters; i++) {
          const drop = step.uniforms.uDrop.value as THREE.Vector4;
          drop.set(0, 0, 0, 0);
          if (i === 0 && acc >= 1) {
            acc -= 1;
            drop.set(0.1 + Math.random() * 0.8, 0.1 + Math.random() * 0.8, 0.012 + Math.random() * 0.01, Math.random() < 0.5 ? 0.5 : -0.5);
          }
          if (i === 0 && ptr.down) drop.set(ptr.x, ptr.y, 0.015, ptr.wasDown ? 0.08 : 0.8);
          sim.step(r, step);
        }
        ptr.wasDown = ptr.down;
        display.uniforms.tState.value = sim.read.texture;
        display.uniforms.uTime.value = frame.time;
        display.uniforms.uMode.value = params.mode === 'membrane' ? 1 : 0;
        quad.render(r, display, target);
      },
      pointer(x, y, down) {
        ptr.x = x;
        ptr.y = y;
        ptr.down = down;
      },
      dispose() {
        sim.dispose();
        step.dispose();
        display.dispose();
        quad.dispose();
      },
    };
  },
};

export default effect;
