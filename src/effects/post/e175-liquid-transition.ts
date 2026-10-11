import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_NOISE, GLSL_TRANSITION } from '../../engine/glsl';
import { TRANSITION_NOTE, TRANSITION_PARAMS } from './transitionParams';

export default defineShaderPost({
  id: '175',
  params: [
    ...TRANSITION_PARAMS,
    { key: 'drips', label: 'したたりの数', type: 'number', min: 2, max: 40, step: 1, default: 14 },
    { key: 'viscosity', label: '粘り（ばらつき）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'distortion', label: '液面の屈折', type: 'number', min: 0, max: 0.05, step: 0.001, default: 0.015 },
  ],
  notes: `次の映像が上から液体として流れ込む。列ごとに流下速度をずらした液面を作り、液面付近では屈折（UVの揺らぎ）とハイライトを加える。${TRANSITION_NOTE}`,
  body: /* glsl */ `
${GLSL_NOISE}
${GLSL_TRANSITION}
void main() {
  float p = transitionProgress();
  float x = vUv.x * uDrips;
  float col_ = floor(x);
  float spd = mix(1.0, 0.5 + hash11(col_) * 1.0, uViscosity);
  float shape = 1.0 - pow(abs(fract(x) - 0.5) * 2.0, 2.0);
  float front = 1.0 - p * (1.25 + 0.6 * spd * uViscosity) + (1.0 - shape) * 0.08 * uViscosity;
  front -= vnoise(vec2(vUv.x * 20.0, uTime)) * 0.02;
  float inLiquid = smoothstep(front - 0.004, front + 0.004, vUv.y);
  float edge = exp(-abs(vUv.y - front) * 60.0);
  vec2 refr = vec2(sin(vUv.y * 40.0 + uTime * 3.0), cos(vUv.x * 30.0)) * uDistortion * edge;
  vec3 a = texture2D(tDiffuse, vUv + refr).rgb;
  vec3 b = sceneB(vUv + refr);
  vec3 col = mix(a, b, inLiquid);
  col += vec3(0.9, 0.95, 1.0) * edge * 0.35 * step(0.001, p) * step(p, 0.999);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
