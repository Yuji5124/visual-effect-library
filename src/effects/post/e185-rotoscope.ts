import { defineShaderPost } from '../../engine/shaderEffect';
import { GLSL_COLOR, GLSL_HASH } from '../../engine/glsl';

export default defineShaderPost({
  id: '185',
  params: [
    { key: 'levels', label: '色の段数', type: 'number', min: 2, max: 10, step: 1, default: 4 },
    { key: 'lineWidth', label: '線の太さ(px)', type: 'number', min: 0.5, max: 4, step: 0.1, default: 1.4 },
    { key: 'lineThreshold', label: '線を引く強さ', type: 'number', min: 0.02, max: 0.5, step: 0.01, default: 0.12 },
    { key: 'paper', label: '紙の質感', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'boil', label: '線の揺れ（ボイル）', type: 'number', min: 0, max: 2, step: 0.01, default: 0.8 },
  ],
  notes: '小さな近傍の平均で色を平滑化してから明度を段階化（セル塗り）し、Sobelの輪郭を黒い線として重ねる。線のサンプル位置を12fpsで揺らすと手描きアニメの「線のボイル」になる。',
  body: /* glsl */ `
${GLSL_COLOR}
${GLSL_HASH}
float L(vec2 uv) { return luma(texture2D(tDiffuse, uv).rgb); }
void main() {
  vec2 px = 1.0 / uResolution;
  float fr = floor(uTime * 12.0);
  vec2 jitter = (hash22(floor(vUv * 30.0) + fr) - 0.5) * px * uBoil * 2.0;
  vec3 avg = vec3(0.0);
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) avg += texture2D(tDiffuse, vUv + vec2(float(x), float(y)) * px * 2.0).rgb;
  avg /= 9.0;
  float l = luma(avg);
  float q = floor(l * uLevels + 0.5) / uLevels;
  vec3 flat_ = avg / max(l, 1e-3) * q;
  vec2 uv = vUv + jitter;
  vec2 o = px * uLineWidth;
  float gx = L(uv + vec2(o.x, 0.0)) - L(uv - vec2(o.x, 0.0));
  float gy = L(uv + vec2(0.0, o.y)) - L(uv - vec2(0.0, o.y));
  float line = smoothstep(uLineThreshold, uLineThreshold * 1.8, length(vec2(gx, gy)));
  vec3 paper = vec3(0.96, 0.93, 0.86) * (0.93 + 0.07 * hash12(floor(vUv * uResolution / 2.0)));
  vec3 col = mix(flat_ * 1.1, flat_ * paper * 1.15, uPaper);
  col = mix(col, vec3(0.06, 0.05, 0.08), line);
  gl_FragColor = vec4(col, 1.0);
}
`,
});
