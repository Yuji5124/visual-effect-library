import { defineShaderPost } from '../../engine/shaderEffect';
import { historyExtra, GLSL_HISTORY } from '../../engine/history';

export default defineShaderPost({
  id: '019',
  params: [
    {
      key: 'mode',
      label: '遅延のかけ方',
      type: 'select',
      options: [
        { value: 'rgb', label: 'RGBごとに遅延' },
        { value: 'grid', label: 'タイルごとに遅延' },
        { value: 'rings', label: '同心円ごとに遅延' },
      ],
      default: 'rgb',
    },
    { key: 'delay', label: '遅延(フレーム)', type: 'number', min: 1, max: 15, step: 1, default: 6 },
    { key: 'tiles', label: 'タイル数', type: 'number', min: 2, max: 12, step: 1, default: 5 },
  ],
  notes: '色チャンネルや画面の領域ごとに別々の遅延時間の映像を合成する。RGBモードでは動く物体だけが色分解し、静止部分は元の色のまま残る。',
  extraDecl: GLSL_HISTORY,
  extra: historyExtra({ frames: 32, scale: 0.5 }),
  body: /* glsl */ `
${'float h2(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }'}
void main() {
  vec3 col;
  if (uMode < 0.5) {
    col = vec3(texture2D(tDiffuse, vUv).r, historyAt(vUv, uDelay).g, historyAt(vUv, uDelay * 2.0).b);
  } else if (uMode < 1.5) {
    vec2 cell = floor(vUv * vec2(uTiles * uResolution.x / uResolution.y, uTiles));
    col = historyAt(vUv, floor(h2(cell) * uDelay * 2.0));
  } else {
    float r = length((vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0));
    col = historyAt(vUv, floor(r * uTiles) * uDelay * 0.5);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
