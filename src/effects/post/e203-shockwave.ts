import { defineShaderPost } from '../../engine/shaderEffect';

const MAX_WAVES = 6;

export default defineShaderPost({
  id: '203',
  params: [
    { key: 'amplitude', label: '屈折の強さ', type: 'number', min: 0, max: 0.15, step: 0.001, default: 0.05 },
    { key: 'width', label: 'リングの幅', type: 'number', min: 0.01, max: 0.3, step: 0.005, default: 0.08 },
    { key: 'speed', label: '広がる速さ', type: 'number', min: 0.2, max: 3, step: 0.01, default: 0.9 },
    { key: 'auto', label: '自動で発生', type: 'bool', default: true },
    { key: 'flash', label: 'リングの発光', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
  ],
  notes:
    '爆発・着地・魔法の発動などで使う画面空間の衝撃波。中心からの距離とリング半径の差をガウス関数で包み、放射方向に画素をずらして屈折させる。半径が広がるほど振幅を減衰させる。画面をクリック／タップした位置から発生し、最大6つの波を同時に扱える。（着想: pmndrs/postprocessing の ShockWaveEffect。実装は独自）',
  extraDecl: `uniform vec3 uWaves[${MAX_WAVES}]; // xy: 中心(0..1), z: 発生時刻（負なら無効）`,
  extra() {
    const waves = Array.from({ length: MAX_WAVES }, () => [0.5, 0.5, -100]);
    const uniform = { value: waves.flat() };
    let next = 0;
    let lastAuto = -10;
    let now = 0;
    const spawn = (x: number, y: number) => {
      waves[next] = [x, y, now];
      next = (next + 1) % MAX_WAVES;
      uniform.value = waves.flat();
    };
    return {
      uniforms: { uWaves: uniform },
      update(frame, params) {
        now = frame.time;
        if (params.auto && now - lastAuto > 1.6) {
          lastAuto = now;
          spawn(0.25 + Math.random() * 0.5, 0.3 + Math.random() * 0.4);
        }
      },
      pointer(x, y, down) {
        if (down) spawn(x, y);
      },
      dispose() {},
    };
  },
  body: /* glsl */ `
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 offset = vec2(0.0);
  float glow = 0.0;
  for (int i = 0; i < ${MAX_WAVES}; i++) {
    vec3 w = uWaves[i];
    float age = uTime - w.z;
    if (age < 0.0 || age > 3.0) continue;
    float radius = age * uSpeed;
    vec2 d = (vUv - w.xy) * vec2(aspect, 1.0);
    float dist = length(d);
    float x = (dist - radius) / uWidth;
    float env = exp(-x * x * 4.0) * exp(-age * 1.2);
    vec2 dir = d / max(dist, 1e-4);
    offset -= dir / vec2(aspect, 1.0) * x * env * uAmplitude;
    glow += env * smoothstep(0.0, 0.5, -x + 0.5);
  }
  vec2 uv = vUv + offset;
  float ca = length(offset) * 0.6;
  vec3 col = vec3(texture2D(tDiffuse, uv + offset * ca * 10.0).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - offset * ca * 10.0).b);
  col += vec3(0.9, 0.95, 1.0) * glow * uFlash;
  gl_FragColor = vec4(col, 1.0);
}
`,
});
