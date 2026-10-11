import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { drawChain, forwardKinematics } from '../framework/ikKit';

/** MOT-021 順運動学：各関節の相対角を周期的に動かし、変換の連鎖で先端位置を求める */
export default defineMotionDemo({
  id: 'MOT-021',
  notes: '関節 i の角度 θ_i(t)=振幅·sin(ωt+i·位相差) を親の向きに足し、骨の長さだけ進める（変換の連鎖）ことで全関節と先端の位置を得る。各関節に赤（骨の向き x）と緑（y）のローカル軸を描き、先端の軌跡を残す。根元の関節ほど小さな回転で先端が大きく動く。クリックで根元を移動。',
  params: [
    { key: 'joints', label: '関節数', type: 'number', min: 1, max: 10, step: 1, default: 5 },
    { key: 'amplitude', label: '振幅（度）', type: 'number', min: 0, max: 120, step: 1, default: 35 },
    { key: 'phase', label: '位相差（度）', type: 'number', min: 0, max: 180, step: 1, default: 40 },
    { key: 'length', label: '骨の長さ', type: 'number', min: 0.5, max: 4, step: 0.05, default: 1.8 },
    { key: 'taper', label: '先端ほど短く', type: 'number', min: 0.5, max: 1, step: 0.01, default: 0.85 },
    { key: 'freq', label: '角速度 ω（rad/s）', type: 'number', min: 0.1, max: 5, step: 0.05, default: 1.2 },
  ],
  create() {
    let t = 0;
    const base = { x: 0, y: -7 };
    const trail = new Trail(900);
    const joints = new Float32Array(24);
    const angles = new Float32Array(11), lengths = new Float32Array(11);
    let n = 0;
    const solve = (p: Record<string, unknown>) => {
      n = Number(p.joints);
      const amp = (Number(p.amplitude) * Math.PI) / 180, ph = (Number(p.phase) * Math.PI) / 180, w = Number(p.freq);
      let L = Number(p.length);
      for (let i = 0; i < n; i++) {
        angles[i] = amp * Math.sin(w * t + i * ph);
        lengths[i] = L;
        L *= Number(p.taper);
      }
      forwardKinematics(base.x, base.y, Math.PI / 2, angles.subarray(0, n), lengths.subarray(0, n), joints);
    };
    return {
      step(dt, p) {
        t += dt;
        solve(p);
        if (dt > 0) trail.push(joints[n * 2], joints[n * 2 + 1]);
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        solve(p);
        if (p.showTrails) g.polyline(trail.points(), 0xffd36b, { fade: true });
        g.rect(base.x - 1, base.y - 0.6, 2, 0.6, 0x5a6090, { fill: true });
        drawChain(g, joints.subarray(0, (n + 1) * 2), 0x6bd0ff, { jointR: 0.22 });
        // ローカル軸（各関節の座標系）と、関節の可動範囲の扇
        let a = Math.PI / 2;
        const amp = (Number(p.amplitude) * Math.PI) / 180;
        for (let i = 0; i < n; i++) {
          const x = joints[i * 2], y = joints[i * 2 + 1];
          const parent = a;
          a += angles[i];
          const s = 0.7;
          g.arrow(x, y, Math.cos(a) * s, Math.sin(a) * s, 0xff5060);
          g.arrow(x, y, -Math.sin(a) * s, Math.cos(a) * s, 0x7dff8a);
          if (amp > 0) {
            const r = 0.55;
            let px = x + Math.cos(parent - amp) * r, py = y + Math.sin(parent - amp) * r;
            for (let k = 1; k <= 10; k++) {
              const u = parent - amp + (2 * amp * k) / 10;
              const qx = x + Math.cos(u) * r, qy = y + Math.sin(u) * r;
              g.line(px, py, qx, qy, 0x9aa0c8, 0.5);
              px = qx; py = qy;
            }
          }
        }
        g.circle(joints[n * 2], joints[n * 2 + 1], 0.3, 0xffd36b, { fill: true });
      },
      pointer(x, y, down) {
        if (!down) return;
        base.x = x;
        base.y = y;
        trail.clear();
      },
      status(p) {
        const ex = joints[n * 2] - base.x, ey = joints[n * 2 + 1] - base.y;
        let total = 0, L = Number(p.length);
        for (let i = 0; i < n; i++) { total += L; L *= Number(p.taper); }
        return `先端（根元から）(${ex.toFixed(2)}, ${ey.toFixed(2)}) · 距離 ${Math.hypot(ex, ey).toFixed(2)} / 全長 ${total.toFixed(2)} · 関節角 ${Array.from(angles.subarray(0, Math.min(n, 4))).map((v) => ((v * 180) / Math.PI).toFixed(0) + '°').join(' ')} · クリックで根元`;
      },
    };
  },
});
