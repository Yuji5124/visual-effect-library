import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { clamp, limit, wrapAngle } from '../framework/crowdKit';

/** 隊形をリーダー座標系（前=+x、左=+y）のスロット列として作る */
function slots(shape: string, n: number, sp: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    if (shape === 'v') {
      const r = Math.floor(i / 2) + 1, s = i % 2 ? 1 : -1;
      out.push([-r * sp * 0.9, s * r * sp * 0.8]);
    } else if (shape === 'line') {
      out.push([-sp, (i - (n - 1) / 2) * sp]);
    } else if (shape === 'circle') {
      const R = Math.max(sp, (n * sp) / (Math.PI * 2));
      const a = (i / n) * Math.PI * 2;
      out.push([-R - sp + Math.cos(a) * R, Math.sin(a) * R]);
    } else {
      const k = Math.ceil(Math.sqrt(n));
      out.push([-sp * (1 + Math.floor(i / k)), ((i % k) - (k - 1) / 2) * sp]);
    }
  }
  return out;
}

/** MOT-031 隊列制御：リーダー座標系のスロットへ各メンバーが Arrive する */
export default defineMotionDemo({
  id: 'MOT-031',
  notes: '隊形をリーダー座標系の点（スロット）の集合として定義し、リーダーの位置と向きでワールドへ変換したスロットへ各メンバーが Arrive する（スロットの速度＝リーダー速度＋角速度×腕の長さ を先読みに使う）。隊形を変えると近いスロットから順に貪欲に割り当て直す。クリックでリーダーの目的地。旋回時は外側ほど速さが要る（橙の矢印）。',
  params: [
    {
      key: 'shape', label: '隊形', type: 'select', default: 'v',
      options: [{ value: 'v', label: 'V字' }, { value: 'line', label: '横列' }, { value: 'circle', label: '円陣' }, { value: 'square', label: '四角' }],
    },
    { key: 'count', label: '人数', type: 'number', min: 2, max: 40, step: 1, default: 12 },
    { key: 'spacing', label: '間隔', type: 'number', min: 0.6, max: 3, step: 0.05, default: 1.3 },
    { key: 'speed', label: 'メンバーの最高速度', type: 'number', min: 1, max: 12, step: 0.1, default: 6 },
    { key: 'leaderSpeed', label: 'リーダーの速さ', type: 'number', min: 0.5, max: 6, step: 0.1, default: 2.5 },
    { key: 'autoTarget', label: '目的地を自動で変える', type: 'bool', default: true },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    const L = { x: 0, y: 0, a: 0, v: 0, w: 0 };
    let tx = 8, ty = 4;
    const ms = Array.from({ length: n }, () => ({
      x: (env.rng() - 0.5) * 12, y: (env.rng() - 0.5) * 12, vx: 0, vy: 0, slot: 0, trail: new Trail(160), need: 0,
    }));
    let shapeKey = '';
    let errAvg = 0;
    const assign = (local: [number, number][]) => {
      // 近い組から順に割り当てる（貪欲法）
      const pairs: [number, number, number][] = [];
      const c = Math.cos(L.a), s = Math.sin(L.a);
      ms.forEach((m, i) => local.forEach(([lx, ly], j) => {
        const wx = L.x + lx * c - ly * s, wy = L.y + lx * s + ly * c;
        pairs.push([Math.hypot(m.x - wx, m.y - wy), i, j]);
      }));
      pairs.sort((a, b) => a[0] - b[0]);
      const ui = new Uint8Array(n), uj = new Uint8Array(n);
      for (const [, i, j] of pairs) if (!ui[i] && !uj[j]) { ui[i] = uj[j] = 1; ms[i].slot = j; }
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        const { w, h } = env.bounds();
        const local = slots(String(p.shape), n, Number(p.spacing));
        const key = `${p.shape}|${p.spacing}`;
        if (key !== shapeKey) { shapeKey = key; assign(local); }
        // リーダー：旋回速度を制限して目的地へ Arrive
        const dx = tx - L.x, dy = ty - L.y, d = Math.hypot(dx, dy);
        if (d < 0.6 && p.autoTarget) { tx = (env.rng() * 2 - 1) * (w - 3); ty = (env.rng() * 2 - 1) * (h - 3); }
        const want = wrapAngle(Math.atan2(dy, dx) - L.a);
        L.w = clamp(want * 3, -1.2, 1.2);
        L.a += L.w * dt;
        L.v += (Math.min(Number(p.leaderSpeed), d * 0.8) * Math.max(0, Math.cos(want)) - L.v) * Math.min(1, dt * 3);
        L.x += Math.cos(L.a) * L.v * dt;
        L.y += Math.sin(L.a) * L.v * dt;
        const c = Math.cos(L.a), s = Math.sin(L.a);
        const vmax = Number(p.speed);
        let err = 0;
        for (const m of ms) {
          const [lx, ly] = local[m.slot];
          const sx = L.x + lx * c - ly * s, sy = L.y + lx * s + ly * c;
          // スロットの速度 = リーダー速度 + ω × r
          const svx = Math.cos(L.a) * L.v - L.w * (lx * s + ly * c);
          const svy = Math.sin(L.a) * L.v + L.w * (lx * c - ly * s);
          m.need = Math.hypot(svx, svy);
          const ex = sx - m.x, ey = sy - m.y, ed = Math.hypot(ex, ey);
          err += ed;
          const ramp = Math.min(1, ed / 2.5);
          let [dvx, dvy] = limit(svx + (ex / (ed || 1)) * vmax * ramp, svy + (ey / (ed || 1)) * vmax * ramp, vmax);
          // 仲間との分離
          for (const o of ms) {
            if (o === m) continue;
            const ox = m.x - o.x, oy = m.y - o.y, od = Math.hypot(ox, oy);
            if (od < 0.7 && od > 1e-4) { dvx += (ox / od) * (0.7 - od) * 8; dvy += (oy / od) * (0.7 - od) * 8; }
          }
          const [ax, ay] = limit(dvx - m.vx, dvy - m.vy, 25 * dt);
          m.vx += ax;
          m.vy += ay;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          m.trail.push(m.x, m.y);
        }
        errAvg = err / n;
      },
      draw(g, p) {
        g.grid(1);
        const local = slots(String(p.shape), n, Number(p.spacing));
        const c = Math.cos(L.a), s = Math.sin(L.a);
        g.circle(tx, ty, 0.4, 0xffd166);
        g.line(tx - 0.5, ty, tx + 0.5, ty, 0xffd166);
        g.line(tx, ty - 0.5, tx, ty + 0.5, 0xffd166);
        g.line(L.x, L.y, tx, ty, 0xffd166, 0.25);
        for (const m of ms) {
          const [lx, ly] = local[m.slot];
          const sx = L.x + lx * c - ly * s, sy = L.y + lx * s + ly * c;
          if (p.showTrails) g.polyline(m.trail.points(), 0x6fd3ff, { fade: true, alpha: 0.35 });
          g.circle(sx, sy, 0.3, 0x5a6390);
          g.line(L.x, L.y, sx, sy, 0x2a3050);
          g.line(m.x, m.y, sx, sy, 0xff8a5a, 0.6);
          g.agent(m.x, m.y, Math.atan2(m.vy, m.vx), 0.3, 0x6fd3ff);
          // スロットが要求する速さ（旋回の外側ほど大きい）
          g.arrow(sx, sy, (m.vx / (Math.hypot(m.vx, m.vy) || 1)) * m.need * 0.25, (m.vy / (Math.hypot(m.vx, m.vy) || 1)) * m.need * 0.25, 0xffa040, 0.6);
        }
        g.agent(L.x, L.y, L.a, 0.5, 0xff6b8a);
      },
      pointer(x, y, down) {
        if (down) { tx = x; ty = y; }
      },
      action(key, p) {
        if (key === 'next') {
          const order = ['v', 'line', 'circle', 'square'];
          return { shape: order[(order.indexOf(String(p.shape)) + 1) % order.length] };
        }
      },
      status() {
        const needs = ms.map((m) => m.need);
        return `スロットとのずれ 平均 ${errAvg.toFixed(2)} · 要求速度 最小 ${Math.min(...needs).toFixed(1)} / 最大 ${Math.max(...needs).toFixed(1)} · 旋回 ${(L.w * 57.3).toFixed(0)}°/s · クリックで目的地`;
      },
    };
  },
  extraActions: [{ key: 'next', label: '▦ 次の隊形' }],
});
