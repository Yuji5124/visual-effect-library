import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_TRANSITION, GLSL_HASH } from '../../engine/glsl';
import { TRANSITION_NOTE, TRANSITION_PARAMS } from './transitionParams';

export default defineShaderPost({
  id: '215',
  params: [
    ...TRANSITION_PARAMS,
    { key: 'columns', label: '帯の数', type: 'number', min: 8, max: 320, step: 1, default: 160 },
    { key: 'jitter', label: '開始のばらつき', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0.25 },
    { key: 'pixel', label: 'ドット感(px)', type: 'number', min: 1, max: 8, step: 1, default: 2 },
  ],
  notes: `画面を縦の帯に分け、帯ごとに少しずつ違う開始時刻で下へ滑り落とす。隣の帯との開始時刻の差を小さく制限した乱数（ランダムウォーク風）にすると、往年のFPSのような「溶け落ち」になる。${TRANSITION_NOTE}（着想: gl-transitions の DoomScreenTransition。実装は独自）`,
  body: /* glsl */ `
${GLSL_HASH}
${GLSL_TRANSITION}
void main() {
  float p = transitionProgress();
  vec2 px = floor(vUv * uResolution / uPixel) * uPixel / uResolution;
  float col = floor(px.x * uColumns);
  // 隣接帯の開始差を抑えるため、低周波＋高周波のハッシュを足す
  float delay = (hash11(floor(col / 6.0)) * 0.6 + hash11(col) * 0.4) * uJitter;
  float t = clamp((p * (1.0 + uJitter) - delay) / 1.0, 0.0, 1.0);
  float offset = t * t * 1.05;
  vec2 src = vec2(vUv.x, vUv.y + offset);
  vec3 c = src.y > 1.0 ? sceneB(vUv) : texture2D(tDiffuse, src).rgb;
  gl_FragColor = vec4(c, 1.0);
}
`,
});
