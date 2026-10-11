import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '189',
  params: [
    { key: 'skyTop', label: '空の色（上）', type: 'color', default: '#1b1449' },
    { key: 'skyBottom', label: '空の色（下）', type: 'color', default: '#ff8a3d' },
    { key: 'threshold', label: 'シルエット化の明るさ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.12 },
    { key: 'rim', label: 'リムライト', type: 'number', min: 0, max: 3, step: 0.01, default: 1.4 },
    { key: 'rimColor', label: 'リムの色', type: 'color', default: '#ffd9a0' },
  ],
  notes: '背景（暗い部分）を夕焼けのグラデーションに置き換え、物体は真っ黒に塗りつぶす。物体の縁（背景との境界）だけを輪郭光として光らせ、逆光撮影に見せる。',
  body: /* glsl */ `
${GLSL_COLOR}
float mask(vec2 uv) { return smoothstep(uThreshold, uThreshold + 0.05, luma(texture2D(tDiffuse, uv).rgb)); }
void main() {
  float m = mask(vUv);
  vec2 px = 2.0 / uResolution;
  float around = 0.0;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    around += mask(vUv + vec2(cos(a), sin(a)) * px * 2.0);
  }
  around /= 8.0;
  float rim = clamp(m - around, 0.0, 1.0) + clamp(m * (1.0 - around) * 2.0, 0.0, 1.0);
  vec3 sky = mix(uSkyBottom, uSkyTop, smoothstep(0.1, 0.9, vUv.y));
  sky += uSkyBottom * 0.6 * exp(-length((vUv - vec2(0.5, 0.3)) * vec2(1.5, 3.0)) * 3.0);
  vec3 col = mix(sky, vec3(0.01), m);
  col += uRimColor * rim * uRim;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
