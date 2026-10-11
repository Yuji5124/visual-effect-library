import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HASH } from '../../engine/glsl';

export default defineShaderPost({
  id: '008',
  params: [
    { key: 'levels', label: '階調数/ch', type: 'number', min: 2, max: 32, step: 1, default: 4 },
    { key: 'downsample', label: '縮小率(px)', type: 'number', min: 1, max: 16, step: 1, default: 3 },
    { key: 'noise', label: '量子化ノイズ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
  ],
  notes: '解像度とチャンネルごとの階調数を同時に落とす。量子化前にノイズを加えると縞が崩れ、デジタル劣化らしくなる。',
  body: /* glsl */ `
${GLSL_HASH}
void main() {
  vec2 px = floor(vUv * uResolution / uDownsample);
  vec2 uv = (px + 0.5) * uDownsample / uResolution;
  vec3 c = texture2D(tDiffuse, uv).rgb;
  float n = (hash12(px + floor(uTime * 12.0)) - 0.5) * uNoise;
  float L = uLevels - 1.0;
  c = floor(c * L + 0.5 + n) / L;
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`,
});
