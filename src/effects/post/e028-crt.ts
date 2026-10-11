import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_HASH } from '../../engine/glsl';

export default defineShaderPost({
  id: '028',
  params: [
    { key: 'curvature', label: '画面の湾曲', type: 'number', min: 0, max: 0.6, step: 0.01, default: 0.2 },
    { key: 'scanline', label: '走査線', type: 'number', min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: 'lineCount', label: '走査線本数', type: 'number', min: 120, max: 720, step: 1, default: 240 },
    { key: 'mask', label: 'シャドウマスク', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'vignette', label: '周辺減光', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'flicker', label: 'ちらつき', type: 'number', min: 0, max: 0.3, step: 0.005, default: 0.04 },
  ],
  notes: '樽型歪み → 走査線（正弦波）→ RGBアパーチャマスク → 周辺減光の順で合成。走査線本数は解像度と独立に指定できる。',
  body: /* glsl */ `
${GLSL_HASH}
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  p *= 1.0 + uCurvature * 0.25 * dot(p.yx, p.yx);
  vec2 uv = p * 0.5 + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
  float off = 0.0015;
  vec3 col = vec3(
    texture2D(tDiffuse, uv + vec2(off, 0.0)).r,
    texture2D(tDiffuse, uv).g,
    texture2D(tDiffuse, uv - vec2(off, 0.0)).b);
  float scan = 0.5 + 0.5 * sin(uv.y * uLineCount * 3.14159 * 2.0);
  col *= mix(1.0, 0.35 + 0.65 * scan, uScanline);
  float m = mod(floor(gl_FragCoord.x), 3.0);
  vec3 mask = m < 0.5 ? vec3(1.0, 0.7, 0.7) : (m < 1.5 ? vec3(0.7, 1.0, 0.7) : vec3(0.7, 0.7, 1.0));
  col *= mix(vec3(1.0), mask * 1.25, uMask);
  vec2 v = uv * (1.0 - uv);
  col *= mix(1.0, pow(v.x * v.y * 16.0, 0.35), uVignette);
  col *= 1.0 - uFlicker * hash11(floor(uTime * 30.0));
  col *= 1.15;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
