import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HASH, GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '009',
  params: [
    { key: 'loss', label: '欠損率', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'lineHeight', label: '欠損行の高さ(px)', type: 'number', min: 1, max: 24, step: 1, default: 4 },
    { key: 'freeze', label: '直前行の引き伸ばし', type: 'bool', default: true },
    { key: 'noise', label: 'ノイズ置換', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  notes: 'パケット欠落のように走査行を単位として欠落させ、黒帯・ノイズ・直前の正常行の引き伸ばし（エラーコンシールメント風）で置き換える。欠損率は時間で揺らぐ。',
  body: /* glsl */ `
${GLSL_HASH}
${GLSL_COLOR}
void main() {
  float t = floor(uTime * 15.0);
  float burst = 0.5 + 0.5 * sin(uTime * 0.7) * sin(uTime * 1.9);
  float rows = uResolution.y / uLineHeight;
  float row = floor(vUv.y * rows);
  float lost = step(hash12(vec2(row, t)), uLoss * burst * 0.6);
  float chunk = step(hash12(vec2(floor(row / 12.0), t * 1.7)), uLoss * burst * 0.25);
  lost = max(lost, chunk);
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  if (lost > 0.5) {
    float r = hash12(vec2(row * 1.3, t + 3.0));
    if (uFreeze > 0.5 && r < 0.45) {
      // 直前の正常行を引き伸ばす
      float k = 1.0;
      for (int i = 1; i < 12; i++) {
        float pr = row - float(i);
        if (step(hash12(vec2(pr, t)), uLoss * burst * 0.6) < 0.5) { k = float(i); break; }
      }
      col = texture2D(tDiffuse, vec2(vUv.x, (row - k + 0.5) / rows)).rgb;
    } else if (r < 0.45 + uNoise * 0.4) {
      col = vec3(hash12(vec2(vUv.x * uResolution.x, row + t)));
      col *= vec3(0.6, 0.8, 1.0);
    } else {
      col = vec3(0.0);
    }
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
