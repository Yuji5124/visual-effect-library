import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { limit } from '../framework/crowdKit';

/** MOT-033 リーダー追従：後方点への Arrive＋分離＋リーダー前方からの退避 */
export default defineMotionDemo({
  id: 'MOT-033',
  notes: 'Reynolds のリーダー追従。各メンバーの操舵力＝リーダー後方の点への Arrive（緑）＋仲間との分離（青）＋リーダー前方の円（黄の退避領域）に入った時にリーダーの進路から横へ逃げる力（赤）。リーダーはドラッグした点へ向かい、離すと自動で徘徊する。',
  params: [
    { key: 'behind', label: '追従距離', type: 'number', min: 0.5, max: 6, step: 0.1, default: 2.2 },
    { key: 'sep', label: '分離の強さ', type: 'number', min: 0, max: 10, step: 0.1, default: 3 },
    { key: 'evade', label: '退避の強さ', type: 'number', min: 0, max: 10, step: 0.1, default: 4 },
    { key: 'count', label: '人数', type: 'number', min: 1, max: 60, step: 1, default: 20 },
    { key: 'speed', label: '最高速度', type: 'number', min: 1, max: 10, step: 0.1, default: 4.5 },
    { key: 'showForces', label: '力のベクトルを表示', type: 'bool', default: true },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    const L = { x: 0, y: 0, vx: 2, vy: 0, wa: 0 };
    let px = 0, py = 0, dragging = false;
    const lt = new Trail(300);
    const fs = Array.from({ length: n }, () => ({
      x: (env.rng() - 0.5) * 10, y: (env.rng() - 0.5) * 10, vx: 0, vy: 0, trail: new Trail(120),
      fa: [0, 0], fs: [0, 0], fe: [0, 0],
    }));
    let inZone = 0;
    return {
      step(dt, p) {
        if (dt <= 0) return;
        const { w, h } = env.bounds();
        const vmax = Number(p.speed);
        // リーダー：ドラッグ中はポインタへ、それ以外は徘徊
        let ax: number, ay: number;
        if (dragging) {
          [ax, ay] = limit((px - L.x) * 2 - L.vx, (py - L.y) * 2 - L.vy, 8);
        } else {
          L.wa += (env.rng() - 0.5) * 6 * dt;
          const sp = Math.hypot(L.vx, L.vy) || 1;
          const dx = L.vx / sp, dy = L.vy / sp;
          const cx = L.x + dx * 2 + Math.cos(L.wa), cy = L.y + dy * 2 + Math.sin(L.wa);
          [ax, ay] = limit(cx - L.x - dx * 1.5, cy - L.y - dy * 1.5, 3);
          if (Math.abs(L.x) > w - 3) ax -= Math.sign(L.x) * 4;
          if (Math.abs(L.y) > h - 3) ay -= Math.sign(L.y) * 4;
        }
        [L.vx, L.vy] = limit(L.vx + ax * dt, L.vy + ay * dt, vmax * 0.7);
        L.x += L.vx * dt;
        L.y += L.vy * dt;
        lt.push(L.x, L.y);
        const ls = Math.hypot(L.vx, L.vy) || 1;
        const hx = L.vx / ls, hy = L.vy / ls;
        const bx = L.x - hx * Number(p.behind), by = L.y - hy * Number(p.behind);
        const aheadX = L.x + hx * 2, aheadY = L.y + hy * 2, aheadR = 1.8;
        inZone = 0;
        for (const f of fs) {
          // Arrive：後方点へ、近づくと減速
          const dx = bx - f.x, dy = by - f.y, d = Math.hypot(dx, dy);
          const ramp = Math.min(1, d / 2);
          const [dvx, dvy] = limit((dx / (d || 1)) * vmax * ramp, (dy / (d || 1)) * vmax * ramp, vmax);
          f.fa = [dvx - f.vx, dvy - f.vy];
          // 分離
          let sx = 0, sy = 0;
          for (const o of fs) {
            if (o === f) continue;
            const ox = f.x - o.x, oy = f.y - o.y, od2 = ox * ox + oy * oy;
            if (od2 < 1.4 * 1.4 && od2 > 1e-6) { sx += ox / od2; sy += oy / od2; }
          }
          f.fs = [sx * Number(p.sep), sy * Number(p.sep)];
          // 退避：リーダー前方の円の中、またはリーダーに近い時は進路から横へ
          let ex = 0, ey = 0;
          const zx = f.x - aheadX, zy = f.y - aheadY;
          if (Math.hypot(zx, zy) < aheadR || Math.hypot(f.x - L.x, f.y - L.y) < aheadR) {
            inZone++;
            const side = (f.x - L.x) * -hy + (f.y - L.y) * hx >= 0 ? 1 : -1;
            ex = -hy * side * vmax;
            ey = hx * side * vmax;
          }
          f.fe = [ex * Number(p.evade) * 0.5, ey * Number(p.evade) * 0.5];
          const [sx2, sy2] = limit(f.fa[0] * 2 + f.fs[0] + f.fe[0], f.fa[1] * 2 + f.fs[1] + f.fe[1], 30);
          [f.vx, f.vy] = limit(f.vx + sx2 * dt, f.vy + sy2 * dt, vmax);
          f.x += f.vx * dt;
          f.y += f.vy * dt;
          f.trail.push(f.x, f.y);
        }
      },
      draw(g, p) {
        g.grid(1);
        const ls = Math.hypot(L.vx, L.vy) || 1;
        const hx = L.vx / ls, hy = L.vy / ls;
        g.circle(L.x + hx * 2, L.y + hy * 2, 1.8, 0xffd166, { alpha: 0.6 });
        const bx = L.x - hx * Number(p.behind), by = L.y - hy * Number(p.behind);
        g.line(L.x, L.y, bx, by, 0x7dff8a, 0.5);
        g.circle(bx, by, 0.25, 0x7dff8a, { fill: true });
        if (p.showTrails) {
          g.polyline(lt.points(), 0xff6b8a, { fade: true, alpha: 0.6 });
          for (const f of fs) g.polyline(f.trail.points(), 0x6fd3ff, { fade: true, alpha: 0.3 });
        }
        for (const f of fs) {
          if (p.showForces) {
            g.arrow(f.x, f.y, f.fa[0] * 0.2, f.fa[1] * 0.2, 0x7dff8a, 0.8);
            g.arrow(f.x, f.y, f.fs[0] * 0.2, f.fs[1] * 0.2, 0x5ab8ff, 0.8);
            g.arrow(f.x, f.y, f.fe[0] * 0.2, f.fe[1] * 0.2, 0xff3355, 0.9);
          }
          g.agent(f.x, f.y, Math.atan2(f.vy, f.vx), 0.3, 0xd8def5);
        }
        g.agent(L.x, L.y, Math.atan2(L.vy, L.vx), 0.55, 0xff6b8a);
        if (dragging) g.circle(px, py, 0.3, 0xffffff);
      },
      pointer(x, y, down) {
        dragging = down;
        px = x;
        py = y;
      },
      status(p) {
        const ls = Math.hypot(L.vx, L.vy) || 1;
        const bx = L.x - (L.vx / ls) * Number(p.behind), by = L.y - (L.vy / ls) * Number(p.behind);
        const avg = fs.reduce((s, f) => s + Math.hypot(f.x - bx, f.y - by), 0) / n;
        return `退避中 ${inZone} 人 · 後方点までの平均距離 ${avg.toFixed(2)} · リーダー速さ ${ls.toFixed(2)} · ドラッグでリーダーを誘導`;
      },
    };
  },
});
