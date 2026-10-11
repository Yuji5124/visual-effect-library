import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '041',
  params: [
    { key: 'amplitude', label: '振幅', type: 'number', min: 0, max: 0.06, step: 0.001, default: 0.012 },
    { key: 'frequency', label: '周波数', type: 'number', min: 1, max: 60, step: 0.5, default: 14 },
    { key: 'speed', label: '速度', type: 'number', min: 0, max: 10, step: 0.1, default: 2 },
    {
      key: 'direction',
      label: '方向',
      type: 'select',
      options: [
        { value: 'horizontal', label: '横揺れ' },
        { value: 'vertical', label: '縦揺れ' },
        { value: 'radial', label: '同心円（波紋）' },
      ],
      default: 'horizontal',
    },
  ],
  notes: 'UVにサイン波のオフセットを加える最も基本的な歪み。radialは中心からの距離を位相に使い、水面の波紋になる。',
  body: /* glsl */ `
void main() {
  vec2 uv = vUv;
  float t = uTime * uSpeed;
  if (uDirection < 0.5) {
    uv.x += sin(uv.y * uFrequency + t) * uAmplitude + sin(uv.y * uFrequency * 2.3 - t * 1.3) * uAmplitude * 0.3;
  } else if (uDirection < 1.5) {
    uv.y += sin(uv.x * uFrequency + t) * uAmplitude + sin(uv.x * uFrequency * 2.3 - t * 1.3) * uAmplitude * 0.3;
  } else {
    vec2 d = uv - 0.5;
    d.x *= uResolution.x / uResolution.y;
    float r = length(d);
    uv += normalize(d + 1e-5) * sin(r * uFrequency * 3.0 - t * 2.0) * uAmplitude * smoothstep(0.0, 0.1, r);
  }
  gl_FragColor = vec4(texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb, 1.0);
}
`,
});
