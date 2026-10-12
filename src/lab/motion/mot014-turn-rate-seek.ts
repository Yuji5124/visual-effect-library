import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { hueColor, wrapAngle } from '../framework/steerKit';

/** MOT-014 旋回角速度を制限した追従：向きの変化を ω·dt 以内に抑え、最小旋回円 R=v/ω を描く */
interface Car { x: number; y: number; a: number; k: number; trail: Trail; color: number; near: number; reached: number }

export default defineMotionDemo({
  id: 'MOT-014',
  notes: '各追従者は速さ一定で、目標方向との角度差を毎ステップ ±ω·dt に切り詰めて向きを変える（ω は台ごとに 0.6〜1.4 倍）。左右の円が最小旋回円（半径 R=v/ω）。目標がこの円の内側に入ると届かずに周回し続ける。クリックで目標を置く（触らないと数秒ごとに移動）。',
  params: [
    { key: 'speed', label: '速さ', type: 'number', min: 1, max: 15, step: 0.1, default: 6 },
    { key: 'omega', label: '最大角速度（rad/s）', type: 'number', min: 0.3, max: 6, step: 0.05, default: 1.6 },
    { key: 'count', label: '台数', type: 'number', min: 1, max: 12, step: 1, default: 5 },
    { key: 'circles', label: '最小旋回円を表示', type: 'bool', default: true },
  ],
  resetKeys: ['count'],
  create(env, params) {
    const n = Number(params.count);
    const cars: Car[] = [];
    for (let i = 0; i < n; i++) {
      cars.push({ x: (env.rng() * 2 - 1) * 8, y: (env.rng() * 2 - 1) * 7, a: env.rng() * Math.PI * 2, k: n === 1 ? 1 : 0.6 + (0.8 * i) / (n - 1), trail: new Trail(500), color: hueColor(0.55 + i * 0.07), near: 0, reached: 0 });
    }
    const tgt = { x: 3, y: 1 };
    let idle = 0;
    return {
      step(dt, p) {
        if (dt <= 0) return;
        idle += dt;
        if (idle > 7) {
          idle = 0;
          const { w } = env.bounds();
          tgt.x = (env.rng() * 2 - 1) * (w - 2);
          tgt.y = (env.rng() * 2 - 1) * 8;
        }
        const v = Number(p.speed), om = Number(p.omega);
        for (const c of cars) {
          const want = Math.atan2(tgt.y - c.y, tgt.x - c.x);
          const lim = om * c.k * dt;
          c.a = wrapAngle(c.a + Math.max(-lim, Math.min(lim, wrapAngle(want - c.a))));
          c.x += Math.cos(c.a) * v * dt;
          c.y += Math.sin(c.a) * v * dt;
          c.trail.push(c.x, c.y);
          const d = Math.hypot(tgt.x - c.x, tgt.y - c.y);
          if (d < 0.35) c.reached++;
          // 旋回円の内側に目標がある＝周回中
          const R = v / (om * c.k);
          const lx = c.x - Math.sin(c.a) * R, ly = c.y + Math.cos(c.a) * R;
          const rx = c.x + Math.sin(c.a) * R, ry = c.y - Math.cos(c.a) * R;
          const inside = Math.hypot(tgt.x - lx, tgt.y - ly) < R || Math.hypot(tgt.x - rx, tgt.y - ry) < R;
          c.near = inside ? c.near + dt : 0;
        }
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const v = Number(p.speed), om = Number(p.omega);
        for (const c of cars) {
          if (p.showTrails) g.polyline(c.trail.points(), c.color, { fade: true });
          if (p.circles) {
            const R = v / (om * c.k);
            g.circle(c.x - Math.sin(c.a) * R, c.y + Math.cos(c.a) * R, R, c.color, { alpha: 0.35, segments: 40 });
            g.circle(c.x + Math.sin(c.a) * R, c.y - Math.cos(c.a) * R, R, c.color, { alpha: 0.35, segments: 40 });
          }
          g.line(c.x, c.y, tgt.x, tgt.y, c.color, 0.15);
          g.arrow(c.x, c.y, Math.cos(c.a) * 1.4, Math.sin(c.a) * 1.4, 0xffffff, 0.6);
          g.agent(c.x, c.y, c.a, 0.4, c.near > 1 ? 0xff5060 : c.color);
        }
        g.circle(tgt.x, tgt.y, 0.45, 0xffffff);
        g.circle(tgt.x, tgt.y, 0.12, 0xffffff, { fill: true });
      },
      pointer(x, y, down) {
        if (!down) return;
        tgt.x = x;
        tgt.y = y;
        idle = 0;
      },
      status(p) {
        const v = Number(p.speed), om = Number(p.omega);
        const orbit = cars.filter((c) => c.near > 1).length;
        return `最小旋回半径 R=v/ω=${(v / om).toFixed(2)}（台ごと ${(v / (om * 1.4)).toFixed(1)}〜${(v / (om * 0.6)).toFixed(1)}）· 周回中 ${orbit}/${cars.length} 台（赤）· 到達 ${cars.reduce((s, c) => s + c.reached, 0)} 回 · クリックで目標`;
      },
    };
  },
});
