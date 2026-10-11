import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_NOISE, GLSL_COLOR } from '../../engine/glsl';

export default defineShaderPost({
  id: '049',
  params: [
    { key: 'radius', label: 'ポータル半径', type: 'number', min: 0.05, max: 0.5, step: 0.005, default: 0.2 },
    { key: 'lens', label: '空間の引き伸ばし', type: 'number', min: 0, max: 0.2, step: 0.001, default: 0.06 },
    { key: 'spin', label: '渦の速さ', type: 'number', min: 0, max: 4, step: 0.01, default: 1.2 },
    { key: 'rimColor', label: '縁の色', type: 'color', default: '#ff7a1a' },
  ],
  notes: '重力レンズの近似で、ポータル外周の空間を半径方向へ 1/r で引き伸ばす。内側は入力映像を回転・反転させて「向こう側」に見せ、縁はノイズで燃えるように揺らす。ドラッグで移動。',
  extraDecl: 'uniform vec2 uCenter;',
  extra() {
    const center = { value: [0.5, 0.55] };
    return { uniforms: { uCenter: center }, pointer: (x, y, down) => { if (down) center.value = [x, y]; }, dispose() {} };
  },
  body: /* glsl */ `
${GLSL_NOISE}
${GLSL_COLOR}
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 d = (vUv - uCenter) * vec2(aspect, 1.0);
  float r = length(d);
  float R = uRadius * (1.0 + 0.05 * sin(uTime * 2.0));
  vec3 col;
  float a = atan(d.y, d.x);
  float rimN = fbm(vec2(a * 3.0, uTime * 2.0)) * 0.04;
  if (r < R + rimN) {
    float ang = uTime * uSpin + (R - r) * 8.0;
    vec2 q = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * d / R * 0.5;
    col = texture2D(tDiffuse, 1.0 - (q / vec2(aspect, 1.0) + 0.5)).rgb;
    col = mix(col, col.bgr, 0.6) * 0.9;
  } else {
    vec2 dir = d / max(r, 1e-4);
    float pull = uLens * R / max(r - R * 0.8, 0.01);
    vec2 uv = vUv - dir / vec2(aspect, 1.0) * pull * 0.2;
    col = texture2D(tDiffuse, clamp(uv, 0.0, 1.0)).rgb;
  }
  float rim = smoothstep(0.03, 0.0, abs(r - R - rimN));
  col += uRimColor * rim * 2.0 + uRimColor * exp(-abs(r - R) * 25.0) * 0.5;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
