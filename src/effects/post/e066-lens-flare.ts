import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '066',
  params: [
    { key: 'threshold', label: '光源とみなす明るさ', type: 'number', min: 0.3, max: 1, step: 0.01, default: 0.75 },
    { key: 'ghosts', label: 'ゴースト数', type: 'number', min: 1, max: 8, step: 1, default: 5 },
    { key: 'spacing', label: 'ゴースト間隔', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.35 },
    { key: 'halo', label: 'ハロー', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.6 },
    { key: 'intensity', label: '強さ', type: 'number', min: 0, max: 3, step: 0.01, default: 1.2 },
  ],
  notes: '画面中心を光軸として、明るい部分を中心対称の位置に何度も写す（ゴースト）。さらに一定半径の輪（ハロー）と、波長ごとに少しずらしたサンプリングで色づきを加える。光源の位置を指定する必要がない。',
  body: /* glsl */ `
${GLSL_COLOR}
vec3 bright(vec2 uv) {
  vec3 c = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  return c * smoothstep(uThreshold, 1.0, luma(c)) * inside;
}
vec3 chroma(vec2 uv, vec2 dir, float amt) {
  return vec3(bright(uv + dir * amt).r, bright(uv).g, bright(uv - dir * amt).b);
}
void main() {
  vec3 base = texture2D(tDiffuse, vUv).rgb;
  vec2 flip = 1.0 - vUv;
  vec2 ghostVec = (vec2(0.5) - flip) * uSpacing;
  vec2 dir = normalize(ghostVec + 1e-5);
  vec3 flare = vec3(0.0);
  for (int i = 0; i < 8; i++) {
    if (float(i) >= uGhosts) break;
    vec2 uv = fract(flip + ghostVec * float(i));
    float w = pow(max(1.0 - length(vec2(0.5) - uv) / 0.7071, 0.0), 8.0);
    flare += chroma(uv, dir, 0.006) * w * hsv2rgb(vec3(float(i) * 0.13 + 0.5, 0.45, 1.0));
  }
  vec2 haloVec = normalize(vec2(0.5) - flip) * 0.45;
  float hw = pow(max(1.0 - length(vec2(0.5) - fract(flip + haloVec)) / 0.7071, 0.0), 6.0);
  flare += chroma(flip + haloVec, dir, 0.012) * hw * uHalo * vec3(0.9, 0.8, 1.0);
  gl_FragColor = vec4(base + flare * uIntensity, 1.0);
}
`,
});
