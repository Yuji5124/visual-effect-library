import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { ccdIteration, drawChain, fabrikBackward, fabrikForward } from '../framework/ikKit';
import { PointerTracker } from '../framework/steerKit';

/** MOT-023 FABRIK：前進段（先端→根元）と後退段（根元→先端）で関節位置を直す */
export default defineMotionDemo({
  id: 'MOT-023',
  notes: '前進段で先端を目標に置き、各関節を骨の長さを保って一つ前の関節側へ引き寄せ、後退段で根元を元の位置に戻して先端側へ直す。「段階を表示」では、まっすぐな姿勢からの各反復の前進段（橙）と後退段（緑）の結果を重ねる。「CCDと比較」では右に同じ目標を CCD で解いた腕を並べる。白い四角（根元）をドラッグするとロープのように追従し、それ以外の場所のドラッグで目標を動かす。',
  params: [
    { key: 'iterations', label: '反復回数', type: 'number', min: 1, max: 20, step: 1, default: 3 },
    {
      key: 'mode', label: '表示', type: 'select', default: 'stages',
      options: [
        { value: 'stages', label: '段階を表示' },
        { value: 'compare', label: 'CCDと比較' },
      ],
    },
    { key: 'joints', label: '関節数', type: 'number', min: 2, max: 16, step: 1, default: 8 },
  ],
  resetKeys: ['joints'],
  create(env, params) {
    const pt = new PointerTracker();
    const n = Number(params.joints);
    const total = 12;
    const lengths = new Float32Array(n).fill(total / n);
    const base = { x: -3, y: -8 };
    const tgt = { x: 3, y: 1 };
    const joints = new Float32Array((n + 1) * 2);
    for (let i = 0; i <= n; i++) { joints[i * 2] = base.x; joints[i * 2 + 1] = base.y + (total / n) * i; }
    const angles = new Float32Array(n);
    const ccdJ = new Float32Array((n + 1) * 2);
    let stages: Float32Array[] = [];
    let drag: 'base' | 'target' | null = null;
    let idle = 10, t = 0, errF = 0, errC = 0;
    const trail = new Trail(300);
    const layout = (mode: string) => {
      const { w } = env.bounds();
      // 比較時は左右に根元をずらして同じ相対目標を解く
      return mode === 'compare' ? { off: Math.min(w * 0.5, 9) } : { off: 0 };
    };
    return {
      step(dt, p) {
        t += dt;
        idle += dt;
        const mode = String(p.mode);
        const { off } = layout(mode);
        if (idle > 3) {
          tgt.x = base.x + Math.sin(t * 0.8) * 7;
          tgt.y = base.y + 9 + Math.sin(t * 1.3) * 5;
        }
        const bx = base.x - off;
        const tx = tgt.x - off, ty = tgt.y;
        const iters = Number(p.iterations);
        // 本体（前フレームの姿勢から続けて解く＝ロープのような追従）
        for (let k = 0; k < iters; k++) {
          fabrikForward(joints, lengths, tx, ty);
          fabrikBackward(joints, lengths, bx, base.y);
        }
        errF = Math.hypot(joints[n * 2] - tx, joints[n * 2 + 1] - ty);
        // 段階表示：まっすぐな姿勢から同じ反復をたどる
        stages = [];
        if (mode === 'stages') {
          const s = new Float32Array((n + 1) * 2);
          for (let i = 0; i <= n; i++) { s[i * 2] = bx; s[i * 2 + 1] = base.y + (total / n) * i; }
          stages.push(s.slice());
          for (let k = 0; k < iters; k++) {
            fabrikForward(s, lengths, tx, ty);
            stages.push(s.slice());
            fabrikBackward(s, lengths, bx, base.y);
            stages.push(s.slice());
          }
        } else {
          for (let k = 0; k < iters; k++) ccdIteration(base.x + off, base.y, Math.PI / 2, angles, lengths, ccdJ, tgt.x + off, tgt.y, Math.PI);
          errC = Math.hypot(ccdJ[n * 2] - tgt.x - off, ccdJ[n * 2 + 1] - tgt.y);
        }
        if (dt > 0) trail.push(joints[n * 2], joints[n * 2 + 1]);
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const mode = String(p.mode);
        const { off } = layout(mode);
        const bases = mode === 'compare' ? [base.x - off, base.x + off] : [base.x];
        for (const bx of bases) g.circle(bx, base.y, total, 0x2a3050, { segments: 64 });
        if (mode === 'stages') {
          stages.forEach((s, k) => {
            if (k === 0) { drawChain(g, s, 0x5a6090, { alpha: 0.5, fillJoints: false, jointR: 0.1 }); return; }
            const fwd = k % 2 === 1;
            drawChain(g, s, fwd ? 0xffa040 : 0x7dff8a, { alpha: 0.2 + (0.4 * k) / stages.length, fillJoints: false, jointR: 0.1 });
          });
        }
        if (p.showTrails) g.polyline(trail.points(), 0xffd36b, { fade: true, alpha: 0.7 });
        drawChain(g, joints, 0x6bd0ff, { jointR: 0.2 });
        if (mode === 'compare') {
          drawChain(g, ccdJ, 0xffa040, { jointR: 0.2 });
          g.circle(tgt.x + off, tgt.y, 0.45, 0xff5c8a);
        }
        for (const bx of bases) g.rect(bx - 0.4, base.y - 0.4, 0.8, 0.8, 0xffffff, { fill: drag === 'base' });
        for (const bx of bases) g.rect(bx - 0.4, base.y - 0.4, 0.8, 0.8, 0xffffff);
        const tx = mode === 'compare' ? tgt.x - off : tgt.x;
        g.circle(tx, tgt.y, 0.45, 0xff5c8a);
        g.circle(tx, tgt.y, 0.12, 0xff5c8a, { fill: true });
      },
      pointer(x, y, down, p) {
        const ev = pt.update(down);
        const { off } = layout(String(p.mode));
        const compare = p.mode === 'compare';
        // 比較時は左（FABRIK）側の座標に揃える
        const lx = compare && x > 0 ? x - 2 * off : x;
        if (ev === 'press') drag = Math.hypot(lx - (base.x - off), y - base.y) < 1 ? 'base' : 'target';
        if ((ev === 'press' || ev === 'drag') && drag) {
          idle = 0;
          if (drag === 'base') { base.x = lx + off; base.y = y; }
          else { tgt.x = lx + off; tgt.y = y; }
        }
        if (ev === 'release') drag = null;
      },
      status(p) {
        const d = Math.hypot(tgt.x - base.x, tgt.y - base.y);
        const reach = d > total ? '（届かない → 一直線に伸びる）' : '';
        return p.mode === 'compare'
          ? `同じ反復 ${p.iterations} 回での誤差：FABRIK（水色）${errF.toFixed(3)} · CCD（橙）${errC.toFixed(3)}${reach} · ドラッグで目標／根元`
          : `FABRIK 誤差 ${errF.toFixed(4)} · 反復 ${p.iterations} 回（橙＝前進段、緑＝後退段）${reach} · ドラッグで目標／根元`;
      },
    };
  },
});
