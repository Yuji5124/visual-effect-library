import { defineShaderPost } from '../../engine/shaderEffect';
import { historyExtra, GLSL_HISTORY } from '../../engine/history';

export default defineShaderPost({
  id: '020',
  params: [
    { key: 'flashes', label: '焼き付け回数', type: 'number', min: 2, max: 8, step: 1, default: 6 },
    { key: 'interval', label: '間隔(フレーム)', type: 'number', min: 2, max: 8, step: 1, default: 6 },
    { key: 'darkness', label: '背景の暗さ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'fade', label: '古い像ほど薄く', type: 'bool', default: true },
  ],
  notes: 'ストロボ多重露光のように、一定間隔の過去フレームを「明るい部分だけ」比較(明)で重ねる。背景を暗く落とすと動体の連続写真が浮かび上がる。',
  extraDecl: GLSL_HISTORY,
  extra: historyExtra({ frames: 48, scale: 0.5 }),
  body: /* glsl */ `
void main() {
  vec3 cur = texture2D(tDiffuse, vUv).rgb;
  vec3 col = cur * (1.0 - uDarkness * 0.6);
  for (int i = 1; i < 8; i++) {
    if (float(i) >= uFlashes) break;
    vec3 h = historyAt(vUv, float(i) * uInterval);
    float w = uFade > 0.5 ? 1.0 - float(i) / uFlashes * 0.7 : 1.0;
    float lum = dot(h, vec3(0.3, 0.6, 0.1));
    col = max(col, h * w * smoothstep(0.15, 0.5, lum));
  }
  col = max(col * (1.0 - uDarkness * 0.4), cur * smoothstep(0.15, 0.5, dot(cur, vec3(0.3, 0.6, 0.1))));
  gl_FragColor = vec4(col, 1.0);
}
`,
});
