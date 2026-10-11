import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HASH } from '../../engine/glsl';

export default defineShaderPost({
  id: '005',
  params: [
    { key: 'slices', label: 'スライス数', type: 'number', min: 4, max: 120, step: 1, default: 28 },
    { key: 'shift', label: '最大ずれ', type: 'number', min: 0, max: 0.4, step: 0.005, default: 0.08 },
    { key: 'probability', label: '発生率', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'speed', label: '更新頻度', type: 'number', min: 1, max: 30, step: 1, default: 7 },
  ],
  notes: '時間ごとに変わる不均一な水平スライスを生成し、選ばれた帯だけ横方向へずらす。帯の縁でRチャンネルを少し遅らせて裂け目を強調。',
  body: /* glsl */ `
${GLSL_HASH}
void main() {
  float t = floor(uTime * uSpeed);
  float warpY = vUv.y + (hash11(t) - 0.5) * 0.2 * sin(vUv.y * 6.0 + t);
  float row = floor(warpY * uSlices * (0.4 + hash11(t * 3.1)));
  float h = hash12(vec2(row, t));
  vec2 uv = vUv;
  float hitRow = step(h, uProbability);
  float dx = (hash12(vec2(row * 3.1, t + 5.0)) - 0.5) * 2.0 * uShift * hitRow;
  uv.x += dx;
  vec3 col = texture2D(tDiffuse, fract(uv)).rgb;
  col.r = mix(col.r, texture2D(tDiffuse, fract(uv + vec2(dx * 0.25, 0.0))).r, hitRow);
  col += hitRow * step(0.97, hash12(vec2(row, t * 2.0))) * 0.25;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
