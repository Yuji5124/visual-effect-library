import { defineShaderPost } from '../../engine/shaderEffect';
import { historyExtra, GLSL_HISTORY } from '../../engine/history';

export default defineShaderPost({
  id: '065',
  params: [
    { key: 'readout', label: '読み出し時間(フレーム)', type: 'number', min: 1, max: 31, step: 1, default: 16 },
    { key: 'topFirst', label: '上から読み出す', type: 'bool', default: true },
    { key: 'banding', label: 'フリッカー帯（蛍光灯）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
  ],
  notes: 'CMOSセンサーは行を順番に読み出すため、行ごとに撮影時刻がずれる。各行が「読み出し時間 × 行位置」だけ過去のフレームを表示することで、速く動く物体が斜めに傾く・ぐにゃりと曲がる現象を再現する。',
  extraDecl: GLSL_HISTORY,
  extra: historyExtra({ frames: 32, scale: 0.5 }),
  body: /* glsl */ `
void main() {
  float row = uTopFirst > 0.5 ? 1.0 - vUv.y : vUv.y;
  float age = row * uReadout;
  vec3 col = mix(historyAt(vUv, age), historyAt(vUv, age + 1.0), fract(age));
  col *= 1.0 - uBanding * 0.25 * (0.5 + 0.5 * sin(vUv.y * 9.0 - uTime * 6.0));
  gl_FragColor = vec4(col, 1.0);
}
`,
});
