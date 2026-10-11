import { defineShaderPost } from '../../engine/shaderEffect';
import { AUDIO_PARAMS, GLSL_AUDIO, audioExtra } from '../../engine/audioExtra';

export default defineShaderPost({
  id: '153',
  params: [
    ...AUDIO_PARAMS,
    { key: 'zoom', label: 'ズームの強さ', type: 'number', min: 0, max: 0.3, step: 0.005, default: 0.08 },
    { key: 'flash', label: 'フラッシュ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'split', label: '色ずれ', type: 'number', min: 0, max: 0.03, step: 0.001, default: 0.008 },
  ],
  notes:
    '低音域のエネルギーが直近の平均を一定以上上回った瞬間をビートとして検出し（エネルギー比較法）、その瞬間に画面を拡大・発光・色分離させて指数関数的に戻す。どんな映像にも重ねられるポスト演出。タップで音声開始。',
  extraDecl: GLSL_AUDIO,
  extra: audioExtra(),
  body: /* glsl */ `
void main() {
  float b = uBeat;
  vec2 c = vUv - 0.5;
  vec2 uv = 0.5 + c / (1.0 + b * uZoom + uBass * uZoom * 0.3);
  float s = uSplit * b;
  vec3 col = vec3(texture2D(tDiffuse, uv + c * s * 4.0).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * s * 4.0).b);
  col += vec3(1.0, 0.95, 0.9) * b * b * uFlash;
  col *= 1.0 + uLevel * 0.3;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
