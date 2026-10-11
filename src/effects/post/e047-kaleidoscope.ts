import { defineShaderPost } from '../../engine/shaderEffect';

export default defineShaderPost({
  id: '047',
  params: [
    { key: 'segments', label: '分割数', type: 'number', min: 2, max: 24, step: 1, default: 8 },
    { key: 'speed', label: '回転速度', type: 'number', min: -1, max: 1, step: 0.01, default: 0.1 },
    { key: 'zoom', label: 'ズーム', type: 'number', min: 0.3, max: 3, step: 0.01, default: 0.7 },
    { key: 'drift', label: '採取角の回転', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'offset', label: '中心オフセット', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0.1 },
  ],
  notes: '極座標の角度を扇形の幅で割った余りを取り、さらに中央で折り返す（鏡映）ことで継ぎ目のない万華鏡になる。採取する扇形の向きをゆっくり回すと模様が変化し続ける。',
  body: /* glsl */ `
void main() {
  float aspect = uResolution.x / uResolution.y;
  vec2 p = vUv - 0.5;
  p.x *= aspect;
  float r = length(p);
  float a = atan(p.y, p.x) + uTime * uSpeed;
  float seg = 6.2831853 / floor(uSegments);
  a = mod(a, seg);
  a = abs(a - seg * 0.5);
  a += uTime * uDrift + 1.2;
  vec2 q = vec2(cos(a), sin(a)) * r / uZoom;
  q += vec2(uOffset * sin(uTime * 0.3), uOffset * cos(uTime * 0.23));
  q.x /= aspect;
  vec2 uv = q + 0.5;
  uv = abs(mod(uv - 1.0, 2.0) - 1.0);
  gl_FragColor = vec4(texture2D(tDiffuse, uv).rgb, 1.0);
}
`,
});
