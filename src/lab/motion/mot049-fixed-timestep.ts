import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';

interface Body { x: number; y: number; vx: number; vy: number }
const G = 30, FLOOR = 0, SPEED = 5;

/** 物理の1ステップ（半陰的オイラー＋床で弾性反射） */
function physics(b: Body, h: number): void {
  b.vy -= G * h;
  b.x += b.vx * h;
  b.y += b.vy * h;
  if (b.y < FLOOR) { b.y = FLOOR - (b.y - FLOOR); b.vy = Math.min(16, Math.abs(b.vy)); }
}

interface Lane { label: string; y0: number; color: number; trail: Trail; vel: number[]; apex: number; lastY: number; rising: boolean; dx: number; dy: number }

/** MOT-049 固定タイムステップと描画補間：可変 dt・固定刻み（補間なし）・固定刻み＋補間を並べる */
export default defineMotionDemo({
  id: 'MOT-049',
  notes: '擬似的な描画フレーム（fps と揺らぎで間隔が変わる）ごとに3通りで物理を進める。上（橙）は可変 dt でそのまま積分し、跳ねる高さがフレーム間隔で変わる。中（赤）は時間を貯めて固定の刻み h で消費し、最新の状態をそのまま描く（刻みが粗いとカクつく）。下（緑）は同じ固定刻みで、余り α=残り/h で直前と現在の状態を補間して描く。点は描画フレームごとの表示位置、下の帯は物理ステップ（青）と描画フレーム（白）の時刻。クリックで全員を跳ね上げる。',
  params: [
    { key: 'physHz', label: '物理の刻み（回/秒）', type: 'number', min: 2, max: 120, step: 1, default: 8 },
    {
      key: 'interp', label: '補間の有無', type: 'select', default: 'both',
      options: [{ value: 'both', label: '補間なし／ありを並べる' }, { value: 'off', label: '補間なしのみ' }, { value: 'on', label: '補間ありのみ' }],
    },
    { key: 'fps', label: '描画fps', type: 'number', min: 10, max: 60, step: 1, default: 40 },
    { key: 'jitter', label: '描画fpsの揺らぎ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'showVar', label: '可変 dt も表示', type: 'bool', default: true },
  ],
  create(env) {
    const init = (): Body => ({ x: 0, y: 0, vx: SPEED, vy: 14 });
    const varB = init();
    const fixCur = init(), fixPrev = init();
    let acc = 0, alpha = 0, renderAcc = 0, nextFrame = 1 / 40, realT = 0, steps = 0, frames = 0, stepsLast = 0;
    const lanes: Lane[] = [
      { label: '可変dt', y0: 4.2, color: 0xff8a5a, trail: new Trail(80), vel: [], apex: 0, lastY: 0, rising: true, dx: 0, dy: 0 },
      { label: '固定・補間なし', y0: -0.6, color: 0xff4d6d, trail: new Trail(80), vel: [], apex: 0, lastY: 0, rising: true, dx: 0, dy: 0 },
      { label: '固定・補間あり', y0: -5.4, color: 0x7dff8a, trail: new Trail(80), vel: [], apex: 0, lastY: 0, rising: true, dx: 0, dy: 0 },
    ];
    const tickTimes: number[] = [], frameTimes: number[] = [];
    let kick = false;
    const show = (lane: Lane, x: number, y: number, fdt: number) => {
      lane.vel.push(Math.hypot(x - lane.dx, y - lane.dy) / fdt);
      if (lane.vel.length > 60) lane.vel.shift();
      if (lane.rising && y < lane.lastY) { lane.apex = lane.lastY; lane.rising = false; }
      if (y > lane.lastY) lane.rising = true;
      lane.lastY = y;
      lane.dx = x; lane.dy = y;
      lane.trail.push(x, y);
    };
    const roughness = (v: number[]) => {
      if (v.length < 3) return 0;
      const m = v.reduce((a, b) => a + b, 0) / v.length;
      const s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length);
      return m > 0 ? s / m : 0;
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        realT += dt;
        renderAcc += dt;
        if (renderAcc < nextFrame) return;
        // 擬似的な描画フレームが来た
        const fdt = renderAcc;
        renderAcc = 0;
        const base = 1 / Number(p.fps);
        nextFrame = base * (1 + Number(p.jitter) * (env.rng() * 2 - 1) * 0.9);
        frames++;
        frameTimes.push(realT);
        if (kick) { varB.vy = Math.min(16, varB.vy + 10); fixCur.vy = Math.min(16, fixCur.vy + 10); kick = false; }
        // 可変 dt
        physics(varB, fdt);
        // 固定刻み：アキュムレータを消費
        const h = 1 / Number(p.physHz);
        acc += fdt;
        stepsLast = 0;
        while (acc >= h && stepsLast < 60) {
          Object.assign(fixPrev, fixCur);
          physics(fixCur, h);
          acc -= h;
          steps++;
          stepsLast++;
          tickTimes.push(realT - acc);
        }
        alpha = acc / h;
        show(lanes[0], varB.x, varB.y, fdt);
        show(lanes[1], fixCur.x, fixCur.y, fdt);
        show(lanes[2], fixPrev.x + (fixCur.x - fixPrev.x) * alpha, fixPrev.y + (fixCur.y - fixPrev.y) * alpha, fdt);
        while (tickTimes.length && tickTimes[0] < realT - 1.5) tickTimes.shift();
        while (frameTimes.length && frameTimes[0] < realT - 1.5) frameTimes.shift();
      },
      draw(g, p) {
        const { w, h } = env.bounds();
        const L = 2 * w - 3;
        const mode = String(p.interp);
        const vis = [Boolean(p.showVar), mode !== 'on', mode !== 'off'];
        const sy = 0.9;
        const wrapX = (x: number) => -w + 1.5 + (((x % L) + L) % L);
        lanes.forEach((ln, i) => {
          if (!vis[i]) return;
          g.line(-w + 1, ln.y0, w - 0.5, ln.y0, 0x555a80);
          g.line(-w + 1, ln.y0, -w + 1, ln.y0 + 3.6, ln.color, 0.6);
          if (p.showTrails) {
            const pts = ln.trail.points();
            for (let k = 0; k < pts.length; k += 2) {
              const a = (k + 2) / pts.length;
              g.circle(wrapX(pts[k]), ln.y0 + pts[k + 1] * sy + 0.35, 0.09, ln.color, { fill: true, segments: 6, alpha: a });
            }
          }
          g.circle(wrapX(ln.dx), ln.y0 + ln.dy * sy + 0.35, 0.35, ln.color, { fill: true });
        });
        // α（アキュムレータの残り / h）のバー
        if (vis[2]) {
          g.rect(w - 0.45, lanes[2].y0, 0.3, 3.6, 0x2a2f50);
          g.rect(w - 0.45, lanes[2].y0, 0.3, 3.6 * alpha, 0x7dff8a, { fill: true });
        }
        // 時刻の帯：直近 1.5 秒の物理ステップと描画フレーム
        const x0 = -w + 1, tw = 2 * w - 1.5, y0 = -h + 0.4;
        g.line(x0, y0, x0 + tw, y0, 0x2a2f50);
        for (const t of tickTimes) { const x = x0 + (1 - (realT - t) / 1.5) * tw; g.line(x, y0, x, y0 + 1.3, 0x5ab8ff); }
        for (const t of frameTimes) { const x = x0 + (1 - (realT - t) / 1.5) * tw; g.line(x, y0, x, y0 + 0.6, 0xffffff, 0.8); }
      },
      pointer(_x, _y, down) {
        if (down) kick = true;
      },
      status(p) {
        const r = lanes.map((l) => roughness(l.vel));
        return `α=${alpha.toFixed(2)} · 余り ${(acc * 1000).toFixed(0)}ms / h=${(1000 / Number(p.physHz)).toFixed(0)}ms · 直前フレームの物理ステップ ${stepsLast} · 見かけの速さのばらつき：可変 ${r[0].toFixed(2)} / 補間なし ${r[1].toFixed(2)} / 補間あり ${r[2].toFixed(2)} · 頂点の高さ：可変 ${lanes[0].apex.toFixed(2)} / 固定 ${lanes[1].apex.toFixed(2)} · 描画 ${frames} 回 · 物理 ${steps} 回`;
      },
    };
  },
});
