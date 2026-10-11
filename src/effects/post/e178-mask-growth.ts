import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_NOISE, GLSL_TRANSITION } from '../../engine/glsl';
import { TRANSITION_NOTE, TRANSITION_PARAMS } from './transitionParams';

export default defineShaderPost({
  id: '178',
  params: [
    ...TRANSITION_PARAMS,
    { key: 'seeds', label: '成長の起点数', type: 'number', min: 1, max: 12, step: 1, default: 5 },
    { key: 'organic', label: '有機的な縁', type: 'number', min: 0, max: 0.4, step: 0.005, default: 0.18 },
    { key: 'veinColor', label: '侵食前線の色', type: 'color', default: '#7dff6a' },
  ],
  notes: `複数の起点からの距離（ボロノイ的な最小距離）にノイズを足した値を成長時刻として使い、カビや蔦が広がるように次の映像が侵食する。前線には発光色を乗せる。${TRANSITION_NOTE}`,
  body: /* glsl */ `
${GLSL_NOISE}
${GLSL_TRANSITION}
void main() {
  float p = transitionProgress();
  vec2 q = vUv * vec2(uResolution.x / uResolution.y, 1.0);
  float d = 10.0;
  for (int i = 0; i < 12; i++) {
    if (float(i) >= uSeeds) break;
    vec2 s = hash22(vec2(float(i), 4.2)) * vec2(uResolution.x / uResolution.y, 1.0);
    d = min(d, length(q - s));
  }
  float f = d + (fbm(q * 6.0) - 0.5) * uOrganic * 2.0 + (fbm(q * 25.0) - 0.5) * uOrganic * 0.3;
  float e = p * 1.3 - 0.05;
  float k = smoothstep(e - 0.01, e + 0.01, f);
  vec3 col = mix(sceneB(vUv), texture2D(tDiffuse, vUv).rgb, k);
  col += uVeinColor * smoothstep(0.04, 0.0, abs(f - e)) * 1.5 * step(0.001, p) * step(p, 0.999);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
