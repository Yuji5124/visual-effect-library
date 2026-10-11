import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';

/** MOT-007 リサージュ：x=A·sin(a·t+δ), y=B·sin(b·t) を合成し、上と左の単振動から作図する */
export default defineMotionDemo({
  id: 'MOT-007',
  notes: '横 x=A·sin(a·t+δ)・縦 y=B·sin(b·t) の2つの単振動（上と左の円で回る点）を合成し、交点の点が軌跡を描く。a:b が簡単な整数比なら閉じた曲線（薄い線が1周期分の形）、無理数に近いと面を埋める。δ の変化速度を上げると形が回転して見える。クリックで振幅 A・B を変える。',
  params: [
    { key: 'fa', label: '周波数 a', type: 'number', min: 1, max: 9, step: 0.01, default: 3 },
    { key: 'fb', label: '周波数 b', type: 'number', min: 1, max: 9, step: 0.01, default: 2 },
    { key: 'phase', label: '位相差 δ（度）', type: 'number', min: 0, max: 360, step: 1, default: 90 },
    { key: 'drift', label: 'δ の変化速度（度/秒）', type: 'number', min: 0, max: 60, step: 0.5, default: 0 },
    { key: 'decay', label: '減衰（1/秒）', type: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'speed', label: '角速度の基準（rad/s）', type: 'number', min: 0.1, max: 3, step: 0.05, default: 0.8 },
  ],
  create(env) {
    let t = 0, td = 0, drift = 0;
    let A = 1, B = 1;
    const trail = new Trail(env.quality === 'low' ? 900 : 1800);
    const layout = () => {
      const { w } = env.bounds();
      const R = Math.max(1.5, Math.min(6.2, w - 2.2));
      return { cx: 1.55, cy: -1.6, R };
    };
    return {
      step(dt, p) {
        t += dt;
        td += dt;
        drift += ((Number(p.drift) * Math.PI) / 180) * dt;
        const k = Math.exp(-Number(p.decay) * td);
        if (k < 0.04) { td = 0; trail.clear(); }
        const { cx, cy, R } = layout();
        const s = Number(p.speed), d = (Number(p.phase) * Math.PI) / 180 + drift;
        trail.push(cx + A * R * k * Math.sin(Number(p.fa) * s * t + d), cy + B * R * k * Math.sin(Number(p.fb) * s * t));
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const { cx, cy, R } = layout();
        const s = Number(p.speed), fa = Number(p.fa), fb = Number(p.fb);
        const d = (Number(p.phase) * Math.PI) / 180 + drift;
        const k = Math.exp(-Number(p.decay) * td);
        const ax = A * R * k, by = B * R * k;
        g.rect(cx - R, cy - R, 2 * R, 2 * R, 0x2a3050);
        // 1周期分の曲線（基準形）
        const pts: number[] = [];
        const M = 600;
        for (let i = 0; i <= M; i++) {
          const u = (i / M) * Math.PI * 2;
          pts.push(cx + A * R * Math.sin(fa * u + d), cy + B * R * Math.sin(fb * u));
        }
        g.polyline(pts, 0x5a6090, { alpha: 0.6 });
        // 上の円：x を作る回転、左の円：y を作る回転
        const rc = 1.3;
        const topY = cy + R + 1.8, leftX = cx - R - 1.8;
        const phx = fa * s * t + d, phy = fb * s * t;
        g.circle(cx, topY, rc, 0x8890c0);
        g.circle(leftX, cy, rc, 0x8890c0);
        const px = cx + ax * Math.sin(phx), py = cy + by * Math.sin(phy);
        const ux = cx + Math.sin(phx) * rc, uy = topY + Math.cos(phx) * rc;
        const vx = leftX + Math.cos(phy) * rc, vy = cy + Math.sin(phy) * rc;
        g.line(cx, topY, ux, uy, 0xff8a6b);
        g.line(leftX, cy, vx, vy, 0x6bd0ff);
        g.circle(ux, uy, 0.15, 0xff8a6b, { fill: true });
        g.circle(vx, vy, 0.15, 0x6bd0ff, { fill: true });
        // 上の振動の横位置 → 点、左の振動の縦位置 → 点（作図線）
        g.line(px, topY - rc, px, py, 0xff8a6b, 0.4);
        g.line(leftX + rc, py, px, py, 0x6bd0ff, 0.4);
        if (p.showTrails) g.polyline(trail.points(), 0xffd36b, { fade: true });
        g.circle(px, py, 0.28, 0xffffff, { fill: true });
      },
      pointer(x, y, down) {
        if (!down) return;
        const { cx, cy, R } = layout();
        A = Math.max(0.1, Math.min(1, Math.abs(x - cx) / R));
        B = Math.max(0.1, Math.min(1, Math.abs(y - cy) / R));
        trail.clear();
      },
      status(p) {
        const fa = Number(p.fa), fb = Number(p.fb);
        // 有理数近似（分母10以下）で閉じるかを判定
        let best = '';
        for (let q = 1; q <= 10 && !best; q++) {
          const pr = Math.round((fa / fb) * q);
          if (Math.abs(pr / q - fa / fb) < 1e-3) best = `${pr}:${q}`;
        }
        return `a:b = ${(fa / fb).toFixed(3)}${best ? `（${best}、閉じた曲線）` : '（簡単な整数比でない → 面を埋める）'} · δ=${((Number(p.phase) + (drift * 180) / Math.PI) % 360).toFixed(0)}° · A=${A.toFixed(2)} B=${B.toFixed(2)} · クリックで振幅`;
      },
    };
  },
});
