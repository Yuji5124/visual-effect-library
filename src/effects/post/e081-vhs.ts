import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_NOISE } from '../../engine/glsl';

export default defineShaderPost({
  id: '081',
  params: [
    { key: 'tracking', label: 'トラッキングずれ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'noise', label: 'ノイズ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'bleed', label: '色にじみ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'saturation', label: '彩度', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.75 },
  ],
  notes: '輝度(Y)は鋭く、色差(IQ)は水平方向に広くぼかすことでVHSの色にじみを再現。下へ流れるトラッキング帯で行ごとの横ずれとノイズを強める。',
  body: /* glsl */ `
${GLSL_NOISE}
vec3 toYIQ(vec3 c) { return mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c; }
vec3 toRGB(vec3 c) { return mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * c; }
void main() {
  vec2 uv = vUv;
  float t = uTime;
  float line = floor(uv.y * 240.0);
  float bandPos = fract(1.0 - t * 0.12);
  float band = smoothstep(0.08, 0.0, abs(uv.y - bandPos)) * uTracking;
  float jitter = (hash12(vec2(line, floor(t * 30.0))) - 0.5) * 0.003 * uNoise;
  uv.x += jitter + band * (vnoise(vec2(line * 0.3, t * 20.0)) - 0.5) * 0.08;
  uv.x += sin(uv.y * 30.0 + t * 2.0) * 0.0015 * uTracking;

  float y = toYIQ(texture2D(tDiffuse, uv).rgb).x;
  vec2 iq = vec2(0.0);
  float spread = 0.004 + 0.012 * uBleed;
  for (int i = 0; i < 6; i++) {
    float o = (float(i) - 1.0) * spread / 5.0 * 2.0;
    iq += toYIQ(texture2D(tDiffuse, uv - vec2(o, 0.0)).rgb).yz;
  }
  iq /= 6.0;
  vec3 col = toRGB(vec3(y, iq * uSaturation));

  float n = hash12(vec2(uv.x * 400.0, line + floor(t * 60.0)));
  col += (n - 0.5) * 0.12 * uNoise;
  col += step(0.995 - band * 0.05, n) * uNoise * 0.6;
  col = mix(col, vec3(n), band * 0.35);
  col *= 0.92 + 0.08 * sin(uv.y * uResolution.y * 1.5);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
});
