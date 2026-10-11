import { defineShaderSource } from '../../engine/shaderEffect';

export default defineShaderSource({
  id: '073',
  params: [
    { key: 'blend', label: '形状の融合度', type: 'number', min: 0.01, max: 1.2, step: 0.01, default: 0.45 },
    { key: 'speed', label: '速度', type: 'number', min: 0, max: 3, step: 0.01, default: 1 },
    { key: 'color', label: '素材色', type: 'color', default: '#ff5aa5' },
    { key: 'repeat', label: '空間反復', type: 'bool', default: false },
  ],
  notes:
    '球・トーラス・角丸箱の距離関数をスムーズminで融合。法線は距離場の差分、ソフトシャドウとAOも距離場から求める。低品質モードではステップ数を半減。',
  body: /* glsl */ `
float smin(float a, float b, float k) { float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0); return mix(b, a, h) - k * h * (1.0 - h); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdRoundBox(vec3 p, vec3 b, float r) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - r; }
float T;
float map(vec3 p) {
  if (uRepeat > 0.5) { p.xz = mod(p.xz + 3.0, 6.0) - 3.0; }
  float ground = p.y + 1.2;
  vec3 q = p;
  q.xz *= rot(T * 0.4);
  float s = length(q - vec3(sin(T) * 1.2, 0.3 + sin(T * 1.3) * 0.4, 0.0)) - 0.65;
  vec3 tp = q; tp.xy *= rot(T * 0.7);
  float tor = sdTorus(tp, vec2(1.0, 0.25));
  vec3 bp = q - vec3(-1.1, -0.2, 0.4); bp.yz *= rot(T * 0.9);
  float box = sdRoundBox(bp, vec3(0.4), 0.08);
  float d = smin(smin(s, tor, uBlend), box, uBlend);
  return min(d, ground);
}
vec3 normal(vec3 p) {
  vec2 e = vec2(0.0015, 0.0);
  return normalize(vec3(map(p + e.xyy) - map(p - e.xyy), map(p + e.yxy) - map(p - e.yxy), map(p + e.yyx) - map(p - e.yyx)));
}
float shadow(vec3 ro, vec3 rd) {
  float res = 1.0; float t = 0.03;
  for (int i = 0; i < 40; i++) {
    float h = map(ro + rd * t);
    res = min(res, 10.0 * h / t);
    t += clamp(h, 0.02, 0.3);
    if (res < 0.002 || t > 8.0) break;
  }
  return clamp(res, 0.0, 1.0);
}
float ao(vec3 p, vec3 n) {
  float o = 0.0; float w = 1.0;
  for (int i = 1; i <= 5; i++) { float h = 0.06 * float(i); o += (h - map(p + n * h)) * w; w *= 0.7; }
  return clamp(1.0 - 2.0 * o, 0.0, 1.0);
}
void main() {
  T = uTime * uSpeed;
  vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float ca = T * 0.15;
  vec3 ro = vec3(sin(ca) * 7.5, 2.6, cos(ca) * 7.5);
  vec3 ta = vec3(0.0, 0.0, 0.0);
  vec3 fw = normalize(ta - ro); vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0))); vec3 up = cross(rt, fw);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.4 * fw);
  float steps = uQuality > 0.5 ? 110.0 : 55.0;
  float t = 0.0; float d = 1.0;
  for (int i = 0; i < 110; i++) {
    if (float(i) >= steps) break;
    d = map(ro + rd * t);
    if (d < 0.001 * t || t > 30.0) break;
    t += d;
  }
  vec3 sky = mix(vec3(0.05, 0.06, 0.12), vec3(0.35, 0.2, 0.45), pow(max(0.0, 1.0 - abs(rd.y)), 3.0));
  vec3 col = sky;
  if (t < 30.0) {
    vec3 p = ro + rd * t;
    vec3 n = normal(p);
    vec3 lig = normalize(vec3(0.6, 0.8, 0.4));
    bool isGround = p.y < -1.19;
    vec3 alb = isGround ? vec3(0.25) * (0.6 + 0.4 * mod(floor(p.x) + floor(p.z), 2.0)) : uColor;
    float dif = clamp(dot(n, lig), 0.0, 1.0) * shadow(p + n * 0.01, lig);
    float occ = ao(p, n);
    float spe = pow(clamp(dot(reflect(rd, n), lig), 0.0, 1.0), 32.0);
    float fre = pow(clamp(1.0 + dot(n, rd), 0.0, 1.0), 3.0);
    col = alb * (0.15 * occ + 1.1 * dif) + spe * dif * 0.8 + fre * 0.3 * vec3(0.5, 0.6, 1.0) * occ;
    col = mix(col, sky, 1.0 - exp(-0.004 * t * t));
  }
  col = pow(col, vec3(0.4545));
  gl_FragColor = vec4(col, 1.0);
}
`,
});
