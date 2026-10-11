import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HASH } from '../../engine/glsl';
import { historyExtra, GLSL_HISTORY } from '../../engine/history';

export default defineShaderPost({
  id: '007',
  params: [
    { key: 'blocks', label: '領域の細かさ', type: 'number', min: 2, max: 24, step: 1, default: 8 },
    { key: 'coverage', label: '止まる領域の割合', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'freezeTime', label: '停止時間(フレーム)', type: 'number', min: 4, max: 31, step: 1, default: 24 },
    { key: 'outline', label: '停止領域の縁取り', type: 'bool', default: true },
  ],
  notes: 'ブロックごとに乱数で「凍結」を決め、凍結中のブロックはその瞬間のフレーム（履歴の固定位置）を表示し続ける。更新が止まったデコーダーのような映像になる。',
  extraDecl: GLSL_HISTORY,
  extra: historyExtra({ frames: 32, scale: 0.5 }),
  body: /* glsl */ `
${GLSL_HASH}
void main() {
  vec2 grid = vec2(uBlocks * uResolution.x / uResolution.y, uBlocks);
  vec2 cell = floor(vUv * grid);
  // ブロックごとにずれた周期で凍結が始まる
  float phase = hash12(cell) * uFreezeTime;
  float tf = uTime * 60.0 + phase;
  float cycle = floor(tf / uFreezeTime);
  float age = mod(tf, uFreezeTime);
  bool frozen = hash12(cell + cycle * 1.7) < uCoverage;
  vec3 col = frozen ? historyAt(vUv, age) : texture2D(tDiffuse, vUv).rgb;
  if (frozen && uOutline > 0.5) {
    vec2 f = fract(vUv * grid);
    float e = step(min(min(f.x, f.y), min(1.0 - f.x, 1.0 - f.y)), 0.02);
    col = mix(col, vec3(0.2, 1.0, 0.6), e * 0.6);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
