import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';
import { historyExtra, GLSL_HISTORY } from '../../engine/history';

export default defineShaderPost({
  id: '186',
  params: [
    { key: 'focus', label: 'ピント位置', type: 'number', min: 0, max: 1, step: 0.01, default: 0.42 },
    { key: 'band', label: 'ピント帯の幅', type: 'number', min: 0.02, max: 0.4, step: 0.01, default: 0.1 },
    { key: 'blur', label: 'ぼけ(px)', type: 'number', min: 0, max: 20, step: 0.5, default: 9 },
    { key: 'saturation', label: '彩度', type: 'number', min: 1, max: 2.5, step: 0.01, default: 1.6 },
    { key: 'fps', label: 'コマ落とし(fps)', type: 'number', min: 4, max: 60, step: 1, default: 10 },
  ],
  notes: 'ジオラマに見える3要素の合成：①チルトシフトの帯状ピント ②高彩度・高コントラスト ③低フレームレート（模型の撮影っぽいコマ送り）。コマ落としは履歴バッファから一定間隔のフレームだけを表示して実現。',
  extraDecl: GLSL_HISTORY,
  extra: historyExtra({ frames: 8, scale: 0.5 }),
  body: /* glsl */ `
${GLSL_COLOR}
void main() {
  // 現在時刻を fps で量子化し、何フレーム前を見せるか決める（約60fps前提）
  float hold = mod(uTime * 60.0, 60.0 / uFps);
  float age = floor(hold);
  float d = max(0.0, abs(vUv.y - uFocus) - uBand) / (1.0 - uBand);
  float radius = uBlur * smoothstep(0.0, 0.5, d);
  vec3 acc = vec3(0.0);
  for (int i = 0; i < 24; i++) {
    float fi = float(i) + 0.5;
    float r = sqrt(fi / 24.0) * radius;
    float a = fi * 2.39996;
    vec2 uv = vUv + vec2(cos(a), sin(a)) * r / uResolution;
    acc += age < 0.5 ? texture2D(tDiffuse, uv).rgb : historyAt(uv, age);
  }
  vec3 col = acc / 24.0;
  col = (col - 0.5) * 1.15 + 0.5;
  float l = luma(col);
  col = mix(vec3(l), col, uSaturation);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
});
