import * as THREE from 'three';
import type { BoxBatch } from './worldKit';

/**
 * 都市生成（WRD-B）用の2D多角形ツール：辺に属性（道路幅など）を持つ凸多角形の半平面クリップ・直線分割・
 * 辺ごとの後退（インセット）・再帰的街区分割・接道する敷地割り、と、それらをまとめて描くメッシュ生成。
 * 座標は (x, z)。向きは x 右・z 上とみなした数学的な反時計回り（CCW）にそろえる。
 */

export type V2 = [number, number];

/** 辺属性付き多角形。attr[i] は pts[i]→pts[i+1] の辺の属性 */
export interface APoly {
  pts: V2[];
  attr: number[];
}

/** 属性の約束：0 以上 = 道路に面する辺（値は道路幅）、SIDE = 隣地境界、REAR = 奥（中庭側） */
export const SIDE = -1;
export const REAR = -2;

export function polyArea(pts: V2[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

export function polyCentroid(pts: V2[]): V2 {
  let cx = 0, cz = 0, s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const c = a[0] * b[1] - b[0] * a[1];
    s += c;
    cx += (a[0] + b[0]) * c;
    cz += (a[1] + b[1]) * c;
  }
  if (Math.abs(s) < 1e-12) {
    const m = pts.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1]] as V2, [0, 0] as V2);
    return [m[0] / pts.length, m[1] / pts.length];
  }
  return [cx / (3 * s), cz / (3 * s)];
}

export function makeAPoly(pts: V2[], attr: number | number[]): APoly {
  const a = Array.isArray(attr) ? attr.slice() : pts.map(() => attr);
  if (polyArea(pts) < 0) {
    // CCW にそろえる（辺 i は pts[i]→pts[i+1] なので属性もずらす）
    const n = pts.length;
    const rp = pts.slice().reverse();
    const ra = rp.map((_, i) => a[(n - 2 - i + n) % n]);
    return { pts: rp, attr: ra };
  }
  return { pts: pts.slice(), attr: a };
}

/** 近すぎる連続頂点を取り除く */
function clean(p: APoly, eps = 1e-6): APoly {
  const pts: V2[] = [], attr: number[] = [];
  for (let i = 0; i < p.pts.length; i++) {
    const a = p.pts[i];
    const last = pts[pts.length - 1];
    if (last && Math.abs(last[0] - a[0]) < eps && Math.abs(last[1] - a[1]) < eps) {
      attr[attr.length - 1] = p.attr[i];
      continue;
    }
    pts.push(a);
    attr.push(p.attr[i]);
  }
  while (pts.length > 1 && Math.abs(pts[0][0] - pts[pts.length - 1][0]) < eps && Math.abs(pts[0][1] - pts[pts.length - 1][1]) < eps) {
    pts.pop();
    attr.pop();
  }
  return { pts, attr };
}

/** 半平面 nx*x + nz*z >= c で切り取る（Sutherland–Hodgman）。切り口にできた辺は newAttr */
export function clipHalf(p: APoly, nx: number, nz: number, c: number, newAttr: number): APoly {
  const n = p.pts.length;
  const pts: V2[] = [], attr: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = p.pts[i], b = p.pts[(i + 1) % n];
    const sa = nx * a[0] + nz * a[1] - c, sb = nx * b[0] + nz * b[1] - c;
    const ina = sa >= 0, inb = sb >= 0;
    if (ina) {
      pts.push(a);
      attr.push(p.attr[i]);
    }
    if (ina !== inb) {
      const t = sa / (sa - sb);
      const x: V2 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
      pts.push(x);
      attr.push(ina ? newAttr : p.attr[i]);
    }
  }
  const out = clean({ pts, attr });
  return out.pts.length >= 3 && polyArea(out.pts) > 1e-9 ? out : { pts: [], attr: [] };
}

/** 辺 i の内向き単位法線と、その直線の定数（n·p = c が辺の直線） */
export function edgeLine(p: APoly, i: number): { nx: number; nz: number; c: number; len: number; dx: number; dz: number } {
  const a = p.pts[i], b = p.pts[(i + 1) % p.pts.length];
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz) || 1e-9;
  const nx = -dz / len, nz = dx / len;
  return { nx, nz, c: nx * a[0] + nz * a[1], len, dx: dx / len, dz: dz / len };
}

/** 辺ごとに異なる距離だけ内側へ縮める（凸多角形）。新しい辺は元の辺の属性を受け継ぐ */
export function insetBy(p: APoly, dist: (attr: number, i: number) => number): APoly {
  let out = p;
  for (let i = 0; i < p.pts.length && out.pts.length >= 3; i++) {
    const L = edgeLine(p, i);
    const d = dist(p.attr[i], i);
    if (d <= 0) continue;
    out = clipHalf(out, L.nx, L.nz, L.c + d, p.attr[i]);
  }
  return out;
}

