import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { drawChain, twoBoneIK } from '../framework/ikKit';
import { PointerTracker } from '../framework/steerKit';

/** MOT-024 2ボーン解析IK：余弦定理で肘の角度を求め、ポールで2つの解のどちらかを選ぶ */
export default defineMotionDemo({
  id: 'MOT-024',
  notes: '上腕 a・前腕 b・根元から目標までの距離 c の三角形で、根元の角 A を cos A=(a²+c²−b²)/(2ac) から一度で求める。肘の候補は「根元中心・半径 a の円」と「目標中心・半径 b の円」の2交点（薄い円と2つの点）で、ポール（菱形）のある側の解を選ぶ（もう一方は破線）。目標とポールはドラッグ可能。届かない距離では伸び切る。',
  params: [
    { key: 'upper', label: '上腕の長さ a', type: 'number', min: 1, max: 9, step: 0.1, default: 5.5 },
    { key: 'lower', label: '前腕の長さ b', type: 'number', min: 1, max: 9, step: 0.1, default: 4.5 },
    {
      key: 'side', label: 'ポールの側', type: 'select', default: 'pole',
      options: [
        { value: 'pole', label: 'ポールの位置で決める' },
        { value: 'up', label: '常に左回り（+）' },
        { value: 'down', label: '常に右回り（−）' },
      ],
    },
  ],
  create() {
    const pt = new PointerTracker();
    const base = { x: -4, y: -1 };
    const tgt = { x: 4, y: 0 };
    const pole = { x: 0, y: 6 };
    let drag: 'target' | 'pole' | null = null;
    let idle = 10, t = 0;
    let sol: [number, number, number, number, number] = [0, 0, 0, 0, 1];
    let alt: [number, number, number, number, number] = [0, 0, 0, 0, 1];
    let sign = 1;
    const trail = new Trail(300);
    return {
      step(dt, p) {
        t += dt;
        idle += dt;
        if (idle > 3) {
          const R = (Number(p.upper) + Number(p.lower)) * 0.75;
          tgt.x = base.x + Math.cos(t * 0.6) * R * (0.6 + 0.5 * Math.sin(t * 0.37));
          tgt.y = base.y + Math.sin(t * 0.6) * R * 0.7;
        }
        if (p.side === 'up') sign = 1;
        else if (p.side === 'down') sign = -1;
        else {
          // 根元→目標 に対してポールが左（外積が正）なら左回りの解
          const cr = (tgt.x - base.x) * (pole.y - base.y) - (tgt.y - base.y) * (pole.x - base.x);
          sign = cr >= 0 ? 1 : -1;
        }
        const a = Number(p.upper), b = Number(p.lower);
        sol = twoBoneIK(base.x, base.y, a, b, tgt.x, tgt.y, sign);
        alt = twoBoneIK(base.x, base.y, a, b, tgt.x, tgt.y, -sign);
        if (dt > 0) trail.push(sol[0], sol[1]);
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const a = Number(p.upper), b = Number(p.lower);
        // 到達範囲（外側 a+b、内側 |a−b|）
        g.circle(base.x, base.y, a + b, 0x2a3050, { segments: 72 });
        if (Math.abs(a - b) > 0.05) g.circle(base.x, base.y, Math.abs(a - b), 0x2a3050, { segments: 48 });
        // 作図：肘の候補は2円の交点
        g.circle(base.x, base.y, a, 0x5a6090, { segments: 64, alpha: 0.7 });
        g.circle(sol[2], sol[3], b, 0x5a6090, { segments: 64, alpha: 0.7 });
        // 三角形の辺 c
        g.line(base.x, base.y, sol[2], sol[3], 0xffd36b, 0.5);
        // もう一方の解（破線）
        for (const [x0, y0, x1, y1] of [[base.x, base.y, alt[0], alt[1]], [alt[0], alt[1], alt[2], alt[3]]]) {
          for (let k = 0; k < 12; k += 2) {
            const u0 = k / 12, u1 = (k + 1) / 12;
            g.line(x0 + (x1 - x0) * u0, y0 + (y1 - y0) * u0, x0 + (x1 - x0) * u1, y0 + (y1 - y0) * u1, 0x9aa0c8, 0.6);
          }
        }
        g.circle(alt[0], alt[1], 0.2, 0x9aa0c8);
        if (p.showTrails) g.polyline(trail.points(), 0x7dff8a, { fade: true, alpha: 0.7 });
        // ポールへの補助線
        if (p.side === 'pole') {
          g.line(sol[0], sol[1], pole.x, pole.y, 0xff7dc0, 0.35);
          const s = 0.45;
          g.tri(pole.x - s, pole.y, pole.x, pole.y + s, pole.x + s, pole.y, 0xff7dc0, drag === 'pole' ? 1 : 0.7);
          g.tri(pole.x - s, pole.y, pole.x + s, pole.y, pole.x, pole.y - s, 0xff7dc0, drag === 'pole' ? 1 : 0.7);
        }
        drawChain(g, [base.x, base.y, sol[0], sol[1], sol[2], sol[3]], 0x6bd0ff, { jointR: 0.3 });
        g.circle(sol[0], sol[1], 0.3, 0x7dff8a, { fill: true });
        g.rect(base.x - 0.6, base.y - 0.6, 1.2, 1.2, 0x8890c0);
        g.circle(tgt.x, tgt.y, 0.5, sol[4] ? 0xff5c8a : 0xffa040);
        g.circle(tgt.x, tgt.y, 0.14, sol[4] ? 0xff5c8a : 0xffa040, { fill: true });
      },
      pointer(x, y, down, p) {
        const ev = pt.update(down);
        if (ev === 'press') drag = p.side === 'pole' && Math.hypot(x - pole.x, y - pole.y) < 1 ? 'pole' : 'target';
        if ((ev === 'press' || ev === 'drag') && drag) {
          idle = 0;
          if (drag === 'pole') { pole.x = x; pole.y = y; }
          else { tgt.x = x; tgt.y = y; }
        }
        if (ev === 'release') drag = null;
      },
      status(p) {
        const a = Number(p.upper), b = Number(p.lower);
        const c = Math.hypot(sol[2] - base.x, sol[3] - base.y);
        const cosC = (a * a + b * b - c * c) / (2 * a * b);
        const elbow = (Math.acos(Math.max(-1, Math.min(1, cosC))) * 180) / Math.PI;
        return `c=${c.toFixed(2)} · cos C=${cosC.toFixed(3)} → 肘の内角 ${elbow.toFixed(1)}° · 解 ${sign > 0 ? '+' : '−'} 側${sol[4] ? '' : '（届かない → 伸び切り）'} · 目標・ポールをドラッグ`;
      },
    };
  },
});
