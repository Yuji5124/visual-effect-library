import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '043',
  params: [
    { key: 'strength', label: '膨らみ', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.7 },
    { key: 'radius', label: '半径', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.4 },
    { key: 'follow', label: 'ドラッグ位置に追従', type: 'bool', default: true },
    { key: 'breathe', label: '呼吸アニメーション', type: 'bool', default: true },
  ],
  notes: '半径内の点を中心からの距離のべき乗で引き寄せてサンプリングすると、中心が拡大された凸レンズ状になる。画面をドラッグすると中心を動かせる。',
  extraDecl: 'uniform vec2 uCenter;',
  extra() {
    const center = { value: [0.5, 0.5] };
    return {
      uniforms: { uCenter: center },
      pointer(x, y, down) {
        if (down) center.value = [x, y];
      },
      dispose() {},
    };
  },
  body: /* glsl */ `
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 c = uFollow > 0.5 ? uCenter : vec2(0.5);
  vec2 d = (vUv - c) * vec2(aspect, 1.0);
  float r = length(d) / uRadius;
  float k = uStrength * (uBreathe > 0.5 ? 0.6 + 0.4 * sin(uTime * 1.5) : 1.0);
  if (r < 1.0) d *= mix(1.0, pow(r, k), smoothstep(1.0, 0.0, r) * 0.999 + 0.001);
  vec2 uv = c + d / vec2(aspect, 1.0);
  gl_FragColor = vec4(texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb, 1.0);
}
`,
});
