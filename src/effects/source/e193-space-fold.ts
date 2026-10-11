import { defineShaderSource } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderSource({
  id: '193',
  params: [
    { key: 'folds', label: '折り畳み回数', type: 'number', min: 1, max: 10, step: 1, default: 6 },
    { key: 'fold', label: '折り畳みの進行', type: 'number', min: 0, max: 1, step: 0.01, default: 0.7 },
    { key: 'animate', label: '折り畳みを動かす', type: 'bool', default: true },
    { key: 'speed', label: '飛行速度', type: 'number', min: 0, max: 2, step: 0.01, default: 0.5 },
  ],
  notes:
    '空間そのものを「鏡映（abs）・回転・拡大」で繰り返し折り畳む KIFS（万華鏡的反復関数系）。折り畳みの角度を時間で変えると、遠く離れた場所が折り重なって接し、建築物のような構造が連続的に変形する。',
  body: /* glsl */ `
${GLSL_COLOR}
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float F;
float de(vec3 p) {
  float s = 1.0;
  for (int i = 0; i < 10; i++) {
    if (float(i) >= uFolds) break;
    p = abs(p) - vec3(0.9, 0.6, 0.9) * F;
    p.xy *= rot(0.6 * F + 0.2);
    p.yz *= rot(0.35 * F);
    p *= 1.35;
    s *= 1.35;
  }
  vec3 q = abs(p) - vec3(0.6, 0.12, 0.6);
  return (length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0)) / s;
}
void main() {
  F = uAnimate > 0.5 ? 0.5 + 0.5 * sin(uTime * 0.2) * uFold + 0.3 * uFold : uFold;
  vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  float z = uTime * uSpeed;
  vec3 ro = vec3(0.0, 0.0, -3.5 + sin(z * 0.3) * 0.5);
  vec3 rd = normalize(vec3(uv, 1.3));
  rd.xz *= rot(sin(z * 0.2) * 0.5);
  rd.xy *= rot(z * 0.1);
  float t = 0.0;
  float glow = 0.0;
  float hit = 0.0;
  for (int i = 0; i < 90; i++) {
    float d = de(ro + rd * t);
    glow += 0.012 / (1.0 + d * d * 400.0);
    if (d < 0.0015) { hit = 1.0; break; }
    t += d * 0.9;
    if (t > 12.0) break;
  }
  vec3 col = vec3(0.01, 0.0, 0.03) + glow * hsv2rgb(vec3(0.6 + t * 0.05, 0.7, 1.0));
  if (hit > 0.5) {
    vec3 p = ro + rd * t;
    vec2 e = vec2(0.001, 0.0);
    vec3 n = normalize(vec3(de(p + e.xyy) - de(p - e.xyy), de(p + e.yxy) - de(p - e.yxy), de(p + e.yyx) - de(p - e.yyx)));
    float dif = max(dot(n, normalize(vec3(0.5, 0.8, -0.4))), 0.0);
    col += hsv2rgb(vec3(0.08 + length(p) * 0.08, 0.5, 1.0)) * (0.2 + dif) * exp(-t * 0.15);
  }
  gl_FragColor = vec4(pow(col, vec3(0.8)), 1.0);
}
`,
});
