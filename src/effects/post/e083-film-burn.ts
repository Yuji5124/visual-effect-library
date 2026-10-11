import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_NOISE } from '../../engine/glsl';

export default defineShaderPost({
  id: '083',
  params: [
    { key: 'speed', label: '焼ける速さ', type: 'number', min: 0.02, max: 1, step: 0.01, default: 0.15 },
    { key: 'scale', label: '焼け穴の細かさ', type: 'number', min: 1, max: 10, step: 0.1, default: 3 },
    { key: 'edge', label: '焦げ縁の幅', type: 'number', min: 0.01, max: 0.2, step: 0.005, default: 0.06 },
    { key: 'loop', label: '繰り返す', type: 'bool', default: true },
  ],
  notes: '映写機の熱でフィルムが溶ける現象の再現。ノイズ値 < 進行度 の部分を焼失（白）、その手前の帯を高温のオレンジ→焦げ茶のグラデーションにする。進行度は時間で増え、ループ可能。',
  body: /* glsl */ `
${GLSL_NOISE}
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float t = uTime * uSpeed;
  float prog = uLoop > 0.5 ? fract(t) * 1.4 - 0.2 : min(t, 1.2);
  vec2 p = (vUv - vec2(0.45, 0.5)) * vec2(uResolution.x / uResolution.y, 1.0) * uScale;
  float n = fbm(p + 3.1) * 0.85 + length(vUv - vec2(0.45, 0.5)) * 0.35;
  float d = n - prog;
  vec3 burnt = vec3(1.0, 0.98, 0.9);
  vec3 col = c;
  col = mix(col, vec3(0.15, 0.05, 0.0), smoothstep(uEdge * 2.0, uEdge * 0.6, d));
  col = mix(col, vec3(1.0, 0.45, 0.05) * 1.6, smoothstep(uEdge * 0.8, 0.0, d) * step(0.0, d));
  col = mix(col, burnt, step(d, 0.0));
  col *= 0.95 + 0.05 * sin(uTime * 40.0);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
