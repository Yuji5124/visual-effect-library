import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '062',
  params: [
    { key: 'focus', label: 'ピント位置', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'band', label: 'ピント帯の幅', type: 'number', min: 0.02, max: 0.5, step: 0.01, default: 0.12 },
    { key: 'blur', label: 'ぼけの大きさ(px)', type: 'number', min: 0, max: 24, step: 0.5, default: 10 },
    { key: 'saturation', label: '彩度', type: 'number', min: 0.5, max: 2, step: 0.01, default: 1.35 },
  ],
  notes: 'ピント帯からの距離に応じてぼけ半径を変える可変ぼかし。円盤状に配置した黄金角サンプル（螺旋）で、少ないサンプル数でも丸いボケになる。',
  body: /* glsl */ `
void main() {
  float d = max(0.0, abs(vUv.y - uFocus) - uBand) / (1.0 - uBand);
  float radius = uBlur * smoothstep(0.0, 0.6, d);
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  int n = uQuality > 0.5 ? 48 : 24;
  for (int i = 0; i < 48; i++) {
    if (i >= n) break;
    float fi = float(i) + 0.5;
    float r = sqrt(fi / float(n)) * radius;
    float a = fi * 2.39996;
    vec2 o = vec2(cos(a), sin(a)) * r / uResolution;
    vec3 s = texture2D(tDiffuse, vUv + o).rgb;
    float w = 1.0 + dot(s, vec3(0.33)) * 2.0; // 明るい点ほどボケが目立つ
    acc += s * w;
    wsum += w;
  }
  vec3 col = acc / wsum;
  float l = dot(col, vec3(0.299, 0.587, 0.114));
  col = mix(vec3(l), col, uSaturation);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
