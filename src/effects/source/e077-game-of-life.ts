import * as THREE from 'three';
import { FullscreenQuad, makeShader } from '../../engine/fullscreen';
import { PingPong } from '../../engine/gpgpu';
import { GLSL_HASH } from '../../engine/glsl';
import { hexToVec3 } from '../../engine/shaderEffect';
import type { SourceEffect } from '../../engine/types';

// ルールを「生誕」「生存」の近傍数ビットマスク（9要素）で表す
const RULES: Record<string, { born: number[]; survive: number[] }> = {
  life: { born: [3], survive: [2, 3] },
  highlife: { born: [3, 6], survive: [2, 3] },
  daynight: { born: [3, 6, 7, 8], survive: [3, 4, 6, 7, 8] },
  maze: { born: [3], survive: [1, 2, 3, 4, 5] },
  seeds: { born: [2], survive: [] },
};

const INIT = /* glsl */ `
${GLSL_HASH}
uniform float uSeed;
uniform float uFill;
uniform vec2 uGrid;
varying vec2 vUv;
void main() {
  float a = step(1.0 - uFill, hash12(floor(vUv * uGrid) + uSeed));
  gl_FragColor = vec4(a, a, 0.0, 1.0);
}
`;

const STEP = /* glsl */ `
${GLSL_HASH}
uniform sampler2D tState;
uniform vec2 uTexel;
uniform float uBorn[9];
uniform float uSurvive[9];
uniform float uDecay;
uniform float uChaos;
uniform float uSeed;
uniform vec3 uBrush;
uniform float uAspect;
varying vec2 vUv;
float alive(vec2 o) { return step(0.5, texture2D(tState, vUv + o * uTexel).r); }
void main() {
  float n = alive(vec2(-1.0, -1.0)) + alive(vec2(0.0, -1.0)) + alive(vec2(1.0, -1.0))
          + alive(vec2(-1.0, 0.0)) + alive(vec2(1.0, 0.0))
          + alive(vec2(-1.0, 1.0)) + alive(vec2(0.0, 1.0)) + alive(vec2(1.0, 1.0));
  vec4 s = texture2D(tState, vUv);
  float self = step(0.5, s.r);
  float born = 0.0, survive = 0.0;
  for (int i = 0; i < 9; i++) {
    float hit = 1.0 - step(0.5, abs(n - float(i)));
    born += hit * uBorn[i];
    survive += hit * uSurvive[i];
  }
  float next = self > 0.5 ? survive : born;
  if (hash12(gl_FragCoord.xy + uSeed) < uChaos) next = 1.0;
  if (uBrush.z > 0.0 && length((vUv - uBrush.xy) * vec2(uAspect, 1.0)) < uBrush.z) next = step(0.5, hash12(gl_FragCoord.xy * 1.3 + uSeed));
  float trail = max(next, s.g * uDecay);
  float age = next > 0.5 ? min(s.b + 0.02, 1.0) : 0.0;
  gl_FragColor = vec4(next, trail, age, 1.0);
}
`;

const DISPLAY = /* glsl */ `
uniform sampler2D tState;
uniform vec3 uColor;
uniform vec3 uTrail;
uniform vec2 uGrid;
uniform float uGap;
varying vec2 vUv;
void main() {
  vec4 s = texture2D(tState, vUv);
  vec2 f = fract(vUv * uGrid);
  float cellMask = uGap > 0.5 ? step(0.08, f.x) * step(0.08, f.y) : 1.0;
  vec3 young = vec3(1.0);
  vec3 col = s.r > 0.5 ? mix(young, uColor, clamp(s.b * 3.0, 0.0, 1.0)) : uTrail * s.g * s.g;
  gl_FragColor = vec4(col * cellMask + vec3(0.01, 0.01, 0.03), 1.0);
}
`;

