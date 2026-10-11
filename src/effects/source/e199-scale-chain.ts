import { defineShaderSource } from '../../engine/shaderEffect';
import { GLSL_COLOR, GLSL_HASH } from '../../engine/glsl';

export default defineShaderSource({
  id: '199',
  params: [
    { key: 'speed', label: 'ズーム速度', type: 'number', min: -1, max: 1, step: 0.01, default: 0.35 },
    { key: 'ratio', label: '入れ子の倍率', type: 'number', min: 2, max: 6, step: 1, default: 3 },
    { key: 'rotate', label: '階層ごとの回転', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
  ],
  notes:
    '「部屋の中の窓の中に同じ部屋」がある構造を、倍率 N ごとに同じ図形が繰り返す格子として描く。ズーム量の対数を階層数として扱い、隣接する2階層をクロスフェードすることで、拡大しても縮小しても終わりのない連鎖になる。',
  body: /* glsl */ `
${GLSL_COLOR}
${GLSL_HASH}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
vec3 layer(vec2 p, float level) {
  // 中央の窓（1/ratio の大きさ）と、周りの装飾的なタイル
  vec2 q = abs(p);
  float m = max(q.x, q.y);
  vec3 col = hsv2rgb(vec3(fract(level * 0.13), 0.55, 0.9));
  vec2 g = fract(p * uRatio * 0.5 + 0.5) - 0.5;
  float tile = smoothstep(0.42, 0.4, max(abs(g.x), abs(g.y)));
  col *= 0.5 + 0.4 * tile;
  float frame = smoothstep(0.012, 0.0, abs(m - 1.0 / uRatio)) + smoothstep(0.02, 0.0, abs(m - 1.0));
  col += frame * 0.8;
  col *= 0.6 + 0.4 * hash12(floor(p * uRatio * 0.5 + 0.5) + level);
  return col;
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 1.6;
  float z = uTime * uSpeed;
  float level = floor(z);
  float f = fract(z);
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float L = level + float(i);
    float s = pow(uRatio, f - float(i) + 1.0) / uRatio;
    vec2 q = p / s;
    q *= rot((L) * uRotate);
    float inside = step(max(abs(q.x), abs(q.y)), 1.0);
    vec3 c = layer(q, L);
    col = i == 0 ? c : mix(col, c, inside);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
