import { defineShaderSource } from '../../engine/shaderEffect';

export default defineShaderSource({
  id: '211',
  renderScale: { high: 0.5, low: 0.35 },
  params: [
    { key: 'coverage', label: '雲の量', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'density', label: '雲の密度', type: 'number', min: 0.1, max: 4, step: 0.01, default: 1.4 },
    { key: 'wind', label: '風速', type: 'number', min: 0, max: 3, step: 0.01, default: 0.6 },
    { key: 'sunHeight', label: '太陽の高さ', type: 'number', min: 0.02, max: 1, step: 0.01, default: 0.35 },
    { key: 'sunColor', label: '日差しの色', type: 'color', default: '#fff1d6' },
  ],
  notes:
    '高度1.5〜4の板状の層に、3次元のバリューノイズを重ねた密度場を置き、視線に沿って最大40点（軽量モード22点）サンプリングする。粗いノイズで雲のない区間を先に飛ばし、各点から太陽方向へ3点だけ低解像度の密度を積分して自己遮蔽を求め、ベール＝ランバート則で透過率を掛け合わせる。前方散乱で太陽側の縁が明るく光る（シルバーライニング）。（着想: three.js examples の webgl_volume_cloud。実装は独自）',
  body: /* glsl */ `
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1, 0, 0)), f.x), mix(h3(i + vec3(0, 1, 0)), h3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(h3(i + vec3(0, 0, 1)), h3(i + vec3(1, 0, 1)), f.x), mix(h3(i + vec3(0, 1, 1)), h3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm3(vec3 p, int oct) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { if (i >= oct) break; v += a * noise3(p); p *= 2.02; a *= 0.5; } return v; }
// oct: 本体は4オクターブ、影の計算は2オクターブで十分（低周波だけが影に効く）
float cloudO(vec3 p, int oct) {
  if (p.y < 1.5 || p.y > 4.0) return 0.0;
  vec3 q = p * 0.35 + vec3(uTime * uWind * 0.15, 0.0, uTime * uWind * 0.05);
  float n = fbm3(q, oct) / (oct == 4 ? 0.9375 : 0.75) * 0.9375;
  float h = (p.y - 1.5) / 2.5;
  float shape = smoothstep(0.0, 0.25, h) * smoothstep(1.0, 0.6, h);
  return max(0.0, (n - (1.0 - uCoverage) * 0.75) * shape) * uDensity * 2.0;
}
float cloud(vec3 p) { return cloudO(p, 4); }
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 uv = (vUv - vec2(0.5, 0.3)) * vec2(aspect, 1.0);
  vec3 ro = vec3(0.0, 0.5, 0.0);
  vec3 rd = normalize(vec3(uv.x, uv.y, -1.0));
  vec3 sun = normalize(vec3(0.6, uSunHeight, -1.0));
  vec3 sky = mix(vec3(0.55, 0.7, 0.95), vec3(0.15, 0.35, 0.75), clamp(rd.y * 1.5, 0.0, 1.0));
  sky = mix(sky, vec3(1.0, 0.7, 0.45), (1.0 - uSunHeight) * 0.5 * exp(-max(rd.y, 0.0) * 4.0));
  float sd = max(dot(rd, sun), 0.0);
  sky += uSunColor * (pow(sd, 400.0) * 3.0 + pow(sd, 8.0) * 0.25);
  vec3 col = sky;
  if (rd.y > 0.01) {
    float t0 = (1.5 - ro.y) / rd.y;
    float t1 = min((4.0 - ro.y) / rd.y, 60.0);
    float steps = uQuality > 0.5 ? 40.0 : 22.0;
    float dt = (t1 - t0) / steps;
    float trans = 1.0;
    vec3 light = vec3(0.0);
    float jitter = fract(sin(dot(vUv, vec2(12.9898, 78.233))) * 43758.5453);
    for (int i = 0; i < 40; i++) {
      if (float(i) >= steps || trans < 0.03) break;
      vec3 p = ro + rd * (t0 + (float(i) + jitter) * dt);
      // 空の部分は粗いノイズで先に判定し、雲がなければ詳細計算を省く
      if (cloudO(p, 1) <= 0.0 && cloudO(p, 2) <= 0.0) continue;
      float d = cloud(p);
      if (d > 0.001) {
        float od = 0.0;
        for (int j = 1; j <= 3; j++) od += cloudO(p + sun * float(j) * 0.45, 2);
        float lightT = exp(-od * 0.45 * 1.5);
        float phase = 0.6 + 1.4 * pow(sd, 6.0);
        vec3 lit = uSunColor * lightT * phase + vec3(0.45, 0.55, 0.7) * 0.35;
        float a = 1.0 - exp(-d * dt);
        light += trans * a * lit;
        trans *= 1.0 - a;
      }
    }
    float fade = exp(-t0 * 0.03);
    col = mix(sky, sky * trans + light, fade);
  } else {
    col = mix(vec3(0.25, 0.3, 0.25), sky, 0.3);
  }
  gl_FragColor = vec4(pow(clamp(col, 0.0, 1.0), vec3(0.9)), 1.0);
}
`,
});
