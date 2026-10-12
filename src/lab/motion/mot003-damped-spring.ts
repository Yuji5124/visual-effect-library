import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';

/** MOT-003 ばね：同じ目標を不足減衰・臨界減衰・過減衰で追う */
export default defineMotionDemo({
  id: 'MOT-003',
  notes: '質点−ばね−ダンパー系 x¨ = −ω²(x−目標) − 2ζω x˙ を半陰的オイラー法で積分。3本の帯は上から ζ×0.25（不足）・1（臨界）・ζ×3（過減衰）。目標は一定間隔で跳ぶか、クリックした位置に移る。右側に変位の時間グラフを描く。',
  params: [
    { key: 'freq', label: '固有振動数 ω（rad/s）', type: 'number', min: 1, max: 20, step: 0.1, default: 7 },
    { key: 'zeta', label: '基準の減衰比 ζ', type: 'number', min: 0.1, max: 2, step: 0.01, default: 1 },
    { key: 'interval', label: '目標が跳ぶ間隔（秒）', type: 'number', min: 0.5, max: 5, step: 0.1, default: 2 },
  ],
  create(env) {
    const lanes = [0.25, 1, 3].map((k) => ({ k, x: 0, v: 0, trail: new Trail(300), overshoot: 0 }));
    let target = 4;
    let t = 0;
    let since = 0;
    return {
      step(dt, p) {
        t += dt;
        since += dt;
        if (since > Number(p.interval)) {
          since = 0;
          target = target > 0 ? -4 - env.rng() * 2 : 4 + env.rng() * 2;
          for (const l of lanes) l.overshoot = 0;
        }
        const w = Number(p.freq);
        for (const l of lanes) {
          const z = Number(p.zeta) * l.k;
          const a = -w * w * (l.x - target) - 2 * z * w * l.v;
          l.v += a * dt;
          l.x += l.v * dt;
          const over = Math.sign(target) * (l.x - target);
          if (over > l.overshoot) l.overshoot = over;
          l.trail.push(t, l.x);
        }
      },
      draw(g, p) {
        g.grid(1);
        const { w } = env.bounds();
        const colors = [0xff6b8a, 0x7dff8a, 0x5ab8ff];
        lanes.forEach((l, i) => {
          const y0 = 6 - i * 6;
          // 左：実際に動く質点とばね
          const x0 = -w + 1.5;
          g.line(x0 - 1, y0 - 1.5, x0 - 1, y0 + 1.5, 0x666a90);
          const px = -w * 0.35 + l.x * 0.9;
          const coils = 14;
          let prevX = x0 - 1, prevY = y0;
          for (let c = 1; c <= coils; c++) {
            const cx = x0 - 1 + ((px - (x0 - 1)) * c) / coils;
            const cy = y0 + (c === coils ? 0 : (c % 2 ? 0.5 : -0.5));
            g.line(prevX, prevY, cx, cy, 0x9aa0c8);
            prevX = cx;
            prevY = cy;
          }
          g.circle(-w * 0.35 + target * 0.9, y0, 0.25, 0xffffff, { fill: false });
          g.circle(px, y0, 0.55, colors[i], { fill: true });
          // 右：変位の時間グラフ（目標線と軌跡）
          const gx0 = 0.5, gw = w - 1;
          g.line(gx0, y0 - 2.4, gx0 + gw, y0 - 2.4, 0x2a2f50);
          if (p.showTrails) {
            const pts = l.trail.points();
            const tmax = pts.length ? pts[pts.length - 2] : 0;
            const span = 6;
            const mapped = new Float32Array(pts.length);
            for (let k = 0; k < pts.length; k += 2) {
              mapped[k] = gx0 + gw * (1 - (tmax - pts[k]) / span);
              mapped[k + 1] = y0 + pts[k + 1] * 0.35;
            }
            let start = 0;
            while (start < mapped.length && mapped[start] < gx0) start += 2;
            g.polyline(mapped.subarray(start), colors[i], { fade: true });
          }
          g.line(gx0, y0 + target * 0.35, gx0 + gw, y0 + target * 0.35, 0xffffff, 0.35);
        });
      },
      pointer(x, _y, down) {
        if (down) {
          target = Math.max(-7, Math.min(7, (x + env.bounds().w * 0.35) / 0.9));
          since = 0;
          for (const l of lanes) l.overshoot = 0;
        }
      },
      status(p) {
        const z = Number(p.zeta);
        return lanes.map((l) => `ζ=${(z * l.k).toFixed(2)} 行き過ぎ ${l.overshoot.toFixed(2)}`).join(' · ') + ' · クリックで目標を移動';
      },
    };
  },
});
