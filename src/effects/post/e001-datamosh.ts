import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HASH, GLSL_COLOR } from '../../engine/glsl';
import { combineExtras, feedbackExtra } from '../../engine/feedback';
import { historyExtra, GLSL_HISTORY } from '../../engine/history';

export default defineShaderPost({
  id: '001',
  status: 'experimental',
  params: [
    { key: 'iframe', label: 'Iフレーム間隔(秒)', type: 'number', min: 1, max: 12, step: 0.5, default: 5 },
    { key: 'block', label: 'マクロブロック(px)', type: 'number', min: 4, max: 48, step: 1, default: 16 },
    { key: 'smear', label: '引きずり量', type: 'number', min: 0, max: 3, step: 0.01, default: 1.4 },
    { key: 'bleed', label: '新しい画素の混入', type: 'number', min: 0, max: 0.3, step: 0.005, default: 0.04 },
  ],
  notes:
    '【実験中】圧縮動画のIフレーム（全画面更新）を抜いた状態を擬似的に再現。ブロックごとに前フレームとの差から動きの向きを粗く推定し（輝度勾配法）、自分の前回出力をその向きへ移流し続ける。本物のコーデックの動きベクトルではないため近似。',
  extraDecl: 'uniform sampler2D tPrev;\n' + GLSL_HISTORY,
  extra: combineExtras(feedbackExtra(), historyExtra({ frames: 4, scale: 0.5 })),
  body: /* glsl */ `
${GLSL_HASH}
${GLSL_COLOR}
float Lc(vec2 uv) { return luma(texture2D(tDiffuse, uv).rgb); }
float Lp(vec2 uv) { return luma(historyAt(uv, 1.0)); }
void main() {
  float cycle = mod(uTime, uIframe);
  vec3 cur = texture2D(tDiffuse, vUv).rgb;
  if (cycle < 0.08) { gl_FragColor = vec4(cur, 1.0); return; }
  vec2 bs = uBlock / uResolution;
  vec2 bc = (floor(vUv / bs) + 0.5) * bs;
  // ブロック中心付近で輝度勾配法（Lucas-Kanade の簡略版）により動きを推定
  vec2 px = 2.0 / uResolution;
  float ixx = 0.0, iyy = 0.0, ixy = 0.0, ixt = 0.0, iyt = 0.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 p = bc + vec2(float(x), float(y)) * bs * 0.2;
    float ix = (Lc(p + vec2(px.x, 0.0)) - Lc(p - vec2(px.x, 0.0))) * 0.5;
    float iy = (Lc(p + vec2(0.0, px.y)) - Lc(p - vec2(0.0, px.y))) * 0.5;
    float it = Lc(p) - Lp(p);
    ixx += ix * ix; iyy += iy * iy; ixy += ix * iy; ixt += ix * it; iyt += iy * it;
  }
  float det = ixx * iyy - ixy * ixy;
  vec2 flow = det > 1e-6 ? -vec2(iyy * ixt - ixy * iyt, ixx * iyt - ixy * ixt) / det : vec2(0.0);
  flow = clamp(flow, -4.0, 4.0) * px * uSmear;
  vec3 moshed = texture2D(tPrev, vUv - flow).rgb;
  float fresh = uBleed + step(0.985, hash12(floor(vUv / bs) + floor(uTime * 10.0))) * 0.6;
  gl_FragColor = vec4(mix(moshed, cur, fresh), 1.0);
}
`,
});
