import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '191',
  params: [
    { key: 'scale', label: '入れ子の縮小率', type: 'number', min: 0.2, max: 0.8, step: 0.01, default: 0.45 },
    { key: 'spiral', label: '螺旋（ドロステ）', type: 'bool', default: true },
    { key: 'speed', label: '吸い込まれる速さ', type: 'number', min: -1, max: 1, step: 0.01, default: 0.25 },
    { key: 'frame', label: '額縁', type: 'number', min: 0, max: 0.1, step: 0.001, default: 0.02 },
  ],
  notes: '対数極座標 (log r, θ) で見ると「自分の中に縮小した自分」は単純な平行移動になる。log r を縮小率の対数で割った余りを取り、螺旋モードでは角度を混ぜて回転させる（ドロステ効果）。世界の中に同じ世界が無限に続く。',
  body: /* glsl */ `
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
  float r = length(p) + 1e-5;
  float a = atan(p.y, p.x);
  float L = log(1.0 / uScale);
  float lr = log(r);
  if (uSpiral > 0.5) lr += a / 6.28318 * L;
  // [0, L) に折り返す ＝ 半径 [scale, 1) の帯に、無限に縮小した自分自身が並ぶ
  lr = mod(lr - uTime * uSpeed * L, L) - L;
  vec2 q = vec2(cos(a), sin(a)) * exp(lr) * 0.62;
  vec2 uv = 0.5 + q / vec2(aspect, 1.0);
  vec3 col = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
  vec2 e = abs(uv - 0.5);
  float m = max(e.x, e.y);
  col = mix(col, vec3(0.95, 0.85, 0.6), step(0.5 - uFrame, m) * step(m, 0.5) * step(0.0001, uFrame));
  if (m > 0.5) col *= 0.3;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
