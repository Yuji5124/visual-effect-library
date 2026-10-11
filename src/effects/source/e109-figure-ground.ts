import { defineShaderSource } from '../../engine/shaderEffect';

export default defineShaderSource({
  id: '109',
  params: [
    { key: 'morph', label: '輪郭の揺らぎ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'swap', label: '図と地の色を周期的に入れ替える', type: 'bool', default: true },
    { key: 'colorA', label: '色A', type: 'color', default: '#111111' },
    { key: 'colorB', label: '色B', type: 'color', default: '#f2efe6' },
  ],
  notes:
    'ルビンの壺の構造を手続き生成。左右対称な横顔プロファイル（額・鼻・唇・顎）を関数で作り、中央の領域（壺）と外側（向かい合う2つの横顔）が同じ境界線を共有する。色の入れ替えと輪郭の揺らぎで、図と地の解釈が切り替わる瞬間を作る。',
  body: /* glsl */ `
float profile(float y, float t) {
  // y: -1(下)〜1(上) に対する横顔の境界の x（中心からの距離）
  float w = 0.32;
  w += 0.10 * exp(-pow((y - 0.55) * 4.0, 2.0));        // 額
  w -= 0.07 * exp(-pow((y - 0.28) * 6.0, 2.0));        // 目のくぼみ
  w += 0.13 * exp(-pow((y - 0.10) * 7.0, 2.0)) * (1.0 + 0.3 * uMorph * sin(t)); // 鼻
  w -= 0.05 * exp(-pow((y + 0.08) * 9.0, 2.0));        // 鼻の下
  w += 0.06 * exp(-pow((y + 0.2) * 10.0, 2.0));        // 唇
  w -= 0.05 * exp(-pow((y + 0.32) * 9.0, 2.0));
  w += 0.07 * exp(-pow((y + 0.48) * 6.0, 2.0));        // 顎
  w -= 0.12 * smoothstep(-0.6, -0.95, y);               // 首
  return w;
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 2.0;
  float t = uTime * 0.8;
  float inside = step(abs(p.x), profile(p.y, t) * 1.4) * step(abs(p.y), 0.95);
  inside = max(inside, step(abs(p.x), 0.55) * step(0.95, abs(p.y)) * step(abs(p.y), 1.05));
  float phase = uSwap > 0.5 ? smoothstep(0.4, 0.6, 0.5 + 0.5 * sin(uTime * 0.5)) : 0.0;
  vec3 a = mix(uColorA, uColorB, phase);
  vec3 b = mix(uColorB, uColorA, phase);
  gl_FragColor = vec4(mix(b, a, inside), 1.0);
}
`,
});
