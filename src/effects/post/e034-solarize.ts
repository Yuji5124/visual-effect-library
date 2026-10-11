import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '034',
  params: [
    { key: 'threshold', label: '反転しきい値', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'animate', label: 'しきい値を揺らす', type: 'bool', default: true },
    { key: 'edgeLine', label: '境界線（サバティエ効果）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
  ],
  notes: '各チャンネルがしきい値を超えた部分だけを反転させる写真技法の再現。反転境界に細い線（マッキー線）を描くとサバティエ効果らしくなる。',
  body: /* glsl */ `
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float th = uThreshold + (uAnimate > 0.5 ? 0.3 * sin(uTime * 0.8) : 0.0);
  vec3 s = mix(c, 1.0 - c, step(th, c));
  vec3 line = smoothstep(0.03, 0.0, abs(c - th));
  s -= line * uEdgeLine;
  gl_FragColor = vec4(clamp(s * 1.3, 0.0, 1.0), 1.0);
}
`,
});