const effect: SourceEffect = {
  id: '077',
  kind: 'source',
  status: 'implemented',
  params: [
    {
      key: 'rule',
      label: 'ルール',
      type: 'select',
      options: [
        { value: 'life', label: 'Conway B3/S23' },
        { value: 'highlife', label: 'HighLife B36/S23' },
        { value: 'daynight', label: 'Day & Night' },
        { value: 'maze', label: 'Maze B3/S12345' },
        { value: 'seeds', label: 'Seeds B2/S' },
      ],
      default: 'life',
    },
    { key: 'cellSize', label: 'セルサイズ(px)', type: 'number', min: 2, max: 16, step: 1, default: 4 },
    { key: 'rate', label: '世代/秒', type: 'number', min: 1, max: 60, step: 1, default: 24 },
    { key: 'decay', label: '残像の減衰', type: 'number', min: 0, max: 0.99, step: 0.01, default: 0.9 },
    { key: 'chaos', label: 'ランダム発生', type: 'number', min: 0, max: 0.002, step: 0.00005, default: 0.0002 },
    { key: 'color', label: '細胞の色', type: 'color', default: '#59f0ff' },
    { key: 'trail', label: '残像の色', type: 'color', default: '#ff3d9a' },
  ],
  notes:
    '状態テクスチャ（R:生死, G:残像, B:年齢）をピンポンバッファで更新。生誕・生存ルールをuniform配列で渡すため、シェーダーを書き換えずに別ルールへ切替可能。ドラッグでセルを描ける。',
  create(ctx) {
    let cellSize = 4;
    const dims = () => [Math.max(16, Math.floor(ctx.width / cellSize)), Math.max(16, Math.floor(ctx.height / cellSize))];
    let [gw, gh] = dims();
    let sim = new PingPong(gw, gh, { nearest: true, wrap: true });
    const quad = new FullscreenQuad();
    const init = makeShader(INIT, { uSeed: { value: 0 }, uFill: { value: 0.3 }, uGrid: { value: new THREE.Vector2() } });
    const step = makeShader(STEP, {
      tState: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uBorn: { value: new Array(9).fill(0) },
      uSurvive: { value: new Array(9).fill(0) },
      uDecay: { value: 0.9 },
      uChaos: { value: 0 },
      uSeed: { value: 0 },
      uBrush: { value: new THREE.Vector3() },
      uAspect: { value: 1 },
    });
    const display = makeShader(DISPLAY, {
      tState: { value: null },
      uColor: { value: new THREE.Vector3() },
      uTrail: { value: new THREE.Vector3() },
      uGrid: { value: new THREE.Vector2() },
      uGap: { value: 1 },
    });
    const brush = { x: 0, y: 0, down: false };
    let acc = 0;
    let lastRule = '';

    const seed = () => {
      init.uniforms.uSeed.value = Math.random() * 1000;
      init.uniforms.uGrid.value.set(gw, gh);
      sim.fill(ctx.renderer, init);
    };
    const realloc = () => {
      [gw, gh] = dims();
      sim.dispose();
      sim = new PingPong(gw, gh, { nearest: true, wrap: true });
      seed();
    };
    seed();

    return {
      render(target, params, frame) {
        const cs = Math.round(Number(params.cellSize));
        if (cs !== cellSize) {
          cellSize = cs;
          realloc();
        }
        const ruleName = String(params.rule);
        if (ruleName !== lastRule) {
          const rule = RULES[ruleName] ?? RULES.life;
          step.uniforms.uBorn.value = Array.from({ length: 9 }, (_, i) => (rule.born.includes(i) ? 1 : 0));
          step.uniforms.uSurvive.value = Array.from({ length: 9 }, (_, i) => (rule.survive.includes(i) ? 1 : 0));
          if (lastRule) seed();
          lastRule = ruleName;
        }
        const u = step.uniforms;
        u.uTexel.value.set(1 / gw, 1 / gh);
        u.uDecay.value = Number(params.decay);
        u.uChaos.value = Number(params.chaos);
        u.uAspect.value = gw / gh;
        acc += frame.dt * Number(params.rate);
        let steps = Math.min(4, Math.floor(acc));
        acc -= Math.floor(acc);
        if (brush.down && steps === 0) steps = 1;
        for (let i = 0; i < steps; i++) {
          u.uSeed.value = Math.random() * 1000;
          u.uBrush.value.set(brush.x, brush.y, brush.down ? 0.04 : 0);
          sim.step(ctx.renderer, step);
        }
        const d = display.uniforms;
        d.tState.value = sim.read.texture;
        d.uGrid.value.set(gw, gh);
        d.uGap.value = cellSize >= 4 ? 1 : 0;
        hexToVec3(String(params.color), d.uColor.value);
        hexToVec3(String(params.trail), d.uTrail.value);
        quad.render(ctx.renderer, display, target);
      },
      resize() {
        realloc();
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
