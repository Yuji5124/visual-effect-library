import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { PointerTracker } from '../framework/steerKit';

/** MOT-008 cubic-bezier のタイミング曲線：x(s)=t をニュートン法＋二分法で解いて y(s) を得る */
const bez = (p1: number, p2: number, s: number) => {
  const u = 1 - s;
  return 3 * u * u * s * p1 + 3 * u * s * s * p2 + s * s * s;
};
const dbez = (p1: number, p2: number, s: number) => {
  const u = 1 - s;
  return 3 * u * u * p1 + 6 * u * s * (p2 - p1) + 3 * s * s * (1 - p2);
};

/** x(s)=t の解 s と、使った反復回数 */
function solveS(x1: number, x2: number, t: number): [number, number] {
  let s = t;
  for (let i = 0; i < 8; i++) {
    const err = bez(x1, x2, s) - t;
    if (Math.abs(err) < 1e-6) return [s, i];
    const d = dbez(x1, x2, s);
    if (Math.abs(d) < 1e-6) break;
    s -= err / d;
    if (s < 0 || s > 1) break;
  }
  // ニュートン法が不安定なら二分法（x(s) は x1,x2∈[0,1] で単調増加）
  let lo = 0, hi = 1;
  s = t;
  let n = 8;
  while (hi - lo > 1e-6 && n < 60) {
    s = (lo + hi) / 2;
    if (bez(x1, x2, s) < t) lo = s; else hi = s;
    n++;
  }
  return [s, n];
}

const PRESETS: Record<string, [number, number, number, number]> = {
  ease: [0.25, 0.1, 0.25, 1],
  easeInOut: [0.42, 0, 0.58, 1],
  easeOut: [0, 0, 0.58, 1],
  back: [0.68, -0.55, 0.27, 1.55],
};

