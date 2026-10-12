import * as THREE from 'three';
import type { Noise3 } from './random';

/**
 * WRD-A（地形生成）用の共通部品：高さ格子の演算、priority-flood、D8流向と流量累積、
 * 傾き、等高線（マーチングスクエア）、リボン線、3D fBm。
 * 高さ格子はすべて n×n・行優先 (j*n+i) の Float32Array。
 */

/** fn(u,v)（u,v は 0..1）で n×n の高さ格子を作る */
export function gridFrom(n: number, fn: (u: number, v: number, i: number, j: number) => number): Float32Array {
  const h = new Float32Array(n * n);
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) h[j * n + i] = fn(i / (n - 1), j / (n - 1), i, j);
  return h;
}

export function minMax(h: ArrayLike<number>): [number, number] {
  let lo = Infinity, hi = -Infinity;
  for (let k = 0; k < h.length; k++) {
    if (h[k] < lo) lo = h[k];
    if (h[k] > hi) hi = h[k];
  }
  return [lo, hi];
}

/** 値域を [a,b] に線形変換（その場で） */
export function normalize(h: Float32Array, a = 0, b = 1): Float32Array {
  const [lo, hi] = minMax(h);
  const s = hi > lo ? (b - a) / (hi - lo) : 0;
  for (let k = 0; k < h.length; k++) h[k] = a + (h[k] - lo) * s;
  return h;
}

/** 中心差分による傾き（tanθ）。cell = 格子間隔（ワールド単位）、scale = 高さ倍率 */
export function slopeMap(h: ArrayLike<number>, n: number, cell: number, scale = 1): Float32Array {
  const s = new Float32Array(n * n);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const l = h[j * n + Math.max(0, i - 1)], r = h[j * n + Math.min(n - 1, i + 1)];
      const u = h[Math.max(0, j - 1) * n + i], d = h[Math.min(n - 1, j + 1) * n + i];
      const gx = ((r - l) * scale) / (cell * (i > 0 && i < n - 1 ? 2 : 1));
      const gz = ((d - u) * scale) / (cell * (j > 0 && j < n - 1 ? 2 : 1));
      s[j * n + i] = Math.hypot(gx, gz);
    }
  }
  return s;
}

/** 2分ヒープ（優先度が小さい順） */
export class MinHeap {
  private keys: number[] = [];
  private vals: number[] = [];
  get size(): number {
    return this.keys.length;
  }
  push(key: number, val: number): void {
    const k = this.keys, v = this.vals;
    let i = k.length;
    k.push(key);
    v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p];
      v[i] = v[p];
      i = p;
    }
    k[i] = key;
    v[i] = val;
  }
  /** 最小要素の値を取り出す（キーは lastKey に入る） */
  lastKey = 0;
  pop(): number {
    const k = this.keys, v = this.vals;
    const topK = k[0], topV = v[0];
    const lk = k.pop()!, lv = v.pop()!;
    const n = k.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c];
        v[i] = v[c];
        i = c;
      }
      k[i] = lk;
      v[i] = lv;
    }
    this.lastKey = topK;
    return topV;
  }
}

const D8X = [1, 1, 0, -1, -1, -1, 0, 1];
const D8Z = [0, 1, 1, 1, 0, -1, -1, -1];

/**
 * Priority-flood（Barnes 2014）：外周から低い順に浸水させ、窪地を「縁の高さ＋ε」まで埋める。
 * ε で僅かな傾きを付けるので、埋めた後は必ず外周まで下り坂でつながる。
 */
export function priorityFlood(h: ArrayLike<number>, n: number, eps = 1e-5): Float32Array {
  const out = Float32Array.from(h);
  const done = new Uint8Array(n * n);
  const heap = new MinHeap();
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1) {
        const k = j * n + i;
        done[k] = 1;
        heap.push(out[k], k);
      }
    }
  }
  while (heap.size) {
    const k = heap.pop();
    const i = k % n, j = (k / n) | 0;
    for (let d = 0; d < 8; d++) {
      const x = i + D8X[d], z = j + D8Z[d];
      if (x < 0 || z < 0 || x >= n || z >= n) continue;
      const q = z * n + x;
      if (done[q]) continue;
      done[q] = 1;
      if (out[q] <= out[k] + eps) out[q] = out[k] + eps;
      heap.push(out[q], q);
    }
  }
  return out;
}

/** D8：各セルの流出先（最急降下の8近傍）。流出先がなければ -1（外周または窪地） */
export function d8Receivers(h: ArrayLike<number>, n: number): Int32Array {
  const recv = new Int32Array(n * n).fill(-1);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1) continue;
      let best = 0, bq = -1;
      for (let d = 0; d < 8; d++) {
        const q = (j + D8Z[d]) * n + i + D8X[d];
        const drop = (h[k] - h[q]) / (d & 1 ? Math.SQRT2 : 1);
        if (drop > best) {
          best = drop;
          bq = q;
        }
      }
      recv[k] = bq;
    }
  }
  return recv;
}

