import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '118',
  params: [
    { key: 'contrast', label: 'コントラスト', type: 'number', min: 0.3, max: 3, step: 0.01, default: 1.2 },
    { key: 'shift', label: '温度シフト', type: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0 },
    { key: 'scan', label: 'スキャンバー', type: 'bool', default: true },
  ],
  notes: '輝度を「温度」とみなし、黒→青→紫→赤→黄→白のサーマルカラーマップへ変換する。',
  body: /* glsl */ `
${GLSL_COLOR}
vec3 thermal(float t) {
  t = clamp(t, 0.0, 1.0);
  vec3 c0 = vec3(0.0, 0.0, 0.05);
  vec3 c1 = vec3(0.1, 0.0, 0.6);
  vec3 c2 = vec3(0.75, 0.0, 0.55);
  vec3 c3 = vec3(1.0, 0.25, 0.0);
  vec3 c4 = vec3(1.0, 0.85, 0.0);
  vec3 c5 = vec3(1.0, 1.0, 1.0);
  float s = t * 5.0;
  if (s < 1.0) return mix(c0, c1, s);
  if (s < 2.0) return mix(c1, c2, s - 1.0);
  if (s < 3.0) return mix(c2, c3, s - 2.0);
  if (s < 4.0) return mix(c3, c4, s - 3.0);
  return mix(c4, c5, s - 4.0);
}
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = (luma(c) - 0.5) * uContrast + 0.5 + uShift;
  vec3 col = thermal(l);
  if (uScan > 0.5) {
    float y = fract(uTime * 0.25);
    col += vec3(0.25, 0.9, 1.0) * smoothstep(0.012, 0.0, abs(vUv.y - y)) * 0.6;
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
