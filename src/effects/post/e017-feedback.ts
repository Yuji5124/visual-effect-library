import * as THREE from 'three';
import { FullscreenQuad, createTarget, makeShader, COPY_FRAGMENT } from '../../engine/fullscreen';
import type { PostEffect } from '../../engine/types';

const FEEDBACK_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform sampler2D tPrev;
uniform vec2 uResolution;
uniform float uAmount;
uniform float uZoom;
uniform float uRotate;
uniform float uHueShift;
uniform float uMode;
varying vec2 vUv;
vec3 hueShift(vec3 c, float a) {
  vec3 k = vec3(0.57735);
  float ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vUv - 0.5;
  p.x *= aspect;
  float c = cos(uRotate), s = sin(uRotate);
  p = mat2(c, s, -s, c) * p / uZoom;
  p.x /= aspect;
  vec2 uv = p + 0.5;
  vec3 prev = texture2D(tPrev, uv).rgb;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  prev = hueShift(prev, uHueShift) * uAmount * inside;
  vec3 cur = texture2D(tDiffuse, vUv).rgb;
  vec3 outc = uMode < 0.5 ? max(cur, prev) : (uMode < 1.5 ? mix(cur, prev, uAmount) : cur * (1.0 - uAmount) + prev);
  gl_FragColor = vec4(outc, 1.0);
}
`;

const effect: PostEffect = {
  id: '017',
  kind: 'post',
  status: 'implemented',
  params: [
    { key: 'amount', label: 'フィードバック量', type: 'number', min: 0, max: 0.99, step: 0.005, default: 0.9 },
    { key: 'zoom', label: 'ズーム', type: 'number', min: 0.9, max: 1.1, step: 0.001, default: 1.02 },
    { key: 'rotate', label: '回転（度/フレーム）', type: 'number', min: -6, max: 6, step: 0.05, default: 0.8 },
    { key: 'hueShift', label: '色相シフト', type: 'number', min: 0, max: 0.3, step: 0.005, default: 0.04 },
    {
      key: 'mode',
      label: '合成',
      type: 'select',
      options: [
        { value: 'max', label: '比較(明)' },
        { value: 'mix', label: 'ミックス' },
        { value: 'add', label: '加算' },
      ],
      default: 'max',
    },
  ],
  notes:
    '前フレームの出力を保持するバッファ（半精度浮動小数点）を2枚交互に使い、ズーム・回転・色相回転してから現在フレームと合成する。ビデオフィードバックの古典的手法。',
  create(ctx) {
    const opt = { float: true };
    let prev = createTarget(ctx.width, ctx.height, opt);
    let next = createTarget(ctx.width, ctx.height, opt);
    const quad = new FullscreenQuad();
    const uniforms = {
      tDiffuse: { value: null as THREE.Texture | null },
      tPrev: { value: prev.texture as THREE.Texture },
      uResolution: { value: new THREE.Vector2(ctx.width, ctx.height) },
      uAmount: { value: 0.9 },
      uZoom: { value: 1.02 },
      uRotate: { value: 0 },
      uHueShift: { value: 0 },
      uMode: { value: 0 },
    };
    const mat = makeShader(FEEDBACK_FRAGMENT, uniforms);
    const copy = makeShader(COPY_FRAGMENT, { tDiffuse: { value: null } });
    const modes = ['max', 'mix', 'add'];
    return {
      render(input, target, params) {
        uniforms.tDiffuse.value = input;
        uniforms.tPrev.value = prev.texture;
        uniforms.uAmount.value = Number(params.amount);
        uniforms.uZoom.value = Number(params.zoom);
        uniforms.uRotate.value = (Number(params.rotate) * Math.PI) / 180;
        uniforms.uHueShift.value = Number(params.hueShift);
        uniforms.uMode.value = Math.max(0, modes.indexOf(String(params.mode)));
        quad.render(ctx.renderer, mat, next);
        copy.uniforms.tDiffuse.value = next.texture;
        quad.render(ctx.renderer, copy, target);
        [prev, next] = [next, prev];
      },
      resize(w, h) {
        prev.setSize(w, h);
        next.setSize(w, h);
        uniforms.uResolution.value.set(w, h);
      },
      dispose() {
        prev.dispose();
        next.dispose();
        mat.dispose();
        copy.dispose();
        quad.dispose();
      },
    };
  },
};

export default effect;
