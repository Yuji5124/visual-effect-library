import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '048',
  params: [
    {
      key: 'mode',
      label: '鏡の配置',
      type: 'select',
      options: [
        { value: 'lr', label: '左右対称' },
        { value: 'tb', label: '上下対称（水鏡）' },
        { value: 'quad', label: '4分割' },
        { value: 'tile', label: '無限タイル' },
      ],
      default: 'quad',
    },
    { key: 'offset', label: '鏡の位置', type: 'number', min: 0.2, max: 0.8, step: 0.01, default: 0.5 },
    { key: 'ripple', label: '水面の揺らぎ', type: 'number', min: 0, max: 0.03, step: 0.001, default: 0.004 },
    { key: 'tint', label: '鏡像の暗さ', type: 'number', min: 0, max: 0.8, step: 0.01, default: 0.15 },
  ],
  notes: '鏡の線を境にUVを折り返す。上下対称では鏡像側だけに波紋と減光を入れて水面反射に見せる。タイル化すると空間が無限に連なる。',
  body: /* glsl */ `
void main() {
  vec2 uv = vUv;
  float mirrored = 0.0;
  float o = uOffset;
  if (uMode < 0.5) { if (uv.x > o) { uv.x = 2.0 * o - uv.x; mirrored = 1.0; } }
  else if (uMode < 1.5) { if (uv.y < o) { uv.y = 2.0 * o - uv.y; mirrored = 1.0; uv.x += sin(uv.y * 80.0 + uTime * 3.0) * uRipple; } }
  else if (uMode < 2.5) {
    if (uv.x > o) { uv.x = 2.0 * o - uv.x; mirrored = 1.0; }
    if (uv.y < o) { uv.y = 2.0 * o - uv.y; mirrored = 1.0; }
  } else {
    vec2 g = uv * 3.0 + vec2(uTime * 0.05, 0.0);
    vec2 cell = floor(g);
    uv = fract(g);
    uv = mix(uv, 1.0 - uv, mod(cell, 2.0));
    mirrored = mod(cell.x + cell.y, 2.0);
  }
  vec3 col = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
  col *= 1.0 - mirrored * uTint;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
