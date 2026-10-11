import { defineShaderSource } from '../../engine/shaderEffect';
import { AUDIO_PARAMS, GLSL_AUDIO, audioExtra } from '../../engine/audioExtra';

export default defineShaderSource({
  id: '156',
  params: [
    ...AUDIO_PARAMS,
    { key: 'complexity', label: '振動モードの複雑さ', type: 'number', min: 1, max: 12, step: 0.1, default: 3.5 },
    { key: 'sharpness', label: '砂の集まり方', type: 'number', min: 5, max: 80, step: 0.5, default: 30 },
    {
      key: 'plate',
      label: '板の形',
      type: 'select',
      options: [
        { value: 'square', label: '正方形' },
        { value: 'circle', label: '円形' },
      ],
      default: 'square',
    },
  ],
  notes:
    'クラドニ図形：振動する板の上の砂は、振幅が0の「節線」に集まる。正方形板の固有モード cos(nπx)cos(mπy) − cos(mπx)cos(nπy) の節線を描き、モード番号 (n, m) を音の重心周波数（スペクトラムの加重平均）から決める。音がない時は時間で自動的にモードを移り変わらせる。タップで音声開始。',
  extraDecl: GLSL_AUDIO,
  extra: audioExtra(),
  body: /* glsl */ `
float chladni(vec2 p, float n, float m) {
  const float PI = 3.14159265;
  return cos(n * PI * p.x) * cos(m * PI * p.y) - cos(m * PI * p.x) * cos(n * PI * p.y);
}
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (vUv - 0.5) * vec2(aspect, 1.0) * 2.1;
  // 音の重心周波数
  float sum = 0.0, wsum = 0.0;
  for (int i = 1; i < 32; i++) {
    float x = float(i) / 32.0;
    float s = spectrum(x * 0.5);
    sum += x * s; wsum += s;
  }
  float spectralCenter = wsum > 0.05 ? sum / wsum : 0.5 + 0.5 * sin(uTime * 0.15);
  float n = 1.0 + spectralCenter * uComplexity * 2.0;
  float m = 1.0 + (1.0 - spectralCenter) * uComplexity + uBass * 2.0;
  float f;
  if (uPlate < 0.5) f = chladni(p, n, m);
  else {
    float r = length(p);
    float a = atan(p.y, p.x);
    f = cos(n * 3.14159 * r) * cos(floor(m) * a);
  }
  float sand = exp(-abs(f) * uSharpness);
  float grain = fract(sin(dot(floor(vUv * uResolution / 1.5), vec2(12.9898, 78.233))) * 43758.5453);
  sand *= 0.6 + 0.4 * grain;
  vec3 plate = vec3(0.08, 0.07, 0.06);
  vec3 col = mix(plate, vec3(0.95, 0.9, 0.8), sand);
  if (uPlate < 0.5) col *= step(max(abs(p.x), abs(p.y)), 1.0);
  else col *= step(length(p), 1.0);
  col += vec3(0.4, 0.3, 0.2) * uBeat * 0.15;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
