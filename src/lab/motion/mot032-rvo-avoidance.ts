import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { heat, limit } from '../framework/crowdKit';

const R = 0.45; // エージェントの半径

/** 原点から速度 (ux,uy) で進む点が、中心 (px,py)・半径 rr の円に入るまでの時間（入らなければ ∞） */
function timeToHit(px: number, py: number, ux: number, uy: number, rr: number): number {
  const c = px * px + py * py - rr * rr;
  if (c < 0) return 0;
  const a = ux * ux + uy * uy;
  const b = px * ux + py * uy;
  if (b <= 0 || a < 1e-9) return Infinity;
  const disc = b * b - a * c;
  if (disc < 0) return Infinity;
  return (b - Math.sqrt(disc)) / a;
}

/** MOT-032 RVO：候補速度をサンプリングし、相互速度障害物を避けつつ希望速度に近いものを選ぶ */
export default defineMotionDemo({
  id: 'MOT-032',
  notes: '円周上のエージェントが対角へ一斉に移動する。各自が候補速度をサンプリングし、相手の速度障害物（VO）または頂点を自他の速度の中点へずらした RVO に入る候補へ「1/衝突までの時間」の罰則を付け、希望速度との差との和が最小の候補を選ぶ（van den Berg 2008 のサンプリング版）。0番のエージェントには候補（緑=安全、赤=見通し時間内に衝突）と錐体を描く。クリックした点に対して点対称の位置が新しい目的地になる。',
  params: [
    {
      key: 'method', label: '方式', type: 'select', default: 'rvo',
      options: [{ value: 'none', label: '回避なし' }, { value: 'vo', label: 'VO（相手は動かないと仮定）' }, { value: 'rvo', label: 'RVO（半分ずつ避ける）' }],
    },
    { key: 'count', label: '人数', type: 'number', min: 2, max: 40, step: 1, default: 18 },
    { key: 'horizon', label: '見通し時間（秒）', type: 'number', min: 0.3, max: 6, step: 0.1, default: 2.5 },
    { key: 'samples', label: '候補数', type: 'number', min: 10, max: 150, step: 1, default: 70 },
    { key: 'vmax', label: '最高速度', type: 'number', min: 0.5, max: 5, step: 0.1, default: 2.5 },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    const { h } = env.bounds();
    const rad = h - 1.5;
    const ag = Array.from({ length: n }, (_, i) => {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * rad, y = Math.sin(a) * rad;
      return { x, y, vx: 0, vy: 0, gx: -x, gy: -y, px: 0, py: 0, trail: new Trail(400), color: heat(i / n) };
    });
    let acc = 0, hits = 0, overlapping = 0, t = 0, arrivedAt = -1;
    const prevOver = new Set<number>();
    let samples0: { vx: number; vy: number; tc: number }[] = [];
    let chosen0 = [0, 0];

    const choose = (p: Record<string, unknown>) => {
      const method = String(p.method), hor = Number(p.horizon), vmax = Number(p.vmax);
      const ns = Math.round(Number(p.samples) * (env.quality === 'low' ? 0.5 : 1));
      const out: [number, number][] = [];
      for (let i = 0; i < n; i++) {
        const a = ag[i];
        const dx = a.gx - a.x, dy = a.gy - a.y, d = Math.hypot(dx, dy);
        const [pvx, pvy] = limit(dx * 1.5, dy * 1.5, vmax);
        a.px = pvx;
        a.py = pvy;
        if (method === 'none') { out.push([pvx, pvy]); continue; }
        const cand: [number, number][] = [[pvx, pvy], [0, 0], [a.vx, a.vy]];
        for (let k = 0; k < ns; k++) {
          const r = Math.sqrt(env.rng()) * vmax, th = env.rng() * Math.PI * 2;
          cand.push([Math.cos(th) * r, Math.sin(th) * r]);
        }
        let best = Infinity, bv: [number, number] = [0, 0];
        const rec: typeof samples0 = [];
        for (const [cx, cy] of cand) {
          let tc = Infinity;
          for (let j = 0; j < n; j++) {
            if (j === i) continue;
            const b = ag[j];
            const ox = b.x - a.x, oy = b.y - a.y;
            if (ox * ox + oy * oy > (vmax * 2 * hor + 2 * R) ** 2) continue;
            // VO：相対速度 v' − v_j、RVO：2v' − v_i − v_j
            const ux = method === 'rvo' ? 2 * cx - a.vx - b.vx : cx - b.vx;
            const uy = method === 'rvo' ? 2 * cy - a.vy - b.vy : cy - b.vy;
            const tt = timeToHit(ox, oy, ux, uy, 2 * R);
            if (tt < tc) tc = tt;
          }
          if (tc > hor) tc = Infinity;
          const pen = (tc === Infinity ? 0 : 1.2 / Math.max(tc, 1e-3)) + Math.hypot(cx - pvx, cy - pvy);
          if (pen < best) { best = pen; bv = [cx, cy]; }
          if (i === 0) rec.push({ vx: cx, vy: cy, tc });
        }
        if (i === 0) { samples0 = rec; chosen0 = bv; }
        if (d < 0.05) bv = [0, 0];
        out.push(bv);
      }
      out.forEach(([vx, vy], i) => { ag[i].vx = vx; ag[i].vy = vy; });
    };

    return {
      step(dt, p) {
        if (dt <= 0) return;
        t += dt;
        acc += dt;
        // 速度の選び直しは 20Hz（実際の RVO 実装と同じく一定周期）
        if (acc >= 0.05) { acc = 0; choose(p); }
        for (const a of ag) { a.x += a.vx * dt; a.y += a.vy * dt; a.trail.push(a.x, a.y); }
        overlapping = 0;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          const key = i * 1000 + j;
          const ov = Math.hypot(ag[i].x - ag[j].x, ag[i].y - ag[j].y) < 2 * R * 0.95;
          if (ov) { overlapping++; if (!prevOver.has(key)) { hits++; prevOver.add(key); } } else prevOver.delete(key);
        }
        const done = ag.every((a) => Math.hypot(a.gx - a.x, a.gy - a.y) < 0.2);
        if (done && arrivedAt < 0) arrivedAt = t;
        if (done && t - arrivedAt > 1.2) {
          // 全員到着したら再び対角へ
          for (const a of ag) { a.gx = -a.x; a.gy = -a.y; }
          arrivedAt = -1;
        }
      },
      draw(g, p) {
        g.grid(1);
        for (const a of ag) {
          if (p.showTrails) g.polyline(a.trail.points(), a.color, { fade: true, alpha: 0.4 });
          g.circle(a.gx, a.gy, 0.12, a.color, { alpha: 0.6 });
        }
        const a0 = ag[0];
        if (p.method !== 'none') {
          // 0番の候補速度（位置 + 速度×1秒）
          for (const s of samples0) g.circle(a0.x + s.vx, a0.y + s.vy, 0.06, s.tc === Infinity ? 0x7dff8a : 0xff3355, { fill: true, segments: 4, alpha: 0.8 });
          // 近い相手の錐体（頂点は VO では相手の速度、RVO では中点）
          for (let j = 1; j < n; j++) {
            const b = ag[j];
            const ox = b.x - a0.x, oy = b.y - a0.y, d = Math.hypot(ox, oy);
            if (d > 5 || d < 2 * R) continue;
            const apx = p.method === 'rvo' ? (a0.vx + b.vx) / 2 : b.vx, apy = p.method === 'rvo' ? (a0.vy + b.vy) / 2 : b.vy;
            const base = Math.atan2(oy, ox), half = Math.asin(Math.min(1, (2 * R) / d));
            for (const sgn of [-1, 1]) {
              const ang = base + sgn * half;
              g.line(a0.x + apx, a0.y + apy, a0.x + apx + Math.cos(ang) * 4, a0.y + apy + Math.sin(ang) * 4, 0xff8a5a, 0.5);
            }
          }
          g.arrow(a0.x, a0.y, chosen0[0], chosen0[1], 0xffffff);
        }
        for (const a of ag) {
          g.circle(a.x, a.y, R, a.color, { fill: true, segments: 14 });
          g.arrow(a.x, a.y, a.px * 0.5, a.py * 0.5, 0x8890c0, 0.6);
          g.arrow(a.x, a.y, a.vx * 0.5, a.vy * 0.5, 0xffffff);
        }
        g.circle(a0.x, a0.y, R + 0.12, 0xffffff);
      },
      pointer(x, y, down) {
        if (!down) return;
        for (const a of ag) { a.gx = 2 * x - a.x; a.gy = 2 * y - a.y; }
        arrivedAt = -1;
      },
      status(p) {
        const sp = ag.reduce((s, a) => s + Math.hypot(a.vx, a.vy), 0) / n;
        return `方式 ${String(p.method).toUpperCase()} · 接触 ${hits} 回（現在 ${overlapping} 組） · 平均速さ ${sp.toFixed(2)} · クリックで点対称の位置へ`;
      },
    };
  },
});
