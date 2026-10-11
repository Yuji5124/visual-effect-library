/** MOTION（MOT-A/B）用の小さな2Dベクトル・ステアリング補助。すべて number の組で扱い、割り当てを避ける */

export interface Mover {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 角度を -π..π に折り返す */
export function wrapAngle(a: number): number {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/** ベクトルの長さを max 以下に切り詰める */
export function truncate(x: number, y: number, max: number): [number, number] {
  const l = Math.hypot(x, y);
  if (l > max && l > 0) return [(x / l) * max, (y / l) * max];
  return [x, y];
}

/** Seek：目標へ最大速度で向かう望む速度 − 現在の速度 */
export function seekForce(m: Mover, tx: number, ty: number, maxSpeed: number): [number, number] {
  const dx = tx - m.x, dy = ty - m.y;
  const d = Math.hypot(dx, dy) || 1;
  return [(dx / d) * maxSpeed - m.vx, (dy / d) * maxSpeed - m.vy];
}

export function fleeForce(m: Mover, tx: number, ty: number, maxSpeed: number): [number, number] {
  const [fx, fy] = seekForce(m, tx, ty, maxSpeed);
  return [-fx - 2 * m.vx, -fy - 2 * m.vy];
}

/** Arrive：減速半径の内側では距離に比例して望む速さを落とす */
export function arriveForce(m: Mover, tx: number, ty: number, maxSpeed: number, slowRadius: number): [number, number] {
  const dx = tx - m.x, dy = ty - m.y;
  const d = Math.hypot(dx, dy);
  if (d < 1e-6) return [-m.vx, -m.vy];
  const speed = d < slowRadius ? (maxSpeed * d) / slowRadius : maxSpeed;
  return [(dx / d) * speed - m.vx, (dy / d) * speed - m.vy];
}

/** 力を加えて速度・位置を進める（半陰的オイラー） */
export function integrate(m: Mover, fx: number, fy: number, maxForce: number, maxSpeed: number, dt: number): void {
  const [ax, ay] = truncate(fx, fy, maxForce);
  const [vx, vy] = truncate(m.vx + ax * dt, m.vy + ay * dt, maxSpeed);
  m.vx = vx;
  m.vy = vy;
  m.x += vx * dt;
  m.y += vy * dt;
}

/** 画面端で反対側へ回り込む。回り込んだら true */
export function wrapBounds(m: Mover, w: number, h: number): boolean {
  let wrapped = false;
  if (m.x > w) { m.x -= 2 * w; wrapped = true; }
  if (m.x < -w) { m.x += 2 * w; wrapped = true; }
  if (m.y > h) { m.y -= 2 * h; wrapped = true; }
  if (m.y < -h) { m.y += 2 * h; wrapped = true; }
  return wrapped;
}

/**
 * 迎撃の時刻：|P + V t| = s t（P,V は目標の相対位置・速度、s は追跡者の速さ）の最小の正の解。
 * 解がなければ -1
 */
export function interceptTime(px: number, py: number, vx: number, vy: number, s: number): number {
  const a = vx * vx + vy * vy - s * s;
  const b = 2 * (px * vx + py * vy);
  const c = px * px + py * py;
  if (Math.abs(a) < 1e-9) return b < 0 ? -c / b : -1;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const r = Math.sqrt(disc);
  const t1 = (-b - r) / (2 * a), t2 = (-b + r) / (2 * a);
  const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
  if (lo > 0) return lo;
  if (hi > 0) return hi;
  return -1;
}

/** 線分 ab 上で点 p に最も近い点と、そのパラメーター u（0..1） */
export function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): [number, number, number] {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  const u = l2 > 0 ? clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1) : 0;
  return [ax + dx * u, ay + dy * u, u];
}

/** 点列（x,y 交互）の中で、点 (x,y) から半径 r 内にある最も近い点の番号。なければ -1 */
export function pickHandle(pts: ArrayLike<number>, x: number, y: number, r: number): number {
  let best = -1, bd = r * r;
  for (let i = 0; i < pts.length / 2; i++) {
    const d = (pts[i * 2] - x) ** 2 + (pts[i * 2 + 1] - y) ** 2;
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

/**
 * pointer(x,y,down) を「押した瞬間／ドラッグ中／離した」に分ける。
 * ビューアは押下中の移動も down=true で送るため、前回の状態を覚えて区別する。
 */
export class PointerTracker {
  private prev = false;
  /** 'press' | 'drag' | 'release' | 'hover' */
  update(down: boolean): 'press' | 'drag' | 'release' | 'hover' {
    const was = this.prev;
    this.prev = down;
    if (down && !was) return 'press';
    if (down) return 'drag';
    if (was) return 'release';
    return 'hover';
  }
}

/** 色相（0..1）から表示用の16進色 */
export function hueColor(h: number, s = 0.75, l = 0.6): number {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255);
}
