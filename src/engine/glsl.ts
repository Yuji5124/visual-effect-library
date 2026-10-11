/** 複数のシェーダーで共有するGLSL関数群（すべて独自実装） */

export const GLSL_HASH = /* glsl */ `
float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2 hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
`;

export const GLSL_NOISE = /* glsl */ `
${GLSL_HASH}
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float v = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return v;
}
`;

export const GLSL_COLOR = /* glsl */ `
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
vec3 hsv2rgb(vec3 c) {
  vec3 p = abs(fract(c.xxx + vec3(0.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  return c.z * mix(vec3(1.0), clamp(p - 1.0, 0.0, 1.0), c.y);
}
vec3 palette(float t, vec3 a, vec3 b, vec3 c, vec3 d) { return a + b * cos(6.28318 * (c * t + d)); }
`;

/**
 * トランジションや多重露光で使う「もう一つの世界」。
 * デモシーンと見分けやすい、夕焼けの山並みとワイヤーグリッドの風景（独自の手続き生成）。
 */
export const GLSL_WORLD_B = /* glsl */ `
float wbHash(float n) { return fract(sin(n) * 43758.5453); }
float wbNoise(float x) { float i = floor(x); float f = fract(x); return mix(wbHash(i), wbHash(i + 1.0), f * f * (3.0 - 2.0 * f)); }
vec3 worldB(vec2 uv, float t, float aspect) {
  vec2 p = vec2((uv.x - 0.5) * aspect, uv.y);
  vec3 sky = mix(vec3(0.98, 0.45, 0.25), vec3(0.18, 0.05, 0.35), smoothstep(0.35, 1.0, uv.y));
  vec3 col = sky;
  vec2 sc = vec2(0.0, 0.52);
  float sd = length(p - sc);
  float stripes = step(0.5, fract((p.y - sc.y) * 22.0 - t * 0.4)) + step(sc.y + 0.02, p.y);
  col = mix(col, mix(vec3(1.0, 0.85, 0.3), vec3(1.0, 0.3, 0.55), smoothstep(0.25, -0.25, p.y - sc.y)), step(sd, 0.26) * min(stripes, 1.0));
  col += vec3(1.0, 0.5, 0.3) * 0.25 * exp(-sd * 4.0);
  float m1 = 0.38 + wbNoise(p.x * 3.0 + 1.7) * 0.12 + wbNoise(p.x * 9.0) * 0.03;
  float m2 = 0.33 + wbNoise(p.x * 5.0 + 9.1 + t * 0.02) * 0.08;
  col = mix(col, vec3(0.25, 0.08, 0.3), step(uv.y, m1));
  col = mix(col, vec3(0.1, 0.03, 0.15), step(uv.y, m2));
  if (uv.y < 0.3) {
    float d = 0.3 - uv.y;
    float z = 0.08 / max(d, 0.002);
    vec2 g = vec2(p.x * z, z + t * 1.2);
    vec2 f = abs(fract(g) - 0.5);
    float line = smoothstep(0.06 * z, 0.0, min(f.x, f.y) * 1.0);
    col = mix(vec3(0.05, 0.0, 0.1), vec3(1.0, 0.25, 0.85), clamp(line, 0.0, 1.0) * smoothstep(0.0, 0.08, d));
  }
  return col;
}
`;

/** トランジション系の共通部分：進行度（自動往復 or 手動）と B 世界の取得 */
export const GLSL_TRANSITION = /* glsl */ `
${GLSL_WORLD_B}
float transitionProgress() {
  if (uAuto < 0.5) return uProgress;
  float c = mod(uTime, uCycle * 2.0) / uCycle;
  float x = c < 1.0 ? c : 2.0 - c;
  return smoothstep(0.2, 0.8, x);
}
vec3 sceneB(vec2 uv) { return worldB(clamp(uv, 0.0, 1.0), uTime, uResolution.x / uResolution.y); }
`;