/** 直線（点 o、方向 d）で2分。切り口の辺は cutAttr */
export function splitByLine(p: APoly, ox: number, oz: number, dx: number, dz: number, cutAttr: number): [APoly, APoly] {
  const nx = -dz, nz = dx;
  const c = nx * ox + nz * oz;
  return [clipHalf(p, nx, nz, c, cutAttr), clipHalf(p, -nx, -nz, -c, cutAttr)];
}

export interface SubdivOptions {
  minArea: number;
  /** 分割位置の乱れ 0..1（0 = 最長辺の中点） */
  jitter: number;
  /** 角度の乱れ（ラジアン） */
  angle: number;
  /** 深さ → 道路幅 */
  width: (depth: number) => number;
  maxDepth?: number;
  rng: () => number;
}

export interface Cut {
  a: V2;
  b: V2;
  depth: number;
  width: number;
}

export interface Region {
  region: APoly;
  /** 道路幅の半分だけ縮めた街区 */
  block: APoly;
  depth: number;
}

/** 再帰的な街区分割：最長辺のほぼ中点で、その辺にほぼ垂直な道路を引いて2分する */
export function subdivide(root: APoly, o: SubdivOptions): { regions: Region[]; cuts: Cut[] } {
  const regions: Region[] = [];
  const cuts: Cut[] = [];
  const maxDepth = o.maxDepth ?? 12;
  const rec = (p: APoly, depth: number) => {
    const area = polyArea(p.pts);
    if (area < o.minArea * 2 || depth >= maxDepth) {
      const block = insetBy(p, (w) => (w > 0 ? w / 2 : 0));
      if (block.pts.length >= 3) regions.push({ region: p, block, depth });
      return;
    }
    let bi = 0, bl = -1;
    for (let i = 0; i < p.pts.length; i++) {
      const L = edgeLine(p, i);
      if (L.len > bl) (bl = L.len), (bi = i);
    }
    const E = edgeLine(p, bi);
    const t = 0.5 + (o.rng() - 0.5) * o.jitter * 0.6;
    const a = p.pts[bi];
    const ox = a[0] + E.dx * E.len * t, oz = a[1] + E.dz * E.len * t;
    const th = (o.rng() - 0.5) * 2 * o.angle;
    // 辺の内向き法線方向を少し回した直線
    const dx = E.nx * Math.cos(th) - E.nz * Math.sin(th), dz = E.nx * Math.sin(th) + E.nz * Math.cos(th);
    const w = o.width(depth);
    const [l, r] = splitByLine(p, ox, oz, dx, dz, w);
    if (l.pts.length < 3 || r.pts.length < 3) {
      regions.push({ region: p, block: insetBy(p, (ww) => (ww > 0 ? ww / 2 : 0)), depth });
      return;
    }
    // 切り口の線分（両側の多角形で cutAttr を持つ辺）
    const seg = l.attr.findIndex((v, i) => v === w && onLine(l.pts[i], ox, oz, dx, dz) && onLine(l.pts[(i + 1) % l.pts.length], ox, oz, dx, dz));
    if (seg >= 0) cuts.push({ a: l.pts[seg], b: l.pts[(seg + 1) % l.pts.length], depth, width: w });
    rec(l, depth + 1);
    rec(r, depth + 1);
  };
  rec(root, 0);
  return { regions, cuts };
}

function onLine(p: V2, ox: number, oz: number, dx: number, dz: number): boolean {
  return Math.abs(-dz * (p[0] - ox) + dx * (p[1] - oz)) < 1e-6;
}

export interface Lot {
  poly: APoly;
  /** 接道辺のインデックス（block の辺番号） */
  front: number;
  /** 前面道路の幅 */
  road: number;
}

/**
 * 街区を敷地に分ける：各道路辺から奥行き depth の帯をとり、帯を間口 frontage で刻む。すべての敷地は道路に接し、残りは中庭。
 * 帯どうしの境界：奥行きが有限なら長い辺を優先して角地を長い辺の帯に含め（角地は2辺で接道）、
 * 奥行きが無限（中庭なし）なら凸多角形の直線骨格（どの辺に一番近いか）で分ける。
 */
