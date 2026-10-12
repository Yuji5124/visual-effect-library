import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { hueColor } from '../framework/steerKit';

/** MOT-006 減衰振動の位相図：x¨ = −ω²x − c·x˙ を RK4 で積分し、(x, v/ω) 平面に軌道とベクトル場を描く */
interface Orbit { x: number; v: number; trail: Trail; hist: Trail; color: number }

export default defineMotionDemo({
  id: 'MOT-006',
  notes: 'x¨ = −ω²x − c·x˙ を RK4 で積分。左は横軸 x・縦軸 v/ω の位相平面で、背景の矢印がベクトル場、各色の点が別々の初期条件。c>0 で原点へ巻き込む螺旋、c=0 で円、c<0 で外へ広がる。右は x の時間グラフ。クリックした位置から新しい軌道を出す。',
  params: [
    { key: 'damping', label: '減衰係数 c', type: 'number', min: -0.6, max: 3, step: 0.01, default: 0.35 },
    { key: 'omega', label: '固有振動数 ω（rad/s）', type: 'number', min: 0.5, max: 5, step: 0.05, default: 2 },
    { key: 'count', label: '初期条件の数', type: 'number', min: 1, max: 16, step: 1, default: 7 },
  ],
  resetKeys: ['count'],
  create(env, params) {
    const LIM = 4.2;
    let time = 0;
    const orbits: Orbit[] = [];
    const spawn = (x: number, v: number, i: number): Orbit => ({ x, v, trail: new Trail(500), hist: new Trail(400), color: hueColor(i * 0.13 + 0.02) });
    const n = Number(params.count);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + env.rng() * 0.3;
      const r = 2.2 + env.rng() * 1.8;
      orbits.push(spawn(Math.cos(a) * r, Math.sin(a) * r * Number(params.omega), i));
    }
    let spawnIdx = n;
    const layout = () => {
      const { w } = env.bounds();
      const S = Math.min(2.15, (w * 1.2) / (2 * LIM));
      return { cx: -w + LIM * S + 0.8, cy: 0, S, gx0: -w + 2 * LIM * S + 2, gx1: w - 0.6 };
    };
    const deriv = (x: number, v: number, w: number, c: number): [number, number] => [v, -w * w * x - c * v];
    return {
      step(dt, p) {
        time += dt;
        const w = Number(p.omega), c = Number(p.damping);
        for (const o of orbits) {
          const [k1x, k1v] = deriv(o.x, o.v, w, c);
          const [k2x, k2v] = deriv(o.x + k1x * dt / 2, o.v + k1v * dt / 2, w, c);
          const [k3x, k3v] = deriv(o.x + k2x * dt / 2, o.v + k2v * dt / 2, w, c);
          const [k4x, k4v] = deriv(o.x + k3x * dt, o.v + k3v * dt, w, c);
          o.x += (dt / 6) * (k1x + 2 * k2x + 2 * k3x + k4x);
          o.v += (dt / 6) * (k1v + 2 * k2v + 2 * k3v + k4v);
          // 発散したら（負の減衰）原点近くからやり直す
          if (Math.hypot(o.x, o.v / w) > LIM * 1.15) {
            const a = env.rng() * Math.PI * 2;
            o.x = Math.cos(a) * 0.3;
            o.v = Math.sin(a) * 0.3 * w;
            o.trail.clear();
          }
          const { cx, cy, S } = layout();
          o.trail.push(cx + o.x * S, cy + (o.v / w) * S);
          o.hist.push(time, o.x);
        }
      },
      draw(g, p) {
        const w = Number(p.omega), c = Number(p.damping);
        const { cx, cy, S, gx0, gx1 } = layout();
        g.rect(cx - LIM * S, cy - LIM * S, 2 * LIM * S, 2 * LIM * S, 0x3a4070);
        g.line(cx - LIM * S, cy, cx + LIM * S, cy, 0x3a4070);
        g.line(cx, cy - LIM * S, cx, cy + LIM * S, 0x3a4070);
        // ベクトル場（位相平面での速度 (x˙, v˙/ω)）
        const N = env.quality === 'low' ? 11 : 15;
        for (let i = 0; i < N; i++) {
          for (let j = 0; j < N; j++) {
            const x = -LIM + ((i + 0.5) / N) * 2 * LIM, q = -LIM + ((j + 0.5) / N) * 2 * LIM;
            const v = q * w;
            const [dx, dv] = deriv(x, v, w, c);
            const fx = dx, fy = dv / w;
            const l = Math.hypot(fx, fy) || 1;
            const len = (LIM / N) * 0.85 * S;
            g.arrow(cx + x * S, cy + q * S, (fx / l) * len, (fy / l) * len, 0x4a5590, Math.min(1, 0.35 + l * 0.08));
          }
        }
        for (const o of orbits) {
          if (p.showTrails) g.polyline(o.trail.points(), o.color, { fade: true });
          g.circle(cx + o.x * S, cy + (o.v / w) * S, 0.2, o.color, { fill: true });
        }
        // 右：x(t)
        if (gx1 - gx0 > 2) {
          const gy0 = -LIM * S, gh = 2 * LIM * S, span = 8;
          g.rect(gx0, gy0, gx1 - gx0, gh, 0x3a4070);
          g.line(gx0, 0, gx1, 0, 0x3a4070);
          for (const o of orbits) {
            const pts = o.hist.points();
            const out: number[] = [];
            for (let k = 0; k < pts.length; k += 2) {
              const x = gx1 - ((time - pts[k]) / span) * (gx1 - gx0);
              if (x >= gx0) out.push(x, (pts[k + 1] / LIM) * (gh / 2));
            }
            g.polyline(out, o.color, { alpha: 0.85 });
          }
        }
      },
      pointer(x, y, down, p) {
        if (!down) return;
        const { cx, cy, S } = layout();
        const px = (x - cx) / S, q = (y - cy) / S;
        if (Math.abs(px) > LIM || Math.abs(q) > LIM) return;
        const o = orbits[spawnIdx % orbits.length];
        spawnIdx++;
        o.x = px;
        o.v = q * Number(p.omega);
        o.trail.clear();
      },
      status(p) {
        const w = Number(p.omega), c = Number(p.damping);
        const zeta = c / (2 * w);
        const kind = c < 0 ? '発散（負の減衰）' : c === 0 ? '保存（閉じた円）' : zeta < 1 ? '不足減衰（螺旋）' : zeta === 1 ? '臨界減衰' : '過減衰（結節点）';
        const e = orbits.reduce((s, o) => s + 0.5 * o.v * o.v + 0.5 * w * w * o.x * o.x, 0) / orbits.length;
        return `ζ=c/(2ω)=${zeta.toFixed(2)} · ${kind} · 平均エネルギー ${e.toFixed(2)} · クリックで初期条件を追加`;
      },
    };
  },
});
