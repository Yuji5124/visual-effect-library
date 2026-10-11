import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '033',
  params: [
    { key: 'speed', label: '回転速度', type: 'number', min: -2, max: 2, step: 0.01, default: 0.3 },
    { key: 'offset', label: '色相オフセット（度）', type: 'number', min: 0, max: 360, step: 1, default: 0 },
    { key: 'saturation', label: '彩度', type: 'number', min: 0, max: 2.5, step: 0.01, default: 1.25 },
    { key: 'spatial', label: '位置による色相差', type: 'number', min: 0, max: 2, step: 0.01, default: 0 },
  ],
  notes: 'YIQ色空間でIQ平面を回転させると、輝度(Y)を保ったまま色相だけを回せる。',
  body: /* glsl */ `
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  vec3 yiq = mat3(0.299, 0.596, 0.211, 0.587, -0.274, -0.523, 0.114, -0.322, 0.312) * c;
  float a = radians(uOffset) + uTime * uSpeed * 6.28318 + (vUv.x + vUv.y) * uSpatial * 3.14159;
  float cs = cos(a), sn = sin(a);
  yiq.yz = mat2(cs, sn, -sn, cs) * yiq.yz * uSaturation;
  vec3 rgb = mat3(1.0, 1.0, 1.0, 0.956, -0.272, -1.106, 0.621, -0.647, 1.703) * yiq;
  gl_FragColor = vec4(clamp(rgb, 0.0, 1.0), 1.0);
}
`,
});
