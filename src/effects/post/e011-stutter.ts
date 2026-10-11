import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HASH } from '../../engine/glsl';
import { historyExtra, GLSL_HISTORY } from '../../engine/history';

export default defineShaderPost({
  id: '011',
  params: [
    { key: 'probability', label: 'カクつく頻度', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'maxHold', label: '最大停止(フレーム)', type: 'number', min: 2, max: 23, step: 1, default: 12 },
    { key: 'repeat', label: '短いループ再生', type: 'bool', default: true },
  ],
  notes: '一定時間ごとに乱数で「止める・繰り返す・普通に進む」を決め、履歴バッファの過去フレームを表示する。ループ再生ではスクラッチのように数フレームを往復させる。',
  extraDecl: GLSL_HISTORY,
  extra: historyExtra({ frames: 24, scale: 0.6 }),
  body: /* glsl */ `
${GLSL_HASH}
void main() {
  float seg = floor(uTime * 3.0);
  float local = fract(uTime * 3.0) * 20.0;
  float r = hash11(seg);
  float age = 0.0;
  if (r < uProbability) {
    float hold = 2.0 + floor(hash11(seg + 7.0) * (uMaxHold - 2.0));
    if (uRepeat > 0.5 && hash11(seg + 3.0) < 0.5) {
      float p = mod(local, hold * 2.0);
      age = abs(p - hold);
    } else {
      age = min(local, hold);
    }
  }
  vec3 col = age < 0.5 ? texture2D(tDiffuse, vUv).rgb : historyAt(vUv, age);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
