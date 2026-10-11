import * as THREE from 'three';

/**
 * 植生・生態系デモ（WRD-024〜030）用の追加部品：
 * 傾斜角と斜面方位の法線、チャンファー距離変換、台形の適合度関数、
 * 動的に書き換えられる円の線（樹冠の範囲表示）。
 */

/** 中心差分の法線（xz 格子、cell = 格子間隔、scale = 高さ倍率）。戻り値は (nx,ny,nz) の連続配列 */
export function normalMap(h: ArrayLike<number>, n: number, cell: number, scale: number): Float32Array {
  const out = new Float32Array(n * n * 3);
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const l = h[j * n + Math.max(0, i - 1)], r = h[j * n + Math.min(n - 1, i + 1)];
      const u = h[Math.max(0, j - 1) * n + i], d = h[Math.min(n - 1, j + 1) * n + i];
      const gx = ((r - l) * scale) / (cell * (i > 0 && i < n - 1 ? 2 : 1));
      const gz = ((d - u) * scale) / (cell * (j > 0 && j < n - 1 ? 2 : 1));
      const L = Math.hypot(gx, 1, gz);
      const k = (j * n + i) * 3;
      out[k] = -gx / L;
      out[k + 1] = 1 / L;
      out[k + 2] = -gz / L;
    }
  }
  return out;
}

/**
 * チャンファー距離変換（3-4 マスク、2パス）。src[k] が真のセルからの距離（格子単位）を返す。
 * 前向き（左上→右下）と後ろ向き（右下→左上）の2回の走査だけで近似ユークリッド距離が求まる。
 */
export function chamferDistance(w: number, h: number, src: (k: number) => boolean): Float32Array {
  const INF = 1e9;
  const d = new Float32Array(w * h);
  for (let k = 0; k < w * h; k++) d[k] = src(k) ? 0 : INF;
  const A = 3, B = 4;
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      let v = d[k];
      if (i > 0) v = Math.min(v, d[k - 1] + A);
      if (j > 0) {
        v = Math.min(v, d[k - w] + A);
        if (i > 0) v = Math.min(v, d[k - w - 1] + B);
        if (i < w - 1) v = Math.min(v, d[k - w + 1] + B);
      }
      d[k] = v;
    }
  }
  for (let j = h - 1; j >= 0; j--) {
    for (let i = w - 1; i >= 0; i--) {
      const k = j * w + i;
      let v = d[k];
      if (i < w - 1) v = Math.min(v, d[k + 1] + A);
      if (j < h - 1) {
        v = Math.min(v, d[k + w] + A);
        if (i < w - 1) v = Math.min(v, d[k + w + 1] + B);
        if (i > 0) v = Math.min(v, d[k + w - 1] + B);
      }
      d[k] = v;
    }
  }
  for (let k = 0; k < w * h; k++) d[k] /= A;
  return d;
}

/** 台形の適合度：a〜b で立ち上がり、b〜c で 1、c〜d で下がる */
export function trapezoid(x: number, a: number, b: number, c: number, d: number): number {
  if (x <= a || x >= d) return 0;
  if (x < b) return (x - a) / Math.max(1e-6, b - a);
  if (x <= c) return 1;
  return (d - x) / Math.max(1e-6, d - c);
}

/** 容量固定の円の集合（毎ステップ半径や色が変わるもの用）。setAt で書き、commit で表示数を確定 */
export class DynamicRings {
  readonly lines: THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly cos: Float32Array;
  private readonly sin: Float32Array;
  constructor(readonly capacity: number, readonly seg = 16) {
    this.pos = new Float32Array(Math.max(1, capacity) * seg * 6);
    this.col = new Float32Array(Math.max(1, capacity) * seg * 6);
    this.cos = new Float32Array(seg + 1);
    this.sin = new Float32Array(seg + 1);
    for (let s = 0; s <= seg; s++) {
      this.cos[s] = Math.cos((s / seg) * Math.PI * 2);
      this.sin[s] = Math.sin((s / seg) * Math.PI * 2);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    geo.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.lines.frustumCulled = false;
  }

  setAt(i: number, x: number, y: number, z: number, r: number, c: THREE.Color): void {
    const seg = this.seg;
    for (let s = 0; s < seg; s++) {
      const o = (i * seg + s) * 6;
      this.pos[o] = x + this.cos[s] * r;
      this.pos[o + 1] = y;
      this.pos[o + 2] = z + this.sin[s] * r;
      this.pos[o + 3] = x + this.cos[s + 1] * r;
      this.pos[o + 4] = y;
      this.pos[o + 5] = z + this.sin[s + 1] * r;
      this.col[o] = this.col[o + 3] = c.r;
      this.col[o + 1] = this.col[o + 4] = c.g;
      this.col[o + 2] = this.col[o + 5] = c.b;
    }
  }

  commit(count: number): void {
    const g = this.lines.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, Math.min(count, this.capacity) * this.seg * 2);
  }
}

/** 標準正規乱数（Box–Muller） */
export function gaussian(rng: () => number): number {
  const u = Math.max(1e-12, rng()), v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 平均 lambda のポアソン乱数（Knuth 法。lambda が小さい用途向け） */
export function poissonCount(rng: () => number, lambda: number): number {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do {
    k++;
    p *= rng();
  } while (p > L && k < 1000);
  return k - 1;
}

/** 高さ格子のうち水位より低いセルだけを覆う水面（地形の外へはみ出さない） */
export function waterCells(h: ArrayLike<number>, n: number, size: number, level: number, y: number, color = 0x2a6fb8, opacity = 0.6): THREE.Mesh {
  const pos: number[] = [];
  const wx = (i: number) => (i / (n - 1) - 0.5) * size;
  for (let j = 0; j < n - 1; j++) {
    for (let i = 0; i < n - 1; i++) {
      const k = j * n + i;
      if (h[k] >= level && h[k + 1] >= level && h[k + n] >= level && h[k + n + 1] >= level) continue;
      const x0 = wx(i), x1 = wx(i + 1), z0 = wx(j), z1 = wx(j + 1);
      pos.push(x0, y, z0, x0, y, z1, x1, y, z0, x1, y, z0, x0, y, z1, x1, y, z1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos.length ? pos : [0, y, 0, 0, y, 0, 0, y, 0], 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, transparent: true, opacity, roughness: 0.15, metalness: 0.1, depthWrite: false }));
}
