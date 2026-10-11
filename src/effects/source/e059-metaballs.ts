import { defineShaderSource } from '../../engine/shaderEffect';
import { GLSL_COLOR } from '../../engine/glsl';

export default defineShaderSource({
  id: '059',
  params: [
    { key: 'count', label: '球の数', type: 'number', min: 2, max: 16, step: 1, default: 9 },
    { key: 'threshold', label: '表面しきい値', type: 'number', min: 0.5, max: 3, step: 0.01, default: 1.2 },
    { key: 'speed', label: '速度', type: 'number', min: 0, max: 3, step: 0.01, default: 0.7 },
    { key: 'colorA', label: '色A', type: 'color', default: '#38f7ff' },
    { key: 'colorB', label: '色B', type: 'color', default: '#ff3dbe' },
  ],
  notes: '各球の場 r²/d² を合計し、しきい値で等値面を取る2Dメタボール。場の勾配から擬似法線を作ってツヤを付ける。',
  body: /* glsl */ `
${GLSL_COLOR}
vec2 ballPos(float i, float t) {
  return vec2(sin(t * (0.6 + i * 0.13) + i * 1.7) * 0.6, cos(t * (0.5 + i * 0.11) + i * 2.3) * 0.38);
}
float field(vec2 p, float t, out float hueMix) {
  float f = 0.0; hueMix = 0.0;
  for (int k = 0; k < 16; k++) {
    float i = float(k);
    if (i >= uCount) break;
    vec2 d = p - ballPos(i, t);
    float r = 0.06 + 0.03 * sin(i * 3.1);
    float v = r * r / max(dot(d, d), 1e-5);
    f += v;
    hueMix += v * fract(i * 0.37);
  }
  hueMix /= max(f, 1e-5);
  return f;
}
void main() {
  vec2 p = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0) * 1.1;
  float t = uTime * uSpeed;
  float hm;
  float f = field(p, t, hm);
  vec2 e = vec2(0.003, 0.0);
  float tmp;
  vec2 g = vec2(field(p + e.xy, t, tmp) - field(p - e.xy, t, tmp), field(p + e.yx, t, tmp) - field(p - e.yx, t, tmp));
  vec3 n = normalize(vec3(-g * 2.0, 1.0));
  float inside = smoothstep(uThreshold - 0.05, uThreshold + 0.05, f);
  vec3 base = mix(uColorA, uColorB, hm);
  float light = 0.35 + 0.65 * max(dot(n, normalize(vec3(-0.4, 0.5, 0.8))), 0.0);
  float spec = pow(max(dot(reflect(vec3(0.0, 0.0, -1.0), n), normalize(vec3(-0.4, 0.5, 0.8))), 0.0), 24.0);
  vec3 col = base * light + spec * 0.8;
  vec3 bg = vec3(0.03, 0.03, 0.07) + base * 0.25 * smoothstep(0.2, uThreshold, f);
  gl_FragColor = vec4(mix(bg, col, inside), 1.0);
}
`,
});
