import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HASH, GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '084',
  params: [
    { key: 'snow', label: '砂嵐', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'roll', label: '縦ロール', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'ghost', label: 'ゴースト（多重像）', type: 'number', min: 0, max: 0.6, step: 0.01, default: 0.25 },
    { key: 'interference', label: '干渉縞', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'tuning', label: 'チャンネル切替', type: 'bool', default: true },
  ],
  notes: '電波受信の不具合を合成：右にずれた弱い多重像（マルチパス）、ゆっくり流れる斜めの干渉縞、垂直同期の外れによる縦ロール、砂嵐。数秒ごとに一瞬「チャンネル切替」の全面砂嵐を挟む。',
  body: /* glsl */ `
${GLSL_HASH}
${GLSL_COLOR}
void main() {
  float t = uTime;
  float switching = uTuning > 0.5 ? smoothstep(0.92, 0.97, fract(t / 6.0)) * smoothstep(1.0, 0.97, fract(t / 6.0)) : 0.0;
  vec2 uv = vUv;
  uv.y = fract(uv.y + floor(t * 0.7) * 0.0 + uRoll * fract(t * 0.13) * step(0.6, sin(t * 0.4)));
  uv.x += sin(uv.y * 6.0 + t * 3.0) * 0.003 * uInterference;
  vec3 col = texture2D(tDiffuse, uv).rgb;
  col += texture2D(tDiffuse, uv - vec2(0.03, 0.0)).rgb * uGhost;
  col /= 1.0 + uGhost;
  float stripes = sin((vUv.x * 3.0 + vUv.y * 40.0) - t * 4.0) * 0.5 + 0.5;
  col += (stripes - 0.5) * 0.12 * uInterference;
  float n = hash12(floor(vUv * uResolution / 1.5) + fract(t * 60.0) * 100.0);
  col = mix(col, vec3(n), clamp(uSnow * 0.6 + switching, 0.0, 1.0));
  float l = luma(col);
  col = mix(vec3(l), col, 0.75);
  float bar = smoothstep(0.0, 0.02, abs(fract(uv.y - 0.02) - 0.98));
  col *= mix(1.0, bar, uRoll);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
