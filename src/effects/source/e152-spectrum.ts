import { defineShaderSource } from '../../engine/shaderEffect';
import { AUDIO_PARAMS, GLSL_AUDIO, audioExtra } from '../../engine/audioExtra';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderSource({
  id: '152',
  params: [
    ...AUDIO_PARAMS,
    {
      key: 'shape',
      label: '形',
      type: 'select',
      options: [
        { value: 'bars', label: 'バー' },
        { value: 'radial', label: '放射状' },
        { value: 'mirror', label: '上下対称' },
      ],
      default: 'bars',
    },
    { key: 'bars', label: 'バーの本数', type: 'number', min: 16, max: 160, step: 1, default: 64 },
  ],
  notes:
    'FFTで得た512帯域の振幅を、人の聴感に近い対数スケールで横軸に並べ直して表示する（低音域が広く、高音域が詰まる）。色相は周波数、明るさは振幅に対応。タップで音声開始。',
  extraDecl: GLSL_AUDIO,
  extra: audioExtra(),
  body: /* glsl */ `
${GLSL_COLOR}
float logBin(float x) { return (pow(2.0, x * 9.0) - 1.0) / 511.0; }
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec3 col = vec3(0.01, 0.01, 0.025);
  if (uShape < 1.5 && uShape > 0.5) {
    vec2 p = (vUv - 0.5) * vec2(aspect, 1.0);
    float a = atan(p.y, p.x) / 6.28318 + 0.5;
    float k = floor(a * uBars) / uBars;
    float v = spectrum(logBin(abs(k * 2.0 - 1.0))) * uSensitivity;
    float r = length(p);
    float inner = 0.12 + uBass * 0.04;
    float bar = step(inner, r) * step(r, inner + v * 0.35) * step(0.15, fract(a * uBars));
    col += hsv2rgb(vec3(k, 0.8, 1.0)) * bar;
    col += vec3(1.0, 0.8, 0.9) * smoothstep(inner, inner - 0.01, r) * (0.2 + uBeat * 0.8);
  } else {
    float k = floor(vUv.x * uBars) / uBars;
    float v = spectrum(logBin(k)) * uSensitivity;
    float gap = step(0.15, fract(vUv.x * uBars));
    float y = uShape > 1.5 ? abs(vUv.y - 0.5) * 2.0 : vUv.y;
    float h = v * (uShape > 1.5 ? 0.95 : 0.9);
    float bar = step(y, h) * gap;
    float seg = step(0.25, fract(y * 40.0));
    vec3 c = hsv2rgb(vec3(0.7 - k * 0.7, 0.85, 1.0));
    col += c * bar * mix(0.6, 1.0, seg);
    col += c * 0.25 * exp(-max(y - h, 0.0) * 30.0) * gap * step(0.01, v);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
