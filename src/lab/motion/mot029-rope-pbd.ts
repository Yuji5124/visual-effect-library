import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';

interface Rope {
  x: Float32Array; y: Float32Array; px: Float32Array; py: Float32Array;
  pinned: Uint8Array; rest: number; n: number; color: number;
}

function makeRope(n: number, ax: number, ay: number, bx: number, by: number, slack: number, color: number): Rope {
  const r: Rope = {
    x: new Float32Array(n), y: new Float32Array(n), px: new Float32Array(n), py: new Float32Array(n),
    pinned: new Uint8Array(n), rest: (Math.hypot(bx - ax, by - ay) * slack) / (n - 1), n, color,
  };
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    r.x[i] = r.px[i] = ax + (bx - ax) * t;
    r.y[i] = r.py[i] = ay + (by - ay) * t;
  }
  return r;
}

/** MOT-029 ロープと鎖：Verlet 積分＋距離拘束の反復（位置ベース動力学） */
export default defineMotionDemo({
  id: 'MOT-029',
  notes: '各質点を Verlet 積分 x′ = x + (x − x_prev)(1−減衰) + g·dt² で進めた後、隣り合う質点の距離を元の長さへ戻す補正を指定回数だけ反復する。反復が少ないとロープが伸び、多いと硬い。左は上端固定で先端が自由なロープ、右は両端固定の鎖。どの質点もドラッグで掴める。',
  params: [
    { key: 'iters', label: '反復回数', type: 'number', min: 1, max: 60, step: 1, default: 12 },
    { key: 'count', label: '質点の数', type: 'number', min: 5, max: 80, step: 1, default: 30 },
    { key: 'gravity', label: '重力', type: 'number', min: 0, max: 40, step: 0.5, default: 14 },
    { key: 'damping', label: '減衰', type: 'number', min: 0, max: 0.2, step: 0.001, default: 0.01 },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const { w } = env.bounds();
    const n = Math.round(Number(p0.count));
    const rope = makeRope(n, -w * 0.45, 8, -w * 0.45 + 9, 8, 1, 0xffd166);
    rope.pinned[0] = 1;
    const chain = makeRope(n, w * 0.05, 6, w * 0.85, 6, 1.25, 0x6fd3ff);
    chain.pinned[0] = 1;
    chain.pinned[n - 1] = 1;
    const ropes = [rope, chain];
    const tipTrail = new Trail(300);
    let grab: { r: Rope; i: number } | null = null;
    let gx = 0, gy = 0;
    const stretch = [1, 1];

    return {
      step(dt, p) {
        const g = Number(p.gravity), damp = Number(p.damping), iters = Math.round(Number(p.iters));
        for (const r of ropes) {
          for (let i = 0; i < r.n; i++) {
            if (r.pinned[i]) continue;
            const vx = (r.x[i] - r.px[i]) * (1 - damp), vy = (r.y[i] - r.py[i]) * (1 - damp);
            r.px[i] = r.x[i];
            r.py[i] = r.y[i];
            r.x[i] += vx;
            r.y[i] += vy - g * dt * dt;
          }
          if (grab && grab.r === r) { r.x[grab.i] = gx; r.y[grab.i] = gy; }
          // 距離拘束：固定点は動かさず、残りの質点で誤差を分け合う
          for (let k = 0; k < iters; k++) {
            for (let i = 0; i < r.n - 1; i++) {
              const dx = r.x[i + 1] - r.x[i], dy = r.y[i + 1] - r.y[i];
              const d = Math.hypot(dx, dy) || 1e-6;
              const fixA = r.pinned[i] || (grab?.r === r && grab.i === i);
              const fixB = r.pinned[i + 1] || (grab?.r === r && grab.i === i + 1);
              if (fixA && fixB) continue;
              const diff = (d - r.rest) / d;
              const wa = fixA ? 0 : fixB ? 1 : 0.5, wb = fixB ? 0 : fixA ? 1 : 0.5;
              r.x[i] += dx * diff * wa; r.y[i] += dy * diff * wa;
              r.x[i + 1] -= dx * diff * wb; r.y[i + 1] -= dy * diff * wb;
            }
          }
          // 床
          for (let i = 0; i < r.n; i++) if (r.y[i] < -9.6) { r.y[i] = -9.6; r.px[i] = r.x[i] + (r.px[i] - r.x[i]) * 0.5; }
        }
        ropes.forEach((r, k) => {
          let len = 0;
          for (let i = 0; i < r.n - 1; i++) len += Math.hypot(r.x[i + 1] - r.x[i], r.y[i + 1] - r.y[i]);
          stretch[k] = len / (r.rest * (r.n - 1));
        });
        tipTrail.push(rope.x[n - 1], rope.y[n - 1]);
      },
      draw(g, p) {
        g.grid(1);
        const { w } = env.bounds();
        g.line(-w, -9.6, w, -9.6, 0x5a6390);
        if (p.showTrails) g.polyline(tipTrail.points(), 0xff8a5a, { fade: true, alpha: 0.7 });
        for (const r of ropes) {
          for (let i = 0; i < r.n - 1; i++) {
            // 伸びている区間ほど赤く
            const d = Math.hypot(r.x[i + 1] - r.x[i], r.y[i + 1] - r.y[i]) / r.rest;
            const col = d > 1.02 ? (d > 1.15 ? 0xff3355 : 0xff8a5a) : r.color;
            g.line(r.x[i], r.y[i], r.x[i + 1], r.y[i + 1], col);
          }
          for (let i = 0; i < r.n; i++) {
            g.circle(r.x[i], r.y[i], r.pinned[i] ? 0.25 : 0.12, r.pinned[i] ? 0xffffff : r.color, { fill: true, segments: 8 });
            // 速度（Verlet の暗黙の速度 x − x_prev）
            if (i % 3 === 0) g.line(r.x[i], r.y[i], r.x[i] + (r.x[i] - r.px[i]) * 6, r.y[i] + (r.y[i] - r.py[i]) * 6, 0x7dff8a, 0.5);
          }
        }
        if (grab) g.circle(gx, gy, 0.45, 0xffffff);
      },
      pointer(x, y, down) {
        if (down && !grab) {
          let best = 1.2;
          for (const r of ropes) for (let i = 0; i < r.n; i++) {
            const d = Math.hypot(r.x[i] - x, r.y[i] - y);
            if (d < best) { best = d; grab = { r, i }; }
          }
        }
        if (!down) grab = null;
        gx = x;
        gy = y;
      },
      action(key) {
        if (key === 'flick') for (let i = 1; i < n; i++) rope.px[i] = rope.x[i] - 0.5 * (i / n);
      },
      status() {
        return `伸び率：ロープ ${((stretch[0] - 1) * 100).toFixed(1)}% · 鎖 ${((stretch[1] - 1) * 100).toFixed(1)}% · 質点 ${n}×2 · 質点をドラッグで掴む`;
      },
    };
  },
  extraActions: [{ key: 'flick', label: '↗ ロープを弾く' }],
});
