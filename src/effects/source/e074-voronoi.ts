import { defineShaderSource } from '../../engine/shaderEffect';
import { GLSL_HASH, GLSL_COLOR } from '../../engine/glsl';

export default defineShaderSource({
  id: '074',
  params: [
    { key: 'scale', label: 'セル密度', type: 'number', min: 2, max: 24, step: 0.1, default: 7 },
    { key: 'speed', label: '母点の速度', type: 'number', min: 0, max: 3, step: 0.01, default: 0.6 },
    { key: 'border', label: '境界の太さ', type: 'number', min: 0.005, max: 0.2, step: 0.001, default: 0.04 },
    { key: 'glow', label: '境界の発光', type: 'number', min: 0, max: 2, step: 0.01, default: 1 },
    { key: 'fill', label: 'セル塗り', type: 'bool', default: true },
  ],
  notes: '格子ごとに1つの母点をハッシュで配置し、周囲3×3格子を探索してF1・F2距離を算出。F2−F1で正確な境界線を得る。',
  body: /* glsl */ `
${GLSL_HASH}
${GLSL_COLOR}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * uScale;
  vec2 ip = floor(p);
  vec2 fp = fract(p);
  float f1 = 8.0, f2 = 8.0;
  vec2 id1 = vec2(0.0);
  vec2 mr = vec2(0.0);
  vec2 mg = vec2(0.0);
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(ip + g);
    o = 0.5 + 0.45 * sin(uTime * uSpeed + 6.2831 * o);
    vec2 r = g + o - fp;
    float d = dot(r, r);
    if (d < f1) { f2 = f1; f1 = d; id1 = ip + g; mr = r; mg = g; }
    else if (d < f2) { f2 = d; }
  }
  // 正確な境界距離: 最近母点との二等分線までの距離を2パス目で求める
  float md = 8.0;
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 o = hash22(ip + g);
    o = 0.5 + 0.45 * sin(uTime * uSpeed + 6.2831 * o);
    vec2 r = g + o - fp;
    if (dot(mr - r, mr - r) > 1e-5) md = min(md, dot(0.5 * (mr + r), normalize(r - mr)));
  }
  float h = hash12(id1);
  vec3 cell = uFill > 0.5 ? hsv2rgb(vec3(h * 0.35 + 0.55 + uTime * 0.02, 0.6, 0.25 + 0.35 * (1.0 - sqrt(f1)))) : vec3(0.02);
  float edge = 1.0 - smoothstep(0.0, uBorder, md);
  vec3 glow = hsv2rgb(vec3(h * 0.2 + 0.5, 0.7, 1.0)) * exp(-md * 18.0) * uGlow;
  vec3 col = cell + glow + vec3(edge) * 0.9;
  col += vec3(1.0) * smoothstep(0.06, 0.0, sqrt(f1)) * 0.8;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