export function lotsOfBlock(block: APoly, frontage: number, depth: number): { lots: Lot[]; court: APoly | null } {
  const lots: Lot[] = [];
  const lines = block.pts.map((_, i) => edgeLine(block, i));
  const finite = Number.isFinite(depth);
  const order = block.pts.map((_, i) => i).filter((i) => block.attr[i] >= 0).sort((a, b) => lines[b].len - lines[a].len || a - b);
  order.forEach((i, rank) => {
    const Li = lines[i];
    let piece: APoly = { pts: block.pts.map((q) => [q[0], q[1]] as V2), attr: block.attr.map((v, k) => (k === i || finite ? v : SIDE)) };
    if (finite) {
      // 帯：辺 i からの距離が depth 以下、かつ優先度の高い辺の帯には入らない
      piece = clipHalf(piece, -Li.nx, -Li.nz, -(Li.c + depth), REAR);
      for (let r = 0; r < rank && piece.pts.length >= 3; r++) {
        const Lj = lines[order[r]];
        piece = clipHalf(piece, Lj.nx, Lj.nz, Lj.c + depth, SIDE);
      }
    } else {
      // 直線骨格：dist_j(p) - dist_i(p) >= 0
      for (const j of order) {
        if (j === i || piece.pts.length < 3) continue;
        const Lj = lines[j];
        piece = clipHalf(piece, Lj.nx - Li.nx, Lj.nz - Li.nz, Lj.c - Li.c, SIDE);
      }
    }
    if (piece.pts.length < 3) return;
    // 敷地の接道区間 [f0, f1]（辺 i 上の範囲）を間口で等分する
    let f0 = Infinity, f1 = -Infinity;
    const m = piece.pts.length;
    for (let k = 0; k < m; k++) {
      const a = piece.pts[k], b = piece.pts[(k + 1) % m];
      if (Math.abs(Li.nx * a[0] + Li.nz * a[1] - Li.c) > 1e-6 || Math.abs(Li.nx * b[0] + Li.nz * b[1] - Li.c) > 1e-6) continue;
      for (const q of [a, b]) {
        const t = Li.dx * q[0] + Li.dz * q[1];
        f0 = Math.min(f0, t);
        f1 = Math.max(f1, t);
      }
    }
    if (!(f1 - f0 > 1e-4)) return;
    const k = Math.max(1, Math.round((f1 - f0) / frontage));
    for (let s = 0; s < k; s++) {
      let lot = piece;
      if (s > 0) lot = clipHalf(lot, Li.dx, Li.dz, f0 + ((f1 - f0) * s) / k, SIDE);
      if (s < k - 1) lot = clipHalf(lot, -Li.dx, -Li.dz, -(f0 + ((f1 - f0) * (s + 1)) / k), SIDE);
      if (lot.pts.length < 3 || polyArea(lot.pts) < 1e-4) continue;
      // 接道辺：辺 i の直線上にある辺
      let f = -1;
      for (let q = 0; q < lot.pts.length && f < 0; q++) {
        const a = lot.pts[q], b = lot.pts[(q + 1) % lot.pts.length];
        if (lot.attr[q] >= 0 && Math.abs(Li.nx * a[0] + Li.nz * a[1] - Li.c) < 1e-6 && Math.abs(Li.nx * b[0] + Li.nz * b[1] - Li.c) < 1e-6) f = q;
      }
      lots.push({ poly: lot, front: f, road: block.attr[i] });
    }
  });
  let court: APoly | null = null;
  if (finite) {
    const c = insetBy(block, (v) => (v >= 0 ? depth : 0));
    if (c.pts.length >= 3) court = c;
  }
  return { lots, court };
}

/* ---------- 描画 ---------- */

export interface FillItem {
  pts: V2[];
  color: THREE.ColorRepresentation;
  y: number;
}

function pushTriUp(pos: number[], col: number[], a: number[], b: number[], c: number[], color: THREE.Color): void {
  const e1x = b[0] - a[0], e1z = b[2] - a[2], e2x = c[0] - a[0], e2z = c[2] - a[2];
  const ny = e1z * e2x - e1x * e2z;
  if (ny < 0) [b, c] = [c, b];
  pos.push(...a, ...b, ...c);
  for (let k = 0; k < 3; k++) col.push(color.r, color.g, color.b);
}

