/** MOTION（MOT-C）用の2D関節チェーン補助：FK・CCD・FABRIK・2ボーン解析IK */
import type { Draw2D } from './draw2d';

/** 関節位置（x,y 交互、n+1 点）を相対角から計算する。angles[i] は親の骨に対する回転 */
export function forwardKinematics(baseX: number, baseY: number, baseAngle: number, angles: ArrayLike<number>, lengths: ArrayLike<number>, out: Float32Array): void {
  let x = baseX, y = baseY, a = baseAngle;
  out[0] = x;
  out[1] = y;
  for (let i = 0; i < lengths.length; i++) {
    a += angles[i];
    x += Math.cos(a) * lengths[i];
    y += Math.sin(a) * lengths[i];
    out[(i + 1) * 2] = x;
    out[(i + 1) * 2 + 1] = y;
  }
}

/**
 * CCD を1反復（先端側の関節から根元へ1巡）。angles を書き換え、joints も更新する。
 * limit は各関節の相対角の上限（ラジアン、根元は制限しない）。
 */
export function ccdIteration(baseX: number, baseY: number, baseAngle: number, angles: Float32Array, lengths: ArrayLike<number>, joints: Float32Array, tx: number, ty: number, limit: number): void {
  const n = lengths.length;
  for (let i = n - 1; i >= 0; i--) {
    forwardKinematics(baseX, baseY, baseAngle, angles, lengths, joints);
    const jx = joints[i * 2], jy = joints[i * 2 + 1];
    const ex = joints[n * 2], ey = joints[n * 2 + 1];
    const a1 = Math.atan2(ey - jy, ex - jx);
    const a2 = Math.atan2(ty - jy, tx - jx);
    let d = a2 - a1;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    let na = angles[i] + d;
    while (na > Math.PI) na -= Math.PI * 2;
    while (na < -Math.PI) na += Math.PI * 2;
    if (i > 0) na = Math.max(-limit, Math.min(limit, na));
    angles[i] = na;
  }
  forwardKinematics(baseX, baseY, baseAngle, angles, lengths, joints);
}

/** FABRIK 前進段：先端を目標に置き、骨の長さを保って根元側へ引き寄せる */
export function fabrikForward(joints: Float32Array, lengths: ArrayLike<number>, tx: number, ty: number): void {
  const n = lengths.length;
  joints[n * 2] = tx;
  joints[n * 2 + 1] = ty;
  for (let i = n - 1; i >= 0; i--) pull(joints, i, i + 1, lengths[i]);
}

/** FABRIK 後退段：根元を固定位置に戻し、先端側へ順に直す */
export function fabrikBackward(joints: Float32Array, lengths: ArrayLike<number>, bx: number, by: number): void {
  joints[0] = bx;
  joints[1] = by;
  for (let i = 0; i < lengths.length; i++) pull(joints, i + 1, i, lengths[i]);
}

/** joints[a] を joints[b] から長さ len の位置へ（b の方向を保ったまま）移す */
function pull(j: Float32Array, a: number, b: number, len: number): void {
  const dx = j[a * 2] - j[b * 2], dy = j[a * 2 + 1] - j[b * 2 + 1];
  const d = Math.hypot(dx, dy) || 1e-6;
  j[a * 2] = j[b * 2] + (dx / d) * len;
  j[a * 2 + 1] = j[b * 2 + 1] + (dy / d) * len;
}

/**
 * 2ボーン解析IK。根元 (ax,ay)、骨 a,b、目標 (tx,ty)。bendSign=+1/-1 で肘の側を選ぶ。
 * 戻り値：[肘x, 肘y, 先端x, 先端y, 届いたか(1/0)]
 */
export function twoBoneIK(ax: number, ay: number, la: number, lb: number, tx: number, ty: number, bendSign: number): [number, number, number, number, number] {
  const dx = tx - ax, dy = ty - ay;
  const dist = Math.hypot(dx, dy);
  const c = Math.max(Math.abs(la - lb) + 1e-4, Math.min(la + lb - 1e-4, dist));
  const base = Math.atan2(dy, dx);
  // 余弦定理：根元での角 A（根元→目標 と 上腕 のなす角）
  const cosA = (la * la + c * c - lb * lb) / (2 * la * c);
  const A = Math.acos(Math.max(-1, Math.min(1, cosA)));
  const ang = base + bendSign * A;
  const ex = ax + Math.cos(ang) * la, ey = ay + Math.sin(ang) * la;
  const ux = dist > 1e-6 ? dx / dist : 1, uy = dist > 1e-6 ? dy / dist : 0;
  return [ex, ey, ax + ux * c, ay + uy * c, dist <= la + lb ? 1 : 0];
}

/** 関節チェーンを描く（骨の線＋関節の円） */
export function drawChain(g: Draw2D, joints: ArrayLike<number>, color: number, opts: { alpha?: number; jointR?: number; fillJoints?: boolean } = {}): void {
  const a = opts.alpha ?? 1, r = opts.jointR ?? 0.18;
  const n = joints.length / 2;
  for (let i = 1; i < n; i++) {
    const x0 = joints[(i - 1) * 2], y0 = joints[(i - 1) * 2 + 1], x1 = joints[i * 2], y1 = joints[i * 2 + 1];
    // 骨を細長い四角形（2三角形）で太く描く
    const dx = x1 - x0, dy = y1 - y0, l = Math.hypot(dx, dy) || 1;
    const nx = (-dy / l) * r * 0.55, ny = (dx / l) * r * 0.55;
    if (opts.fillJoints !== false) {
      g.tri(x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, color, a * 0.55);
      g.tri(x0 + nx, y0 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny, color, a * 0.55);
    }
    g.line(x0, y0, x1, y1, color, a);
  }
  for (let i = 0; i < n; i++) g.circle(joints[i * 2], joints[i * 2 + 1], r, color, { fill: opts.fillJoints !== false, alpha: a, segments: 12 });
}
