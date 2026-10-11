import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '042',
  params: [
    { key: 'strength', label: 'ねじれ量', type: 'number', min: -12, max: 12, step: 0.1, default: 4 },
    { key: 'radius', label: '半径', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.45 },
    { key: 'animate', label: '往復アニメーション', type: 'bool', default: true },
  ],
  notes: '中心からの距離 r に応じた回転角 (1-r/R)^2 × 強度 でUVを回す。半径外は無変形。',
  body: /* glsl */ `
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vUv - 0.5;
  p.x *= aspect;
  float r = length(p);
  float k = uStrength * (uAnimate > 0.5 ? sin(uTime * 0.8) : 1.0);
  float w = max(0.0, 1.0 - r / uRadius);
  float a = k * w * w;
  float c = cos(a), s = sin(a);
  p = mat2(c, s, -s, c) * p;
  p.x /= aspect;
  gl_FragColor = vec4(texture2D(tDiffuse, clamp(p + 0.5, 0.0, 1.0)).rgb, 1.0);
}
`,
});
