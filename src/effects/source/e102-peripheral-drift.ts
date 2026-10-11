import { defineShaderSource } from '../../engine/shaderEffect';

export default defineShaderSource({
  id: '102',
  params: [
    { key: 'rings', label: 'リング数', type: 'number', min: 3, max: 12, step: 1, default: 7 },
    { key: 'segments', label: '1周の単位数', type: 'number', min: 8, max: 48, step: 1, default: 24 },
    { key: 'contrast', label: 'コントラスト', type: 'number', min: 0.2, max: 1, step: 0.01, default: 1 },
    {
      key: 'palette',
      label: '配色',
      type: 'select',
      options: [
        { value: 'classic', label: '黒→青→白→黄' },
        { value: 'mono', label: '黒→灰→白→灰' },
      ],
      default: 'classic',
    },
  ],
  notes:
    '【静止画です】「黒→暗い色→白→明るい色」の非対称な輝度の並びを繰り返すと、周辺視で見たときに暗→明の方向へ動いて見える（周辺ドリフト錯視）。隣のリングは向きを逆にしてあり、視線を動かすと回転して見える。画像自体は一切動いていない。',
  body: /* glsl */ `
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float r = length(p);
  float a = atan(p.y, p.x) / 6.28318 + 0.5;
  float ring = floor(r * uRings * 2.0);
  float dir = mod(ring, 2.0) * 2.0 - 1.0;
  float u = fract((dir > 0.0 ? a : 1.0 - a) * uSegments + ring * 0.37);
  int k = int(floor(u * 4.0));
  vec3 c0 = vec3(0.0), c1, c2 = vec3(1.0), c3;
  if (uPalette < 0.5) { c1 = vec3(0.1, 0.2, 0.75); c3 = vec3(0.95, 0.85, 0.1); }
  else { c1 = vec3(0.35); c3 = vec3(0.65); }
  vec3 col = k == 0 ? c0 : (k == 1 ? c1 : (k == 2 ? c2 : c3));
  vec3 bg = uPalette < 0.5 ? vec3(0.35, 0.55, 0.3) : vec3(0.5);
  float band = fract(r * uRings * 2.0);
  col = mix(bg, col, smoothstep(0.05, 0.12, band) * smoothstep(0.95, 0.88, band));
  col = mix(vec3(0.5), col, uContrast);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
