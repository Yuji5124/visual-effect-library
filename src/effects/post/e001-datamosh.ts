import * as THREE from 'three';
import { COPY_FRAGMENT, FullscreenQuad, createTarget, makeShader } from '../../engine/fullscreen';
import type { PostEffect } from '../../engine/types';

// Solve once per macroblock instead of repeating the fit at every output pixel.
const MOTION = /* glsl */ `
uniform sampler2D tDiffuse, tInputPrev;
uniform vec2 uResolution, uGrid;
varying vec2 vUv;
float L(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
void main() {
  vec2 px = 1.0 / uResolution;
  vec2 center = (floor(vUv * uGrid) + .5) / uGrid;
  float xx = .0001, yy = .0001, xy = 0., xt = 0., yt = 0., change = 0.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 p = center + vec2(float(x), float(y)) / (uGrid * 3.);
    // Match nearest and linear inputs at texel centers: stationary edges must not move.
    p = (floor(p * uResolution) + .5) / uResolution;
    float gx = .5 * (L(texture2D(tInputPrev, p + vec2(px.x, 0.)).rgb) - L(texture2D(tInputPrev, p - vec2(px.x, 0.)).rgb));
    float gy = .5 * (L(texture2D(tInputPrev, p + vec2(0., px.y)).rgb) - L(texture2D(tInputPrev, p - vec2(0., px.y)).rgb));
    float dt = L(texture2D(tDiffuse, p).rgb) - L(texture2D(tInputPrev, p).rgb);
    xx += gx*gx; yy += gy*gy; xy += gx*gy; xt += gx*dt; yt += gy*dt; change += abs(dt);
  }
  vec2 flow = -vec2(yy*xt - xy*yt, xx*yt - xy*xt) / max(xx*yy - xy*xy, .00000001);
  gl_FragColor = vec4(clamp(flow, -12., 12.) / 24. + .5, change / 9., 1.);
}`;
const DECODE = /* glsl */ `
uniform sampler2D tDiffuse, tInputPrev, tFeedback, tMotion;
uniform vec2 uResolution;
uniform float uSmear, uBleed, uReset;
varying vec2 vUv;
void main() {
  vec3 current = texture2D(tDiffuse, vUv).rgb;
  if (uReset > .5) { gl_FragColor = vec4(current, 1.); return; }
  vec3 motion = texture2D(tMotion, vUv).rgb;
  vec2 flow = (motion.rg * 24. - 12.) / uResolution;
  if (motion.b < .004) flow = vec2(0.);
  vec2 uv = clamp(vUv - flow * uSmear, .5/uResolution, 1. - .5/uResolution);
  vec3 predicted = texture2D(tFeedback, uv).rgb;
  vec3 residual = current - texture2D(tInputPrev, clamp(vUv-flow, vec2(0.), vec2(1.))).rgb;
  vec3 corrupt = predicted + floor(residual * 12. + .5) / 12. * .18;
  gl_FragColor = vec4(clamp(mix(corrupt, current, uBleed), 0., 1.), 1.);
}`;

const effect: PostEffect = {
  id: '001', kind: 'post', status: 'implemented',
  params: [
    { key: 'iframe', label: 'Iフレーム間隔(秒)', type: 'number', min: 1, max: 12, step: .5, default: 5 },
    { key: 'block', label: 'マクロブロック(px)', type: 'number', min: 4, max: 48, step: 1, default: 16 },
    { key: 'smear', label: '引きずり量', type: 'number', min: 0, max: 3, step: .01, default: 1.4 },
    { key: 'bleed', label: '新しい画素の混入', type: 'number', min: 0, max: .3, step: .005, default: .04 },
  ],
  notes: 'ブロック単位の正則化付き輝度勾配法で入力の動きを推定。前回出力を移流し、量子化した予測残差を加えてIフレーム欠落を模擬する。初回・リサイズ・巻き戻し・Iフレーム周期で完全更新。画像からの推定でありコーデックの真の動きベクトルではない。',
  create(ctx) {
    let width = ctx.width, height = ctx.height, initialized = false, lastTime = 0, lastCycle = -1;
    const previousInput = createTarget(width, height);
    const feedback = createTarget(width, height);
    const motion = createTarget(1, 1, { filter: THREE.NearestFilter });
    const quad = new FullscreenQuad();
    const fit = makeShader(MOTION, {
      tDiffuse: { value: null }, tInputPrev: { value: previousInput.texture },
      uResolution: { value: new THREE.Vector2(width, height) }, uGrid: { value: new THREE.Vector2() },
    });
    const decode = makeShader(DECODE, {
      tDiffuse: { value: null }, tInputPrev: { value: previousInput.texture },
      tFeedback: { value: feedback.texture }, tMotion: { value: motion.texture },
      uResolution: { value: new THREE.Vector2(width, height) },
      uSmear: { value: 1.4 }, uBleed: { value: .04 }, uReset: { value: 1 },
    });
    const copy = makeShader(COPY_FRAGMENT, { tDiffuse: { value: null } });
    return {
      render(input, output, params, frame) {
        const block = Math.max(4, Number(params.block ?? 16));
        const w = Math.max(1, Math.ceil(width / block)), h = Math.max(1, Math.ceil(height / block));
        if (motion.width !== w || motion.height !== h) motion.setSize(w, h);
        fit.uniforms.uGrid.value.set(w, h);
        const cycle = Math.floor(frame.time / Math.max(1, Number(params.iframe ?? 5)));
        const reset = !initialized || frame.time < lastTime || cycle !== lastCycle;
        fit.uniforms.tDiffuse.value = input;
        if (!reset) quad.render(ctx.renderer, fit, motion);
        decode.uniforms.tDiffuse.value = input;
        decode.uniforms.uReset.value = reset ? 1 : 0;
        decode.uniforms.uSmear.value = params.smear ?? 1.4;
        decode.uniforms.uBleed.value = params.bleed ?? .04;
        quad.render(ctx.renderer, decode, output);
        copy.uniforms.tDiffuse.value = output.texture;
        quad.render(ctx.renderer, copy, feedback);
        copy.uniforms.tDiffuse.value = input;
        quad.render(ctx.renderer, copy, previousInput);
        initialized = true; lastTime = frame.time; lastCycle = cycle;
      },
      resize(w, h) {
        width = w; height = h; initialized = false;
        previousInput.setSize(w, h); feedback.setSize(w, h);
        fit.uniforms.uResolution.value.set(w, h); decode.uniforms.uResolution.value.set(w, h);
      },
      dispose() {
        previousInput.dispose(); feedback.dispose(); motion.dispose();
        fit.dispose(); decode.dispose(); copy.dispose(); quad.dispose();
      },
    };
  },
};
export default effect;
