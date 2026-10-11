import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';
import { feedbackExtra } from '../../engine/feedback';

export default defineShaderPost({
  id: '182',
  params: [
    { key: 'exposure', label: '露光時間（残り方）', type: 'number', min: 0.8, max: 0.995, step: 0.001, default: 0.97 },
    { key: 'lightOnly', label: '光だけを残す', type: 'bool', default: true },
    { key: 'threshold', label: '光とみなす明るさ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'trailGain', label: '光跡の強さ', type: 'number', min: 0.2, max: 2, step: 0.01, default: 1 },
  ],
  notes: 'シャッターを開けっ放しにしたように、前フレームの結果を減衰させながら現在の明るい部分を比較(明)で重ねる。8bitで消え残りが出ないよう、減衰に小さな減算も加えている。',
  extraDecl: 'uniform sampler2D tPrev;',
  extra: feedbackExtra(),
  body: /* glsl */ `
${GLSL_COLOR}
void main() {
  vec3 cur = texture2D(tDiffuse, vUv).rgb;
  vec3 prev = max(texture2D(tPrev, vUv).rgb * uExposure - 0.004, 0.0);
  vec3 light = uLightOnly > 0.5 ? cur * smoothstep(uThreshold, uThreshold + 0.15, luma(cur)) * uTrailGain : cur;
  vec3 acc = max(prev, light);
  vec3 col = uLightOnly > 0.5 ? max(cur, acc) : mix(cur, acc, 0.85);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
