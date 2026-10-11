import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR, GLSL_NOISE } from '../../engine/glsl';

export default defineShaderPost({
  id: '082',
  params: [
    { key: 'amount', label: '粒状感', type: 'number', min: 0, max: 0.6, step: 0.01, default: 0.16 },
    { key: 'grainSize', label: '粒の大きさ', type: 'number', min: 1, max: 4, step: 0.1, default: 1.6 },
    { key: 'flicker', label: 'フリッカー', type: 'number', min: 0, max: 0.3, step: 0.01, default: 0.06 },
    { key: 'scratches', label: '傷', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'vignette', label: '周辺減光', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'warmth', label: '暖色トーン', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
  ],
  notes: '毎フレーム変化するバリューノイズを輝度依存（中間調で最大）で加算。縦傷・フリッカー・暖色トーンでフィルムらしさを補強。',
  body: /* glsl */ `
${GLSL_NOISE}
${GLSL_COLOR}
void main() {
  vec3 col = texture2D(tDiffuse, vUv).rgb;
  float frame = floor(uTime * 24.0);
  vec2 gp = vUv * uResolution / uGrainSize + hash22(vec2(frame)) * 100.0;
  float g = vnoise(gp) + vnoise(gp * 2.1) * 0.5 - 0.75;
  float l = luma(col);
  col += g * uAmount * (1.0 - abs(l - 0.5) * 1.4);
  col *= 1.0 + (hash11(frame) - 0.5) * uFlicker * 2.0;
  float sx = hash11(frame * 1.3);
  float scratch = step(0.6, hash11(frame * 0.7)) * smoothstep(0.0015, 0.0, abs(vUv.x - sx));
  col = mix(col, vec3(0.9), scratch * uScratches * (0.5 + 0.5 * vnoise(vec2(vUv.y * 40.0, frame))));
  vec3 warm = vec3(1.08, 1.0, 0.86);
  col *= mix(vec3(1.0), warm, uWarmth);
  vec2 v = vUv * (1.0 - vUv);
  col *= mix(1.0, pow(v.x * v.y * 16.0, 0.3), uVignette);
  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`,
});
