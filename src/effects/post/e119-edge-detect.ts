import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '119',
  params: [
    { key: 'threshold', label: 'しきい値', type: 'number', min: 0, max: 1, step: 0.01, default: 0.12 },
    { key: 'thickness', label: '線の太さ(px)', type: 'number', min: 0.5, max: 4, step: 0.1, default: 1 },
    {
      key: 'mode',
      label: '表示',
      type: 'select',
      options: [
        { value: 'mono', label: '白線のみ' },
        { value: 'overlay', label: '元映像に重ねる' },
        { value: 'neon', label: '方向で色分け（ネオン）' },
      ],
      default: 'neon',
    },
  ],
  notes: '3×3 Sobelカーネルで輝度勾配の大きさと向きを求める。neonモードは勾配方向を色相に割り当てる。',
  body: /* glsl */ `
${GLSL_COLOR}
float L(vec2 o) { return luma(texture2D(tDiffuse, vUv + o / uResolution * uThickness).rgb); }
void main() {
  float tl = L(vec2(-1.0, 1.0)), t = L(vec2(0.0, 1.0)), tr = L(vec2(1.0, 1.0));
  float l = L(vec2(-1.0, 0.0)), r = L(vec2(1.0, 0.0));
  float bl = L(vec2(-1.0, -1.0)), b = L(vec2(0.0, -1.0)), br = L(vec2(1.0, -1.0));
  float gx = -tl - 2.0 * l - bl + tr + 2.0 * r + br;
  float gy = -bl - 2.0 * b - br + tl + 2.0 * t + tr;
  float mag = length(vec2(gx, gy));
  float e = smoothstep(uThreshold, uThreshold + 0.15, mag);
  vec3 src = texture2D(tDiffuse, vUv).rgb;
  vec3 col;
  if (uMode < 0.5) col = vec3(e);
  else if (uMode < 1.5) col = mix(src * 0.5, vec3(1.0), e);
  else col = hsv2rgb(vec3(atan(gy, gx) / 6.28318 + 0.5, 0.85, 1.0)) * e * 1.4;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
