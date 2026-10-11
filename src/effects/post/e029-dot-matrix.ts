import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '029',
  params: [
    { key: 'cell', label: 'ドット間隔(px)', type: 'number', min: 4, max: 32, step: 1, default: 9 },
    { key: 'color', label: 'LED色', type: 'color', default: '#ff9a2e' },
    { key: 'fullColor', label: 'フルカラーLED', type: 'bool', default: false },
    { key: 'levels', label: '輝度段階', type: 'number', min: 2, max: 16, step: 1, default: 6 },
    { key: 'glow', label: 'にじみ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  notes: 'セル中心の輝度を段階化して丸いLEDドットの明るさにする。消灯ドットも薄く描き、周囲へのにじみを指数関数で加えると電光掲示板らしくなる。',
  body: /* glsl */ `
${GLSL_COLOR}
void main() {
  vec2 px = vUv * uResolution;
  vec2 cell = floor(px / uCell);
  vec2 f = fract(px / uCell) - 0.5;
  vec3 src = texture2D(tDiffuse, (cell + 0.5) * uCell / uResolution).rgb;
  float l = floor(luma(src) * uLevels + 0.5) / uLevels;
  vec3 led = uFullColor > 0.5 ? floor(src * uLevels + 0.5) / uLevels : uColor * l;
  float d = length(f);
  float dot_ = smoothstep(0.42, 0.32, d);
  vec3 col = mix(vec3(0.03, 0.02, 0.02), led * 1.3, dot_);
  col += led * exp(-d * 6.0) * uGlow * 0.6;
  col += uColor * 0.04 * dot_;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
