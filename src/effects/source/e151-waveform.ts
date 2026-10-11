import { defineShaderSource } from '../../engine/shaderEffect';
import { AUDIO_PARAMS, GLSL_AUDIO, audioExtra } from '../../engine/audioExtra';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderSource({
  id: '151',
  params: [
    ...AUDIO_PARAMS,
    {
      key: 'shape',
      label: '形',
      type: 'select',
      options: [
        { value: 'line', label: 'オシロスコープ' },
        { value: 'circle', label: '円形' },
      ],
      default: 'line',
    },
    { key: 'color', label: '線の色', type: 'color', default: '#3dffb0' },
    { key: 'glow', label: '発光', type: 'number', min: 0, max: 2, step: 0.01, default: 1 },
  ],
  notes:
    'Web Audio API の AnalyserNode から時間波形（1024サンプル）を毎フレーム取得し、512×2のテクスチャとしてGPUへ送る。シェーダーは画素ごとに「波形の線までの距離」を求めて発光させるので、線の太さや残光をGPUだけで描ける。画面をタップすると内蔵シンセ（外部音源不要の自動演奏）またはマイクが開始する。',
  extraDecl: GLSL_AUDIO,
  extra: audioExtra(),
  body: /* glsl */ `
${GLSL_COLOR}
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec3 col = vec3(0.01, 0.02, 0.03);
  vec2 g = abs(fract(vUv * vec2(10.0 * aspect, 8.0)) - 0.5);
  col += vec3(0.0, 0.08, 0.06) * smoothstep(0.48, 0.5, max(g.x, g.y));
  float d;
  if (uShape < 0.5) {
    float w = waveform(vUv.x) * 0.38 * uSensitivity;
    d = abs(vUv.y - 0.5 - w) * uResolution.y;
  } else {
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
    float a = atan(p.y, p.x) / 6.28318 + 0.5;
    float r = 0.28 + waveform(a) * 0.12 * uSensitivity + uBass * 0.05;
    d = abs(length(p) - r) * uResolution.y;
  }
  float line = smoothstep(2.0, 0.5, d);
  float halo = exp(-d * 0.08) * uGlow * (0.4 + uLevel);
  col += uColor * (line * 1.4 + halo * 0.6);
  col += vec3(1.0) * line * 0.3;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
