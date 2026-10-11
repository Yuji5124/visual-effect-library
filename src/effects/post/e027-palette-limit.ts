import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '027',
  params: [
    {
      key: 'palette',
      label: 'パレット',
      type: 'select',
      options: [
        { value: 'cga', label: 'CGA風 4色' },
        { value: 'pico', label: '16色ファンタジー' },
        { value: 'sepia', label: 'セピア8階調' },
        { value: 'neon', label: 'ネオン5色' },
      ],
      default: 'pico',
    },
    { key: 'dither', label: 'ディザ強度', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'pixel', label: 'ドットサイズ(px)', type: 'number', min: 1, max: 8, step: 1, default: 2 },
  ],
  notes: '各画素を固定パレット中の最も近い色（RGB距離）に置き換える。量子化前に 4×4 秩序ディザで揺らぎを加え、階調の段差を目立たなくする。',
  body: /* glsl */ `
vec3 best; float bestD;
void tryCol(vec3 c, vec3 p) { vec3 d = c - p; float e = dot(d, d * vec3(0.3, 0.59, 0.11)); if (e < bestD) { bestD = e; best = p; } }
vec3 hex(float r, float g, float b) { return vec3(r, g, b) / 255.0; }
float bayer4(vec2 p) {
  p = mod(floor(p), 4.0);
  float v = mod(2.0 * mod(p.x, 2.0) + 3.0 * mod(p.y, 2.0), 4.0) * 4.0;
  vec2 q = floor(p * 0.5);
  v += mod(2.0 * q.x + 3.0 * q.y, 4.0);
  return (v + 0.5) / 16.0;
}
void main() {
  vec2 px = floor(vUv * uResolution / uPixel);
  vec3 c = texture2D(tDiffuse, (px + 0.5) * uPixel / uResolution).rgb;
  c += (bayer4(px) - 0.5) * 0.25 * uDither;
  best = vec3(0.0); bestD = 1e9;
  if (uPalette < 0.5) {
    tryCol(c, hex(0.0, 0.0, 0.0)); tryCol(c, hex(85.0, 255.0, 255.0)); tryCol(c, hex(255.0, 85.0, 255.0)); tryCol(c, hex(255.0, 255.0, 255.0));
  } else if (uPalette < 1.5) {
    tryCol(c, hex(0.0, 0.0, 0.0)); tryCol(c, hex(29.0, 43.0, 83.0)); tryCol(c, hex(126.0, 37.0, 83.0)); tryCol(c, hex(0.0, 135.0, 81.0));
    tryCol(c, hex(171.0, 82.0, 54.0)); tryCol(c, hex(95.0, 87.0, 79.0)); tryCol(c, hex(194.0, 195.0, 199.0)); tryCol(c, hex(255.0, 241.0, 232.0));
    tryCol(c, hex(255.0, 0.0, 77.0)); tryCol(c, hex(255.0, 163.0, 0.0)); tryCol(c, hex(255.0, 236.0, 39.0)); tryCol(c, hex(0.0, 228.0, 54.0));
    tryCol(c, hex(41.0, 173.0, 255.0)); tryCol(c, hex(131.0, 118.0, 156.0)); tryCol(c, hex(255.0, 119.0, 168.0)); tryCol(c, hex(255.0, 204.0, 170.0));
  } else if (uPalette < 2.5) {
    for (int i = 0; i < 8; i++) { float k = float(i) / 7.0; tryCol(c, vec3(k * 1.05, k * 0.9, k * 0.7)); }
  } else {
    tryCol(c, hex(10.0, 5.0, 30.0)); tryCol(c, hex(255.0, 40.0, 140.0)); tryCol(c, hex(40.0, 240.0, 255.0)); tryCol(c, hex(255.0, 230.0, 60.0)); tryCol(c, hex(120.0, 60.0, 255.0));
  }
  gl_FragColor = vec4(best, 1.0);
}
`,
});
