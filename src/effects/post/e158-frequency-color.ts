import { defineShaderPost } from '../../engine/shaderEffect';
import { AUDIO_PARAMS, GLSL_AUDIO, audioExtra } from '../../engine/audioExtra';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '158',
  params: [
    ...AUDIO_PARAMS,
    { key: 'bassColor', label: '低音で暗部を染める色', type: 'color', default: '#ff2a5a' },
    { key: 'trebleColor', label: '高音で明部を染める色', type: 'color', default: '#3de8ff' },
    { key: 'midSat', label: '中音で彩度を上げる量', type: 'number', min: 0, max: 2, step: 0.01, default: 1 },
  ],
  notes:
    '音を低音・中音・高音の3帯域に分け、それぞれを映像の別の性質に割り当てる：低音→暗部の色かぶり、中音→彩度、高音→明部の色かぶりとシャープさ。音楽の展開に合わせて映像の色調が呼吸するように変化する。タップで音声開始。',
  extraDecl: GLSL_AUDIO,
  extra: audioExtra(),
  body: /* glsl */ `
${GLSL_COLOR}
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float l = luma(c);
  c = mix(vec3(l), c, 1.0 + uMid * uMidSat);
  c += uBassColor * uBass * (1.0 - l) * 0.5;
  c = mix(c, c * uTrebleColor * 1.6 + uTrebleColor * 0.1, uTreble * smoothstep(0.4, 1.0, l));
  vec2 px = 1.0 / uResolution;
  vec3 blur = (texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb + texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb
             + texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb + texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb) * 0.25;
  c += (texture2D(tDiffuse, vUv).rgb - blur) * uTreble * 3.0;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`,
});
