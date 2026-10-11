import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '044',
  params: [
    { key: 'strength', label: '吸い込み', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.8 },
    { key: 'radius', label: '半径', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.5 },
    { key: 'swirl', label: '渦の追加', type: 'number', min: 0, max: 6, step: 0.01, default: 1.2 },
  ],
  notes: 'バルジの逆で、半径内の点を外側からサンプリングして中心へ吸い込まれるように縮める。回転を少し加えるとブラックホール風になる。',
  body: /* glsl */ `
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 d = (vUv - 0.5) * vec2(aspect, 1.0);
  float r = length(d) / uRadius;
  float k = uStrength * (0.65 + 0.35 * sin(uTime * 0.9));
  if (r < 1.0) {
    float w = smoothstep(1.0, 0.0, r);
    d *= mix(1.0, pow(max(r, 1e-3), -k * 0.6), w);
    float a = uSwirl * w * w;
    d = mat2(cos(a), sin(a), -sin(a), cos(a)) * d;
  }
  vec2 uv = 0.5 + d / vec2(aspect, 1.0);
  gl_FragColor = vec4(texture2D(tDiffuse, abs(mod(uv - 1.0, 2.0) - 1.0)).rgb, 1.0);
}
`,
});
