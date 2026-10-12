import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { hueColor, integrate, seekForce, wrapBounds, type Mover } from '../framework/steerKit';

/** MOT-020 ワンダー：前方の円周上の点を小さく乱数移動させ、そこへ Seek する */
interface Agent extends Mover { wa: number; tx: number; ty: number; trail: Trail; color: number; naive: boolean; heading: number }

export default defineMotionDemo({
  id: 'MOT-020',
  notes: '各エージェントは進行方向に「円の距離」だけ先に半径 R の円を置き、円周上の目標点の角度を毎秒「揺れ」程度だけ乱数で動かし、その点へ Seek する。向きの変化が連続になり滑らかに蛇行する。赤は比較用の素朴な乱数旋回（毎ステップ独立な乱数で向きを変える）で、震えるだけになる。クリックした位置に全員を集め直す。',
  params: [
    { key: 'distance', label: '円の距離', type: 'number', min: 0, max: 8, step: 0.1, default: 3 },
    { key: 'radius', label: '円の半径', type: 'number', min: 0.1, max: 5, step: 0.05, default: 1.6 },
    { key: 'jitter', label: '揺れの大きさ（rad/秒）', type: 'number', min: 0, max: 20, step: 0.1, default: 6 },
    { key: 'count', label: '台数', type: 'number', min: 1, max: 40, step: 1, default: 10 },
    { key: 'naive', label: '素朴な乱数旋回も表示', type: 'bool', default: true },
  ],
  resetKeys: ['count'],
  create(env, params) {
    const agents: Agent[] = [];
    const mk = (naive: boolean, i: number): Agent => {
      const a = env.rng() * Math.PI * 2;
      return { x: (env.rng() * 2 - 1) * 10, y: (env.rng() * 2 - 1) * 7, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, wa: 0, tx: 0, ty: 0, trail: new Trail(400), color: naive ? 0xff5060 : hueColor(0.3 + i * 0.05), naive, heading: a };
    };
    for (let i = 0; i < Number(params.count); i++) agents.push(mk(false, i));
    agents.push(mk(true, 0));
    const speed = 4.5;
    return {
      step(dt, p) {
        if (dt <= 0) return;
        const D = Number(p.distance), R = Number(p.radius), J = Number(p.jitter);
        const { w, h } = env.bounds();
        for (const a of agents) {
          if (a.naive) {
            if (!p.naive) continue;
            // 毎ステップ独立な乱数で向きを変える（同じ平均的な旋回量）
            a.heading += (env.rng() * 2 - 1) * J * 0.12;
            a.vx = Math.cos(a.heading) * speed;
            a.vy = Math.sin(a.heading) * speed;
            a.x += a.vx * dt;
            a.y += a.vy * dt;
          } else {
            // 円周上の角度を小さく乱数移動（ランダムウォーク）
            a.wa += (env.rng() * 2 - 1) * J * Math.sqrt(dt) * 0.8;
            const sp = Math.hypot(a.vx, a.vy) || 1;
            const hx = a.vx / sp, hy = a.vy / sp;
            const lx = Math.cos(a.wa) * R, ly = Math.sin(a.wa) * R;
            a.tx = a.x + hx * D + (hx * lx - hy * ly);
            a.ty = a.y + hy * D + (hy * lx + hx * ly);
            const [fx, fy] = seekForce(a, a.tx, a.ty, speed);
            integrate(a, fx, fy, 10, speed, dt);
          }
          if (wrapBounds(a, w, h)) a.trail.clear();
          a.trail.push(a.x, a.y);
        }
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const D = Number(p.distance), R = Number(p.radius);
        for (const a of agents) {
          if (a.naive && !p.naive) continue;
          if (p.showTrails) g.polyline(a.trail.points(), a.color, { fade: true, alpha: 0.85 });
          const ang = Math.atan2(a.vy, a.vx);
          if (!a.naive) {
            const hx = Math.cos(ang), hy = Math.sin(ang);
            const ccx = a.x + hx * D, ccy = a.y + hy * D;
            g.line(a.x, a.y, ccx, ccy, 0x5a6090, 0.6);
            g.circle(ccx, ccy, R, 0x5a6090, { alpha: 0.7, segments: 24 });
            g.line(ccx, ccy, a.tx, a.ty, a.color, 0.5);
            g.circle(a.tx, a.ty, 0.14, 0xffffff, { fill: true });
            g.line(a.x, a.y, a.tx, a.ty, 0xffffff, 0.2);
          }
          g.agent(a.x, a.y, ang, 0.38, a.color);
        }
      },
      pointer(x, y, down) {
        if (!down) return;
        for (const a of agents) {
          a.x = x + (env.rng() - 0.5) * 0.6;
          a.y = y + (env.rng() - 0.5) * 0.6;
          a.trail.clear();
        }
      },
      status(p) {
        // 角速度の平均的な大きさ（滑らかさの目安）
        const D = Number(p.distance), R = Number(p.radius);
        return `ワンダー：円の距離 ${D.toFixed(1)}・半径 ${R.toFixed(1)}（最大旋回 ≈ ${((Math.atan2(R, D) * 180) / Math.PI).toFixed(0)}°）· 赤＝素朴な乱数旋回 · クリックで全員を集める`;
      },
    };
  },
});
