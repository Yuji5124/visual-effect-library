import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';

/** MOT-036 連鎖追従：前の要素を直接追う方式と、先頭の経路を弧長でなぞる方式の比較 */
export default defineMotionDemo({
  id: 'MOT-036',
  notes: '同じ先頭から2本の列を伸ばす。橙は各要素が前の要素の方へ間隔ぶんだけ引き寄せられる方式（カーブで内側へショートカットする）。水色は先頭の通った点を累積弧長つきで記録し、要素 i を「先頭の弧長 − i×間隔」の位置へ補間して置く方式（同じ線を正確になぞる）。白い線が先頭の経路。ドラッグで先頭を誘導、離すと自動で8の字を描く。',
  params: [
    { key: 'count', label: '要素の数', type: 'number', min: 2, max: 60, step: 1, default: 24 },
    { key: 'spacing', label: '間隔', type: 'number', min: 0.2, max: 2, step: 0.05, default: 0.6 },
    {
      key: 'method', label: '方式', type: 'select', default: 'both',
      options: [{ value: 'both', label: '両方を重ねる' }, { value: 'direct', label: '前を直接追う' }, { value: 'path', label: '経路をなぞる' }],
    },
    { key: 'speed', label: '先頭の速さ', type: 'number', min: 1, max: 12, step: 0.1, default: 5 },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    let hx = 0, hy = 0, ha = 0, t = 0;
    let px = 0, py = 0, dragging = false;
    // 経路の記録：x, y, 累積弧長
    const PX: number[] = [0], PY: number[] = [0], PS: number[] = [0];
    const dx = new Float32Array(n), dy = new Float32Array(n);
    for (let i = 0; i < n; i++) { dx[i] = -i * 0.6; dy[i] = 0; PX.unshift(-i * 0.6); PY.unshift(0); }
    for (let i = 0; i < PX.length; i++) PS[i] = PX[i] - PX[0];
    const pathX = new Float32Array(n), pathY = new Float32Array(n);
    const headTrail = new Trail(600);
    let devAvg = 0;
    const samplePath = (s: number): [number, number] => {
      // 二分探索で弧長 s を含む区間を探して補間
      let lo = 0, hi = PS.length - 1;
      if (s <= PS[0]) return [PX[0], PY[0]];
      while (hi - lo > 1) { const m = (lo + hi) >> 1; if (PS[m] < s) lo = m; else hi = m; }
      const u = (s - PS[lo]) / (PS[hi] - PS[lo] || 1);
      return [PX[lo] + (PX[hi] - PX[lo]) * u, PY[lo] + (PY[hi] - PY[lo]) * u];
    };
    const distToPath = (x: number, y: number) => {
      let best = Infinity;
      for (let i = Math.max(1, PX.length - 1200); i < PX.length; i++) {
        const ax = PX[i - 1], ay = PY[i - 1], bx = PX[i], by = PY[i];
        const vx = bx - ax, vy = by - ay, l2 = vx * vx + vy * vy || 1e-9;
        const u = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / l2));
        best = Math.min(best, Math.hypot(x - ax - vx * u, y - ay - vy * u));
      }
      return best;
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        t += dt;
        const sp = Number(p.speed), spacing = Number(p.spacing);
        const { w, h } = env.bounds();
        // 先頭：ドラッグ中はポインタへ旋回、それ以外は鋭い8の字
        let tx: number, ty: number;
        if (dragging) { tx = px; ty = py; } else {
          const k = t * sp * 0.08;
          tx = Math.sin(k) * (w - 3);
          ty = Math.sin(k * 2) * (h - 4);
        }
        let want = Math.atan2(ty - hy, tx - hx) - ha;
        want = Math.atan2(Math.sin(want), Math.cos(want));
        ha += Math.max(-4 * dt, Math.min(4 * dt, want * 6 * dt));
        const move = Math.hypot(tx - hx, ty - hy) < 0.3 ? 0 : sp * dt;
        hx += Math.cos(ha) * move;
        hy += Math.sin(ha) * move;
        // 経路を記録（少しでも動いた時だけ）
        const lx = PX[PX.length - 1], ly = PY[PY.length - 1];
        const seg = Math.hypot(hx - lx, hy - ly);
        if (seg > 0.05) { PX.push(hx); PY.push(hy); PS.push(PS[PS.length - 1] + seg); }
        const need = n * spacing + 5;
        while (PS.length > 3 && PS[PS.length - 1] - PS[1] > need) { PX.shift(); PY.shift(); PS.shift(); }
        headTrail.push(hx, hy);
        // 方式A：直接追従
        dx[0] = hx; dy[0] = hy;
        for (let i = 1; i < n; i++) {
          const ox = dx[i] - dx[i - 1], oy = dy[i] - dy[i - 1], d = Math.hypot(ox, oy) || 1e-6;
          if (d > spacing) { dx[i] = dx[i - 1] + (ox / d) * spacing; dy[i] = dy[i - 1] + (oy / d) * spacing; }
        }
        // 方式B：経路の弧長で配置
        const sHead = PS[PS.length - 1] + Math.hypot(hx - PX[PX.length - 1], hy - PY[PY.length - 1]);
        for (let i = 0; i < n; i++) {
          if (i === 0) { pathX[0] = hx; pathY[0] = hy; continue; }
          [pathX[i], pathY[i]] = samplePath(sHead - i * spacing);
        }
        let dev = 0;
        for (let i = 1; i < n; i += Math.max(1, Math.floor(n / 12))) dev = Math.max(dev, distToPath(dx[i], dy[i]));
        devAvg += (dev - devAvg) * Math.min(1, dt * 4);
      },
      draw(g, p) {
        g.grid(1);
        const m = String(p.method);
        if (p.showTrails) g.polyline(headTrail.points(), 0xffffff, { fade: true, alpha: 0.5 });
        const pts = new Float32Array(PX.length * 2);
        for (let i = 0; i < PX.length; i++) { pts[i * 2] = PX[i]; pts[i * 2 + 1] = PY[i]; }
        g.polyline(pts, 0x8890c0, { alpha: 0.6 });
        const drawChain = (xs: ArrayLike<number>, ys: ArrayLike<number>, col: number) => {
          for (let i = 1; i < n; i++) g.line(xs[i - 1], ys[i - 1], xs[i], ys[i], col, 0.8);
          for (let i = n - 1; i >= 1; i--) g.circle(xs[i], ys[i], 0.22 * (1 - (i / n) * 0.5), col, { fill: true, segments: 10 });
        };
        if (m !== 'path') drawChain(dx, dy, 0xff8a5a);
        if (m !== 'direct') drawChain(pathX, pathY, 0x6fd3ff);
        g.agent(hx, hy, ha, 0.45, 0xffd166);
        if (dragging) g.circle(px, py, 0.3, 0xffffff);
      },
      pointer(x, y, down) {
        dragging = down;
        px = x;
        py = y;
      },
      status() {
        return `直接追従の経路からの最大ずれ ${devAvg.toFixed(2)} · 経路なぞりのずれ 0（定義上）· 記録点 ${PX.length} · ドラッグで先頭を誘導`;
      },
    };
  },
});
