import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '067',
  params: [
    { key: 'strength', label: '収差の強さ', type: 'number', min: 0, max: 0.08, step: 0.001, default: 0.04 },
    { key: 'falloff', label: '周辺への集中度', type: 'number', min: 0.5, max: 4, step: 0.05, default: 1.5 },
    { key: 'samples', label: 'スペクトル分解数', type: 'number', min: 3, max: 16, step: 1, default: 9 },
  ],
  notes: '中心からの距離のべき乗で放射方向のずれ量を決め、波長ごとの重みで複数回サンプルして虹色のにじみを作る。単純なRGB3分割より滑らか。',
  body: /* glsl */ `
vec3 spectrum(float t) {
  return clamp(vec3(1.5 - abs(4.0 * t - 1.0), 1.5 - abs(4.0 * t - 2.0), 1.5 - abs(4.0 * t - 3.0)), 0.0, 1.0);
}
void main() {
  vec2 d = vUv - 0.5;
  float r = length(d * vec2(uResolution.x / uResolution.y, 1.0));
  float amt = uStrength * pow(r * 1.4, uFalloff);
  vec3 sum = vec3(0.0);
  vec3 wsum = vec3(0.0);
  for (int i = 0; i < 16; i++) {
    if (float(i) >= uSamples) break;
    float t = float(i) / max(uSamples - 1.0, 1.0);
    vec3 w = spectrum(t);
    vec2 uv = 0.5 + d * (1.0 - amt * (t - 0.5) * 2.0);
    sum += texture2D(tDiffuse, uv).rgb * w;
    wsum += w;
  }
  gl_FragColor = vec4(sum / max(wsum, vec3(1e-4)), 1.0);
}
`,
});
