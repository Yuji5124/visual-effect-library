import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '061',
  params: [
    { key: 'strength', label: '歪みの強さ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.75 },
    { key: 'circular', label: '円周魚眼', type: 'bool', default: false },
    { key: 'vignette', label: '周辺減光', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
  notes: '出力画素を等距離射影（r = f·θ）とみなして入射角θを求め、入力映像（透視投影 r = tanθ）の座標へ逆写像する。画面端が入力の端に一致するよう正規化しているので、中心が膨らみ周辺が圧縮される魚眼らしい歪みになる。',
  body: /* glsl */ `
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = (vUv - 0.5) * 2.0 * vec2(aspect, 1.0);
  // 正規化半径：対角魚眼は画面の角、円周魚眼は画面の高さを 1 とする
  float norm = uCircular > 0.5 ? 1.0 : length(vec2(aspect, 1.0));
  float r = length(p) / norm;
  float thetaMax = mix(0.05, 1.35, uStrength);
  vec3 col = vec3(0.0);
  if (uCircular < 0.5 || r <= 1.0) {
    // 出力は等距離射影（r ∝ θ）、入力は透視投影（r ∝ tanθ）とみなして逆写像する
    float theta = r * thetaMax;
    float src = tan(theta) / tan(thetaMax);
    vec2 q = r > 1e-5 ? p / (r * norm) * src * norm : vec2(0.0);
    vec2 uv = q / vec2(aspect, 1.0) * 0.5 + 0.5;
    col = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
    col *= mix(1.0, cos(theta * 0.8), uVignette);
    if (uCircular > 0.5) col *= smoothstep(1.0, 0.985, r);
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
