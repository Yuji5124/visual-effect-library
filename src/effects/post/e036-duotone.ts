import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '036',
  params: [
    { key: 'shadow', label: '暗部色', type: 'color', default: '#1b0a4a' },
    { key: 'highlight', label: '明部色', type: 'color', default: '#ffcf3d' },
    { key: 'contrast', label: 'コントラスト', type: 'number', min: 0.3, max: 3, step: 0.01, default: 1.4 },
    { key: 'mixAmount', label: '適用量', type: 'number', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  notes: '輝度にコントラストカーブをかけ、2色の線形補間へマッピングする。ポスターやUI背景の雰囲気統一に有効。',
  body: /* glsl */ `
${GLSL_COLOR}
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = clamp((luma(c) - 0.5) * uContrast + 0.5, 0.0, 1.0);
  l = l * l * (3.0 - 2.0 * l);
  vec3 duo = mix(uShadow, uHighlight, l);
  gl_FragColor = vec4(mix(c, duo, uMixAmount), 1.0);
}
`,
});
