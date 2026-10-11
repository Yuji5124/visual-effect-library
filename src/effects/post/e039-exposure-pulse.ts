import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '039',
  params: [
    { key: 'bpm', label: 'テンポ(BPM)', type: 'number', min: 30, max: 200, step: 1, default: 100 },
    { key: 'peak', label: '最大露出', type: 'number', min: 1, max: 8, step: 0.1, default: 3.5 },
    { key: 'decay', label: '減衰の速さ', type: 'number', min: 1, max: 20, step: 0.1, default: 7 },
    { key: 'tint', label: 'フラッシュ色', type: 'color', default: '#fff1d6' },
  ],
  notes: 'テンポに同期して露出を一瞬跳ね上げ、指数関数で戻す。フィルム風の肩特性（x/(1+x)）で白飛びをなめらかにし、写真のフラッシュのように見せる。',
  body: /* glsl */ `
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float beat = fract(uTime * uBpm / 60.0);
  float pulse = exp(-beat * uDecay);
  float ex = 1.0 + (uPeak - 1.0) * pulse;
  vec3 e = c * ex * mix(vec3(1.0), uTint, pulse);
  e = e / (1.0 + max(e - 1.0, 0.0));
  e += uTint * pulse * 0.15;
  gl_FragColor = vec4(clamp(e, 0.0, 1.0), 1.0);
}
`,
});
