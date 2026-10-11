import { defineShaderSource } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderSource({
  id: '103',
  params: [
    { key: 'stare', label: '凝視時間(秒)', type: 'number', min: 5, max: 40, step: 1, default: 20 },
    { key: 'blank', label: '白黒表示の時間(秒)', type: 'number', min: 3, max: 20, step: 1, default: 8 },
    {
      key: 'motif',
      label: '図柄',
      type: 'select',
      options: [
        { value: 'flag', label: '補色の旗' },
        { value: 'landscape', label: '補色の風景' },
        { value: 'circles', label: '色の円' },
      ],
      default: 'landscape',
    },
  ],
  notes:
    '【見る人の目で完成する錯視】中央の点を凝視時間のあいだ見つめ続けると、網膜の色の受容体が順応する。その後に白黒の画像へ切り替わると、補色の残像によって白黒画像に本来の色がついて見える。画面には補色と白黒しか描いていない。',
  body: /* glsl */ `
${GLSL_COLOR}
vec3 motifColor(vec2 uv) {
  if (uMotif < 0.5) {
    if (uv.x < 0.33) return vec3(0.0, 0.6, 1.0);
    if (uv.y > 0.55) return vec3(0.0, 1.0, 1.0);
    return uv.y > 0.3 ? vec3(1.0) : vec3(0.0, 1.0, 1.0);
  }
  if (uMotif < 1.5) {
    float sky = smoothstep(0.45, 0.55, uv.y + sin(uv.x * 6.0) * 0.05);
    vec3 c = mix(vec3(1.0, 0.2, 1.0), vec3(1.0, 0.75, 0.2), sky);
    c = mix(c, vec3(0.0, 0.5, 1.0), smoothstep(0.08, 0.06, length(uv - vec2(0.75, 0.75))));
    return c;
  }
  vec2 g = fract(uv * vec2(3.0, 2.0)) - 0.5;
  vec2 id = floor(uv * vec2(3.0, 2.0));
  return length(g) < 0.32 ? hsv2rgb(vec3(id.x / 3.0 + id.y * 0.5, 1.0, 1.0)) : vec3(0.5);
}
void main() {
  float total = uStare + uBlank;
  float t = mod(uTime, total);
  vec3 c = motifColor(vUv);
  vec3 col = t < uStare ? c : vec3(luma(1.0 - c) * 0.9 + 0.05);
  // 凝視点と残り時間のバー
  vec2 d = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  col = mix(col, vec3(0.0), smoothstep(0.012, 0.006, length(d)));
  float prog = t < uStare ? t / uStare : 1.0;
  col = mix(col, vec3(0.1), step(vUv.y, 0.012) * step(vUv.x, prog) * step(t, uStare));
  gl_FragColor = vec4(col, 1.0);
}
`,
});
