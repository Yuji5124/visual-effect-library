import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';

/** MOT-001 NLERP と SLERP：同じ t で2方向の間を補間し、円弧上の点の間隔で角速度の偏りを見せる */
export default defineMotionDemo({
  id: 'MOT-001',
  notes: '単位ベクトル a, b の間を NLERP（(1−t)a+tb を正規化）と SLERP（sin((1−t)θ)/sinθ·a+sin(tθ)/sinθ·b）で補間。左の円に等間隔の t の点を打ち、右に「t→角度」のグラフを描く。SLERP は直線、NLERP は S 字になる。クリックした方向が b になる。',
  params: [
    { key: 'angle', label: '角度の差（度）', type: 'number', min: 10, max: 179, step: 1, default: 150 },
    { key: 'divisions', label: 't の分割数', type: 'number', min: 2, max: 40, step: 1, default: 12 },
    {
      key: 'show', label: '表示', type: 'select', default: 'both',
      options: [
        { value: 'both', label: 'NLERP と SLERP' },
        { value: 'nlerp', label: 'NLERP のみ' },
        { value: 'slerp', label: 'SLERP のみ' },
      ],
    },
    { key: 'period', label: '往復の周期（秒）', type: 'number', min: 1, max: 10, step: 0.1, default: 4 },
  ],
  create(env) {
    let t = 0;
    let baseAngle = 0.35;
    const trailN = new Trail(200), trailS = new Trail(200);
    let maxDev = 0;
    // a は baseAngle、b は baseAngle+θ
    const nlerp = (theta: number, u: number): [number, number, number, number] => {
      const ax = Math.cos(baseAngle), ay = Math.sin(baseAngle);
      const bx = Math.cos(baseAngle + theta), by = Math.sin(baseAngle + theta);
      const lx = ax * (1 - u) + bx * u, ly = ay * (1 - u) + by * u;
      const l = Math.hypot(lx, ly) || 1e-6;
      return [lx / l, ly / l, lx, ly];
    };
    const slerp = (theta: number, u: number): [number, number] => {
      const s = Math.sin(theta);
      const ka = Math.sin((1 - u) * theta) / s, kb = Math.sin(u * theta) / s;
      return [Math.cos(baseAngle) * ka + Math.cos(baseAngle + theta) * kb, Math.sin(baseAngle) * ka + Math.sin(baseAngle + theta) * kb];
    };
    const layout = () => {
      const { w } = env.bounds();
      const R = Math.min(7, w * 0.42);
      return { cx: -w + R + 1.2, cy: 0, R, gx0: -w + 2 * R + 3, gx1: w - 1 };
    };
    let u = 0;
    let clickAngle: number | null = null;
    return {
      step(dt, p) {
        t += dt;
        const ph = (t / Number(p.period)) % 1;
        u = ph < 0.5 ? ph * 2 : 2 - ph * 2;
        const theta = (Number(p.angle) * Math.PI) / 180;
        if (clickAngle !== null) baseAngle = clickAngle - theta;
        const { cx, cy, R } = layout();
        const [nx, ny] = nlerp(theta, u);
        const [sx, sy] = slerp(theta, u);
        trailN.push(cx + nx * R * 1.08, cy + ny * R * 1.08);
        trailS.push(cx + sx * R * 0.92, cy + sy * R * 0.92);
        // NLERP と理想角の最大ずれ（度）
        maxDev = 0;
        for (let k = 0; k <= 50; k++) {
          const [qx, qy] = nlerp(theta, k / 50);
          let a = Math.atan2(qy, qx) - baseAngle;
          while (a < -0.01) a += Math.PI * 2;
          maxDev = Math.max(maxDev, Math.abs(a - (k / 50) * theta));
        }
      },
      draw(g, p) {
        g.grid(1);
        const theta = (Number(p.angle) * Math.PI) / 180;
        const { cx, cy, R, gx0, gx1 } = layout();
        const showN = p.show !== 'slerp', showS = p.show !== 'nlerp';
        const cN = 0xffa040, cS = 0x4ad8ff;
        g.circle(cx, cy, R, 0x3a4070, { segments: 64 });
        // 円弧（a→b）
        let px = cx + Math.cos(baseAngle) * R, py = cy + Math.sin(baseAngle) * R;
        for (let k = 1; k <= 48; k++) {
          const a = baseAngle + (theta * k) / 48;
          const qx = cx + Math.cos(a) * R, qy = cy + Math.sin(a) * R;
          g.line(px, py, qx, qy, 0x8890c0);
          px = qx; py = qy;
        }
        const ax = Math.cos(baseAngle), ay = Math.sin(baseAngle);
        const bx = Math.cos(baseAngle + theta), by = Math.sin(baseAngle + theta);
        g.arrow(cx, cy, ax * R, ay * R, 0xffffff);
        g.arrow(cx, cy, bx * R, by * R, 0xffffff, 0.8);
        // 弦（素朴な LERP の軌跡）
        g.line(cx + ax * R, cy + ay * R, cx + bx * R, cy + by * R, cN, 0.35);
        const n = Number(p.divisions);
        for (let k = 0; k <= n; k++) {
          const uk = k / n;
          if (showN) {
            const [qx, qy, lx, ly] = nlerp(theta, uk);
            g.circle(cx + lx * R, cy + ly * R, 0.08, cN, { fill: true, alpha: 0.5 });
            g.line(cx + lx * R, cy + ly * R, cx + qx * R * 1.08, cy + qy * R * 1.08, cN, 0.25);
            g.circle(cx + qx * R * 1.08, cy + qy * R * 1.08, 0.16, cN, { fill: true });
          }
          if (showS) {
            const [qx, qy] = slerp(theta, uk);
            g.circle(cx + qx * R * 0.92, cy + qy * R * 0.92, 0.16, cS, { fill: true });
          }
        }
        if (p.showTrails) {
          if (showN) g.polyline(trailN.points(), cN, { fade: true });
          if (showS) g.polyline(trailS.points(), cS, { fade: true });
        }
        // 現在の t のベクトル
        if (showN) {
          const [qx, qy, lx, ly] = nlerp(theta, u);
          g.arrow(cx, cy, lx * R, ly * R, cN, 0.5);
          g.arrow(cx, cy, qx * R * 1.08, qy * R * 1.08, cN);
        }
        if (showS) {
          const [qx, qy] = slerp(theta, u);
          g.arrow(cx, cy, qx * R * 0.92, qy * R * 0.92, cS);
        }
        // 右：t → 補間角 のグラフ
        if (gx1 - gx0 > 2) {
          const gy0 = -7, gy1 = 7;
          g.rect(gx0, gy0, gx1 - gx0, gy1 - gy0, 0x3a4070);
          const mapX = (v: number) => gx0 + (gx1 - gx0) * v;
          const mapY = (a: number) => gy0 + ((gy1 - gy0) * a) / theta;
          const ptsN: number[] = [], ptsS: number[] = [];
          for (let k = 0; k <= 60; k++) {
            const uk = k / 60;
            const [qx, qy] = nlerp(theta, uk);
            let a = Math.atan2(qy, qx) - baseAngle;
            while (a < -0.01) a += Math.PI * 2;
            ptsN.push(mapX(uk), mapY(a));
            ptsS.push(mapX(uk), mapY(uk * theta));
          }
          if (showS) g.polyline(ptsS, cS);
          if (showN) g.polyline(ptsN, cN);
          g.line(mapX(u), gy0, mapX(u), gy1, 0xffffff, 0.4);
          for (let k = 0; k <= n; k++) g.line(mapX(k / n), gy0, mapX(k / n), gy0 + 0.3, 0x8890c0);
        }
      },
      pointer(x, y, down) {
        if (!down) return;
        const { cx, cy } = layout();
        // クリック方向を b にする（a = b − θ）
        clickAngle = Math.atan2(y - cy, x - cx);
      },
      status(p) {
        const theta = (Number(p.angle) * Math.PI) / 180;
        const n = Number(p.divisions);
        // 端と中央での NLERP の角速度比
        const ang = (uu: number) => { const [qx, qy] = nlerp(theta, uu); let a = Math.atan2(qy, qx) - baseAngle; while (a < -0.01) a += Math.PI * 2; return a; };
        const vMid = (ang(0.5 + 0.5 / n) - ang(0.5 - 0.5 / n)) * n;
        const vEnd = ang(1 / n) * n;
        return `t=${u.toFixed(2)} · NLERP 最大角度誤差 ${((maxDev * 180) / Math.PI).toFixed(1)}° · NLERP 角速度比（中央/端）${(vMid / vEnd).toFixed(2)} · SLERP は 1.00 · クリックで b の方向`;
      },
    };
  },
});
