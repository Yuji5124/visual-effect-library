import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { clamp } from '../framework/crowdKit';

/** MOT-037 レーン形成：周期境界の通路で対向する2集団がソーシャルフォースで自己組織的に列を作る */
export default defineMotionDemo({
  id: 'MOT-037',
  notes: '左右が周期境界の通路で、赤は右へ・青は左へ歩く。加速度＝(v0·e − v)/τ ＋ 他者からの指数的な斥力（前方ほど強い異方性 λ+(1−λ)(1+cosφ)/2）＋ 壁の斥力 ＋ ゆらぎ。同方向の人の後ろにいると衝突が減るので、指示なしにレーンができる。右端の帯は高さごとの赤/青の比率、ステータスのレーン指標は「前後の近傍のうち同方向の人の割合」。ドラッグで柱（障害物）を動かせる。',
  params: [
    { key: 'count', label: '人数', type: 'number', min: 20, max: 260, step: 2, default: 140 },
    { key: 'avoid', label: '回避の強さ', type: 'number', min: 0, max: 20, step: 0.1, default: 6 },
    { key: 'noise', label: 'ゆらぎ', type: 'number', min: 0, max: 6, step: 0.05, default: 0.8 },
    { key: 'v0', label: '歩く速さ', type: 'number', min: 0.5, max: 3, step: 0.05, default: 1.3 },
    { key: 'pillar', label: '柱を置く', type: 'bool', default: false },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    const { w, h } = env.bounds();
    const L = 2 * w - 3.5, half = L / 2, H = Math.min(h - 1.5, 6.5);
    const xs = new Float32Array(n), ys = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n);
    const dir = new Int8Array(n);
    const trails = Array.from({ length: n }, () => new Trail(60));
    for (let i = 0; i < n; i++) {
      dir[i] = i % 2 ? 1 : -1;
      xs[i] = (env.rng() - 0.5) * L;
      ys[i] = (env.rng() * 2 - 1) * (H - 0.4);
      vx[i] = dir[i] * 0.5;
    }
    let pxp = 0, pyp = 0, dragged = false;
    let order = 0, t = 0;
    const wrap = (d: number) => (d > half ? d - L : d < -half ? d + L : d);
    return {
      step(dt, p) {
        if (dt <= 0) return;
        t += dt;
        const A = Number(p.avoid), v0 = Number(p.v0), nz = Number(p.noise), B = 0.35, lam = 0.3;
        const ax = new Float32Array(n), ay = new Float32Array(n);
        for (let i = 0; i < n; i++) {
          ax[i] = (v0 * dir[i] - vx[i]) / 0.5 + (env.rng() - 0.5) * nz * 2;
          ay[i] = -vy[i] / 0.5 + (env.rng() - 0.5) * nz * 2;
        }
        let same = 0, tot = 0;
        for (let i = 0; i < n; i++) {
          const sp = Math.hypot(vx[i], vy[i]) || 1;
          const hx = vx[i] / sp, hy = vy[i] / sp;
          for (let j = i + 1; j < n; j++) {
            const ox = wrap(xs[i] - xs[j]), oy = ys[i] - ys[j];
            if (Math.abs(ox) > 2.5 || Math.abs(oy) > 2.5) continue;
            const d = Math.hypot(ox, oy);
            if (d < 1e-4 || d > 2.5) continue;
            const nx = ox / d, ny = oy / d;
            const base = A * Math.exp((0.5 - d) / B);
            // 異方性：自分の前方にいる相手からの力ほど強い
            const cosI = -(hx * nx + hy * ny);
            const sj = Math.hypot(vx[j], vy[j]) || 1;
            const cosJ = (vx[j] / sj) * nx + (vy[j] / sj) * ny;
            const fi = base * (lam + ((1 - lam) * (1 + cosI)) / 2);
            const fj = base * (lam + ((1 - lam) * (1 + cosJ)) / 2);
            ax[i] += fi * nx; ay[i] += fi * ny;
            ax[j] -= fj * nx; ay[j] -= fj * ny;
            // レーン指標：前後（横のずれが小さい）の近傍の向き
            if (Math.abs(oy) < 0.5 && Math.abs(ox) < 2) { tot += 2; if (dir[i] === dir[j]) same += 2; }
          }
        }
        for (let i = 0; i < n; i++) {
          // 壁と柱
          const dt2 = H - ys[i], db = ys[i] + H;
          ay[i] -= A * Math.exp((0.3 - dt2) / 0.2);
          ay[i] += A * Math.exp((0.3 - db) / 0.2);
          if (p.pillar || dragged) {
            const ox = wrap(xs[i] - pxp), oy = ys[i] - pyp, d = Math.hypot(ox, oy);
            if (d < 3 && d > 1e-4) { const f = A * 2 * Math.exp((1.3 - d) / 0.3); ax[i] += (f * ox) / d; ay[i] += (f * oy) / d; }
          }
          vx[i] += clamp(ax[i], -60, 60) * dt;
          vy[i] += clamp(ay[i], -60, 60) * dt;
          const sp = Math.hypot(vx[i], vy[i]), vm = v0 * 1.4;
          if (sp > vm) { vx[i] *= vm / sp; vy[i] *= vm / sp; }
          const ox = xs[i];
          xs[i] += vx[i] * dt;
          ys[i] = clamp(ys[i] + vy[i] * dt, -H + 0.15, H - 0.15);
          if (xs[i] > half) xs[i] -= L;
          if (xs[i] < -half) xs[i] += L;
          if (Math.abs(xs[i] - ox) > 1) trails[i].clear();
          trails[i].push(xs[i], ys[i]);
        }
        order += ((tot ? same / tot : 0.5) - order) * Math.min(1, dt * 2);
      },
      draw(g, p) {
        g.grid(1, 0x141828);
        g.line(-half, H, half, H, 0xd8def5);
        g.line(-half, -H, half, -H, 0xd8def5);
        g.line(-half, -H, -half, H, 0x5a6390, 0.6);
        g.line(half, -H, half, H, 0x5a6390, 0.6);
        // 高さごとの赤/青の比率（レーンの可視化）
        const bins = 26;
        const r = new Float32Array(bins), b = new Float32Array(bins);
        for (let i = 0; i < n; i++) {
          const k = clamp(Math.floor(((ys[i] + H) / (2 * H)) * bins), 0, bins - 1);
          if (dir[i] > 0) r[k]++; else b[k]++;
        }
        const bh = (2 * H) / bins;
        for (let k = 0; k < bins; k++) {
          const tot = r[k] + b[k];
          if (!tot) continue;
          const y = -H + k * bh;
          g.rect(half + 0.3, y, 1.2 * (r[k] / tot), bh * 0.9, 0xff6b6b, { fill: true });
          g.rect(half + 0.3 + 1.2 * (r[k] / tot), y, 1.2 * (b[k] / tot), bh * 0.9, 0x5ab8ff, { fill: true });
        }
        if (p.pillar || dragged) g.circle(pxp, pyp, 1, 0xd8def5, { fill: true });
        for (let i = 0; i < n; i++) {
          const col = dir[i] > 0 ? 0xff6b6b : 0x5ab8ff;
          if (p.showTrails) g.polyline(trails[i].points(), col, { fade: true, alpha: 0.35 });
          g.agent(xs[i], ys[i], Math.atan2(vy[i], vx[i]), 0.2, col);
        }
      },
      pointer(x, y, down) {
        if (down) { pxp = x; pyp = clamp(y, -H + 1, H - 1); dragged = true; }
      },
      action(key, p) {
        if (key === 'pillar') { const on = !(p.pillar || dragged); dragged = false; return { pillar: on }; }
      },
      status() {
        return `レーン指標（前後の同方向率）${(order * 100).toFixed(0)}%（無秩序なら約50%）· ${n} 人 · 経過 ${t.toFixed(0)} 秒 · ドラッグで柱を移動`;
      },
    };
  },
  extraActions: [{ key: 'pillar', label: '● 柱の有無' }],
});
