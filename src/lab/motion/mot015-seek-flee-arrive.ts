import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { arriveForce, fleeForce, integrate, seekForce, type Mover } from '../framework/steerKit';

/** MOT-015 Reynolds のステアリング：Seek・Flee・Arrive を同じ目標に対して並べる */
type Kind = 'seek' | 'flee' | 'arrive';
interface Agent extends Mover { kind: Kind; trail: Trail; fx: number; fy: number }
const COLOR: Record<Kind, number> = { seek: 0xffa040, flee: 0xff5c8a, arrive: 0x4ad8ff };

export default defineMotionDemo({
  id: 'MOT-015',
  notes: 'ステアリング力＝望む速度−現在の速度を最大操舵力で切り詰めて加える。橙 Seek は最大速度で突っ込んで行き過ぎ、桃 Flee は逃走半径の内側で逆向きに逃げ、水色 Arrive は減速半径（外側の円）の内側で距離に比例して減速し、ぴたりと止まる。白が速度、赤がステアリング力。クリックで目標を移動。',
  params: [
    { key: 'maxSpeed', label: '最大速度', type: 'number', min: 1, max: 20, step: 0.1, default: 8 },
    { key: 'maxForce', label: '最大操舵力', type: 'number', min: 1, max: 60, step: 0.5, default: 14 },
    { key: 'slowRadius', label: '減速半径', type: 'number', min: 0.5, max: 12, step: 0.1, default: 5 },
    { key: 'perKind', label: '各方式の数', type: 'number', min: 1, max: 10, step: 1, default: 4 },
    { key: 'vectors', label: '速度・力の矢印', type: 'bool', default: true },
  ],
  resetKeys: ['perKind'],
  create(env, params) {
    const agents: Agent[] = [];
    const n = Number(params.perKind);
    (['seek', 'flee', 'arrive'] as Kind[]).forEach((kind) => {
      for (let i = 0; i < n; i++) {
        agents.push({ kind, x: (env.rng() * 2 - 1) * 12, y: (env.rng() * 2 - 1) * 8, vx: 0, vy: 0, trail: new Trail(240), fx: 0, fy: 0 });
      }
    });
    const tgt = { x: 0, y: 0 };
    const PANIC = 6;
    let idle = 0;
    return {
      step(dt, p) {
        if (dt <= 0) return;
        idle += dt;
        const { w, h } = env.bounds();
        if (idle > 6) {
          idle = 0;
          tgt.x = (env.rng() * 2 - 1) * (w - 3);
          tgt.y = (env.rng() * 2 - 1) * (h - 3);
        }
        const ms = Number(p.maxSpeed), mf = Number(p.maxForce), sr = Number(p.slowRadius);
        for (const a of agents) {
          let f: [number, number];
          if (a.kind === 'seek') f = seekForce(a, tgt.x, tgt.y, ms);
          else if (a.kind === 'arrive') f = arriveForce(a, tgt.x, tgt.y, ms, sr);
          else if (Math.hypot(a.x - tgt.x, a.y - tgt.y) < PANIC) f = fleeForce(a, tgt.x, tgt.y, ms);
          else f = [-a.vx, -a.vy]; // 逃走半径の外では止まる
          // 画面の外へ出ないよう壁から押し戻す
          const m = 1.5;
          if (a.x > w - m) f[0] -= mf * 2; if (a.x < -w + m) f[0] += mf * 2;
          if (a.y > h - m) f[1] -= mf * 2; if (a.y < -h + m) f[1] += mf * 2;
          a.fx = f[0]; a.fy = f[1];
          integrate(a, f[0], f[1], mf, ms, dt);
          a.x = Math.max(-w, Math.min(w, a.x));
          a.y = Math.max(-h, Math.min(h, a.y));
          a.trail.push(a.x, a.y);
        }
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const sr = Number(p.slowRadius), mf = Number(p.maxForce);
        g.circle(tgt.x, tgt.y, sr, COLOR.arrive, { alpha: 0.45, segments: 48 });
        g.circle(tgt.x, tgt.y, PANIC, COLOR.flee, { alpha: 0.3, segments: 48 });
        for (const a of agents) {
          if (p.showTrails) g.polyline(a.trail.points(), COLOR[a.kind], { fade: true, alpha: 0.8 });
          if (p.vectors) {
            g.arrow(a.x, a.y, a.vx * 0.25, a.vy * 0.25, 0xffffff, 0.7);
            const l = Math.hypot(a.fx, a.fy), k = l > mf ? mf / l : 1;
            g.arrow(a.x, a.y, a.fx * k * 0.12, a.fy * k * 0.12, 0xff4050, 0.9);
          }
          g.agent(a.x, a.y, Math.atan2(a.vy, a.vx), 0.35, COLOR[a.kind]);
        }
        g.circle(tgt.x, tgt.y, 0.4, 0xffffff, { fill: true });
      },
      pointer(x, y, down) {
        if (!down) return;
        tgt.x = x;
        tgt.y = y;
        idle = 0;
      },
      status() {
        const avg = (k: Kind) => {
          const l = agents.filter((a) => a.kind === k);
          return (l.reduce((s, a) => s + Math.hypot(a.x - tgt.x, a.y - tgt.y), 0) / l.length).toFixed(1);
        };
        const arr = agents.filter((a) => a.kind === 'arrive');
        const sp = arr.reduce((s, a) => s + Math.hypot(a.vx, a.vy), 0) / arr.length;
        return `平均距離 Seek ${avg('seek')} · Flee ${avg('flee')} · Arrive ${avg('arrive')}（平均速さ ${sp.toFixed(2)}）· クリックで目標`;
      },
    };
  },
});
