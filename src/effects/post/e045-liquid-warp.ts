import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_NOISE } from '../../engine/glsl';

export default defineShaderPost({
  id: '045',
  params: [
    { key: 'amount', label: '歪み量', type: 'number', min: 0, max: 0.2, step: 0.001, default: 0.05 },
    { key: 'scale', label: 'うねりの大きさ', type: 'number', min: 0.5, max: 8, step: 0.01, default: 2.5 },
    { key: 'speed', label: '流れる速さ', type: 'number', min: 0, max: 2, step: 0.01, default: 0.3 },
    { key: 'gloss', label: '表面のツヤ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
  ],
  notes: 'fbmノイズの値を座標に足してもう一度fbmを取る「ドメインワーピング」で、液体のような有機的な流れを作る。歪み場の勾配から擬似的な反射光も加える。',
  body: /* glsl */ `
${GLSL_NOISE}
vec2 warpField(vec2 p, float t) {
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, 1.3 - t)));
  vec2 r = vec2(fbm(p + 3.0 * q + vec2(1.7, 9.2) + t * 0.5), fbm(p + 3.0 * q + vec2(8.3, 2.8) - t * 0.4));
  return r - 0.5;
}
void main() {
  vec2 p = vUv * uScale * vec2(uResolution.x / uResolution.y, 1.0);
  float t = uTime * uSpeed;
  vec2 w = warpField(p, t);
  vec3 col = texture2D(tDiffuse, vUv + w * uAmount).rgb;
  float spec = pow(max(0.0, w.x + w.y + 0.3), 4.0);
  col += spec * uGloss * 0.8;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
