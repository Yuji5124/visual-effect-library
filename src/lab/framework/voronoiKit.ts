/**
 * ボウヤー・ワトソン法のドロネー三角形分割と、そこから求めるボロノイセル（矩形で切り取り）。
 * WRD-019 など城郭都市・区画生成用。O(n²) の素直な実装（数百点向け）。
 */

export interface Pt {
  x: number;
  y: number;
}

export interface Delaunay {
  /** 三角形の頂点番号（3つ組） */
  triangles: number[];
  /** 各点のドロネー隣接点 */
  neighbors: number[][];
}

interface Tri {
  a: number;
  b: number;
  c: number;
  cx: number;
  cy: number;
  r2: number;
}

function circum(P: Pt[], a: number, b: number, c: number): Tri {
  const ax = P[a].x, ay = P[a].y, bx = P[b].x, by = P[b].y, cx = P[c].x, cy = P[c].y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  if (Math.abs(d) < 1e-12) return { a, b, c, cx: 0, cy: 0, r2: Infinity };
  const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
  const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
  const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
  return { a, b, c, cx: ux, cy: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
}

/** ボウヤー・ワトソン法：点を1つずつ加え、外接円に入る三角形を消して穴を扇形に張り直す */
export function delaunay(points: Pt[]): Delaunay {
  const n = points.length;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const d = Math.max(maxX - minX, maxY - minY, 1e-6) * 50;
  const mx = (minX + maxX) / 2, my = (minY + maxY) / 2;
  // 全点を含む巨大な三角形（あとで取り除く）
  const P: Pt[] = [...points, { x: mx - d, y: my - d }, { x: mx + d, y: my - d }, { x: mx, y: my + d }];
  let tris: Tri[] = [circum(P, n, n + 1, n + 2)];
  for (let i = 0; i < n; i++) {
    const px = P[i].x, py = P[i].y;
    const bad: Tri[] = [];
    const keep: Tri[] = [];
    for (const t of tris) {
      const dx = px - t.cx, dy = py - t.cy;
      if (dx * dx + dy * dy < t.r2) bad.push(t);
      else keep.push(t);
    }
    // 穴の境界辺 = 悪い三角形のうち1回だけ現れる辺
    const edges = new Map<string, [number, number]>();
    for (const t of bad) {
      for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]] as [number, number][]) {
        const k = u < v ? `${u},${v}` : `${v},${u}`;
        if (edges.has(k)) edges.delete(k);
        else edges.set(k, [u, v]);
      }
    }
    for (const [u, v] of edges.values()) keep.push(circum(P, u, v, i));
    tris = keep;
  }
  const triangles: number[] = [];
  const nb = Array.from({ length: n }, () => new Set<number>());
  for (const t of tris) {
    if (t.a >= n || t.b >= n || t.c >= n) continue;
    triangles.push(t.a, t.b, t.c);
    nb[t.a].add(t.b).add(t.c);
    nb[t.b].add(t.a).add(t.c);
    nb[t.c].add(t.a).add(t.b);
  }
  // 凸包付近の辺は超三角形の頂点と組になっていたため、超三角形を含む三角形からも隣接を拾う
  for (const t of tris) {
    const vs = [t.a, t.b, t.c].filter((v) => v < n);
    if (vs.length === 2) {
      nb[vs[0]].add(vs[1]);
      nb[vs[1]].add(vs[0]);
    }
  }
  return { triangles, neighbors: nb.map((s) => [...s]) };
}

export interface VoronoiCell {
  /** 多角形の頂点（反時計回りとは限らない） */
  poly: [number, number][];
  /** 辺 poly[k]→poly[k+1] の向こう側のセル番号（-1 は外枠） */
  labels: number[];
}

/**
 * ボロノイセル：外枠の矩形を、ドロネー隣接点との垂直二等分線で順に切り取る。
 * 各辺に「隣のセル番号」を残すので、城壁（内外の境界）などを辺単位で取り出せる。
 */
export function voronoiCells(points: Pt[], neighbors: number[][], box: [number, number, number, number]): VoronoiCell[] {
  const [x0, y0, x1, y1] = box;
  return points.map((p, i) => {
    let poly: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    let labels = [-1, -1, -1, -1];
    for (const j of neighbors[i]) {
      const q = points[j];
      const nx = q.x - p.x, ny = q.y - p.y;
      const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
      const side = (v: [number, number]) => (v[0] - mx) * nx + (v[1] - my) * ny;
      const outP: [number, number][] = [];
      const outL: number[] = [];
      for (let k = 0; k < poly.length; k++) {
        const A = poly[k], B = poly[(k + 1) % poly.length];
        const sa = side(A), sb = side(B);
        const inA = sa <= 0, inB = sb <= 0;
        if (inA) {
          outP.push(A);
          outL.push(labels[k]);
        }
        if (inA !== inB) {
          const t = sa / (sa - sb);
          const I: [number, number] = [A[0] + (B[0] - A[0]) * t, A[1] + (B[1] - A[1]) * t];
          outP.push(I);
          outL.push(inA ? j : labels[k]);
        }
      }
      poly = outP;
      labels = outL;
      if (poly.length < 3) break;
    }
    return { poly, labels };
  });
}

/** 多角形の面積（符号付き）と重心 */
export function polygonCentroid(poly: [number, number][]): { area: number; x: number; y: number } {
  let a = 0, cx = 0, cy = 0;
  for (let k = 0; k < poly.length; k++) {
    const [x0, y0] = poly[k], [x1, y1] = poly[(k + 1) % poly.length];
    const c = x0 * y1 - x1 * y0;
    a += c;
    cx += (x0 + x1) * c;
    cy += (y0 + y1) * c;
  }
  a /= 2;
  if (Math.abs(a) < 1e-12) return { area: 0, x: poly[0]?.[0] ?? 0, y: poly[0]?.[1] ?? 0 };
  return { area: a, x: cx / (6 * a), y: cy / (6 * a) };
}

/** 点が多角形の内側か（偶奇則） */
export function pointInPolygon(x: number, y: number, poly: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
