import { defineShaderSource } from '../../engine/shaderEffect';

export default defineShaderSource({
  id: '071',
  params: [
    { key: 'speed', label: 'ズーム速度', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.35 },
    {
      key: 'target',
      label: 'ズーム地点',
      type: 'select',
      options: [
        { value: 'seahorse', label: 'タツノオトシゴの谷' },
        { value: 'spiral', label: '渦巻き' },
        { value: 'antenna', label: 'アンテナ' },
      ],
      default: 'seahorse',
    },
    { key: 'colorCycle', label: '色の周期', type: 'number', min: 0.01, max: 0.2, step: 0.001, default: 0.04 },
  ],
  notes:
    'マンデルブロ集合を連続（スムーズ）反復回数で着色。GPUの単精度浮動小数点の限界（約1e-5）までズームしたら自動でループする。深い拡大には倍精度エミュレーションが必要（Phase 2検討）。',
  body: /* glsl */ `
void main() {
  vec2 c0 = uTarget < 0.5 ? vec2(-0.743643, 0.131825) : (uTarget < 1.5 ? vec2(-0.761574, -0.0847596) : vec2(-1.7499, 0.0));
  float maxLog = 9.5;
  float z = mod(uTime * uSpeed, maxLog);
  float scale = 2.5 * exp(-z);
  vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  vec2 c = c0 + uv * scale;
  vec2 w = vec2(0.0);
  float n = 0.0;
  float maxIt = uQuality > 0.5 ? 400.0 : 180.0;
  float escaped = 0.0;
  for (int i = 0; i < 400; i++) {
    if (float(i) >= maxIt) break;
    w = vec2(w.x * w.x - w.y * w.y, 2.0 * w.x * w.y) + c;
    if (dot(w, w) > 256.0) { escaped = 1.0; break; }
    n += 1.0;
  }
  vec3 col = vec3(0.0);
  if (escaped > 0.5) {
    float sn = n - log2(log2(dot(w, w))) + 4.0;
    float t = sn * uColorCycle + uTime * 0.05;
    col = 0.5 + 0.5 * cos(6.28318 * (t + vec3(0.0, 0.15, 0.3)));
    col *= smoothstep(0.0, 6.0, sn);
  }
  float fade = smoothstep(0.0, 0.4, z) * smoothstep(maxLog, maxLog - 0.4, z);
  gl_FragColor = vec4(col * fade, 1.0);
}
`,
});
