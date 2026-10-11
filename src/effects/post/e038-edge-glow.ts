import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '038',
  params: [
    { key: 'color', label: '発光色', type: 'color', default: '#36f3ff' },
    { key: 'useSource', label: '元の色で光らせる', type: 'bool', default: true },
    { key: 'width', label: '光の広がり(px)', type: 'number', min: 1, max: 8, step: 0.1, default: 3 },
    { key: 'strength', label: '強さ', type: 'number', min: 0, max: 4, step: 0.01, default: 2 },
    { key: 'darken', label: '元映像を暗く', type: 'number', min: 0, max: 1, step: 0.01, default: 0.75 },
  ],
  notes: '中心と周囲8方向（2半径）の輝度差から輪郭の強さを求め、ぼかし半径を持たせることで輪郭そのものが発光して見えるネオン調にする。',
  body: /* glsl */ `
${GLSL_COLOR}
float edgeAt(vec2 uv, float r) {
  vec2 px = r / uResolution;
  float c = luma(texture2D(tDiffuse, uv).rgb);
  float e = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    e += abs(c - luma(texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * px).rgb));
  }
  return e / 8.0;
}
void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  float e = edgeAt(vUv, 1.0) * 1.5 + edgeAt(vUv, uWidth) * 0.8 + edgeAt(vUv, uWidth * 2.0) * 0.4;
  vec3 tint = uUseSource > 0.5 ? normalize(base + 0.05) * 1.2 : uColor;
  vec3 col = base * (1.0 - uDarken) + tint * e * uStrength * 2.5;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
