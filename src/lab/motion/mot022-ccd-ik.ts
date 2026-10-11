import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { ccdIteration, drawChain } from '../framework/ikKit';
import { PointerTracker } from '../framework/steerKit';

/** MOT-022 CCD 逆運動学：先端側の関節から順に「先端を目標へ向ける回転」を繰り返す */
export default defineMotionDemo({
  id: 'MOT-022',
  notes: 'CCD の1反復は、先端側の関節から根元へ順に「関節→先端」と「関節→目標」のなす角だけその関節を回す（根元以外は ±角度制限で切る）。「初期姿勢から解く」ではまっすぐな姿勢から毎フレーム解き直し、各反復後の姿勢を薄く重ねて収束の様子を見せる。クリック・ドラッグで目標（触らないと自動で動く）。',
  params: [
    { key: 'iterations', label: '反復回数', type: 'number', min: 1, max: 30, step: 1, default: 6 },
    { key: 'limit', label: '角度制限（度）', type: 'number', min: 5, max: 180, step: 1, default: 120 },
    { key: 'joints', label: '関節数', type: 'number', min: 2, max: 12, step: 1, default: 6 },
    { key: 'fromRest', label: '初期姿勢から解く（反復を表示）', type: 'bool', default: true },
  ],
  resetKeys: ['joints'],
  create(env, params) {
    const pt = new PointerTracker();
    const n = Number(params.joints);
    const total = 13;
    const lengths = new Float32Array(n).fill(total / n);
    const angles = new Float32Array(n);
    const joints = new Float32Array((n + 1) * 2);
    const base = { x: 0, y: -8.5 };
    const tgt = { x: 4, y: 2 };
    let idle = 10, t = 0;
    let ghosts: Float32Array[] = [];
    let err = 0;
    const trail = new Trail(300);
    return {
      step(dt, p) {
        t += dt;
        idle += dt;
        if (idle > 3) {
          const { w } = env.bounds();
          tgt.x = Math.sin(t * 0.7) * Math.min(w - 1, 11);
          tgt.y = 1 + Math.sin(t * 1.1) * 6;
        }
        if (p.fromRest) angles.fill(0);
        const lim = (Number(p.limit) * Math.PI) / 180;
        ghosts = [];
        for (let k = 0; k < Number(p.iterations); k++) {
          ccdIteration(base.x, base.y, Math.PI / 2, angles, lengths, joints, tgt.x, tgt.y, lim);
          ghosts.push(joints.slice());
        }
        err = Math.hypot(joints[n * 2] - tgt.x, joints[n * 2 + 1] - tgt.y);
        if (dt > 0) trail.push(joints[n * 2], joints[n * 2 + 1]);
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        g.circle(base.x, base.y, total, 0x2a3050, { segments: 64 });
        g.rect(base.x - 1, base.y - 0.6, 2, 0.6, 0x5a6090, { fill: true });
        if (p.fromRest) {
          // まっすぐな初期姿勢と各反復後の姿勢
          g.line(base.x, base.y, base.x, base.y + total, 0x5a6090, 0.5);
          ghosts.forEach((gj, k) => {
            if (k === ghosts.length - 1) return;
            drawChain(g, gj, 0xffa040, { alpha: 0.15 + (0.45 * k) / ghosts.length, fillJoints: false, jointR: 0.12 });
          });
        }
        if (p.showTrails) g.polyline(trail.points(), 0xffd36b, { fade: true, alpha: 0.7 });
        drawChain(g, joints, 0x6bd0ff, { jointR: 0.22 });
        // 根元に近い関節から目標への補助線（最後に回した関節＝根元）
        g.line(joints[0], joints[1], tgt.x, tgt.y, 0xffffff, 0.15);
        g.line(joints[0], joints[1], joints[n * 2], joints[n * 2 + 1], 0x6bd0ff, 0.25);
        g.circle(tgt.x, tgt.y, 0.45, 0xff5c8a);
        g.circle(tgt.x, tgt.y, 0.12, 0xff5c8a, { fill: true });
      },
      pointer(x, y, down) {
        const ev = pt.update(down);
        if (ev === 'press' || ev === 'drag') { tgt.x = x; tgt.y = y; idle = 0; }
      },
      status(p) {
        const d = Math.hypot(tgt.x - base.x, tgt.y - base.y);
        return `先端の誤差 ${err.toFixed(3)} · 反復 ${Number(p.iterations)} 回 · 目標距離 ${d.toFixed(1)} / 全長 ${total}${d > total ? '（届かない → 伸び切る）' : ''} · クリック・ドラッグで目標`;
      },
    };
  },
});
