import { defineMotionDemo } from '../framework/motionLab';
import { clamp, heat, smoothstep } from '../framework/crowdKit';
import { PointerTracker } from '../framework/steerKit';

/** MOT-045 タイムバブル：粒子ごとに dt·s(x) で進め、s は位置による時間倍率の場 */
export default defineMotionDemo({
  id: 'MOT-045',
  notes: '左から右へ流れる粒子を、それぞれの位置での時間倍率 s(x) を掛けた dt·s(x) で進める。s はバブルの中心で「時間倍率」、外側で 1、境界はぼかし幅で滑らかに変わる。速度ベクトルは変えずに時間の進みだけを変えるので、遅いバブルの中では粒子が詰まり（密度が上がり）、短い針の回転（各粒子の固有時間）も遅くなる。ドラッグでバブルを動かす。',
  params: [
    { key: 'scale', label: '時間倍率（バブル内）', type: 'number', min: 0, max: 3, step: 0.01, default: 0.2 },
    { key: 'radius', label: 'バブルの半径', type: 'number', min: 1, max: 8, step: 0.1, default: 4 },
    { key: 'feather', label: '境界のぼかし', type: 'number', min: 0, max: 4, step: 0.05, default: 1 },
    { key: 'count', label: '粒子数', type: 'number', min: 50, max: 800, step: 10, default: 350 },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count) * (env.quality === 'low' ? 0.6 : 1));
    const { w, h } = env.bounds();
    const x = new Float32Array(n), y = new Float32Array(n), vx = new Float32Array(n), vy = new Float32Array(n), clock = new Float32Array(n), ls = new Float32Array(n);
    const TRAIL = 14;
    const tx = new Float32Array(n * TRAIL), ty = new Float32Array(n * TRAIL);
    let head = 0, trailT = 0;
    for (let i = 0; i < n; i++) {
      x[i] = (env.rng() * 2 - 1) * w;
      y[i] = (env.rng() * 2 - 1) * (h - 0.5);
      vx[i] = 3 + env.rng() * 2;
      vy[i] = (env.rng() - 0.5) * 0.8;
      clock[i] = env.rng() * Math.PI * 2;
      for (let k = 0; k < TRAIL; k++) { tx[i * TRAIL + k] = x[i]; ty[i * TRAIL + k] = y[i]; }
    }
    let bx = 0, by = 0, dragging = false, worldT = 0;
    const pt = new PointerTracker();
    const scaleAt = (px: number, py: number, s: number, R: number, f: number) => {
      const d = Math.hypot(px - bx, py - by);
      const k = f > 1e-3 ? smoothstep(R - f * 0.5, R + f * 0.5, d) : d < R ? 0 : 1;
      return s + (1 - s) * k;
    };
    let inside = 0, expected = 0;
    return {
      step(dt, p) {
        if (dt <= 0) return;
        worldT += dt;
        const s = Number(p.scale), R = Number(p.radius), f = Number(p.feather);
        const { w: W, h: H } = env.bounds();
        inside = 0;
        for (let i = 0; i < n; i++) {
          const sc = scaleAt(x[i], y[i], s, R, f);
          ls[i] = sc;
          const ldt = dt * sc;
          x[i] += vx[i] * ldt;
          y[i] += vy[i] * ldt;
          clock[i] += ldt * 6;
          if (y[i] > H - 0.3 || y[i] < -H + 0.3) { vy[i] = -vy[i]; y[i] = clamp(y[i], -H + 0.3, H - 0.3); }
          if (x[i] > W + 0.5) {
            x[i] = -W - 0.5;
            for (let k = 0; k < TRAIL; k++) { tx[i * TRAIL + k] = x[i]; ty[i * TRAIL + k] = y[i]; }
          }
          if (Math.hypot(x[i] - bx, y[i] - by) < R) inside++;
        }
        expected = (n * Math.PI * R * R) / (4 * W * H);
        // 軌跡は「世界の時間」で一定間隔に記録（遅い所では点が詰まる）
        trailT += dt;
        if (trailT > 0.06) {
          trailT = 0;
          head = (head + 1) % TRAIL;
          for (let i = 0; i < n; i++) { tx[i * TRAIL + head] = x[i]; ty[i * TRAIL + head] = y[i]; }
        }
      },
      draw(g, p) {
        const s = Number(p.scale), R = Number(p.radius), f = Number(p.feather);
        // 時間倍率の場を同心円の塗りで表示（青＝遅い、赤＝速い）
        const outer = R + f * 0.5 + 0.2;
        const rings = 18;
        for (let k = rings; k >= 1; k--) {
          const r = (outer * k) / rings;
          const sc = scaleAt(bx + r, by, s, R, f);
          g.circle(bx, by, r, heat(clamp(sc / 2, 0, 1)), { fill: true, alpha: 0.18 + 0.2 * Math.abs(1 - sc) / Math.max(1, Math.abs(1 - s)), segments: 40 });
        }
        g.circle(bx, by, R, 0xffffff, { alpha: 0.6, segments: 48 });
        for (let i = 0; i < n; i++) {
          const col = heat(clamp(ls[i] / 2, 0, 1));
          if (p.showTrails) {
            let px = tx[i * TRAIL + ((head + 1) % TRAIL)], py = ty[i * TRAIL + ((head + 1) % TRAIL)];
            for (let k = 2; k <= TRAIL; k++) {
              const j = (head + k) % TRAIL;
              const qx = tx[i * TRAIL + j], qy = ty[i * TRAIL + j];
              if (Math.abs(qx - px) < 3) g.line(px, py, qx, qy, col, (k / TRAIL) * 0.5);
              px = qx; py = qy;
            }
          }
          g.circle(x[i], y[i], 0.13, col, { fill: true, segments: 6 });
          g.line(x[i], y[i], x[i] + Math.cos(clock[i]) * 0.3, y[i] + Math.sin(clock[i]) * 0.3, 0xffffff, 0.7);
        }
        if (dragging) g.circle(bx, by, 0.2, 0xffffff, { fill: true });
      },
      pointer(px, py, down) {
        const e = pt.update(down);
        if (e === 'press' || e === 'drag') { dragging = true; bx = px; by = py; }
        if (e === 'release') dragging = false;
      },
      status(p) {
        const ratio = expected > 0 ? inside / expected : 0;
        return `バブル内の時間倍率 ${Number(p.scale).toFixed(2)} · バブル内の粒子 ${inside}（一様なら ${expected.toFixed(0)}）· 密度比 ${ratio.toFixed(2)} · 世界時間 ${worldT.toFixed(1)}s · ドラッグでバブルを移動`;
      },
    };
  },
});
