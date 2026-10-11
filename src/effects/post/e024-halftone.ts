import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '024',
  params: [
    { key: 'dotSize', label: '網点ピッチ(px)', type: 'number', min: 3, max: 32, step: 0.5, default: 8 },
    { key: 'angle', label: '角度（度）', type: 'number', min: 0, max: 90, step: 1, default: 45 },
    {
      key: 'mode',
      label: '方式',
      type: 'select',
      options: [
        { value: 'cmyk', label: 'CMYK 4版' },
        { value: 'mono', label: 'モノクロ' },
      ],
      default: 'cmyk',
    },
  ],
  notes: '回転させた格子のセル中心で濃度をサンプルし、面積比が濃度と一致する半径の円を描く。CMYKは版ごとに角度をずらしてモアレを抑える。',
  body: /* glsl */ `
${GLSL_COLOR}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
// 回転格子上のセル中心UVと、セル内座標(-0.5..0.5)を返す
vec2 cellCenterUv(vec2 px, float ang, out vec2 f) {
  vec2 p = rot(ang) * px / uDotSize;
  vec2 cell = floor(p);
  f = p - cell - 0.5;
  vec2 cpx = rot(-ang) * ((cell + 0.5) * uDotSize);
  return cpx / uResolution;
}
float dotMask(float coverage, vec2 f) {
  float r = sqrt(clamp(coverage, 0.0, 1.0)) * 0.71;
  float aa = 1.0 / uDotSize;
  return 1.0 - smoothstep(r - aa, r + aa, length(f));
}
vec4 cmyk(vec3 c) {
  float k = 1.0 - max(c.r, max(c.g, c.b));
  vec3 cmy = (1.0 - c - k) / max(1.0 - k, 1e-3);
  return vec4(cmy, k);
}
void main() {
  vec2 px = vUv * uResolution;
  float base = radians(uAngle);
  vec3 paper = vec3(0.97, 0.95, 0.9);
  vec2 f;
  if (uMode > 0.5) {
    vec2 uv = cellCenterUv(px, base, f);
    float cov = 1.0 - luma(texture2D(tDiffuse, uv).rgb);
    gl_FragColor = vec4(mix(paper, vec3(0.08), dotMask(cov, f)), 1.0);
    return;
  }
  vec3 col = paper;
  vec2 uv;
  uv = cellCenterUv(px, base + radians(15.0), f);
  col *= mix(vec3(1.0), vec3(0.0, 0.68, 0.94), dotMask(cmyk(texture2D(tDiffuse, uv).rgb).x, f));
  uv = cellCenterUv(px, base + radians(75.0), f);
  col *= mix(vec3(1.0), vec3(0.93, 0.0, 0.55), dotMask(cmyk(texture2D(tDiffuse, uv).rgb).y, f));
  uv = cellCenterUv(px, base, f);
  col *= mix(vec3(1.0), vec3(1.0, 0.95, 0.0), dotMask(cmyk(texture2D(tDiffuse, uv).rgb).z, f));
  uv = cellCenterUv(px, base + radians(45.0), f);
  col *= mix(vec3(1.0), vec3(0.1), dotMask(cmyk(texture2D(tDiffuse, uv).rgb).w, f));
  gl_FragColor = vec4(col, 1.0);
}
`,
});
