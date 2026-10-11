import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '023',
  params: [
    { key: 'pixelSize', label: 'ドットサイズ(px)', type: 'number', min: 1, max: 8, step: 1, default: 2 },
    { key: 'levels', label: '階調数', type: 'number', min: 2, max: 8, step: 1, default: 2 },
    {
      key: 'palette',
      label: 'パレット',
      type: 'select',
      options: [
        { value: 'mono', label: '1bitモノクロ' },
        { value: 'handheld', label: '携帯機4色（緑）' },
        { value: 'rgb', label: 'RGB各チャンネル' },
      ],
      default: 'handheld',
    },
  ],
  notes: '8×8 Bayer行列をビット分解で計算する秩序ディザ。行列を配列で持たないためGLSL ES 1.0でも動作する。',
  body: /* glsl */ `
${GLSL_COLOR}
// 2x2 基本行列 [0 2; 3 1] を再帰的に組み合わせた 8x8 Bayer しきい値
float bayer8(vec2 p) {
  p = mod(floor(p), 8.0);
  float v = 0.0;
  float w = 16.0;
  for (int i = 0; i < 3; i++) {
    vec2 b = mod(p, 2.0);
    v += mod(2.0 * b.x + 3.0 * b.y, 4.0) * w;
    w *= 0.25;
    p = floor(p * 0.5);
  }
  return (v + 0.5) / 64.0;
}
void main() {
  vec2 px = floor(vUv * uResolution / uPixelSize);
  vec2 uv = (px + 0.5) * uPixelSize / uResolution;
  vec3 c = texture2D(tDiffuse, uv).rgb;
  float th = bayer8(px) - 0.5;
  vec3 outc;
  if (uPalette < 0.5) {
    float n = uLevels - 1.0;
    outc = vec3(clamp(floor(luma(c) * n + th + 0.5) / n, 0.0, 1.0));
  } else if (uPalette < 1.5) {
    float k = clamp(floor(luma(c) * 3.0 + th + 0.5), 0.0, 3.0);
    vec3 p0 = vec3(0.06, 0.22, 0.06);
    vec3 p1 = vec3(0.19, 0.38, 0.19);
    vec3 p2 = vec3(0.55, 0.67, 0.06);
    vec3 p3 = vec3(0.61, 0.74, 0.06);
    outc = k < 0.5 ? p0 : (k < 1.5 ? p1 : (k < 2.5 ? p2 : p3));
  } else {
    float n = uLevels - 1.0;
    outc = clamp(floor(c * n + th + 0.5) / n, 0.0, 1.0);
  }
  gl_FragColor = vec4(outc, 1.0);
}
`,
});
