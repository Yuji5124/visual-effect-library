import { defineShaderPost } from '../../engine/shaderEffect';
import { historyExtra, GLSL_HISTORY } from '../../engine/history';

export default defineShaderPost({
  id: '018',
  params: [
    {
      key: 'direction',
      label: '時間の流れる方向',
      type: 'select',
      options: [
        { value: 'vertical', label: '上が過去' },
        { value: 'horizontal', label: '左が過去' },
        { value: 'radial', label: '中心が現在・外側が過去' },
        { value: 'wave', label: '波打つ' },
      ],
      default: 'vertical',
    },
    { key: 'depth', label: '遡るフレーム数', type: 'number', min: 2, max: 47, step: 1, default: 40 },
    { key: 'smooth', label: 'フレーム間補間', type: 'bool', default: true },
  ],
  notes: '画面の行（または列・半径）ごとに異なる時刻のフレームを表示する。48フレームを縮小して1枚のアトラスに保持しているので、1パスで各画素が別々の過去を読める。動く物体は時空間に引き伸ばされた形になる。',
  extraDecl: GLSL_HISTORY,
  extra: historyExtra({ frames: 48, scale: 0.3 }),
  body: /* glsl */ `
void main() {
  float k;
  if (uDirection < 0.5) k = vUv.y;
  else if (uDirection < 1.5) k = 1.0 - vUv.x;
  else if (uDirection < 2.5) k = clamp(length((vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0)) * 1.4, 0.0, 1.0);
  else k = 0.5 + 0.5 * sin(vUv.x * 6.0 + vUv.y * 4.0 + uTime);
  float age = k * uDepth;
  vec3 col = historyAt(vUv, age);
  if (uSmooth > 0.5) col = mix(col, historyAt(vUv, age + 1.0), fract(age));
  gl_FragColor = vec4(col, 1.0);
}
`,
});
