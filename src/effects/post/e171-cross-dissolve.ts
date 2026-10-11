import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_NOISE, GLSL_TRANSITION } from '../../engine/glsl';
import { TRANSITION_NOTE, TRANSITION_PARAMS } from './transitionParams';

export default defineShaderPost({
  id: '171',
  params: [
    ...TRANSITION_PARAMS,
    {
      key: 'style',
      label: '溶け方',
      type: 'select',
      options: [
        { value: 'linear', label: '通常のディゾルブ' },
        { value: 'noise', label: 'ノイズで溶ける' },
        { value: 'burn', label: '燃える縁' },
      ],
      default: 'noise',
    },
    { key: 'scale', label: 'ノイズの細かさ', type: 'number', min: 1, max: 20, step: 0.1, default: 6 },
    { key: 'edgeColor', label: '縁の色', type: 'color', default: '#ffb340' },
  ],
  notes: `進行度とノイズ値を比較して画素ごとに切替時刻をずらすことで、単純な不透明度の補間ではない「溶ける」切替にする。${TRANSITION_NOTE}`,
  body: /* glsl */ `
${GLSL_NOISE}
${GLSL_TRANSITION}
void main() {
  float p = transitionProgress();
  vec3 a = texture2D(tDiffuse, vUv).rgb;
  vec3 b = sceneB(vUv);
  vec3 col;
  if (uStyle < 0.5) col = mix(a, b, p);
  else {
    float n = fbm(vUv * uScale * vec2(uResolution.x / uResolution.y, 1.0));
    float e = p * 1.2 - 0.1;
    float k = smoothstep(e - 0.02, e + 0.02, n);
    col = mix(b, a, k);
    if (uStyle > 1.5) col += uEdgeColor * smoothstep(0.06, 0.0, abs(n - e)) * 2.0 * step(0.001, p) * step(p, 0.999);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
