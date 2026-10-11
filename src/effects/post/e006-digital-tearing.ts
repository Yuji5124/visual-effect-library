import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HASH } from '../../engine/glsl';

export default defineShaderPost({
  id: '006',
  params: [
    { key: 'tears', label: '裂け目の数', type: 'number', min: 1, max: 8, step: 1, default: 3 },
    { key: 'shift', label: '横ずれ', type: 'number', min: 0, max: 0.5, step: 0.005, default: 0.12 },
    { key: 'roll', label: '縦ロール速度', type: 'number', min: 0, max: 2, step: 0.01, default: 0.35 },
    { key: 'rate', label: '発生頻度', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
  ],
  notes: '垂直同期が外れた表示を想定し、画面を数本の水平境界で上下に分断。各帯は異なる横オフセットと縦ロールで描かれ、境界には白い走査ノイズが乗る。',
  body: /* glsl */ `
${GLSL_HASH}
void main() {
  float t = floor(uTime * 12.0);
  float on = step(1.0 - uRate, hash11(floor(uTime * 2.0)));
  vec2 uv = vUv;
  float band = 0.0;
  float edge = 0.0;
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uTears) break;
    float y = fract(hash11(float(i) * 7.3 + floor(uTime * 0.5)) + uTime * uRoll * (0.3 + hash11(float(i))));
    band += step(y, uv.y);
    edge = max(edge, smoothstep(0.004, 0.0, abs(uv.y - y)));
  }
  uv.x += (hash11(band + t * 0.1) - 0.5) * 2.0 * uShift * on * step(0.5, band);
  uv.y = fract(uv.y + on * band * 0.013);
  vec3 col = texture2D(tDiffuse, fract(uv)).rgb;
  col += on * edge * hash12(vec2(vUv.x * 300.0, t));
  gl_FragColor = vec4(col, 1.0);
}
`,
});
