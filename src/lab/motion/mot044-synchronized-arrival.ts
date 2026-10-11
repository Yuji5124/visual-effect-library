import type { ParamValues } from '../../engine/types';
import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { hsl } from '../framework/crowdKit';

/** 台形速度（加速 a、最高速度 v）で距離 d を進むのにかかる時間 */
function trapTime(d: number, v: number, a: number): number {
  if (a <= 0) return d / v;
  if (d < (v * v) / a) return 2 * Math.sqrt(d / a); // 三角形（最高速度に届かない）
  return d / v + v / a;
}

/** 台形速度プロファイルで経過 t のときの進んだ距離と速さ */
function trapPos(d: number, v: number, a: number, t: number): [number, number] {
  if (a <= 0) return t * v >= d ? [d, 0] : [t * v, v];
  const ta = v / a, T = trapTime(d, v, a);
  if (t >= T) return [d, 0];
  if (d < v * ta) {
    // 三角形
    const th = T / 2, vp = a * th;
    return t < th ? [0.5 * a * t * t, a * t] : [d - 0.5 * a * (T - t) ** 2, vp - a * (t - th)];
  }
  if (t < ta) return [0.5 * a * t * t, a * t];
  if (t > T - ta) return [d - 0.5 * a * (T - t) ** 2, a * (T - t)];
  return [0.5 * v * ta + v * (t - ta), v];
}

interface Agent { sx: number; sy: number; tx: number; ty: number; d: number; v: number; arrive: number; x: number; y: number; speed: number; trail: Trail }

