import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HASH } from '../../engine/glsl';
import { historyExtra, GLSL_HISTORY } from '../../engine/history';

export default defineShaderPost({
  id: '184',
  params: [
    { key: 'fps', label: 'コマ数(fps)', type: 'number', min: 4, max: 24, step: 1, default: 8 },
    { key: 'jitter', label: 'コマごとの位置ぶれ', type: 'number', min: 0, max: 0.01, step: 0.0002, default: 0.003 },
    { key: 'flicker', label: '露出のばらつき', type: 'number', min: 0, max: 0.2, step: 0.005, default: 0.06 },
    { key: 'warm', label: '暖色トーン', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
  ],
  notes: '低いコマ数でフレームを保持し、コマが変わるたびに画面全体を微小に平行移動・露出を変える。人形アニメの「1コマずつ置き直した」揺れを再現する。',
  extraDecl: GLSL_HISTORY,
  extra: historyExtra({ frames: 16, scale: 0.6 }),
  body: /* glsl */ `
${GLSL_HASH}
void main() {
  float step_ = 60.0 / uFps;
  float age = floor(mod(uTime * 60.0, step_));
  float frameId = floor(uTime * uFps);
  vec2 off = (hash22(vec2(frameId, 3.0)) - 0.5) * uJitter * 2.0;
  vec2 uv = vUv + off;
  vec3 col = age < 0.5 ? texture2D(tDiffuse, uv).rgb : historyAt(uv, age);
  col *= 1.0 + (hash11(frameId) - 0.5) * uFlicker * 2.0;
  col *= mix(vec3(1.0), vec3(1.08, 0.98, 0.85), uWarm);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
