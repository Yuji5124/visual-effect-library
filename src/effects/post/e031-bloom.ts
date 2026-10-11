import * as THREE from 'three';
import { FullscreenQuad, createTarget, makeShader } from '../../engine/fullscreen';
import type { PostEffect } from '../../engine/types';

const PREFILTER = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uThreshold;
uniform float uKnee;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float br = max(c.r, max(c.g, c.b));
  float soft = clamp(br - uThreshold + uKnee, 0.0, 2.0 * uKnee);
  soft = soft * soft / (4.0 * uKnee + 1e-4);
  float w = max(soft, br - uThreshold) / max(br, 1e-4);
  gl_FragColor = vec4(c * w, 1.0);
}
`;

// 線形補間を利用した9タップ（実質17テクセル相当）ガウスぼかし
const BLUR = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uDir;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * 0.2270270;
  c += texture2D(tDiffuse, vUv + uDir * 1.3846154).rgb * 0.3162162;
  c += texture2D(tDiffuse, vUv - uDir * 1.3846154).rgb * 0.3162162;
  c += texture2D(tDiffuse, vUv + uDir * 3.2307692).rgb * 0.0702703;
  c += texture2D(tDiffuse, vUv - uDir * 3.2307692).rgb * 0.0702703;
  gl_FragColor = vec4(c, 1.0);
}
`;

const COMBINE = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tB0;
uniform sampler2D tB1;
uniform sampler2D tB2;
uniform sampler2D tB3;
uniform float uStrength;
uniform float uRadius;
uniform vec3 uTint;
varying vec2 vUv;
void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  float r = uRadius;
  vec3 b = texture2D(tB0, vUv).rgb * 1.0
         + texture2D(tB1, vUv).rgb * mix(0.6, 1.0, r - 1.0)
         + texture2D(tB2, vUv).rgb * mix(0.3, 1.0, r - 1.0)
         + texture2D(tB3, vUv).rgb * mix(0.1, 1.0, r - 1.0);
  vec3 col = base + b * uStrength * uTint * 0.5;
  col = col / (1.0 + max(col - 1.0, 0.0) * 0.5);
  gl_FragColor = vec4(col, 1.0);
}
`;

const LEVELS = 4;

const effect: PostEffect = {
  id: '031',
  kind: 'post',
  status: 'implemented',
  params: [
    { key: 'threshold', label: 'しきい値', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'strength', label: '強さ', type: 'number', min: 0, max: 4, step: 0.01, default: 2.2 },
    { key: 'radius', label: '広がり', type: 'number', min: 1, max: 2, step: 0.01, default: 1.4 },
    { key: 'tint', label: '光の色', type: 'color', default: '#ffffff' },
  ],
  notes:
    'ソフトニー付きしきい値で高輝度を抽出 → 1/2・1/4・1/8・1/16 解像度で分離ガウスぼかし → 重み付き加算。縮小バッファを使うので広いにじみでも軽い。',
  create(ctx) {
    const quad = new FullscreenQuad();
    const pre = makeShader(PREFILTER, { tDiffuse: { value: null }, uThreshold: { value: 0.6 }, uKnee: { value: 0.2 } });
    const blur = makeShader(BLUR, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });
    const combine = makeShader(COMBINE, {
      tDiffuse: { value: null },
      tB0: { value: null },
      tB1: { value: null },
      tB2: { value: null },
      tB3: { value: null },
      uStrength: { value: 1 },
      uRadius: { value: 1.4 },
      uTint: { value: new THREE.Color(1, 1, 1) },
    });
    const levels: { a: THREE.WebGLRenderTarget; b: THREE.WebGLRenderTarget }[] = [];
    const sizeOf = (w: number, h: number, i: number) => [Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1))];
    for (let i = 0; i < LEVELS; i++) {
      const [w, h] = sizeOf(ctx.width, ctx.height, i);
      levels.push({ a: createTarget(w, h, { float: true }), b: createTarget(w, h, { float: true }) });
    }
    return {
      render(input, target, params) {
        const r = ctx.renderer;
        pre.uniforms.tDiffuse.value = input;
        pre.uniforms.uThreshold.value = Number(params.threshold);
        quad.render(r, pre, levels[0].a);
        let src: THREE.Texture = levels[0].a.texture;
        for (let i = 0; i < LEVELS; i++) {
          const L = levels[i];
          const w = L.a.width;
          const h = L.a.height;
          if (i > 0) {
            // 前段のぼかし結果を縮小コピー（ぼかしシェーダーの方向0で単純サンプル）
            blur.uniforms.tDiffuse.value = src;
            blur.uniforms.uDir.value.set(0, 0);
            quad.render(r, blur, L.a);
          }
          blur.uniforms.tDiffuse.value = L.a.texture;
          blur.uniforms.uDir.value.set(1 / w, 0);
          quad.render(r, blur, L.b);
          blur.uniforms.tDiffuse.value = L.b.texture;
          blur.uniforms.uDir.value.set(0, 1 / h);
          quad.render(r, blur, L.a);
          src = L.a.texture;
        }
        const u = combine.uniforms;
        u.tDiffuse.value = input;
        u.tB0.value = levels[0].a.texture;
        u.tB1.value = levels[1].a.texture;
        u.tB2.value = levels[2].a.texture;
        u.tB3.value = levels[3].a.texture;
        u.uStrength.value = Number(params.strength);
        u.uRadius.value = Number(params.radius);
        (u.uTint.value as THREE.Color).setStyle(String(params.tint), THREE.LinearSRGBColorSpace);
        quad.render(r, combine, target);
      },
      resize(w, h) {
        levels.forEach((L, i) => {
          const [lw, lh] = sizeOf(w, h, i);
          L.a.setSize(lw, lh);
          L.b.setSize(lw, lh);
        });
      },
      dispose() {
        levels.forEach((L) => {
          L.a.dispose();
          L.b.dispose();
        });
        pre.dispose();
        blur.dispose();
        combine.dispose();
        quad.dispose();
      },
    };
  },
};

export default effect;