/** 平らな多角形の集合を1つのメッシュに（凹多角形も可） */
export function fillMesh(items: FillItem[], material?: THREE.Material): THREE.Mesh {
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color();
  for (const it of items) {
    if (it.pts.length < 3) continue;
    c.set(it.color);
    const tris = THREE.ShapeUtils.triangulateShape(it.pts.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const [i, j, k] of tris) {
      const A = it.pts[i], B = it.pts[j], C = it.pts[k];
      pushTriUp(pos, col, [A[0], it.y, A[1]], [B[0], it.y, B[1]], [C[0], it.y, C[1]], c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));
}

export interface PrismItem {
  pts: V2[];
  base: number;
  height: number;
  color: THREE.ColorRepresentation;
  /** 側面だけ別の色にしたいとき */
  side?: THREE.ColorRepresentation;
}

/** 多角形を押し出した角柱（建物・縁石付きの街区）をまとめて1メッシュに */
export function prismMesh(items: PrismItem[], material?: THREE.Material): THREE.Mesh {
  const pos: number[] = [], col: number[] = [];
  const c = new THREE.Color(), cs = new THREE.Color();
  for (const it of items) {
    const P = polyArea(it.pts) < 0 ? it.pts.slice().reverse() : it.pts;
    if (P.length < 3) continue;
    c.set(it.color);
    cs.set(it.side ?? it.color);
    const y0 = it.base, y1 = it.base + it.height;
    const tris = THREE.ShapeUtils.triangulateShape(P.map(([x, z]) => new THREE.Vector2(x, z)), []);
    for (const [i, j, k] of tris) pushTriUp(pos, col, [P[i][0], y1, P[i][1]], [P[j][0], y1, P[j][1]], [P[k][0], y1, P[k][1]], c);
    for (let i = 0; i < P.length; i++) {
      const a = P[i], b = P[(i + 1) % P.length];
      // CCW（x右・z上）なので外向きは右法線 (dz, -dx)。三角形の向きを外向きにそろえる
      const A = [a[0], y0, a[1]], B = [b[0], y0, b[1]], C = [b[0], y1, b[1]], D = [a[0], y1, a[1]];
      const ox = b[1] - a[1], oz = -(b[0] - a[0]);
      const quad = (p: number[], q: number[], r: number[]) => {
        const e1 = [q[0] - p[0], q[1] - p[1], q[2] - p[2]], e2 = [r[0] - p[0], r[1] - p[1], r[2] - p[2]];
        const nx = e1[1] * e2[2] - e1[2] * e2[1], nz = e1[0] * e2[1] - e1[1] * e2[0];
        if (nx * ox + nz * oz < 0) [q, r] = [r, q];
        pos.push(...p, ...q, ...r);
        for (let t = 0; t < 3; t++) col.push(cs.r, cs.g, cs.b);
      };
      quad(A, B, C);
      quad(A, C, D);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, material ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0.05, flatShading: true }));
}

/** 多角形の輪郭を線分列（segments 用）に */
export function outlinePoints(polys: V2[][], y: number, out: number[] = []): number[] {
  for (const p of polys) {
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length];
      out.push(a[0], y, a[1], b[0], y, b[1]);
    }
  }
  return out;
}

/** 線分を幅のある帯（道路）として BoxBatch 互換の引数にする：中心・長さ・回転 */
export function stripArgs(a: V2, b: V2, w: number, cap = true): { x: number; z: number; len: number; ry: number } {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const len = Math.hypot(dx, dz);
  return { x: (a[0] + b[0]) / 2, z: (a[1] + b[1]) / 2, len: len + (cap ? w : 0), ry: Math.atan2(-dz, dx) };
}

/** 道路の格（幹線・街路・路地）の色 */
export const ROAD_COLORS = [0xe0b25a, 0x9aa0ae, 0x6c7180];

export function pointInPoly(x: number, z: number, pts: V2[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, zi] = pts[i], [xj, zj] = pts[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** 深さ → 道路の格（0 幹線 / 1 街路 / 2 路地） */
export const roadClass = (depth: number) => (depth < 2 ? 0 : depth < 4 ? 1 : 2);

export function rootShape(kind: string, rng: () => number): V2[] {
  if (kind === 'rect') return [[-6, -6 * 0.8], [6, -6 * 0.8], [6, 6 * 0.8], [-6, 6 * 0.8]];
  // 不規則な凸多角形（円周上の角度をばらつかせる）
  const n = 7;
  const pts: V2[] = [];
  for (let i = 0; i < n; i++) {
    const a = ((i + 0.3 * (rng() - 0.5)) / n) * Math.PI * 2;
    const r = 6 * (0.92 + 0.08 * rng());
    pts.push([Math.cos(a) * r, Math.sin(a) * r * 0.85]);
  }
  return pts;
}

/** 道路の帯（外周＋切り口）を BoxBatch に */
export function addRoads(batch: BoxBatch, root: APoly, cuts: Cut[], base: number): void {
  for (const c of cuts) {
    const s = stripArgs(c.a, c.b, c.width, false);
    batch.add(s.x, 0.006, s.z, s.len, 0.012, c.width, ROAD_COLORS[roadClass(c.depth)], s.ry);
  }
  for (let i = 0; i < root.pts.length; i++) {
    const s = stripArgs(root.pts[i], root.pts[(i + 1) % root.pts.length], base);
    batch.add(s.x, 0.006, s.z, s.len, 0.012, base, ROAD_COLORS[0], s.ry);
  }
}