export default defineMotionDemo({
  id: 'MOT-008',
  notes: 'CSS と同じ (0,0)-(x1,y1)-(x2,y2)-(1,1) の3次ベジェ。時刻 t に対し x(s)=t をニュートン法（失敗時は二分法）で解き、y(s) を進行率にする。左のグラフの2つの制御点はドラッグ可能、右の溝では曲線どおりの点（白）と等速の点（灰）が同時に動く。ボタンでプリセット。',
  params: [
    { key: 'x1', label: '制御点1 x', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'y1', label: '制御点1 y', type: 'number', min: -0.8, max: 1.8, step: 0.01, default: 0.1 },
    { key: 'x2', label: '制御点2 x', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'y2', label: '制御点2 y', type: 'number', min: -0.8, max: 1.8, step: 0.01, default: 1 },
    { key: 'duration', label: '所要時間（秒）', type: 'number', min: 0.3, max: 4, step: 0.05, default: 1.4 },
  ],
  extraActions: [
    { key: 'ease', label: 'ease' },
    { key: 'easeInOut', label: 'ease-in-out' },
    { key: 'easeOut', label: 'ease-out' },
    { key: 'back', label: 'back 風（行き過ぎ）' },
  ],
  create(env) {
    const pt = new PointerTracker();
    let h = [0.25, 0.1, 0.25, 1];
    let paramKey = '';
    let drag = -1;
    let time = 0;
    let iters = 0, sNow = 0, resid = 0;
    const trail = new Trail(200);
    const layout = () => {
      const { w } = env.bounds();
      const S = Math.min(7.4, w * 0.62);
      const gx = -w + 1.2, gy = -S * 0.5 * 1.3 + 0.2;
      // 縦は y=-0.5..1.5 を描く
      return { gx, gy, S, mx: (v: number) => gx + v * S, my: (v: number) => gy + (v + 0.5) * S * 0.65, tx: gx + S + 2.5, w };
    };
    const sync = (p: Record<string, unknown>) => {
      const k = `${p.x1},${p.y1},${p.x2},${p.y2}`;
      if (k !== paramKey) {
        paramKey = k;
        h = [Number(p.x1), Number(p.y1), Number(p.x2), Number(p.y2)];
      }
    };
    return {
      step(dt, p) {
        sync(p);
        time += dt;
        const d = Number(p.duration);
        const ph = (time % (d * 1.6)) / d;
        const t = Math.min(1, ph);
        const [s, n] = solveS(h[0], h[2], t);
        sNow = s;
        iters = n;
        resid = Math.abs(bez(h[0], h[2], s) - t);
        if (ph < 1) {
          const L = layout();
          trail.push(L.mx(t), L.my(bez(h[1], h[3], s)));
        } else if (ph > 1.5) trail.clear();
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        sync(p);
        const L = layout();
        const { mx, my } = L;
        g.rect(mx(0), my(0), L.S, my(1) - my(0), 0x3a4070);
        g.rect(mx(0), my(-0.5), L.S, my(1.5) - my(-0.5), 0x1d2238);
        // 対角（等速）
        g.line(mx(0), my(0), mx(1), my(1), 0x5a6090, 0.6);
        // 制御多角形
        g.line(mx(0), my(0), mx(h[0]), my(h[1]), 0xff7dc0, 0.8);
        g.line(mx(1), my(1), mx(h[2]), my(h[3]), 0x6bd0ff, 0.8);
        const pts: number[] = [];
        for (let i = 0; i <= 80; i++) {
          const s = i / 80;
          pts.push(mx(bez(h[0], h[2], s)), my(bez(h[1], h[3], s)));
        }
        g.polyline(pts, 0xffffff);
        g.circle(mx(h[0]), my(h[1]), 0.32, 0xff7dc0, { fill: drag === 0 });
        g.circle(mx(h[0]), my(h[1]), 0.32, 0xff7dc0);
        g.circle(mx(h[2]), my(h[3]), 0.32, 0x6bd0ff, { fill: drag === 1 });
        g.circle(mx(h[2]), my(h[3]), 0.32, 0x6bd0ff);
        const d = Number(p.duration);
        const t = Math.min(1, (time % (d * 1.6)) / d);
        const y = bez(h[1], h[3], sNow);
        if (p.showTrails) g.polyline(trail.points(), 0xffd36b, { fade: true });
        g.line(mx(t), my(-0.5), mx(t), my(y), 0xffd36b, 0.4);
        g.line(mx(t), my(y), L.tx, my(y), 0xffd36b, 0.3);
        g.circle(mx(t), my(y), 0.18, 0xffd36b, { fill: true });
        // 右：縦の溝で実際に動く物体（白＝曲線、灰＝等速）
        const tx = L.tx;
        if (tx + 2 < L.w) {
          g.line(tx, my(0), tx, my(1), 0x5a6090);
          g.line(tx + 1.6, my(0), tx + 1.6, my(1), 0x5a6090);
          g.rect(tx - 0.5, my(y) - 0.5, 1, 1, 0xffffff, { fill: true });
          g.rect(tx + 1.1, my(t) - 0.5, 1, 1, 0x7a7f9a, { fill: true });
          // 横方向の動き（大きな帯）
          const bx0 = tx + 3.2, bx1 = L.w - 1;
          if (bx1 - bx0 > 2) {
            for (let k = 0; k < 2; k++) {
              const yy = my(0.75) - k * 2.4;
              const v = k === 0 ? y : t;
              g.line(bx0, yy, bx1, yy, 0x3a4070);
              g.circle(bx0 + (bx1 - bx0) * v, yy, 0.55, k === 0 ? 0xffd36b : 0x7a7f9a, { fill: true });
            }
          }
        }
      },
      pointer(x, y, down) {
        const ev = pt.update(down);
        const L = layout();
        const ux = (x - L.gx) / L.S, uy = (y - L.gy) / (L.S * 0.65) - 0.5;
        if (ev === 'press') {
          const d0 = Math.hypot(L.mx(h[0]) - x, L.my(h[1]) - y), d1 = Math.hypot(L.mx(h[2]) - x, L.my(h[3]) - y);
          drag = Math.min(d0, d1) < 1.2 ? (d0 < d1 ? 0 : 1) : -1;
          if (drag < 0) time = 0;
        }
        if ((ev === 'press' || ev === 'drag') && drag >= 0) {
          h[drag * 2] = Math.max(0, Math.min(1, ux));
          h[drag * 2 + 1] = Math.max(-0.8, Math.min(1.8, uy));
        }
        if (ev === 'release') drag = -1;
      },
      action(key) {
        const pr = PRESETS[key];
        if (pr) return { x1: pr[0], y1: pr[1], x2: pr[2], y2: pr[3] };
      },
      status() {
        return `cubic-bezier(${h.map((v) => v.toFixed(2)).join(', ')}) · s=${sNow.toFixed(3)} · 反復 ${iters} 回${iters >= 8 ? '（二分法）' : '（ニュートン）'} · 残差 ${resid.toExponential(1)} · 制御点をドラッグ`;
      },
    };
  },
});
