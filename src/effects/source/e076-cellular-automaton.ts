import * as THREE from 'three';
import { FullscreenQuad, makeShader } from '../../engine/fullscreen';
import { PingPong } from '../../engine/gpgpu';
import { GLSL_HASH } from '../../engine/glsl';
import { hexToVec3 } from '../../engine/shaderEffect';
import type { SourceEffect } from '../../engine/types';

const STEP = /* glsl */ `
${GLSL_HASH}
uniform sampler2D tState;
uniform vec2 uTexel;
uniform float uRule[8];
uniform float uRandomTop;
uniform float uSeed;
varying vec2 vUv;
void main() {
  // 画面全体を1行ずつ下へスクロールし、最上段だけ新しい世代を計算する
  if (vUv.y < 1.0 - uTexel.y) {
    gl_FragColor = texture2D(tState, vUv + vec2(0.0, uTexel.y));
    return;
  }
  vec2 prevRow = vec2(vUv.x, 1.0 - uTexel.y * 0.5);
  float l = step(0.5, texture2D(tState, vec2(fract(vUv.x - uTexel.x), prevRow.y)).r);
  float c = step(0.5, texture2D(tState, prevRow).r);
  float r = step(0.5, texture2D(tState, vec2(fract(vUv.x + uTexel.x), prevRow.y)).r);
  int idx = int(l * 4.0 + c * 2.0 + r);
  float v = 0.0;
  for (int i = 0; i < 8; i++) if (i == idx) v = uRule[i];
  if (hash12(gl_FragCoord.xy + uSeed) < uRandomTop) v = 1.0 - v;
  gl_FragColor = vec4(v, v, v, 1.0);
}
`;

const DISPLAY = /* glsl */ `
uniform sampler2D tState;
uniform vec3 uOn;
uniform vec3 uOff;
varying vec2 vUv;
void main() {
  float v = texture2D(tState, vUv).r;
  vec3 col = mix(uOff, uOn * (0.7 + 0.3 * vUv.y), v);
  gl_FragColor = vec4(col, 1.0);
}
`;

const effect: SourceEffect = {
  id: '076',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'rule', label: 'ルール番号（Wolfram）', type: 'number', min: 0, max: 255, step: 1, default: 30 },
    { key: 'cell', label: 'セルサイズ(px)', type: 'number', min: 1, max: 8, step: 1, default: 3 },
    { key: 'rate', label: '世代/フレーム', type: 'number', min: 1, max: 4, step: 1, default: 1 },
    { key: 'noise', label: '突然変異', type: 'number', min: 0, max: 0.01, step: 0.0001, default: 0.0005 },
    { key: 'on', label: '生セルの色', type: 'color', default: '#ffd23d' },
    { key: 'off', label: '背景色', type: 'color', default: '#120a24' },
  ],
  notes:
    '1次元セルオートマトン（Wolframの基本ルール0〜255）。左・自分・右の3セルの組み合わせ（8通り）に対する次の状態を、ルール番号の8ビットで表す。最上段で新世代を計算し、画面を1行ずつ下へ送ることで時間発展を縦方向に積み上げる。ルール30は乱数的、110は複雑な構造、90はシェルピンスキーの三角形になる。',
  create(ctx) {
    const r = ctx.renderer;
    let cell = 3;
    let sim: PingPong | null = null;
    const quad = new FullscreenQuad();
    const step = makeShader(STEP, {
      tState: { value: null },
      uTexel: { value: new THREE.Vector2() },
      uRule: { value: new Array(8).fill(0) },
      uRandomTop: { value: 0 },
      uSeed: { value: 0 },
    });
    const display = makeShader(DISPLAY, { tState: { value: null }, uOn: { value: new THREE.Vector3() }, uOff: { value: new THREE.Vector3() } });
    const seedMat = makeShader(
      /* glsl */ `varying vec2 vUv; uniform vec2 uTexel; void main(){ float v = step(1.0 - uTexel.y, vUv.y) * step(abs(vUv.x - 0.5), uTexel.x * 0.6); gl_FragColor = vec4(v, v, v, 1.0); }`,
      { uTexel: { value: new THREE.Vector2() } },
    );
    const alloc = () => {
      sim?.dispose();
      const w = Math.max(32, Math.floor(ctx.width / cell));
      const h = Math.max(32, Math.floor(ctx.height / cell));
      sim = new PingPong(w, h, { nearest: true });
      step.uniforms.uTexel.value.set(1 / w, 1 / h);
      seedMat.uniforms.uTexel.value.set(1 / w, 1 / h);
      sim.fill(r, seedMat);
    };
    alloc();
    let lastRule = -1;
    return {
      render(target, params) {
        const c = Math.round(Number(params.cell));
        if (c !== cell) {
          cell = c;
          alloc();
        }
        const rule = Math.round(Number(params.rule)) & 255;
        if (rule !== lastRule) {
          step.uniforms.uRule.value = Array.from({ length: 8 }, (_, i) => (rule >> i) & 1);
          if (lastRule >= 0) alloc();
          lastRule = rule;
        }
        step.uniforms.uRandomTop.value = Number(params.noise);
        const n = Math.round(Number(params.rate));
        for (let i = 0; i < n; i++) {
          step.uniforms.uSeed.value = Math.random() * 1000;
          sim!.step(r, step);
        }
        display.uniforms.tState.value = sim!.read.texture;
        hexToVec3(String(params.on), display.uniforms.uOn.value);
        hexToVec3(String(params.off), display.uniforms.uOff.value);
        quad.render(r, display, target);
      },
      resize() {
        alloc();
      },
      dispose() {
        sim?.dispose();
        step.dispose();
        display.dispose();
        seedMat.dispose();
        quad.dispose();
      },
    };
  },
};

export default effect;
