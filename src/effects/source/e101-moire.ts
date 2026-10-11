import { defineShaderSource } from '../../engine/shaderEffect';

export default defineShaderSource({
  id: '101',
  params: [
    { key: 'frequency', label: '縞の密度', type: 'number', min: 20, max: 300, step: 1, default: 110 },
    { key: 'offset', label: '中心のずれ', type: 'number', min: 0, max: 0.3, step: 0.001, default: 0.08 },
    { key: 'speed', label: '速度', type: 'number', min: 0, max: 2, step: 0.01, default: 0.4 },
    {
      key: 'pattern',
      label: 'パターン',
      type: 'select',
      options: [
        { value: 'rings', label: '同心円 × 同心円' },
        { value: 'lines', label: '平行線 × 回転平行線' },
        { value: 'mixed', label: '同心円 × 平行線' },
      ],
      default: 'rings',
    },
    { key: 'color', label: 'カラー', type: 'bool', default: true },
  ],
  notes: 'わずかに周期・位置・角度の異なる2つの高周波パターンを乗算すると、低周波の干渉縞（モアレ）が現れる。画素格子とのエイリアスを避けるため滑らかな正弦波で描画。',
  body: /* glsl */ `
float rings(vec2 p, vec2 c, float f) { return 0.5 + 0.5 * sin(length(p - c) * f); }
float lines(vec2 p, float a, float f) { return 0.5 + 0.5 * sin(dot(p, vec2(cos(a), sin(a))) * f); }
void main() {
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float t = uTime * uSpeed;
  vec2 o = vec2(cos(t), sin(t * 0.8)) * uOffset;
  float a, b;
  if (uPattern < 0.5) { a = rings(p, -o, uFrequency); b = rings(p, o, uFrequency * 1.02); }
  else if (uPattern < 1.5) { a = lines(p, 0.0, uFrequency); b = lines(p, 0.05 + uOffset * sin(t), uFrequency); }
  else { a = rings(p, o, uFrequency); b = lines(p, t * 0.1, uFrequency); }
  vec3 col;
  if (uColor > 0.5) {
    float c2 = rings(p, o * 1.7, uFrequency * 0.98);
    col = vec3(a * b, b * c2, a * c2) * 1.3;
  } else {
    col = vec3(a * b);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
