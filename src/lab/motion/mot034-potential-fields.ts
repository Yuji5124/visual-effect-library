import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { hsl, limit } from '../framework/crowdKit';

/** MOT-034 分散と集結：引力ポテンシャルと斥力ポテンシャルの勾配でエージェントを動かす */
export default defineMotionDemo({
  id: 'MOT-034',
  notes: '各エージェントに −∇U を加える。U は集合点への引力（集結：k|x−c|²/2、包囲：k(|x−c|−R)²/2、分散：0）と、仲間ごとの斥力 k_r(1−d/R_r)²（d<R_r）と壁の斥力の和。背景はこの合計ポテンシャルの等高線（マーチングスクエア）。斥力の範囲が間隔を決め、引力を消すと一様に広がる。ドラッグで集合点を動かす。',
  params: [
    {
      key: 'mode', label: '動作', type: 'select', default: 'gather',
      options: [{ value: 'gather', label: '集結' }, { value: 'scatter', label: '分散' }, { value: 'surround', label: '円形に包囲' }],
    },
    { key: 'attract', label: '引力', type: 'number', min: 0, max: 3, step: 0.01, default: 0.6 },
    { key: 'repel', label: '斥力', type: 'number', min: 0, max: 30, step: 0.1, default: 8 },
    { key: 'range', label: '斥力の範囲', type: 'number', min: 0.5, max: 5, step: 0.05, default: 1.8 },
    { key: 'count', label: '人数', type: 'number', min: 2, max: 150, step: 1, default: 60 },
    { key: 'ring', label: '包囲の半径', type: 'number', min: 1, max: 9, step: 0.1, default: 5 },
    { key: 'contours', label: '等高線を表示', type: 'bool', default: true },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    const xs = new Float32Array(n), ys = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n);
    const trails = Array.from({ length: n }, () => new Trail(90));
    for (let i = 0; i < n; i++) { xs[i] = (env.rng() - 0.5) * 16; ys[i] = (env.rng() - 0.5) * 14; }
    let cx = 0, cy = 0;
    const attractU = (x: number, y: number, p: Record<string, unknown>) => {
      const k = Number(p.attract), d = Math.hypot(x - cx, y - cy);
      if (p.mode === 'gather') return 0.5 * k * d * d;
      if (p.mode === 'surround') return 0.5 * k * (d - Number(p.ring)) ** 2 * 2;
      return 0;
    };
    let nnAvg = 0;
    return {
      step(dt, p) {
        if (dt <= 0) return;
        const { w, h } = env.bounds();
        const kr = Number(p.repel), rr = Number(p.range), k = Number(p.attract);
        for (let i = 0; i < n; i++) {
          let fx = 0, fy = 0;
          const dx = xs[i] - cx, dy = ys[i] - cy, d = Math.hypot(dx, dy) || 1e-6;
          if (p.mode === 'gather') { fx -= k * dx; fy -= k * dy; }
          else if (p.mode === 'surround') { const g = 2 * k * (d - Number(p.ring)); fx -= (g * dx) / d; fy -= (g * dy) / d; }
          for (let j = 0; j < n; j++) {
            if (j === i) continue;
            const ox = xs[i] - xs[j], oy = ys[i] - ys[j], od = Math.hypot(ox, oy);
            if (od < rr && od > 1e-5) { const f = (2 * kr * (1 - od / rr)) / rr; fx += (f * ox) / od; fy += (f * oy) / od; }
          }
          // 壁（画面端）の斥力
          const m = 1;
          if (xs[i] < -w + m + 1) fx += kr * (-w + m + 1 - xs[i]);
          if (xs[i] > w - m - 1) fx -= kr * (xs[i] - (w - m - 1));
          if (ys[i] < -h + m + 1) fy += kr * (-h + m + 1 - ys[i]);
          if (ys[i] > h - m - 1) fy -= kr * (ys[i] - (h - m - 1));
          // 粘性のある運動（v˙ = F − c v）
          vx[i] += (fx - vx[i] * 2.5) * dt;
          vy[i] += (fy - vy[i] * 2.5) * dt;
          [vx[i], vy[i]] = limit(vx[i], vy[i], 8);
        }
        for (let i = 0; i < n; i++) { xs[i] += vx[i] * dt; ys[i] += vy[i] * dt; trails[i].push(xs[i], ys[i]); }
        let s = 0;
        for (let i = 0; i < n; i++) {
          let best = Infinity;
          for (let j = 0; j < n; j++) if (j !== i) best = Math.min(best, Math.hypot(xs[i] - xs[j], ys[i] - ys[j]));
          s += best;
        }
        nnAvg = s / n;
      },
      draw(g, p) {
        g.grid(1, 0x141828);
        const { w, h } = env.bounds();
        if (p.contours) {
          // ポテンシャルを格子で評価して等高線を引く
          const low = env.quality === 'low';
          const nx = low ? 36 : 60, ny = low ? 24 : 40;
          const vals = new Float32Array((nx + 1) * (ny + 1));
          const kr = Number(p.repel), rr = Number(p.range);
          let mn = Infinity, mx = -Infinity;
          for (let j = 0; j <= ny; j++) for (let i = 0; i <= nx; i++) {
            const x = -w + (2 * w * i) / nx, y = -h + (2 * h * j) / ny;
            let u = attractU(x, y, p);
            for (let a = 0; a < n; a++) {
              const d = Math.hypot(x - xs[a], y - ys[a]);
              if (d < rr) u += kr * (1 - d / rr) ** 2;
            }
            vals[j * (nx + 1) + i] = u;
            if (u < mn) mn = u;
            if (u > mx) mx = u;
          }
          const K = 14;
          for (let k = 1; k < K; k++) {
            const lv = mn + ((k / K) ** 2) * (mx - mn);
            const col = hsl(0.62 - (k / K) * 0.55, 0.6, 0.45);
            for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
              const v00 = vals[j * (nx + 1) + i], v10 = vals[j * (nx + 1) + i + 1];
              const v01 = vals[(j + 1) * (nx + 1) + i], v11 = vals[(j + 1) * (nx + 1) + i + 1];
              const x0 = -w + (2 * w * i) / nx, y0 = -h + (2 * h * j) / ny, sx = (2 * w) / nx, sy = (2 * h) / ny;
              const pts: number[] = [];
              const edge = (a: number, b: number, ax: number, ay: number, bx: number, by: number) => {
                if ((a < lv) !== (b < lv)) { const t = (lv - a) / (b - a); pts.push(ax + (bx - ax) * t, ay + (by - ay) * t); }
              };
              edge(v00, v10, x0, y0, x0 + sx, y0);
              edge(v10, v11, x0 + sx, y0, x0 + sx, y0 + sy);
              edge(v11, v01, x0 + sx, y0 + sy, x0, y0 + sy);
              edge(v01, v00, x0, y0 + sy, x0, y0);
              if (pts.length >= 4) g.line(pts[0], pts[1], pts[2], pts[3], col, 0.7);
              if (pts.length === 8) g.line(pts[4], pts[5], pts[6], pts[7], col, 0.7);
            }
          }
        }
        if (p.mode === 'surround') g.circle(cx, cy, Number(p.ring), 0xffd166, { alpha: 0.4, segments: 48 });
        if (p.mode !== 'scatter') {
          g.line(cx - 0.6, cy, cx + 0.6, cy, 0xffd166);
          g.line(cx, cy - 0.6, cx, cy + 0.6, 0xffd166);
        }
        for (let i = 0; i < n; i++) {
          if (p.showTrails) g.polyline(trails[i].points(), 0x6fd3ff, { fade: true, alpha: 0.35 });
          g.circle(xs[i], ys[i], Number(p.range) / 2, 0x3a4470, { alpha: 0.5, segments: 12 });
          g.circle(xs[i], ys[i], 0.2, 0xd8def5, { fill: true, segments: 8 });
          g.line(xs[i], ys[i], xs[i] + vx[i] * 0.3, ys[i] + vy[i] * 0.3, 0x7dff8a);
        }
      },
      pointer(x, y, down) {
        if (down) { cx = x; cy = y; }
      },
      action(key) {
        if (key === 'gather' || key === 'scatter' || key === 'surround') return { mode: key };
      },
      status(p) {
        let r = 0;
        for (let i = 0; i < n; i++) r += Math.hypot(xs[i] - cx, ys[i] - cy);
        return `${p.mode === 'gather' ? '集結' : p.mode === 'scatter' ? '分散' : '包囲'} · 最近傍距離の平均 ${nnAvg.toFixed(2)} · 中心からの平均距離 ${(r / n).toFixed(2)} · ドラッグで集合点`;
      },
    };
  },
  extraActions: [
    { key: 'gather', label: '◎ 集結' },
    { key: 'scatter', label: '✣ 分散' },
    { key: 'surround', label: '○ 包囲' },
  ],
});
