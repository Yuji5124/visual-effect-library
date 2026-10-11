import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { heat } from '../framework/crowdKit';

/** MOT-043 動作の伝播：格子の各要素が同じ動作関数を遅れ τ_i だけずらして評価する */
export default defineMotionDemo({
  id: 'MOT-043',
  notes: '格子の要素 i は h_i(t) = f(t − τ_i) を評価する（f は正弦・単発パルス・ドミノ倒し）。τ_i は直線波なら x 方向の距離 / 伝播速度、同心円なら原点からの距離 / 伝播速度、ランダムは乱数。上から見た円の大きさと色が高さ。クリックした点が原点になり、そこから動きが伝わる。下の帯は中央の行の高さの断面。',
  params: [
    { key: 'speed', label: '伝播速度（単位/秒）', type: 'number', min: 1, max: 30, step: 0.5, default: 8 },
    {
      key: 'shape', label: '波の形', type: 'select', default: 'radial',
      options: [{ value: 'linear', label: '直線波' }, { value: 'radial', label: '同心円' }, { value: 'random', label: 'ランダム遅れ' }],
    },
    {
      key: 'motion', label: '動作の種類', type: 'select', default: 'pulse',
      options: [{ value: 'sine', label: '正弦（連続）' }, { value: 'pulse', label: '単発パルス（ウェーブ）' }, { value: 'domino', label: 'ドミノ倒し' }],
    },
    { key: 'grid', label: '格子の数（一辺）', type: 'number', min: 8, max: 40, step: 1, default: 24 },
    { key: 'period', label: '周期・繰り返し（秒）', type: 'number', min: 0.5, max: 8, step: 0.1, default: 3 },
  ],
  resetKeys: ['grid'],
  create(env, p0) {
    const N = Math.round(Number(p0.grid));
    const M = N * N;
    const { h } = env.bounds();
    const span = (h - 2.5) * 2;
    const cell = span / N;
    const gx = new Float32Array(M), gy = new Float32Array(M), rnd = new Float32Array(M), val = new Float32Array(M);
    const y0 = -h + 3.2;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const k = j * N + i;
      gx[k] = -span / 2 + (i + 0.5) * cell;
      gy[k] = y0 + (j + 0.5) * cell * 0.84;
      rnd[k] = env.rng();
    }
    let ox = gx[0], oy = gy[Math.floor(N / 2) * N];
    let t = 0, t0 = 0;
    const probe = new Trail(300);
    let maxDelay = 0;
    const delayOf = (k: number, shape: string, sp: number) => {
      if (shape === 'linear') return Math.abs(gx[k] - ox) / sp;
      if (shape === 'random') return (rnd[k] * span) / sp;
      return Math.hypot(gx[k] - ox, gy[k] - oy) / sp;
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        t += dt;
        const per = Number(p.period), sp = Number(p.speed), shape = String(p.shape), mot = String(p.motion);
        maxDelay = 0;
        for (let k = 0; k < M; k++) maxDelay = Math.max(maxDelay, delayOf(k, shape, sp));
        // 単発の動作は「全体に伝わり終わって少し待つ」ごとに再発火
        if (mot !== 'sine' && t - t0 > maxDelay + per + 0.6) t0 = t;
        for (let k = 0; k < M; k++) {
          const lt = t - t0 - delayOf(k, shape, sp);
          let v: number;
          if (mot === 'sine') v = 0.5 + 0.5 * Math.sin(((t - delayOf(k, shape, sp)) / per) * Math.PI * 2);
          else if (mot === 'pulse') {
            const w = per * 0.25;
            v = lt < 0 ? 0 : Math.exp(-((lt - w) ** 2) / (2 * (w * 0.35) ** 2));
          } else {
            // ドミノ：遅れの時刻に倒れ始め、短い時間で倒れきる
            const u = Math.min(1, Math.max(0, lt / 0.25));
            v = u * u;
          }
          val[k] = v;
        }
        probe.push(t, val[Math.floor(N / 2) * N + Math.floor(N / 2)]);
      },
      draw(g, p) {
        const mot = String(p.motion);
        const r = cell * 0.5;
        for (let k = 0; k < M; k++) {
          const v = val[k];
          const col = heat(v);
          if (mot === 'domino') {
            // 立っている板（短い線）が倒れて長くなる
            const ang = Math.atan2(gy[k] - oy, gx[k] - ox) || 0;
            const len = r * (0.3 + 1.5 * Math.sin((v * Math.PI) / 2));
            const ca = Math.cos(ang), sa = Math.sin(ang);
            g.line(gx[k] - sa * r * 0.6, gy[k] + ca * r * 0.6, gx[k] + sa * r * 0.6, gy[k] - ca * r * 0.6, col);
            g.line(gx[k], gy[k], gx[k] + ca * len, gy[k] + sa * len, col, 0.9);
          } else {
            g.circle(gx[k], gy[k], r * (0.25 + 0.7 * v), col, { fill: true, segments: 10 });
          }
        }
        g.circle(ox, oy, 0.35, 0xffffff);
        // 中央の行の断面（高さ）
        const { w, h } = env.bounds();
        const base = -h + 0.6, amp = 1.6, row = Math.floor(N / 2) * N;
        g.line(-span / 2, base, span / 2, base, 0x2a2f50);
        const pts = new Float32Array(N * 2);
        for (let i = 0; i < N; i++) { pts[i * 2] = gx[row + i]; pts[i * 2 + 1] = base + val[row + i] * amp; }
        g.polyline(pts, 0x7dff8a);
        // 右側：中央要素の高さの時間変化
        if (p.showTrails && w > span / 2 + 3) {
          const x0 = span / 2 + 1, x1 = w - 0.6, pr = probe.points();
          const tmax = pr.length ? pr[pr.length - 2] : 0, win = 5;
          const out: number[] = [];
          for (let i = 0; i < pr.length; i += 2) {
            const x = x1 - ((tmax - pr[i]) / win) * (x1 - x0);
            if (x >= x0) out.push(x, -2 + pr[i + 1] * 4);
          }
          g.line(x0, -2, x1, -2, 0x2a2f50);
          g.polyline(out, 0xffd166, { fade: true });
        }
      },
      pointer(x, y, down) {
        if (down) { ox = x; oy = y; t0 = t; }
      },
      status(p) {
        const per = Number(p.period), sp = Number(p.speed);
        return `伝播速度 ${sp.toFixed(1)} · 波長 ≈ ${(sp * per).toFixed(1)} · 端まで届く時間 ${maxDelay.toFixed(2)}s · 要素 ${M} · クリックで原点を移動`;
      },
    };
  },
});
