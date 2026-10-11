import { defineShaderPost } from '../../engine/shaderEffect';
import { historyExtra, GLSL_HISTORY } from '../../engine/history';

export default defineShaderPost({
  id: '012',
  params: [
    { key: 'echoes', label: 'こだまの数', type: 'number', min: 1, max: 7, step: 1, default: 5 },
    { key: 'gap', label: '間隔(フレーム)', type: 'number', min: 1, max: 6, step: 1, default: 4 },
    { key: 'decay', label: '減衰', type: 'number', min: 0.2, max: 0.95, step: 0.01, default: 0.65 },
    { key: 'colorize', label: 'こだまに色を付ける', type: 'bool', default: true },
  ],
  notes: '履歴アトラスから一定間隔の過去フレームを複数取り出し、減衰させながら比較(明)合成する。色付きにすると時間差が虹色の残像として見える。',
  extraDecl: GLSL_HISTORY,
  extra: historyExtra({ frames: 32, scale: 0.5 }),
  body: /* glsl */ `
vec3 hue(float h) { return clamp(abs(fract(h + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  float w = 1.0;
  for (int i = 1; i <= 7; i++) {
    if (float(i) > uEchoes) break;
    w *= uDecay;
    vec3 e = historyAt(vUv, float(i) * uGap) * w;
    if (uColorize > 0.5) e *= hue(float(i) / 7.0 + uTime * 0.05) * 1.5;
    col = max(col, e);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
