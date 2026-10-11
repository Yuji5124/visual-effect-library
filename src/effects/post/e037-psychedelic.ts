import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '037',
  params: [
    { key: 'bands', label: '縞の数', type: 'number', min: 1, max: 12, step: 0.1, default: 3.5 },
    { key: 'speed', label: '流れる速さ', type: 'number', min: 0, max: 3, step: 0.01, default: 0.6 },
    { key: 'warp', label: 'うねり', type: 'number', min: 0, max: 0.05, step: 0.001, default: 0.01 },
    { key: 'mixAmount', label: '適用量', type: 'number', min: 0, max: 1, step: 0.01, default: 0.9 },
  ],
  notes: '輝度に時間と位置を足した値をコサインパレットに通し、等輝度線を虹色の縞として流す。UVをわずかにうねらせて溶けるような感覚を加える。',
  body: /* glsl */ `
${GLSL_COLOR}
void main() {
  vec2 uv = vUv + vec2(sin(vUv.y * 20.0 + uTime * 2.0), cos(vUv.x * 17.0 + uTime * 1.7)) * uWarp;
  vec3 c = texture2D(tDiffuse, uv).rgb;
  float l = luma(c);
  float t = l * uBands - uTime * uSpeed + length(vUv - 0.5) * 0.5;
  vec3 p = palette(t, vec3(0.5), vec3(0.5), vec3(1.0), vec3(0.0, 0.33, 0.67));
  p *= 0.4 + l * 1.2;
  gl_FragColor = vec4(mix(c, p, uMixAmount), 1.0);
}
`,
});
