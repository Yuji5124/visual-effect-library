import { defineShaderSource } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderSource({
  id: '016',
  status: 'experimental',
  params: [
    { key: 'speed', label: '前進速度', type: 'number', min: 0, max: 4, step: 0.01, default: 1 },
    { key: 'twist', label: 'ねじれ', type: 'number', min: -2, max: 2, step: 0.01, default: 0.4 },
    { key: 'sides', label: '断面の角数', type: 'number', min: 3, max: 12, step: 1, default: 6 },
  ],
  notes:
    '【実験中】極座標の (角度, 1/半径) をテクスチャ座標として使う古典的トンネル。多角形断面とリング状の明滅で時間ループ感を出している。Phase 2で「入力映像そのものが奥へ繰り返す」再帰版に置き換え予定。',
  body: /* glsl */ `
${GLSL_COLOR}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float a = atan(p.y, p.x);
  float seg = 6.28318 / floor(uSides);
  float r = length(p) * cos(mod(a, seg) - seg * 0.5);
  float z = 0.25 / max(r, 1e-3);
  float t = uTime * uSpeed;
  float u = a / 6.28318 + z * uTwist * 0.1 + t * 0.05;
  float v = z + t;
  float ring = smoothstep(0.42, 0.5, abs(fract(v) - 0.5));
  float spokes = smoothstep(0.46, 0.5, abs(fract(u * floor(uSides)) - 0.5));
  vec3 col = hsv2rgb(vec3(fract(floor(v) * 0.13 + 0.6), 0.7, 1.0)) * (ring + spokes * 0.6);
  col += hsv2rgb(vec3(fract(v * 0.05), 0.5, 0.2));
  col *= smoothstep(0.0, 0.35, r) * 1.3;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
