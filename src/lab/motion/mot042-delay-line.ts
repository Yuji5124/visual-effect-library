import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { hsl } from '../framework/crowdKit';
import { PointerTracker } from '../framework/steerKit';

/** 時刻つき状態のリングバッファ */
class History {
  readonly t: Float64Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  head = 0;
  size = 0;
  constructor(readonly cap: number) {
    this.t = new Float64Array(cap);
    this.x = new Float32Array(cap);
    this.y = new Float32Array(cap);
  }
  push(t: number, x: number, y: number): void {
    this.t[this.head] = t; this.x[this.head] = x; this.y[this.head] = y;
    this.head = (this.head + 1) % this.cap;
    if (this.size < this.cap) this.size++;
  }
  /** k 番目に古い要素の添字 */
  idx(k: number): number {
    return (this.head - this.size + k + this.cap) % this.cap;
  }
  /** 時刻 t の状態を二分探索＋線形補間で取り出す */
  sample(t: number): [number, number] {
    const n = this.size;
    const first = this.idx(0), last = this.idx(n - 1);
    if (t <= this.t[first]) return [this.x[first], this.y[first]];
    if (t >= this.t[last]) return [this.x[last], this.y[last]];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.t[this.idx(m)] <= t) lo = m; else hi = m; }
    const a = this.idx(lo), b = this.idx(hi);
    const u = (t - this.t[a]) / (this.t[b] - this.t[a] || 1);
    return [this.x[a] + (this.x[b] - this.x[a]) * u, this.y[a] + (this.y[b] - this.y[a]) * u];
  }
}

/** MOT-042 時間差追従：先頭の状態履歴から「現在−i×遅延」の状態を取り出して再生 */
export default defineMotionDemo({
  id: 'MOT-042',
  notes: '先頭（黄）の位置を時刻つきでリングバッファに積み、追従者 i は時刻 t−i×遅延 の位置を補間して取り出す（水色）。比較用の橙は MOT-036 と同じ距離ベースの連鎖。先頭が止まると、距離の連鎖はその場で止まるが、時間遅れの列は遅れて同じ所まで来て一点に重なる。ドラッグで先頭を動かす。',
  params: [
    { key: 'delay', label: '遅延の間隔（秒）', type: 'number', min: 0.03, max: 1, step: 0.01, default: 0.15 },
    { key: 'count', label: '追従者の数', type: 'number', min: 2, max: 30, step: 1, default: 12 },
    {
      key: 'lead', label: '先頭の動き', type: 'select', default: 'stopgo',
      options: [{ value: 'stopgo', label: '8の字＋一時停止' }, { value: 'circle', label: '円を一定速度' }, { value: 'zigzag', label: 'ジグザグ（急停止）' }, { value: 'pointer', label: 'ポインタのみ' }],
    },
    { key: 'compare', label: '距離ベースの連鎖も表示', type: 'bool', default: true },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    const hist = new History(4096);
    let t = 0, lx = 0, ly = 0, prevX = 0, prevY = 0, speed = 0;
    let dragging = false, px = 0, py = 0;
    let phase = 0;
    const pt = new PointerTracker();
    const fx = new Float32Array(n), fy = new Float32Array(n);
    const cx = new Float32Array(n), cy = new Float32Array(n);
    const trail = new Trail(500);
    let stoppedFor = 0, spread = 0;
    return {
      step(dt, p) {
        if (dt <= 0) return;
        t += dt;
        const { w, h } = env.bounds();
        const mode = String(p.lead);
        if (dragging) {
          lx += (px - lx) * Math.min(1, dt * 10);
          ly += (py - ly) * Math.min(1, dt * 10);
        } else if (mode === 'stopgo') {
          // 3秒動いて1秒止まる
          const cyc = t % 4;
          if (cyc < 3) phase += dt * 0.9;
          lx = Math.sin(phase) * (w - 3);
          ly = Math.sin(phase * 2) * (h - 4) * 0.8;
        } else if (mode === 'circle') {
          phase += dt * 0.8;
          lx = Math.cos(phase) * 6;
          ly = Math.sin(phase) * 6;
        } else if (mode === 'zigzag') {
          const seg = Math.floor(t / 1.2), u = (t % 1.2) / 1.2;
          const k = Math.min(1, u * 1.6); // 残り時間は停止
          const xa = -w + 3 + ((seg % 8) * (2 * w - 6)) / 8, xb = -w + 3 + (((seg + 1) % 8) * (2 * w - 6)) / 8;
          const ya = seg % 2 ? 4 : -4, yb = seg % 2 ? -4 : 4;
          if (seg % 8 === 7) { lx = xa; ly = ya; } else {
            const e = k * k * (3 - 2 * k);
            lx = xa + (xb - xa) * e;
            ly = ya + (yb - ya) * e;
          }
        }
        speed = Math.hypot(lx - prevX, ly - prevY) / dt;
        prevX = lx; prevY = ly;
        stoppedFor = speed < 0.05 ? stoppedFor + dt : 0;
        hist.push(t, lx, ly);
        trail.push(lx, ly);
        const delay = Number(p.delay);
        for (let i = 0; i < n; i++) [fx[i], fy[i]] = hist.sample(t - (i + 1) * delay);
        // 距離ベースの連鎖（比較用）
        const sp = 0.7;
        let ax = lx, ay = ly;
        for (let i = 0; i < n; i++) {
          const ox = cx[i] - ax, oy = cy[i] - ay, d = Math.hypot(ox, oy) || 1e-6;
          if (d > sp) { cx[i] = ax + (ox / d) * sp; cy[i] = ay + (oy / d) * sp; }
          ax = cx[i]; ay = cy[i];
        }
        spread = Math.hypot(fx[n - 1] - lx, fy[n - 1] - ly);
      },
      draw(g, p) {
        g.grid(1);
        if (p.showTrails) g.polyline(trail.points(), 0xffffff, { fade: true, alpha: 0.35 });
        if (p.compare) {
          let ax = lx, ay = ly;
          for (let i = 0; i < n; i++) { g.line(ax, ay, cx[i], cy[i], 0xff8a5a, 0.6); ax = cx[i]; ay = cy[i]; }
          for (let i = 0; i < n; i++) g.circle(cx[i], cy[i], 0.2, 0xff8a5a, { fill: true, segments: 10 });
        }
        for (let i = n - 1; i >= 0; i--) {
          const col = hsl(0.52 + (i / n) * 0.15, 0.8, 0.62 - (i / n) * 0.2);
          g.circle(fx[i], fy[i], 0.36 - (i / n) * 0.15, col, { fill: true, segments: 12 });
        }
        g.circle(lx, ly, 0.5, 0xffd166, { fill: true });
        if (stoppedFor > 0.1) g.circle(lx, ly, 0.75, 0xffffff, { alpha: 0.6 });
        if (dragging) g.circle(px, py, 0.3, 0xffffff);
      },
      pointer(x, y, down) {
        const e = pt.update(down);
        if (e === 'press' || e === 'drag') { dragging = true; px = x; py = y; }
        if (e === 'release') dragging = false;
      },
      status(p) {
        const total = n * Number(p.delay);
        return `先頭の速さ ${speed.toFixed(2)} ${stoppedFor > 0.1 ? `· 停止 ${stoppedFor.toFixed(1)}s` : ''} · 最後尾の遅れ ${total.toFixed(2)}s · 先頭との距離 ${spread.toFixed(2)} · 履歴 ${hist.size}/${hist.cap} · ドラッグで先頭を動かす`;
      },
    };
  },
});
