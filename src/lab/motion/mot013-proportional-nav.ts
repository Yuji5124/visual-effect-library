import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { hueColor, wrapAngle } from '../framework/steerKit';

/** MOT-013 比例航法：横加速度 a = N·Vc·λ˙ を速度に直交して与える */
interface Missile { x: number; y: number; vx: number; vy: number; trail: Trail; acc: number; ldot: number; t: number; color: number; boom: number; bx: number; by: number }

export default defineMotionDemo({
  id: 'MOT-013',
  notes: '各誘導体は視線角 λ の変化率 λ˙=(r×v_rel)/|r|² と接近速度 Vc=−(r·v_rel)/|r| から、横加速度 a=N·Vc·λ˙（上限あり）を速度に直交して加える（速さは一定）。細線が視線、赤い矢印が横加速度。命中か15秒で画面端から再発射。クリックした地点へ目標が回避しながら向かう。',
  params: [
    { key: 'N', label: '航法定数 N', type: 'number', min: 0, max: 8, step: 0.1, default: 4 },
    { key: 'amax', label: '最大横加速度', type: 'number', min: 2, max: 80, step: 1, default: 35 },
    { key: 'evade', label: '目標の回避', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'count', label: '誘導体の数', type: 'number', min: 1, max: 12, step: 1, default: 5 },
    { key: 'mspeed', label: '誘導体の速さ', type: 'number', min: 3, max: 20, step: 0.1, default: 9 },
  ],
  resetKeys: ['count'],
  create(env, params) {
    const tgt = { x: 0, y: 0, a: 0, speed: 4, trail: new Trail(400), wx: 0, wy: 0 };
    let time = 0, hits = 0, misses = 0;
    const missiles: Missile[] = [];
    const launch = (m: Missile, sp: number) => {
      const { w, h } = env.bounds();
      const side = Math.floor(env.rng() * 4);
      const u = env.rng() * 2 - 1;
      m.x = side < 2 ? (side === 0 ? -w : w) : u * w;
      m.y = side < 2 ? u * h : side === 2 ? -h : h;
      // 目標から少し外した向きで発射
      const a = Math.atan2(tgt.y - m.y, tgt.x - m.x) + (env.rng() - 0.5) * 1.6;
      m.vx = Math.cos(a) * sp;
      m.vy = Math.sin(a) * sp;
      m.t = 0;
      m.trail.clear();
    };
    const n = Number(params.count);
    for (let i = 0; i < n; i++) {
      const m: Missile = { x: 0, y: 0, vx: 0, vy: 0, trail: new Trail(300), acc: 0, ldot: 0, t: 0, color: hueColor(0.08 + i * 0.09), boom: 0, bx: 0, by: 0 };
      launch(m, Number(params.mspeed));
      m.t = -i * 0.7; // 時間差で発射
      missiles.push(m);
    }
    return {
      step(dt, p) {
        if (dt <= 0) return;
        time += dt;
        const { w, h } = env.bounds();
        // 目標：ウェイポイントへ向かいながら左右に蛇行して回避
        const ev = Number(p.evade);
        if (Math.hypot(tgt.wx - tgt.x, tgt.wy - tgt.y) < 1.5) { tgt.wx = (env.rng() * 2 - 1) * (w - 3); tgt.wy = (env.rng() * 2 - 1) * (h - 3); }
        const want = Math.atan2(tgt.wy - tgt.y, tgt.wx - tgt.x) + Math.sin(time * 2.3) * 1.4 * ev;
        tgt.a += Math.max(-2.5 * dt, Math.min(2.5 * dt, wrapAngle(want - tgt.a)));
        tgt.x += Math.cos(tgt.a) * tgt.speed * dt;
        tgt.y += Math.sin(tgt.a) * tgt.speed * dt;
        tgt.trail.push(tgt.x, tgt.y);
        const tvx = Math.cos(tgt.a) * tgt.speed, tvy = Math.sin(tgt.a) * tgt.speed;
        const N = Number(p.N), amax = Number(p.amax), sp = Number(p.mspeed);
        for (const m of missiles) {
          if (m.boom > 0) m.boom -= dt;
          m.t += dt;
          if (m.t < 0) continue;
          const rx = tgt.x - m.x, ry = tgt.y - m.y;
          const vrx = tvx - m.vx, vry = tvy - m.vy;
          const r2 = rx * rx + ry * ry, r = Math.sqrt(r2);
          m.ldot = (rx * vry - ry * vrx) / r2;
          const vc = -(rx * vrx + ry * vry) / r;
          let a = N * vc * m.ldot;
          a = Math.max(-amax, Math.min(amax, a));
          m.acc = a;
          const s = Math.hypot(m.vx, m.vy) || 1;
          // 速度に直交（左向き）の単位ベクトルに a を掛けて加える
          m.vx += (-m.vy / s) * a * dt;
          m.vy += (m.vx / s) * a * dt;
          const s2 = Math.hypot(m.vx, m.vy) || 1;
          m.vx = (m.vx / s2) * sp;
          m.vy = (m.vy / s2) * sp;
          m.x += m.vx * dt;
          m.y += m.vy * dt;
          m.trail.push(m.x, m.y);
          if (r < 0.4) {
            hits++;
            m.boom = 0.6; m.bx = m.x; m.by = m.y;
            launch(m, sp);
            m.t = -0.5;
          } else if (m.t > 15 || Math.abs(m.x) > w * 2 || Math.abs(m.y) > h * 2) {
            misses++;
            launch(m, sp);
          }
        }
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        g.circle(tgt.wx, tgt.wy, 0.5, 0x5a6090);
        if (p.showTrails) g.polyline(tgt.trail.points(), 0xffffff, { fade: true, alpha: 0.6 });
        for (const m of missiles) {
          if (m.boom > 0) g.circle(m.bx, m.by, 1.2 * (1 - m.boom / 0.6) + 0.2, 0xffd36b, { alpha: m.boom / 0.6 });
          if (m.t < 0) continue;
          if (p.showTrails) g.polyline(m.trail.points(), m.color, { fade: true });
          g.line(m.x, m.y, tgt.x, tgt.y, m.color, 0.18);
          const s = Math.hypot(m.vx, m.vy) || 1;
          g.arrow(m.x, m.y, (-m.vy / s) * m.acc * 0.04, (m.vx / s) * m.acc * 0.04, 0xff5060);
          g.agent(m.x, m.y, Math.atan2(m.vy, m.vx), 0.3, m.color);
        }
        g.agent(tgt.x, tgt.y, tgt.a, 0.5, 0xffffff);
      },
      pointer(x, y, down) {
        if (down) { tgt.wx = x; tgt.wy = y; }
      },
      status(p) {
        const lmax = missiles.reduce((s, m) => Math.max(s, Math.abs(m.ldot)), 0);
        return `N=${Number(p.N).toFixed(1)} · 命中 ${hits} · 外れ ${misses} · 最大 |λ˙| ${lmax.toFixed(2)} rad/s · クリックで目標の行き先`;
      },
    };
  },
});
