import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_TRANSITION, GLSL_HASH } from '../../engine/glsl';
import { TRANSITION_NOTE, TRANSITION_PARAMS } from './transitionParams';

export default defineShaderPost({
  id: '216',
  params: [
    ...TRANSITION_PARAMS,
    { key: 'tiles', label: 'タイル数（縦）', type: 'number', min: 2, max: 16, step: 1, default: 5 },
    { key: 'stagger', label: '時間差', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    {
      key: 'order',
      label: '裏返る順番',
      type: 'select',
      options: [
        { value: 'random', label: 'ランダム' },
        { value: 'sweep', label: '左から' },
        { value: 'center', label: '中心から' },
      ],
      default: 'random',
    },
    { key: 'gap', label: '隙間', type: 'number', min: 0, max: 0.15, step: 0.005, default: 0.04 },
  ],
  notes: `画面を正方形のタイルに分け、各タイルを縦軸まわりに回転させる。回転角が90度を超えたら裏面（次の場面）を表示し、横幅を |cos θ| 倍に縮めて遠近感の代わりにする。タイルごとの開始時刻で順番の印象が変わる。${TRANSITION_NOTE}（着想: gl-transitions の GridFlip。実装は独自）`,
  body: /* glsl */ `
${GLSL_HASH}
${GLSL_TRANSITION}
void main() {
  float p = transitionProgress();
  float aspect = uResolution.x / uResolution.y;
  vec2 grid = vec2(floor(uTiles * aspect + 0.5), uTiles);
  vec2 cell = floor(vUv * grid);
  vec2 f = fract(vUv * grid);
  float order;
  if (uOrder < 0.5) order = hash12(cell);
  else if (uOrder < 1.5) order = cell.x / max(grid.x - 1.0, 1.0);
  else order = length(cell + 0.5 - grid * 0.5) / length(grid * 0.5);
  float local = clamp((p * (1.0 + uStagger) - order * uStagger), 0.0, 1.0);
  float angle = local * 3.14159265;
  float w = abs(cos(angle));
  float x = (f.x - 0.5) / max(w, 1e-3) + 0.5;
  vec3 col = vec3(0.04, 0.04, 0.06);
  float inGap = step(uGap * 0.5, min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y)));
  if (x >= 0.0 && x <= 1.0) {
    vec2 uv = (cell + vec2(x, f.y)) / grid;
    bool back = angle > 1.5707963;
    vec2 uvB = (cell + vec2(1.0 - x, f.y)) / grid;
    col = back ? sceneB(uvB) : texture2D(tDiffuse, uv).rgb;
    col *= 0.55 + 0.45 * w;
    col = mix(vec3(0.04, 0.04, 0.06), col, mix(1.0, inGap, step(0.001, local) * step(local, 0.999)));
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
