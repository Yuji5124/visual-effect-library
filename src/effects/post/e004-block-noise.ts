import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR, GLSL_HASH } from '../../engine/glsl';

export default defineShaderPost({
  id: '004',
  params: [
    { key: 'blockSize', label: 'ブロックサイズ(px)', type: 'number', min: 8, max: 128, step: 1, default: 32 },
    { key: 'intensity', label: '強度', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'speed', label: '更新頻度', type: 'number', min: 1, max: 30, step: 1, default: 8 },
    { key: 'colorCorrupt', label: '色破損', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
  ],
  notes: '画面をマクロブロックに分割し、ハッシュ値で選んだブロックだけUVずらし・チャンネル入替・量子化を行う。',
  body: /* glsl */ `
${GLSL_HASH}
${GLSL_COLOR}
void main() {
  float t = floor(uTime * uSpeed);
  vec2 px = vUv * uResolution;
  vec2 block = floor(px / uBlockSize);
  vec2 big = floor(px / (uBlockSize * 3.0));
  float r = min(hash12(block + t * 1.37), hash12(big * 7.1 + t * 0.53) + 0.15);
  vec2 uv = vUv;
  bool hit = r < uIntensity * 0.35;
  if (hit) {
    vec2 off = (hash22(block + t) - 0.5) * vec2(0.25, 0.05);
    uv = fract(uv + off);
  }
  vec3 col = texture2D(tDiffuse, uv).rgb;
  float r2 = hash12(block * 1.7 + t * 0.71);
  float k = uIntensity * uColorCorrupt;
  if (r2 < k * 0.25) col = col.brg;
  else if (r2 < k * 0.4) col = floor(col * 3.0 + 0.5) / 3.0;
  else if (r2 > 1.0 - k * 0.06) col = vec3(step(0.5, luma(col))) * vec3(0.2, 1.0, 0.6);
  if (hit) {
    vec2 f = fract(px / uBlockSize);
    col *= 0.85 + 0.3 * step(0.5, fract(f.y * 4.0 + t));
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