/** MOT-044 到着時刻の同期：最も遠い者の所要時間 T に全員を合わせ、各自の最高速度を逆算 */
export default defineMotionDemo({
  id: 'MOT-044',
  notes: 'ばらばらの位置から円周上の目標へ集まる。同期ありでは最も遠い者の所要時間 T を求め、各自の最高速度を d_i/T（加減速ありなら d = v(T − v/a) を解いた v）にして同時に到着させる。同期なしは全員同じ最高速度。下のグラフは各自の速さの時間変化、status は到着時刻のばらつき。クリックで集合場所を変える。',
  params: [
    { key: 'sync', label: '同期する', type: 'bool', default: true },
    { key: 'accel', label: '加減速（0 で無し）', type: 'number', min: 0, max: 20, step: 0.5, default: 5 },
    { key: 'count', label: '人数', type: 'number', min: 3, max: 40, step: 1, default: 14 },
    { key: 'vmax', label: '最高速度', type: 'number', min: 1, max: 12, step: 0.5, default: 5 },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    const agents: Agent[] = [];
    for (let i = 0; i < n; i++) agents.push({ sx: 0, sy: 0, tx: 0, ty: 0, d: 0, v: 1, arrive: -1, x: 0, y: 0, speed: 0, trail: new Trail(200) });
    let cx = 0, cy = 1.5, t = 0, T = 1, wait = 0, spread = 0, done = false;
    const speedHist: Float32Array[] = agents.map(() => new Float32Array(240));
    let histN = 0, sampleT = 0;
    const HZ = 30;
    let lastSync = true;
    const plan = (p: ParamValues) => {
      const vmax = Number(p.vmax), a = Number(p.accel);
      // 必要時間の最大値 T（最も遠い者が最高速度で行く時間）
      T = 0;
      for (const ag of agents) T = Math.max(T, trapTime(ag.d, vmax, a));
      for (const ag of agents) {
        if (!p.sync) { ag.v = vmax; continue; }
        if (a <= 0) ag.v = ag.d / T;
        else {
          // d = v(T − v/a) を v について解く（小さい方の根）
          const disc = a * a * T * T - 4 * a * ag.d;
          ag.v = disc >= 0 ? (a * T - Math.sqrt(disc)) / 2 : vmax;
          ag.v = Math.max(1e-3, ag.v);
        }
      }
      lastSync = Boolean(p.sync);
    };
    const scatter = (p: ParamValues) => {
      const { w, h } = env.bounds();
      const R = 3.2;
      // 開始点を乱数で置き、角度順に円周の目標を割り当てる（経路が交差しにくい）
      const tmp = agents.map((ag) => {
        ag.sx = (env.rng() * 2 - 1) * (w - 1.5);
        ag.sy = -h + 5 + env.rng() * (2 * h - 6.5);
        return ag;
      });
      tmp.sort((a, b) => Math.atan2(a.sy - cy, a.sx - cx) - Math.atan2(b.sy - cy, b.sx - cx));
      const a0 = Math.atan2(tmp[0].sy - cy, tmp[0].sx - cx);
      tmp.forEach((ag, i) => {
        const ang = a0 + (i / n) * Math.PI * 2;
        ag.tx = cx + Math.cos(ang) * R;
        ag.ty = cy + Math.sin(ang) * R;
        ag.d = Math.hypot(ag.tx - ag.sx, ag.ty - ag.sy);
        ag.x = ag.sx; ag.y = ag.sy; ag.arrive = -1; ag.speed = 0;
        ag.trail.clear();
      });
      t = 0; wait = 0; done = false; histN = 0; sampleT = 0;
      plan(p);
    };
    let started = false;
    return {
      step(dt, p) {
        if (!started) { scatter(p); started = true; }
        if (dt <= 0) return;
        if (Boolean(p.sync) !== lastSync) scatter(p);
        if (done) {
          wait += dt;
          if (wait > 1.5) scatter(p);
          return;
        }
        t += dt;
        const a = Number(p.accel);
        let all = true;
        for (const ag of agents) {
          const [s, sp] = trapPos(ag.d, ag.v, a, t);
          const u = ag.d > 0 ? s / ag.d : 1;
          ag.x = ag.sx + (ag.tx - ag.sx) * u;
          ag.y = ag.sy + (ag.ty - ag.sy) * u;
          ag.speed = sp;
          ag.trail.push(ag.x, ag.y);
          if (s >= ag.d - 1e-6 && ag.arrive < 0) ag.arrive = t;
          if (ag.arrive < 0) all = false;
        }
        if (t >= sampleT && histN < 240) {
          sampleT += 1 / HZ;
          agents.forEach((ag, i) => { speedHist[i][histN] = ag.speed; });
          histN++;
        }
        if (all) {
          done = true;
          let lo = Infinity, hi = 0;
          for (const ag of agents) { lo = Math.min(lo, ag.arrive); hi = Math.max(hi, ag.arrive); }
          spread = hi - lo;
        }
      },
      draw(g, p) {
        g.grid(1);
        const { w, h } = env.bounds();
        g.circle(cx, cy, 3.2, 0x555a80, { segments: 48 });
        agents.forEach((ag, i) => {
          const col = hsl(i / n, 0.7, 0.62);
          g.line(ag.sx, ag.sy, ag.tx, ag.ty, col, 0.15);
          g.circle(ag.tx, ag.ty, 0.18, col);
          if (p.showTrails) g.polyline(ag.trail.points(), col, { fade: true, alpha: 0.7 });
          g.agent(ag.x, ag.y, Math.atan2(ag.ty - ag.sy, ag.tx - ag.sx), 0.3, ag.arrive >= 0 ? 0xffffff : col);
        });
        // 下：速さ−時間グラフ（横軸 8 秒）
        const gx0 = -w + 1, gw = 2 * w - 2, gy0 = -h + 0.4, gh = 2.4;
        g.rect(gx0, gy0, gw, gh, 0x2a2f50);
        const vmax = Number(p.vmax);
        agents.forEach((_ag, i) => {
          const col = hsl(i / n, 0.7, 0.62);
          const pts = new Float32Array(histN * 2);
          for (let k = 0; k < histN; k++) { pts[k * 2] = gx0 + (k / 240) * gw; pts[k * 2 + 1] = gy0 + (speedHist[i][k] / vmax) * gh * 0.95; }
          g.polyline(pts, col, { alpha: 0.8 });
        });
        if (p.sync) g.line(gx0 + (T * HZ / 240) * gw, gy0, gx0 + (T * HZ / 240) * gw, gy0 + gh, 0xffffff, 0.5);
      },
      pointer(x, y, down, p) {
        if (down) { cx = x; cy = Math.max(-4, y); scatter(p); }
      },
      status(p) {
        const arrived = agents.filter((a) => a.arrive >= 0).length;
        return `${p.sync ? '同期あり' : '同期なし'} · 目標時間 T=${T.toFixed(2)}s · 到着 ${arrived}/${n} · 到着時刻のばらつき ${done ? spread.toFixed(3) + 's' : '…'} · 経過 ${t.toFixed(2)}s · クリックで集合場所を変更`;
      },
    };
  },
});
