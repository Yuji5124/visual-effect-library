import { defineShaderSource } from '../../engine/shaderEffect';

export default defineShaderSource({
  id: '210',
  renderScale: { high: 0.6, low: 0.4 },
  params: [
    { key: 'sunElevation', label: '太陽の高さ（度）', type: 'number', min: -10, max: 90, step: 0.5, default: 6 },
    { key: 'animate', label: '日の出〜日没を自動で', type: 'bool', default: true },
    { key: 'rayleigh', label: 'レイリー散乱（青さ）', type: 'number', min: 0.2, max: 4, step: 0.01, default: 1 },
    { key: 'mie', label: 'ミー散乱（かすみ）', type: 'number', min: 0, max: 5, step: 0.01, default: 1 },
    { key: 'exposure', label: '露出', type: 'number', min: 0.2, max: 4, step: 0.01, default: 1.4 },
  ],
  notes:
    '惑星の大気を球殻とみなし、視線に沿って大気中を16点、各点から太陽へ8点サンプリングして光の減衰（光学的深さ）を積分する単一散乱モデル。波長の4乗に反比例するレイリー散乱で青空と夕焼け、前方に強く散るミー散乱で太陽周りのかすみが生まれる。（着想: three.js examples の webgl_shaders_sky。実装は独自）',
  body: /* glsl */ `
const float PI = 3.14159265;
const float R_E = 6360e3;
const float R_A = 6420e3;
const vec3 BETA_R = vec3(5.8e-6, 13.5e-6, 33.1e-6);
const float BETA_M = 21e-6;
const float H_R = 7994.0;
const float H_M = 1200.0;
vec2 raySphere(vec3 ro, vec3 rd, float r) {
  float b = dot(ro, rd);
  float c = dot(ro, ro) - r * r;
  float d = b * b - c;
  if (d < 0.0) return vec2(1e9, -1e9);
  d = sqrt(d);
  return vec2(-b - d, -b + d);
}
vec3 scatter(vec3 ro, vec3 rd, vec3 sun) {
  vec2 t = raySphere(ro, rd, R_A);
  float tMax = t.y;
  vec2 g = raySphere(ro, rd, R_E);
  if (g.x > 0.0) tMax = min(tMax, g.x);
  float seg = tMax / 16.0;
  vec3 sumR = vec3(0.0), sumM = vec3(0.0);
  float odR = 0.0, odM = 0.0;
  float mu = dot(rd, sun);
  float phaseR = 3.0 / (16.0 * PI) * (1.0 + mu * mu);
  float gg = 0.76;
  float phaseM = 3.0 / (8.0 * PI) * ((1.0 - gg * gg) * (1.0 + mu * mu)) / ((2.0 + gg * gg) * pow(1.0 + gg * gg - 2.0 * gg * mu, 1.5));
  for (int i = 0; i < 16; i++) {
    vec3 p = ro + rd * (seg * (float(i) + 0.5));
    float h = length(p) - R_E;
    float hr = exp(-h / H_R) * seg;
    float hm = exp(-h / H_M) * seg;
    odR += hr; odM += hm;
    vec2 ls = raySphere(p, sun, R_A);
    float segL = ls.y / 8.0;
    float odLR = 0.0, odLM = 0.0;
    bool lit = true;
    for (int j = 0; j < 8; j++) {
      vec3 q = p + sun * (segL * (float(j) + 0.5));
      float hl = length(q) - R_E;
      if (hl < 0.0) { lit = false; break; }
      odLR += exp(-hl / H_R) * segL;
      odLM += exp(-hl / H_M) * segL;
    }
    if (lit) {
      vec3 tau = BETA_R * uRayleigh * (odR + odLR) + BETA_M * uMie * 1.1 * (odM + odLM);
      vec3 att = exp(-tau);
      sumR += att * hr;
      sumM += att * hm;
    }
  }
  return 20.0 * (sumR * BETA_R * uRayleigh * phaseR + sumM * BETA_M * uMie * phaseM);
}
void main() {
  float aspect = uResolution.x / uResolution.y;
  float elev = uAnimate > 0.5 ? mix(-6.0, 50.0, 0.5 + 0.5 * sin(uTime * 0.12 - 0.75)) : uSunElevation;
  float az = uTime * 0.03;
  vec3 sun = normalize(vec3(sin(az), sin(radians(elev)), -cos(az)) * vec3(cos(radians(elev)), 1.0, cos(radians(elev))));
  vec2 uv = (vUv - vec2(0.5, 0.25)) * vec2(aspect, 1.0);
  vec3 rd = normalize(vec3(uv.x, uv.y, -1.2));
  vec3 ro = vec3(0.0, R_E + 2.0, 0.0);
  vec3 col;
  if (rd.y < -0.0) {
    // 地面：空の色を反射した草原風
    vec3 skyUp = scatter(ro, normalize(vec3(rd.x, 0.05, rd.z)), sun);
    float sunLight = max(sun.y, 0.0);
    col = vec3(0.12, 0.16, 0.08) * (sunLight * 2.0 + 0.05) + skyUp * 0.15;
  } else {
    col = scatter(ro, rd, sun);
    float sd = dot(rd, sun);
    col += vec3(1.0, 0.9, 0.7) * smoothstep(0.9997, 0.99985, sd) * 30.0 * smoothstep(-0.02, 0.02, sun.y);
  }
  col = 1.0 - exp(-col * uExposure);
  gl_FragColor = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`,
});
