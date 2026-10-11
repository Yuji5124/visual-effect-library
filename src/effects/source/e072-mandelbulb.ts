import { defineShaderSource } from '../../engine/shaderEffect';

export default defineShaderSource({
  id: '072',
  params: [
    { key: 'power', label: '次数', type: 'number', min: 2, max: 12, step: 0.01, default: 8 },
    { key: 'morph', label: '次数を揺らす', type: 'bool', default: true },
    { key: 'speed', label: '回転速度', type: 'number', min: 0, max: 2, step: 0.01, default: 0.3 },
    { key: 'colorA', label: '色A', type: 'color', default: '#ffb03d' },
    { key: 'colorB', label: '色B', type: 'color', default: '#3d6bff' },
  ],
  notes:
    '球座標でべき乗する3次元版マンデルブロ集合。距離推定（解析的微分 dr）でレイマーチングし、反復中の原点への最接近距離（オービットトラップ）で着色する。低品質モードでは反復とステップを削減。',
  body: /* glsl */ `
float P;
vec3 trap;
float de(vec3 pos) {
  vec3 z = pos;
  float dr = 1.0;
  float r = 0.0;
  trap = vec3(1e9);
  int iters = uQuality > 0.5 ? 8 : 5;
  for (int i = 0; i < 8; i++) {
    if (i >= iters) break;
    r = length(z);
    if (r > 2.0) break;
    float theta = acos(clamp(z.z / r, -1.0, 1.0));
    float phi = atan(z.y, z.x);
    dr = pow(r, P - 1.0) * P * dr + 1.0;
    float zr = pow(r, P);
    theta *= P;
    phi *= P;
    z = zr * vec3(sin(theta) * cos(phi), sin(phi) * sin(theta), cos(theta)) + pos;
    trap = min(trap, abs(z));
  }
  return 0.5 * log(r) * r / dr;
}
void main() {
  P = uPower + (uMorph > 0.5 ? sin(uTime * 0.25) * 1.5 : 0.0);
  vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float a = uTime * uSpeed;
  vec3 ro = vec3(sin(a) * 3.6, 0.9 * sin(a * 0.7), cos(a) * 3.6);
  vec3 fw = normalize(-ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(uv.x * rt + uv.y * up + 1.25 * fw);
  float t = 0.0;
  float steps = uQuality > 0.5 ? 120.0 : 60.0;
  float hit = 0.0;
  float i_ = 0.0;
  for (int i = 0; i < 120; i++) {
    if (float(i) >= steps) break;
    float d = de(ro + rd * t);
    if (d < 0.0008 * t) { hit = 1.0; break; }
    t += d;
    i_ = float(i);
    if (t > 7.0) break;
  }
  vec3 col = vec3(0.02, 0.02, 0.05) + vec3(0.1, 0.05, 0.2) * (1.0 - length(uv));
  if (hit > 0.5) {
    vec3 p = ro + rd * t;
    vec2 e = vec2(0.0005 * t, 0.0);
    vec3 n = normalize(vec3(de(p + e.xyy) - de(p - e.xyy), de(p + e.yxy) - de(p - e.yxy), de(p + e.yyx) - de(p - e.yyx)));
    de(p);
    vec3 base = mix(uColorA, uColorB, clamp(trap.x * 1.2, 0.0, 1.0));
    base = mix(base, vec3(1.0), clamp(trap.y * 0.5, 0.0, 0.4));
    vec3 l = normalize(vec3(0.6, 0.7, 0.3));
    float dif = max(dot(n, l), 0.0);
    float ao = 1.0 - i_ / steps;
    col = base * (0.15 + dif * 0.9) * (0.4 + 0.6 * ao) + pow(max(dot(reflect(rd, n), l), 0.0), 24.0) * 0.5;
  }
  gl_FragColor = vec4(pow(col, vec3(0.4545)), 1.0);
}
`,
});
