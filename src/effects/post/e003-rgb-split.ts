import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '003',
  params: [
    { key: 'amount', label: 'ずれ量', type: 'number', min: 0, max: 0.06, step: 0.001, default: 0.012 },
    { key: 'angle', label: '方向（度）', type: 'number', min: 0, max: 360, step: 1, default: 0 },
    { key: 'animate', label: '揺らぎ', type: 'bool', default: true },
  ],
  notes: 'R と B を逆方向へオフセットしてサンプリングする最小構成のグリッチ。1パス3フェッチで軽量。',
  body: /* glsl */ `
void main() {
  float wobble = uAnimate > 0.5 ? (0.55 + 0.45 * sin(uTime * 3.1) * sin(uTime * 1.7)) : 1.0;
  float a = radians(uAngle) + (uAnimate > 0.5 ? uTime * 0.9 : 0.0);
  vec2 dir = vec2(cos(a), sin(a)) * uAmount * wobble * vec2(uResolution.y / uResolution.x, 1.0);
  float r = texture2D(tDiffuse, vUv + dir).r;
  float g = texture2D(tDiffuse, vUv).g;
  float b = texture2D(tDiffuse, vUv - dir).b;
  gl_FragColor = vec4(r, g, b, 1.0);
}
`,
});
