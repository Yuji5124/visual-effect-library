import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '021',
  params: [
    { key: 'size', label: 'ピクセルサイズ(px)', type: 'number', min: 2, max: 64, step: 1, default: 10 },
    { key: 'grid', label: '格子線', type: 'bool', default: false },
    { key: 'pulse', label: 'サイズ脈動', type: 'bool', default: false },
  ],
  notes: 'UVをセル単位に量子化してセル中心の色を取得する。ゲームのダメージ演出やシーン遷移に流用しやすい。',
  body: /* glsl */ `
void main() {
  float s = uSize * (uPulse > 0.5 ? (1.0 + 0.8 * (0.5 + 0.5 * sin(uTime * 2.0))) : 1.0);
  vec2 cell = vec2(s) / uResolution;
  vec2 uv = (floor(vUv / cell) + 0.5) * cell;
  vec3 col = texture2D(tDiffuse, uv).rgb;
  if (uGrid > 0.5) {
    vec2 f = fract(vUv / cell);
    float edge = step(0.1, f.x) * step(0.1, f.y);
    col *= 0.55 + 0.45 * edge;
  }
  gl_FragColor = vec4(col, 1.0);
}
`,
});
