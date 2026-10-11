import { defineShaderSource } from '../../engine/shaderEffect';
import { GLSL_NOISE } from '../../engine/glsl';

export default defineShaderSource({
  id: '075',
  params: [
    { key: 'scale', label: 'スケール', type: 'number', min: 0.5, max: 8, step: 0.01, default: 2.5 },
    { key: 'speed', label: '変形速度', type: 'number', min: 0, max: 1, step: 0.01, default: 0.12 },
    { key: 'contours', label: '等高線の本数', type: 'number', min: 4, max: 60, step: 1, default: 24 },
    { key: 'warp', label: 'ドメインワープ', type: 'number', min: 0, max: 2, step: 0.01, default: 0.8 },
    {
      key: 'style',
      label: '表示',
      type: 'select',
      options: [
        { value: 'map', label: '地形図' },
        { value: 'lines', label: '等高線のみ' },
        { value: 'heat', label: '高さの色分け' },
      ],
      default: 'map',
    },
  ],
  notes: '多オクターブのバリューノイズ（fBm）を時間変化する高さ場とみなし、勾配による陰影（ヒルシェード）と等高線（fract + 微分によるアンチエイリアス）で地形図として可視化する。',
  body: /* glsl */ `
${GLSL_NOISE}
float height(vec2 p) {
  float t = uTime * uSpeed;
  vec2 q = vec2(fbm(p + t), fbm(p + vec2(4.1, 1.7) - t));
  return fbm(p + q * uWarp + t * 0.3);
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * uScale;
  float h = height(p);
  vec2 e = vec2(0.01, 0.0);
  vec2 g = vec2(height(p + e.xy) - height(p - e.xy), height(p + e.yx) - height(p - e.yx)) / 0.02;
  vec3 n = normalize(vec3(-g * 1.5, 1.0));
  float shade = clamp(dot(n, normalize(vec3(-0.6, 0.6, 0.6))), 0.0, 1.0);
  float c = h * uContours;
  float w = fwidth(c);
  float line = 1.0 - smoothstep(0.0, w * 1.5, abs(fract(c) - 0.5) * 2.0 - (1.0 - w * 2.0));
  line = smoothstep(w * 1.2, 0.0, min(fract(c), 1.0 - fract(c)));
  float major = smoothstep(w * 1.5, 0.0, min(fract(c / 5.0), 1.0 - fract(c / 5.0)) * 5.0);
  vec3 col;
  if (uStyle < 0.5) {
    vec3 land = h < 0.42 ? mix(vec3(0.05, 0.15, 0.35), vec3(0.15, 0.4, 0.6), h / 0.42)
              : mix(vec3(0.25, 0.45, 0.2), vec3(0.75, 0.65, 0.5), smoothstep(0.42, 0.75, h));
    land = mix(land, vec3(0.95), smoothstep(0.75, 0.85, h));
    col = land * (0.45 + 0.75 * shade);
    col = mix(col, col * 0.4, line * 0.6 + major * 0.3);
  } else if (uStyle < 1.5) {
    col = vec3(0.02, 0.03, 0.05) + vec3(0.3, 1.0, 0.8) * (line * 0.6 + major);
  } else {
    col = 0.5 + 0.5 * cos(6.28318 * (h * 1.2 + vec3(0.0, 0.33, 0.67)));
    col *= 0.5 + 0.6 * shade;
    col = mix(col, vec3(0.0), line * 0.5);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
