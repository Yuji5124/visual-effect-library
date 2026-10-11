import { defineShaderSource } from '../../engine/shaderEffect';

export default defineShaderSource({
  id: '093',
  params: [
    { key: 'bounces', label: '反射回数', type: 'number', min: 1, max: 12, step: 1, default: 8 },
    { key: 'tint', label: '鏡の色', type: 'color', default: '#9fd8ff' },
    { key: 'loss', label: '反射ごとの減衰', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0.12 },
    { key: 'speed', label: '回転速度', type: 'number', min: 0, max: 2, step: 0.01, default: 0.4 },
  ],
  notes:
    '6面が鏡の立方体の内部をレイトレース。光線が壁に当たるたびに反射ベクトルで追跡を続け、反射回数ぶん減衰させて足し合わせる。内部の光るトーラスが合わせ鏡で無限に増殖して見える。',
  body: /* glsl */ `
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, s, -s, c); }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float T;
float obj(vec3 p) {
  p.xy *= rot(T * 0.7);
  p.yz *= rot(T * 0.5);
  return min(sdTorus(p, vec2(0.2, 0.035)), length(p) - 0.06);
}
void main() {
  T = uTime * uSpeed;
  vec2 uv = (vUv - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);
  vec3 ro = vec3(0.3 * sin(T * 0.3), 0.2 * cos(T * 0.4), -0.92);
  vec3 rd = normalize(vec3(uv, 1.0));
  rd.xz *= rot(sin(T * 0.2) * 0.4);
  vec3 col = vec3(0.0);
  float w = 1.0;
  for (int b = 0; b < 13; b++) {
    if (float(b) > uBounces) break;
    // 立方体 [-1,1]^3 の壁までの距離
    vec3 tWall = (sign(rd) - ro) / rd;
    float tw = min(tWall.x, min(tWall.y, tWall.z));
    float t = 0.0;
    float hit = 0.0;
    for (int i = 0; i < 48; i++) {
      float d = obj(ro + rd * t);
      if (d < 0.002) { hit = 1.0; break; }
      t += d;
      if (t > tw) break;
    }
    if (hit > 0.5) {
      vec3 p = ro + rd * t;
      float glow = 0.6 + 0.4 * sin(length(p) * 20.0 - T * 4.0);
      col += w * vec3(1.0, 0.35, 0.7) * (0.6 + 0.6 * glow);
      break;
    }
    vec3 p = ro + rd * tw;
    vec3 n = -sign(rd) * step(abs(p) - 0.999, vec3(0.0)) * 0.0;
    n = tWall.x <= tWall.y && tWall.x <= tWall.z ? vec3(-sign(rd.x), 0.0, 0.0) : (tWall.y <= tWall.z ? vec3(0.0, -sign(rd.y), 0.0) : vec3(0.0, 0.0, -sign(rd.z)));
    vec2 f = abs(fract((p.xy + p.yz + p.zx) * 2.0) - 0.5);
    float seam = smoothstep(0.48, 0.5, max(f.x, f.y));
    vec3 a = abs(p);
    float frame = smoothstep(0.96, 0.99, max(min(a.x, a.y), max(min(a.y, a.z), min(a.x, a.z))));
    col += w * (uTint * 0.04 + vec3(0.2, 0.9, 1.0) * frame * 0.8 + seam * 0.02);
    w *= (1.0 - uLoss);
    ro = p + n * 0.001;
    rd = reflect(rd, n);
  }
  gl_FragColor = vec4(pow(col, vec3(0.75)), 1.0);
}
`,
});
