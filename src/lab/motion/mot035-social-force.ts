import { defineMotionDemo } from '../framework/motionLab';
import { clamp, closestOnSegment, heat, SpatialHash } from '../framework/crowdKit';

/** MOT-035 ソーシャルフォース：駆動力＋他者・壁からの指数的な斥力で狭い出口から退出する */
export default defineMotionDemo({
  id: 'MOT-035',
  notes: 'Helbing のソーシャルフォースモデル。加速度 = (v0·e − v)/τ（駆動力）＋ Σ A·exp((r_ij − d)/B)·n（他者の心理的斥力）＋ 接触時の押し返し k(r_ij − d)·n ＋ 壁からの同様の力。e は出口の開口部の最寄り点へ向かう方向。色は半径1以内の局所密度（青=疎→赤=密）。出口の前に弧状の詰まりができる。ドラッグで出口の位置を動かす。',
  params: [
    { key: 'exitW', label: '出口の幅', type: 'number', min: 0.6, max: 6, step: 0.05, default: 1.4 },
    { key: 'v0', label: '望む速度', type: 'number', min: 0.3, max: 4, step: 0.05, default: 1.6 },
    { key: 'count', label: '人数', type: 'number', min: 10, max: 260, step: 1, default: 140 },
    { key: 'A', label: '斥力の強さ A', type: 'number', min: 0, max: 30, step: 0.1, default: 8 },
    { key: 'refill', label: '出た人を部屋へ戻す', type: 'bool', default: true },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    const { w, h } = env.bounds();
    const xL = -w + 0.6, xw = w * 0.35, yB = -h + 0.6, yT = h - 0.6;
    let ey = 0;
    const B = 0.25, K = 1200, TAU = 0.5;
    const xs = new Float32Array(n), ys = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n);
    const rad = new Float32Array(n), dens = new Float32Array(n);
    const trails = Array.from({ length: n }, () => [] as number[]);
    const hash = new SpatialHash(1.2);
    let passed = 0, t = 0;
    const recent: number[] = [];
    const spawn = (i: number) => {
      for (let tries = 0; tries < 30; tries++) {
        const x = xL + 0.5 + env.rng() * (xw - xL - 1.5), y = yB + 0.5 + env.rng() * (yT - yB - 1);
        let ok = true;
        for (let j = 0; j < n && ok; j++) if (j !== i && Math.hypot(xs[j] - x, ys[j] - y) < 0.6) ok = false;
        xs[i] = x; ys[i] = y;
        if (ok) break;
      }
      vx[i] = vy[i] = 0;
      trails[i].length = 0;
    };
    for (let i = 0; i < n; i++) { rad[i] = 0.22 + env.rng() * 0.08; xs[i] = 1e3 + i; ys[i] = 1e3; }
    for (let i = 0; i < n; i++) spawn(i);
    const walls = (ew: number): [number, number, number, number][] => [
      [xL, yB, xw, yB], [xL, yT, xw, yT], [xL, yB, xL, yT],
      [xw, yB, xw, ey - ew / 2], [xw, ey + ew / 2, xw, yT],
    ];
    return {
      step(dt, p) {
        if (dt <= 0) return;
        t += dt;
        const ew = Number(p.exitW), v0 = Number(p.v0), A = Number(p.A);
        const ws = walls(ew);
        const sub = 3, hdt = dt / sub;
        for (let s = 0; s < sub; s++) {
          hash.build(xs, ys, n);
          for (let i = 0; i < n; i++) {
            const x = xs[i], y = ys[i];
            // 望む方向：部屋の中なら開口部の最寄り点へ、外なら右へ
            let ex = 1, ey2 = 0;
            if (x < xw + 0.3) {
              const gy = clamp(y, ey - ew / 2 + rad[i], ey + ew / 2 - rad[i]);
              const dx = xw + 0.6 - x, dy = gy - y, d = Math.hypot(dx, dy) || 1;
              ex = dx / d; ey2 = dy / d;
            }
            let ax = (v0 * ex - vx[i]) / TAU, ay = (v0 * ey2 - vy[i]) / TAU;
            let cnt = 0;
            hash.query(x, y, 2, (j) => {
              if (j === i) return;
              const ox = x - xs[j], oy = y - ys[j], d = Math.hypot(ox, oy);
              if (d > 2 || d < 1e-5) return;
              if (d < 1) cnt++;
              const rij = rad[i] + rad[j];
              let f = A * Math.exp((rij - d) / B);
              if (d < rij) f += K * (rij - d);
              ax += (f * ox) / d;
              ay += (f * oy) / d;
            });
            dens[i] = cnt / Math.PI;
            for (const [wx1, wy1, wx2, wy2] of ws) {
              const [qx, qy] = closestOnSegment(x, y, wx1, wy1, wx2, wy2);
              const ox = x - qx, oy = y - qy, d = Math.hypot(ox, oy);
              if (d > 1.5 || d < 1e-5) continue;
              let f = A * Math.exp((rad[i] - d) / B);
              if (d < rad[i]) f += K * (rad[i] - d);
              ax += (f * ox) / d;
              ay += (f * oy) / d;
            }
            vx[i] += ax * hdt;
            vy[i] += ay * hdt;
            const sp = Math.hypot(vx[i], vy[i]), vm = v0 * 1.3;
            if (sp > vm) { vx[i] *= vm / sp; vy[i] *= vm / sp; }
          }
          for (let i = 0; i < n; i++) { xs[i] += vx[i] * hdt; ys[i] += vy[i] * hdt; }
        }
        for (let i = 0; i < n; i++) {
          const tr = trails[i];
          tr.push(xs[i], ys[i]);
          if (tr.length > 120) tr.splice(0, 2);
          if (xs[i] > w - 0.3 && xs[i] < 500) {
            passed++;
            recent.push(t);
            if (p.refill) spawn(i);
            else { xs[i] = 1e3 + i * 3; ys[i] = 1e3; vx[i] = vy[i] = 0; tr.length = 0; }
          }
        }
        while (recent.length && t - recent[0] > 10) recent.shift();
      },
      draw(g, p) {
        g.grid(1, 0x141828);
        const ew = Number(p.exitW);
        for (const [a, b, c, d] of walls(ew)) {
          g.line(a, b, c, d, 0xd8def5);
          g.line(a + 0.05, b + 0.05, c + 0.05, d + 0.05, 0xd8def5);
        }
        g.line(xw, ey - ew / 2, xw, ey + ew / 2, 0x7dff8a, 0.6);
        for (let i = 0; i < n; i++) {
          if (xs[i] > 500) continue;
          const col = heat(dens[i] / 2.2);
          if (p.showTrails) g.polyline(trails[i], col, { fade: true, alpha: 0.35 });
          g.circle(xs[i], ys[i], rad[i], col, { fill: true, segments: 10 });
          g.line(xs[i], ys[i], xs[i] + vx[i] * 0.4, ys[i] + vy[i] * 0.4, 0xffffff, 0.6);
        }
      },
      pointer(_x, y, down) {
        if (down) ey = clamp(y, yB + 1.5, yT - 1.5);
      },
      status(p) {
        let maxD = 0, inside = 0;
        for (let i = 0; i < n; i++) { if (xs[i] < xw) inside++; maxD = Math.max(maxD, dens[i]); }
        return `通過 ${passed} 人 · 直近10秒の流量 ${(recent.length / 10).toFixed(2)} 人/秒 · 室内 ${inside} 人 · 最大密度 ${maxD.toFixed(1)} 人/単位² · 出口幅 ${Number(p.exitW).toFixed(2)} · ドラッグで出口を移動`;
      },
    };
  },
});
