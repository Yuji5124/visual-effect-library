import { defineMotionDemo } from '../framework/motionLab';
import { hueColor } from '../framework/steerKit';

/** MOT-019 ケプラー軌道：逆二乗の中心力を速度ベルレ法で積分し、面積速度一定を扇形で見せる */
interface Body { x: number; y: number; vx: number; vy: number; ax: number; ay: number; pts: number[]; color: number; k: number; t: number }
const GM = 60;

export default defineMotionDemo({
  id: 'MOT-019',
  notes: '加速度 a=−GM·r/|r|³ を速度ベルレ法（小刻みな部分ステップ）で積分する。各天体は同じ点から円軌道速度 √(GM/r) の「倍率×(0.75〜1.5)」で接線方向に放たれ、√2 倍を超えると双曲線で脱出する。最初の天体は一定時間ごとに中心と結んだ扇形を交互の色で塗り、どれも同じ面積になる（第二法則）。クリックした位置から新しい天体を放つ。',
  params: [
    { key: 'factor', label: '初速倍率', type: 'number', min: 0.4, max: 1.6, step: 0.01, default: 1 },
    { key: 'count', label: '天体の数', type: 'number', min: 1, max: 10, step: 1, default: 5 },
    { key: 'areas', label: '面積速度の表示', type: 'bool', default: true },
    { key: 'sector', label: '扇形の時間間隔（秒）', type: 'number', min: 0.1, max: 2, step: 0.05, default: 0.5 },
  ],
  resetKeys: ['count', 'factor'],
  create(env, params) {
    const { w } = env.bounds();
    const sun = { x: Math.min(5, w * 0.3), y: 0 };
    const r0 = 3.2;
    const bodies: Body[] = [];
    const n = Number(params.count), f = Number(params.factor);
    const accel = (b: Body) => {
      const dx = b.x - sun.x, dy = b.y - sun.y;
      const r2 = dx * dx + dy * dy + 0.01, r = Math.sqrt(r2);
      b.ax = (-GM * dx) / (r2 * r);
      b.ay = (-GM * dy) / (r2 * r);
    };
    const launch = (b: Body, x: number, y: number, k: number) => {
      const dx = x - sun.x, dy = y - sun.y, r = Math.hypot(dx, dy) || 1;
      const vc = Math.sqrt(GM / r) * k;
      b.x = x; b.y = y;
      b.vx = (-dy / r) * vc;
      b.vy = (dx / r) * vc;
      b.k = k;
      b.t = 0;
      b.pts = [];
      accel(b);
    };
    for (let i = 0; i < n; i++) {
      const k = f * (n === 1 ? 1 : 0.75 + (0.75 * i) / (n - 1));
      const b: Body = { x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, pts: [], color: hueColor(0.12 + i * 0.1), k, t: 0 };
      launch(b, sun.x + r0, sun.y, k);
      bodies.push(b);
    }
    let spawn = 0;
    const MAXP = env.quality === 'low' ? 500 : 1200;
    return {
      step(dt) {
        if (dt <= 0) return;
        const sub = 8, h = dt / sub;
        const { w: bw, h: bh } = env.bounds();
        for (const b of bodies) {
          for (let s = 0; s < sub; s++) {
            b.vx += b.ax * h * 0.5; b.vy += b.ay * h * 0.5;
            b.x += b.vx * h; b.y += b.vy * h;
            accel(b);
            b.vx += b.ax * h * 0.5; b.vy += b.ay * h * 0.5;
          }
          b.t += dt;
          // 点列には時刻も持たせ、扇形の区切りに使う
          b.pts.push(b.x, b.y, b.t);
          if (b.pts.length > MAXP * 3) b.pts.splice(0, 3);
          const r = Math.hypot(b.x - sun.x, b.y - sun.y);
          // 脱出・衝突したら同じ条件で放ち直す
          if (r < 0.3 || Math.abs(b.x) > bw * 2.2 || Math.abs(b.y) > bh * 2.2 || b.t > 60) launch(b, sun.x + r0, sun.y, b.k);
        }
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const sec = Number(p.sector);
        // 面積の扇形（最初の天体）
        if (p.areas) {
          const b = bodies[0], q = b.pts;
          for (let i = 3; i < q.length; i += 3) {
            const bin = Math.floor(q[i + 2] / sec);
            if (q[i + 2] < b.t - sec * 8) continue;
            g.tri(sun.x, sun.y, q[i - 3], q[i - 2], q[i], q[i + 1], bin % 2 ? 0x3a5a90 : 0x6a4a90, 0.7);
          }
        }
        for (const b of bodies) {
          const xy: number[] = [];
          for (let i = 0; i < b.pts.length; i += 3) xy.push(b.pts[i], b.pts[i + 1]);
          if (p.showTrails) g.polyline(xy, b.color, { fade: true });
          g.circle(b.x, b.y, 0.25, b.color, { fill: true });
          g.arrow(b.x, b.y, b.vx * 0.2, b.vy * 0.2, 0xffffff, 0.6);
          g.arrow(b.x, b.y, b.ax * 0.05, b.ay * 0.05, 0xff5060, 0.6);
        }
        g.circle(sun.x, sun.y, 0.6, 0xffd36b, { fill: true });
        g.circle(sun.x, sun.y, r0, 0x3a4070, { segments: 48 });
      },
      pointer(x, y, down, p) {
        if (!down) return;
        if (Math.hypot(x - sun.x, y - sun.y) < 0.8) return;
        const b = bodies[spawn++ % bodies.length];
        launch(b, x, y, Number(p.factor));
        b.k = Number(p.factor);
      },
      status() {
        const b = bodies[0];
        const dx = b.x - sun.x, dy = b.y - sun.y, r = Math.hypot(dx, dy);
        const v2 = b.vx * b.vx + b.vy * b.vy;
        const E = v2 / 2 - GM / r;
        const hh = dx * b.vy - dy * b.vx;
        const e = Math.sqrt(Math.max(0, 1 + (2 * E * hh * hh) / (GM * GM)));
        const kind = e < 0.02 ? '円' : e < 0.98 ? '楕円' : e < 1.02 ? '放物線' : '双曲線';
        return `最初の天体：離心率 e=${e.toFixed(3)}（${kind}）· エネルギー ${E.toFixed(2)} · 面積速度 h/2=${(hh / 2).toFixed(3)}（一定）· クリックで放つ`;
      },
    };
  },
});
