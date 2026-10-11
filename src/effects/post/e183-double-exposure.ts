import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR, GLSL_WORLD_B } from '../../engine/glsl';

export default defineShaderPost({
  id: '183',
  params: [
    {
      key: 'blend',
      label: '合成方法',
      type: 'select',
      options: [
        { value: 'screen', label: 'スクリーン（フィルム多重露光）' },
        { value: 'mask', label: '被写体の中にだけ風景' },
        { value: 'lighten', label: '比較(明)' },
      ],
      default: 'mask',
    },
    { key: 'amount', label: '2枚目の濃さ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.85 },
    { key: 'offset', label: '2枚目のずれ', type: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0.1 },
    { key: 'mono', label: 'モノクロ化', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
  ],
  notes: '入力映像に2枚目の風景（手続き生成の夕景）を重ねる。「被写体の中にだけ風景」は明るい部分をマスクとして風景をはめ込む、ポートレート写真で定番の二重露光表現。',
  body: /* glsl */ `
${GLSL_COLOR}
${GLSL_WORLD_B}
void main() {
  vec3 a = texture2D(tDiffuse, vUv).rgb;
  vec3 b = worldB(clamp(vUv + vec2(uOffset, 0.0), 0.0, 1.0), uTime, uResolution.x / uResolution.y);
  vec3 col;
  if (uBlend < 0.5) col = 1.0 - (1.0 - a) * (1.0 - b * uAmount);
  else if (uBlend < 1.5) {
    float m = smoothstep(0.08, 0.35, luma(a));
    col = mix(vec3(0.94, 0.92, 0.88) * (1.0 - m * 0.2), mix(a, b * (0.6 + luma(a)), uAmount), m);
  } else col = max(a, b * uAmount);
  col = mix(col, vec3(luma(col)), uMono);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
