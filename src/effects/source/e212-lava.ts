import { defineShaderSource } from '../../engine/shaderEffect';
import { GLSL_NOISE } from '../../engine/glsl';

export default defineShaderSource({
  id: '212',
  params: [
    { key: 'flow', label: '流れる速さ', type: 'number', min: 0, max: 2, step: 0.01, default: 0.35 },
    { key: 'scale', label: '模様の大きさ', type: 'number', min: 0.5, max: 6, step: 0.01, default: 2.2 },
    { key: 'crust', label: '冷えた表皮の量', type: 'number', min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: 'heat', label: '温度', type: 'number', min: 0.3, max: 2, step: 0.01, default: 1 },
  ],
  notes:
    '流れ場で歪めた fBm を「温度」として扱い、黒→赤→橙→黄の黒体放射風カラーマップで発光させる。表面には移動するセル（ボロノイの境界距離）で冷えて固まった表皮の割れ目を作り、割れ目の内側だけ高温に光らせる。（着想: three.js examples の webgl_shader_lava。実装は独自でテクスチャ画像を使わない）',
  body: /* glsl */ `
${GLSL_NOISE}
vec2 cellEdge(vec2 p, float t) {
  vec2 ip = floor(p), fp = fract(p);
  float f1 = 8.0, f2 = 8.0;
  for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = 0.5 + 0.4 * sin(t + 6.2831 * hash22(ip + g));
    float d = length(g + o - fp);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return vec2(f1, f2 - f1);
}
vec3 blackbody(float t) {
  t = clamp(t, 0.0, 1.5);
  vec3 c = vec3(0.0);
  c = mix(c, vec3(0.5, 0.02, 0.0), smoothstep(0.0, 0.35, t));
  c = mix(c, vec3(1.0, 0.25, 0.0), smoothstep(0.35, 0.7, t));
  c = mix(c, vec3(1.0, 0.7, 0.1), smoothstep(0.7, 1.0, t));
  c = mix(c, vec3(1.0, 1.0, 0.7), smoothstep(1.0, 1.4, t));
  return c;
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * uScale;
  float t = uTime * uFlow;
  vec2 flow = vec2(fbm(p + vec2(t * 0.3, 0.0)), fbm(p + vec2(3.1, -t * 0.25))) - 0.5;
  vec2 q = p + flow * 1.5 + vec2(t * 0.4, 0.0);
  float temp = fbm(q * 1.5 + fbm(q * 2.0 - t * 0.2)) * 1.3 * uHeat;
  vec2 ce = cellEdge(q * 1.6, t * 0.5);
  float crack = smoothstep(0.08, 0.0, ce.y);
  float crustMask = smoothstep(uCrust * 0.9, uCrust * 0.9 + 0.15, 1.0 - temp + 0.25) * (1.0 - crack);
  vec3 hot = blackbody(temp + crack * 0.6);
  vec3 rock = vec3(0.07, 0.05, 0.05) * (0.6 + 0.6 * fbm(q * 8.0));
  vec3 col = mix(hot, rock, crustMask);
  col += vec3(1.0, 0.3, 0.05) * crack * (1.0 - crustMask * 0.3) * 0.6 * uHeat;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
