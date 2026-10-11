/** MOTION の群れ・複数物体デモ（MOT-026〜050）で共有する小道具：空間ハッシュ・ベクトル計算・色 */

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
/** 角度を -π..π に畳む */
export const wrapAngle = (a: number): number => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
/** (x,y) の長さを max 以下に切り詰めた結果 */
export function limit(x: number, y: number, max: number): [number, number] {
  const l = Math.hypot(x, y);
  if (l > max && l > 0) return [(x / l) * max, (y / l) * max];
  return [x, y];
}

/** HSL（0..1）→ 0xRRGGBB（表示空間の値） */
export function hsl(h: number, s: number, l: number): number {
  h = ((h % 1) + 1) % 1;
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}

/** 0..1 を 青→緑→黄→赤 の色に（密度・速度の色分け用） */
export function heat(t: number): number {
  return hsl(0.66 - clamp(t, 0, 1) * 0.66, 0.85, 0.55);
}

/**
 * 一様格子の空間ハッシュ。毎ステップ build() し直し、query() で近傍の添字を列挙する。
 * 数百体の近傍探索を O(n) 程度にするため。
 */
export class SpatialHash {
  private heads = new Int32Array(0);
  private next = new Int32Array(0);
  private cols = 1;
  private rows = 1;
  private x0 = 0;
  private y0 = 0;
  constructor(readonly cell: number) {}

  build(xs: ArrayLike<number>, ys: ArrayLike<number>, n: number): void {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < n; i++) {
      if (xs[i] < minX) minX = xs[i];
      if (xs[i] > maxX) maxX = xs[i];
      if (ys[i] < minY) minY = ys[i];
      if (ys[i] > maxY) maxY = ys[i];
    }
    if (n === 0) minX = minY = maxX = maxY = 0;
    this.x0 = minX;
    this.y0 = minY;
    this.cols = Math.min(256, Math.floor((maxX - minX) / this.cell) + 1);
    this.rows = Math.min(256, Math.floor((maxY - minY) / this.cell) + 1);
    const nc = this.cols * this.rows;
    if (this.heads.length < nc) this.heads = new Int32Array(nc);
    if (this.next.length < n) this.next = new Int32Array(Math.max(n, 16));
    this.heads.fill(-1, 0, nc);
    for (let i = 0; i < n; i++) {
      const c = this.cellOf(xs[i], ys[i]);
      this.next[i] = this.heads[c];
      this.heads[c] = i;
    }
  }

  private cellOf(x: number, y: number): number {
    const cx = clamp(Math.floor((x - this.x0) / this.cell), 0, this.cols - 1);
    const cy = clamp(Math.floor((y - this.y0) / this.cell), 0, this.rows - 1);
    return cy * this.cols + cx;
  }

  /** (x,y) から半径 r 以内の可能性がある要素を fn に渡す（距離の判定は呼び出し側） */
  query(x: number, y: number, r: number, fn: (j: number) => void): void {
    const ax = clamp(Math.floor((x - r - this.x0) / this.cell), 0, this.cols - 1);
    const bx = clamp(Math.floor((x + r - this.x0) / this.cell), 0, this.cols - 1);
    const ay = clamp(Math.floor((y - r - this.y0) / this.cell), 0, this.rows - 1);
    const by = clamp(Math.floor((y + r - this.y0) / this.cell), 0, this.rows - 1);
    for (let cy = ay; cy <= by; cy++) {
      for (let cx = ax; cx <= bx; cx++) {
        for (let j = this.heads[cy * this.cols + cx]; j >= 0; j = this.next[j]) fn(j);
      }
    }
  }
}

/** 線分 p1-p2 と p3-p4 が交差するか（端点の接触は除く） */
export function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

/** 点 (px,py) に最も近い線分 a-b 上の点 */
export function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): [number, number] {
  const vx = bx - ax, vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  return [ax + vx * t, ay + vy * t];
}

/** 塗った扇形（中心・半径・角度範囲） */
export function fan(
  g: { tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, c: number, a?: number): void },
  x: number, y: number, r: number, a0: number, a1: number, color: number, alpha = 1,
): void {
  const n = Math.max(2, Math.ceil(Math.abs(a1 - a0) / 0.12));
  for (let i = 0; i < n; i++) {
    const t0 = a0 + ((a1 - a0) * i) / n, t1 = a0 + ((a1 - a0) * (i + 1)) / n;
    g.tri(x, y, x + Math.cos(t0) * r, y + Math.sin(t0) * r, x + Math.cos(t1) * r, y + Math.sin(t1) * r, color, alpha);
  }
}

/** ポインタ押下の立ち上がり・ドラッグを判定する小さな状態 */
export class PointerState {
  down = false;
  x = 0;
  y = 0;
  /** 今回の呼び出しが押した瞬間か */
  update(x: number, y: number, down: boolean): { pressed: boolean; released: boolean } {
    const pressed = down && !this.down;
    const released = !down && this.down;
    this.down = down;
    this.x = x;
    this.y = y;
    return { pressed, released };
  }
}
