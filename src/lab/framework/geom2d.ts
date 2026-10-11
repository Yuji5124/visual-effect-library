/** 2D幾何の小道具（WRD-D 用）：ボウヤー・ワトソンのドロネー三角形分割、Union-Find、Kruskal の最小全域木 */

export interface P2 {
  x: number;
  y: number;
}

export interface Edge {
  a: number;
  b: number;
  w: number;
}

interface Tri {
  a: number;
  b: number;
  c: number;
  cx: number;
  cy: number;
  r2: number;
}

function circum(pts: P2[], a: number, b: number, c: number): Tri {
  const A = pts[a], B = pts[b], C = pts[c];
  const d = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y));
  if (Math.abs(d) < 1e-12) return { a, b, c, cx: 0, cy: 0, r2: Infinity };
  const a2 = A.x * A.x + A.y * A.y, b2 = B.x * B.x + B.y * B.y, c2 = C.x * C.x + C.y * C.y;
  const cx = (a2 * (B.y - C.y) + b2 * (C.y - A.y) + c2 * (A.y - B.y)) / d;
  const cy = (a2 * (C.x - B.x) + b2 * (A.x - C.x) + c2 * (B.x - A.x)) / d;
  return { a, b, c, cx, cy, r2: (A.x - cx) ** 2 + (A.y - cy) ** 2 };
}

/** ボウヤー・ワトソン法。点を1つずつ挿入し、外接円に点を含む三角形を取り除いて穴を扇状に埋め直す */
export function delaunay(input: P2[]): [number, number, number][] {
  const n = input.length;
  if (n < 3) return [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of input) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  const span = Math.max(maxX - minX, maxY - minY, 1) * 20;
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  // 共円配置で縮退しないよう、ごく小さく決定的にずらす
  const pts: P2[] = input.map((p, i) => ({ x: p.x + Math.sin(i * 12.9898) * 1e-6, y: p.y + Math.cos(i * 78.233) * 1e-6 }));
  pts.push({ x: mx - span, y: my - span }, { x: mx + span, y: my - span }, { x: mx, y: my + span });
  let tris: Tri[] = [circum(pts, n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    const bad: Tri[] = [];
    const keep: Tri[] = [];
    for (const t of tris) ((p.x - t.cx) ** 2 + (p.y - t.cy) ** 2 < t.r2 ? bad : keep).push(t);
    // 悪い三角形の境界（1回だけ現れる辺）
    const edgeCount = new Map<string, [number, number, number]>();
    for (const t of bad) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
        const k = u < v ? `${u},${v}` : `${v},${u}`;
        const e = edgeCount.get(k);
        if (e) e[2]++;
        else edgeCount.set(k, [u, v, 1]);
      }
    }
    for (const [u, v, c] of edgeCount.values()) if (c === 1) keep.push(circum(pts, u, v, i));
    tris = keep;
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
}

/** 三角形の集合から重複のない辺の一覧（重み＝距離） */
export function triangleEdges(tris: [number, number, number][], pts: P2[]): Edge[] {
  const seen = new Set<string>();
  const out: Edge[] = [];
  for (const t of tris) {
    for (const [u, v] of [[t[0], t[1]], [t[1], t[2]], [t[2], t[0]]]) {
      const a = Math.min(u, v), b = Math.max(u, v);
      const k = `${a},${b}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ a, b, w: Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y) });
    }
  }
  return out;
}

export class UnionFind {
  readonly parent: Int32Array;
  constructor(n: number) {
    this.parent = new Int32Array(n);
    for (let i = 0; i < n; i++) this.parent[i] = i;
  }
  find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;
    this.parent[ra] = rb;
    return true;
  }
}

/** Kruskal 法：辺を軽い順に見て、別の木をつなぐ辺だけ採用する。戻り値は [MST, 残りの辺] */
export function kruskal(n: number, edges: Edge[]): [Edge[], Edge[]] {
  const sorted = [...edges].sort((p, q) => p.w - q.w || p.a - q.a || p.b - q.b);
  const uf = new UnionFind(n);
  const mst: Edge[] = [];
  const rest: Edge[] = [];
  for (const e of sorted) (uf.union(e.a, e.b) ? mst : rest).push(e);
  return [mst, rest];
}

/** 軸平行矩形 */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 矩形どうしの重なり（margin だけ広げて判定）。接しているだけなら重ならない */
export function rectsOverlap(a: Rect, b: Rect, margin = 0, eps = 1e-6): boolean {
  return a.x - margin < b.x + b.w - eps && b.x - margin < a.x + a.w - eps && a.y - margin < b.y + b.h - eps && b.y - margin < a.y + a.h - eps;
}

/** 矩形の共通部分（なければ null） */
export function rectIntersect(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x), y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.w, b.x + b.w), y1 = Math.min(a.y + a.h, b.y + b.h);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, w: x1 - x0, h: y1 - y0 } : null;
}
