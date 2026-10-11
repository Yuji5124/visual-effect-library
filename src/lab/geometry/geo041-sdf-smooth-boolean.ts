import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';

/** GEO-041 SDFモデリング：箱メッシュの内側でスフィアトレーシングし、smooth-min 系の集合演算で形を合成する */
const OPS: Record<string, number> = { union: 0, subtract: 1, intersect: 2 };
const COMBOS: Record<string, number> = { sphereBox: 0, sphereTorus: 1, three: 2, capsules: 3 };

const vertexShader = /* glsl */ `
varying vec3 vObj;
varying vec3 vCamObj;
void main() {
  vObj = position;
  vCamObj = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform mat4 modelMatrix;
uniform mat4 projectionMatrix;
uniform float uK;
uniform int uOp;
uniform int uCombo;
uniform float uTime;
uniform vec3 uHalf;
varying vec3 vObj;
varying vec3 vCamObj;

float sdSphere(vec3 p, float r) { return length(p) - r; }
float sdBox(vec3 p, vec3 b) { vec3 q = abs(p) - b; return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.05; }
float sdTorus(vec3 p, vec2 t) { vec2 q = vec2(length(p.xz) - t.x, p.y); return length(q) - t.y; }
float sdCapsule(vec3 p, vec3 a, vec3 b, float r) { vec3 pa = p - a, ba = b - a; float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0); return length(pa - ba * h) - r; }

// 多項式 smooth-min（k=0 で通常の min）
float smin(float a, float b, float k) {
  if (k <= 0.0) return min(a, b);
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
float smax(float a, float b, float k) { return -smin(-a, -b, k); }
float combine(float a, float b) {
  if (uOp == 1) return smax(a, -b, uK);
  if (uOp == 2) return smax(a, b, uK);
  return smin(a, b, uK);
}

// 戻り値 x=距離, y=どちらの形に近いか（0..1、色分け用）
vec2 map(vec3 p) {
  float s = sin(uTime * 0.7);
  float a, b;
  if (uCombo == 1) {
    a = sdTorus(p, vec2(1.1, 0.35));
    b = sdSphere(p - vec3(0.0, s * 0.9, 0.0), 0.75);
  } else if (uCombo == 2) {
    a = sdBox(p, vec3(0.8));
    float b1 = sdSphere(p - vec3(s * 0.9, 0.55, 0.0), 0.6);
    float b2 = sdSphere(p - vec3(-0.5, -0.6 * s, 0.75), 0.5);
    b = smin(b1, b2, uK);
  } else if (uCombo == 3) {
    a = sdCapsule(p, vec3(-1.2, -0.6, 0.0), vec3(1.2, 0.6, 0.0), 0.35);
    vec3 q = p; float c = cos(uTime * 0.5), sn = sin(uTime * 0.5);
    q.xz = mat2(c, -sn, sn, c) * q.xz;
    b = sdCapsule(q, vec3(0.0, -1.2, -0.8), vec3(0.0, 1.0, 0.8), 0.35);
  } else {
    a = sdBox(p, vec3(0.75));
    b = sdSphere(p - vec3(s * 0.8, 0.45, 0.25), 0.8);
  }
  float d = combine(a, b);
  float w = clamp(0.5 + 0.5 * (a - b) / max(uK, 0.05), 0.0, 1.0);
  return vec2(d, w);
}

vec3 calcNormal(vec3 p) {
  const vec2 e = vec2(1.0, -1.0) * 0.0015;
  return normalize(e.xyy * map(p + e.xyy).x + e.yyx * map(p + e.yyx).x + e.yxy * map(p + e.yxy).x + e.xxx * map(p + e.xxx).x);
}

void main() {
  vec3 ro = vCamObj;
  gl_FragDepth = 1.0;
  vec3 rd = normalize(vObj - vCamObj);
  // 箱との交差区間 [t0, t1]（カメラが箱の中にいても動くよう裏面を描く）
  vec3 inv = 1.0 / rd;
  vec3 ta = (-uHalf - ro) * inv, tb = (uHalf - ro) * inv;
  vec3 tmin = min(ta, tb), tmax = max(ta, tb);
  float t0 = max(max(max(tmin.x, tmin.y), tmin.z), 0.0);
  float t1 = min(min(tmax.x, tmax.y), tmax.z);
  float t = t0;
  bool hit = false;
  vec2 h;
  for (int i = 0; i < 128; i++) {
    h = map(ro + rd * t);
    if (h.x < 0.0008 * t) { hit = true; break; }
    t += h.x;
    if (t > t1) break;
  }
  if (!hit) discard;
  vec3 p = ro + rd * t;
  vec3 n = calcNormal(p);
  vec3 l = normalize(vec3(0.6, 0.9, 0.5));
  float dif = max(dot(n, l), 0.0);
  float rim = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);
  // 簡易アンビエントオクルージョン
  float ao = 0.0;
  for (int k = 1; k <= 4; k++) { float s = 0.06 * float(k); ao += (s - map(p + n * s).x) / float(k); }
  ao = clamp(1.0 - 2.5 * ao, 0.25, 1.0);
  vec3 ca = vec3(0.35, 0.7, 1.0), cb = vec3(1.0, 0.6, 0.25);
  vec3 base = mix(ca, cb, h.y);
  vec3 col = base * (0.18 + 0.95 * dif) * ao + rim * 0.25 + pow(max(dot(reflect(-l, n), -rd), 0.0), 32.0) * 0.4;
  gl_FragColor = vec4(col, 1.0);
  // 当たった点の深度を書く（床グリッドや比較表示と正しく前後する）
  vec4 clip = projectionMatrix * viewMatrix * modelMatrix * vec4(p, 1.0);
  gl_FragDepth = clamp(clip.z / clip.w * 0.5 + 0.5, 0.0, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

function sdfBox(k: number, op: number, combo: number): THREE.Mesh<THREE.BoxGeometry, THREE.ShaderMaterial> {
  const half = new THREE.Vector3(2, 2, 2);
  const mat = new THREE.ShaderMaterial({
    vertexShader,
    fragmentShader,
    side: THREE.BackSide,
    uniforms: {
      uK: { value: k },
      uOp: { value: op },
      uCombo: { value: combo },
      uTime: { value: 0 },
      uHalf: { value: half },
    },
  });
  return new THREE.Mesh(new THREE.BoxGeometry(half.x * 2, half.y * 2, half.z * 2), mat);
}

export default defineGeometryDemo({
  id: 'GEO-041',
  notes: '箱メッシュの各画素からカメラ方向の光線を物体空間で進め（スフィアトレーシング）、2つの形の SDF を min / max(a,−b) / max で合成する。滑らかさ k>0 のとき多項式 smooth-min で継ぎ目が丸くなる（色は2つの形の混ざり具合）。比較の左は k=0 の通常の集合演算。',
  params: [
    { key: 'op', label: '演算', type: 'select', options: [{ value: 'union', label: '和（smooth-min）' }, { value: 'subtract', label: '差（A − B）' }, { value: 'intersect', label: '積（共通部分）' }], default: 'union' },
    { key: 'smooth', label: '滑らかさ k', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'combo', label: '形の組み合わせ', type: 'select', options: [{ value: 'sphereBox', label: '箱 + 球' }, { value: 'sphereTorus', label: 'トーラス + 球' }, { value: 'three', label: '箱 + 球2つ' }, { value: 'capsules', label: 'カプセル2本' }], default: 'sphereBox' },
    { key: 'animate', label: '形を動かす', type: 'bool', default: true },
  ],
  liveKeys: ['smooth', 'animate'],
  exportable: 'レイマーチングで描く SDF はシェーダー内の関数でメッシュを持たないため、GLB に書き出せません（メッシュ化は GEO-042 の Surface Nets を参照）。',
  distance: 8,
  compareLabels: ['通常の集合演算（k=0）', '滑らかな集合演算'],
  build(p) {
    const op = OPS[String(p.op)] ?? 0;
    const combo = COMBOS[String(p.combo)] ?? 0;
    const mesh = sdfBox(Number(p.smooth), op, combo);
    const before = sdfBox(0, op, combo);
    let t = 0;
    const set = (k: number) => {
      mesh.material.uniforms.uK.value = k;
      mesh.material.uniforms.uTime.value = t;
      before.material.uniforms.uTime.value = t;
    };
    set(Number(p.smooth));
    return {
      object: mesh,
      before,
      info: () => `k = ${Number(mesh.material.uniforms.uK.value).toFixed(2)} · 光線最大 128 ステップ`,
      update(dt, _time, live) {
        if (live.animate) t += dt;
        set(Number(live.smooth));
      },
    };
  },
});
