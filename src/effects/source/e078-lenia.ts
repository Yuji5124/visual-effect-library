import * as THREE from 'three';
import { FullscreenQuad, makeShader } from '../../engine/fullscreen';
import { PingPong } from '../../engine/gpgpu';
import { GLSL_HASH, GLSL_COLOR } from '../../engine/glsl';
import type { SourceEffect } from '../../engine/types';

const INIT = /* glsl */ `
${GLSL_HASH}
uniform float uSeed;
uniform vec2 uGrid;
varying vec2 vUv;
void main() {
  // ランダムな塊をいくつか置く
  float v = 0.0;
  for (int i = 0; i < 18; i++) {
    vec2 c = hash22(vec2(float(i), uSeed));
    float r = 0.04 + hash11(float(i) + uSeed) * 0.05;
    vec2 d = (vUv - c) * vec2(uGrid.x / uGrid.y, 1.0);
    if (length(d) < r) v = hash12(floor(vUv * uGrid) + uSeed);
  }
  gl_FragColor = vec4(v, 0.0, 0.0, 1.0);
}
`;

const STEP = /* glsl */ `
${GLSL_HASH}
uniform sampler2D tState;
uniform vec2 uTexel;
uniform float uR;
uniform float uMu;
uniform float uSigma;
uniform float uDt;
uniform vec3 uBrush;
uniform float uAspect;
uniform float uSeed;
varying vec2 vUv;
// 環状カーネル K(r) = exp(4 - 1/(r(1-r)))（0<r<1）
float kernel(float r) { return r <= 0.0 || r >= 1.0 ? 0.0 : exp(4.0 - 1.0 / (r * (1.0 - r))); }
void main() {
  float sum = 0.0, wsum = 0.0;
  for (int y = -13; y <= 13; y++) {
    for (int x = -13; x <= 13; x++) {
      float d = length(vec2(float(x), float(y))) / uR;
      if (d >= 1.0) continue;
      float w = kernel(d);
      sum += texture2D(tState, fract(vUv + vec2(float(x), float(y)) * uTexel)).r * w;
      wsum += w;
    }
  }
  float u = sum / wsum;
  float g = 2.0 * exp(-pow(u - uMu, 2.0) / (2.0 * uSigma * uSigma)) - 1.0; // 成長関数
  float a = texture2D(tState, vUv).r;
  float nxt = clamp(a + uDt * g, 0.0, 1.0);
  if (uBrush.z > 0.0 && length((vUv - uBrush.xy) * vec2(uAspect, 1.0)) < uBrush.z) nxt = hash12(gl_FragCoord.xy + uSeed);
  gl_FragColor = vec4(nxt, u, 0.0, 1.0);
}
`;

const DISPLAY = /* glsl */ `
${GLSL_COLOR}
uniform sampler2D tState;
uniform float uHue;
varying vec2 vUv;
void main() {
  vec2 s = texture2D(tState, vUv).rg;
  vec3 col = hsv2rgb(vec3(uHue + s.r * 0.25 - s.g * 0.2, 0.8, pow(s.r, 0.7)));
  col += vec3(0.05, 0.08, 0.2) * s.g * 2.0;
  gl_FragColor = vec4(col, 1.0);
}
`;

const effect: SourceEffect = {
  id: '078',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'mu', label: '成長の中心 μ', type: 'number', min: 0.05, max: 0.35, step: 0.001, default: 0.15 },
    { key: 'sigma', label: '成長の幅 σ', type: 'number', min: 0.005, max: 0.05, step: 0.0005, default: 0.017 },
    { key: 'dt', label: '時間刻み', type: 'number', min: 0.02, max: 0.3, step: 0.005, default: 0.1 },
    { key: 'hue', label: '色相', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  notes:
    'Bert Chan の Lenia。セルの状態を0〜1の連続値にし、半径Rのリング状カーネルで近傍を重み付き平均した値 u に、ガウス型の成長関数を適用して少しずつ更新する。μ・σ の組み合わせで「生き物」のように移動・分裂するパターンが現れる。近傍は最大27×27のテクスチャ参照をGPUで畳み込み。ドラッグで種をまける。',
  create(ctx) {
    const r = ctx.renderer;
    const hi = ctx.quality === 'high';
    const aspect = ctx.width / ctx.height;
    const sh = hi ? 256 : 160;
    const sw = Math.round(sh * aspect);
    const R = hi ? 13 : 9;
    const sim = new PingPong(sw, sh, { float: true, wrap: true });
    const quad = new FullscreenQuad();
    const init = makeShader(INIT, { uSeed: { value: Math.random() * 100 }, uGrid: { value: new THREE.Vector2(sw, sh) } });
    const step = makeShader(STEP, {
      tState: { value: null },
      uTexel: { value: new THREE.Vector2(1 / sw, 1 / sh) },
      uR: { value: R },
      uMu: { value: 0.15 },
      uSigma: { value: 0.017 },
      uDt: { value: 0.1 },
      uBrush: { value: new THREE.Vector3() },
      uAspect: { value: aspect },
      uSeed: { value: 0 },
    });
    const display = makeShader(DISPLAY, { tState: { value: null }, uHue: { value: 0.5 } });
    sim.fill(r, init);
    const brush = { x: 0, y: 0, down: false };
    let alive = 0;
    return {
      render(target, params, frame) {
        const u = step.uniforms;
        u.uMu.value = Number(params.mu);
        u.uSigma.value = Number(params.sigma);
        u.uDt.value = Number(params.dt);
        u.uSeed.value = Math.random() * 100;
        u.uBrush.value.set(brush.x, brush.y, brush.down ? 0.05 : 0);
        sim.step(r, step);
        // 全滅したら（一定時間ごとに）種をまき直す
        alive += frame.dt;
        if (alive > 25) {
          alive = 0;
          init.uniforms.uSeed.value = Math.random() * 100;
          sim.fill(r, init);
        }
        display.uniforms.tState.value = sim.read.texture;
        display.uniforms.uHue.value = Number(params.hue);
        quad.render(r, display, target);
      },
      pointer(x, y, down) {
        brush.x = x;
        brush.y = y;
        brush.down = down;
      },
      dispose() {
        sim.dispose();
        init.dispose();
        step.dispose();
        display.dispose();
        quad.dispose();
      },
    };
  },
};

export default effect;