/** 流量累積：高い順に処理し、自分の流量（初期値 1 = 自セルの降水）を流出先へ足す */
export function flowAccumulation(h: ArrayLike<number>, recv: Int32Array, n: number): Float32Array {
  const acc = new Float32Array(n * n).fill(1);
  const order = Array.from({ length: n * n }, (_, k) => k).sort((a, b) => h[b] - h[a]);
  for (const k of order) if (recv[k] >= 0) acc[recv[k]] += acc[k];
  return acc;
}

/** マーチングスクエアで level の等高線を線分（x,y,z…）として返す。y は線の高さ */
export function contourSegments(h: ArrayLike<number>, n: number, size: number, level: number, y: number): number[] {
  const out: number[] = [];
  const wx = (f: number) => (f / (n - 1) - 0.5) * size;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const a = h[j * n + i] - level, b = h[j * n + i + 1] - level;
      const c = h[(j + 1) * n + i + 1] - level, d = h[(j + 1) * n + i] - level;
      const pts: number[] = [];
      const edge = (v0: number, v1: number, x0: number, z0: number, x1: number, z1: number) => {
        if ((v0 < 0) !== (v1 < 0)) {
          const t = v0 / (v0 - v1);
          pts.push(wx(x0 + (x1 - x0) * t), wx(z0 + (z1 - z0) * t));
        }
      };
      edge(a, b, i, j, i + 1, j);
      edge(b, c, i + 1, j, i + 1, j + 1);
      edge(c, d, i + 1, j + 1, i, j + 1);
      edge(d, a, i, j + 1, i, j);
      for (let k = 0; k + 3 < pts.length; k += 4) out.push(pts[k], y, pts[k + 1], pts[k + 2], y, pts[k + 3]);
    }
  }
  return out;
}

/**
 * 水平なリボン（太さを持つ線分）を1つのメッシュにまとめる。
 * segs は [x1,y1,z1,x2,y2,z2,width, r,g,b] の繰り返し。
 */
export function ribbonMesh(segs: number[], material?: THREE.Material): THREE.Mesh {
  const pos: number[] = [];
  const col: number[] = [];
  for (let o = 0; o + 10 <= segs.length; o += 10) {
    const x1 = segs[o], y1 = segs[o + 1], z1 = segs[o + 2], x2 = segs[o + 3], y2 = segs[o + 4], z2 = segs[o + 5];
    const w = segs[o + 6], r = segs[o + 7], g = segs[o + 8], b = segs[o + 9];
    let dx = x2 - x1, dz = z2 - z1;
    const L = Math.hypot(dx, dz) || 1;
    dx /= L;
    dz /= L;
    const nx = -dz * w * 0.5, nz = dx * w * 0.5;
    // 端を半幅だけ延ばして継ぎ目の隙間を消す
    const ex = dx * w * 0.5, ez = dz * w * 0.5;
    const ax = x1 - ex, az = z1 - ez, bx = x2 + ex, bz = z2 + ez;
    pos.push(ax + nx, y1, az + nz, bx + nx, y2, bz + nz, ax - nx, y1, az - nz);
    pos.push(ax - nx, y1, az - nz, bx + nx, y2, bz + nz, bx - nx, y2, bz - nz);
    for (let v = 0; v < 6; v++) col.push(r, g, b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mat = material ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0, side: THREE.DoubleSide });
  return new THREE.Mesh(geo, mat);
}

/** 半透明の水面（size 四方、高さ y） */
export function waterPlane(size: number, y: number, color = 0x2a6fb8, opacity = 0.55): THREE.Mesh {
  const geo = new THREE.PlaneGeometry(size, size);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.15, metalness: 0.1, depthWrite: false }));
}

/** 3Dノイズのフラクタル和（0..1 付近） */
export function fbm3(noise: Noise3, x: number, y: number, z: number, octaves = 3, lacunarity = 2, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, f = 1;
  for (let o = 0; o < octaves; o++) {
    sum += noise(x * f + o * 17.3, y * f, z * f) * amp;
    norm += amp;
    amp *= gain;
    f *= lacunarity;
  }
  return sum / norm;
}

/** 色の線形補間（RGB 0..1 の配列 a→b） */
export function mixRgb(a: [number, number, number], b: [number, number, number], t: number, out: THREE.Color): THREE.Color {
  const u = Math.min(1, Math.max(0, t));
  return out.setRGB(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
}
