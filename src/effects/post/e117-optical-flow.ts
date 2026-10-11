import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';
import { historyExtra, GLSL_HISTORY } from '../../engine/history';

export default defineShaderPost({
  id: '117',
  params: [
    {
      key: 'mode',
      label: '表示',
      type: 'select',
      options: [
        { value: 'arrows', label: '矢印（ベクトル場）' },
        { value: 'color', label: '色相＝方向・明度＝速さ' },
        { value: 'overlay', label: '元映像＋矢印' },
      ],
      default: 'overlay',
    },
    { key: 'cell', label: '矢印の間隔(px)', type: 'number', min: 10, max: 48, step: 1, default: 22 },
    { key: 'gain', label: '感度', type: 'number', min: 0.5, max: 20, step: 0.1, default: 6 },
  ],
  notes: '前フレームとの輝度差と空間勾配から、各セルの動きベクトルを Lucas-Kanade 法（5×5窓の最小二乗）で推定する。機械視覚の動き検出・追跡の基礎になる処理を可視化している。',
  extraDecl: GLSL_HISTORY,
  extra: historyExtra({ frames: 4, scale: 0.5 }),
  body: /* glsl */ `
${GLSL_COLOR}
float Lc(vec2 uv) { return luma(texture2D(tDiffuse, uv).rgb); }
float Lp(vec2 uv) { return luma(historyAt(uv, 1.0)); }
vec2 flowAt(vec2 c) {
  vec2 px = 2.0 / uResolution;
  float ixx = 0.0, iyy = 0.0, ixy = 0.0, ixt = 0.0, iyt = 0.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 p = c + vec2(float(x), float(y)) * px * 1.5;
    float ix = (Lc(p + vec2(px.x, 0.0)) - Lc(p - vec2(px.x, 0.0))) * 0.5;
    float iy = (Lc(p + vec2(0.0, px.y)) - Lc(p - vec2(0.0, px.y))) * 0.5;
    float it = Lc(p) - Lp(p);
    ixx += ix * ix; iyy += iy * iy; ixy += ix * iy; ixt += ix * it; iyt += iy * it;
  }
  float det = ixx * iyy - ixy * ixy + 1e-5;
  return -vec2(iyy * ixt - ixy * iyt, ixx * iyt - ixy * ixt) / det;
}
float segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  vec2 px = vUv * uResolution;
  vec2 cell = floor(px / uCell);
  vec2 center = (cell + 0.5) * uCell;
  vec2 f = clamp(flowAt(center / uResolution), -3.0, 3.0) * uGain;
  float speed = length(f);
  vec3 col;
  if (uMode > 0.5 && uMode < 1.5) {
    vec2 ff = clamp(flowAt(vUv), -3.0, 3.0) * uGain;
    col = hsv2rgb(vec3(atan(ff.y, ff.x) / 6.28318 + 0.5, 1.0, clamp(length(ff) / 8.0, 0.0, 1.0)));
  } else {
    vec2 tip = center + clamp(f, -uCell * 0.9, uCell * 0.9);
    float d = segment(px, center, tip);
    vec2 dir = normalize(tip - center + 1e-4);
    vec2 nrm = vec2(-dir.y, dir.x);
    float head = min(segment(px, tip, tip - dir * 5.0 + nrm * 3.5), segment(px, tip, tip - dir * 5.0 - nrm * 3.5));
    float line = smoothstep(1.4, 0.4, min(d, head)) * step(0.5, speed);
    vec3 ac = hsv2rgb(vec3(atan(f.y, f.x) / 6.28318 + 0.5, 0.8, 1.0));
    vec3 bg = uMode < 0.5 ? vec3(0.02) : base * 0.55;
    col = mix(bg, ac, line);
    col += vec3(0.25) * smoothstep(1.6, 0.6, length(px - center)) * (uMode < 0.5 ? 1.0 : 0.0);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
