import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { PointerTracker } from '../framework/steerKit';

/** MOT-009 二次系 y + k1·y˙ + k2·y¨ = x + k3·x˙ を f・ζ・r から作り、2D の入力に追従させる */
interface SO { y: [number, number]; yd: [number, number]; xp: [number, number]; trail: Trail; hist: Trail }

export default defineMotionDemo({
  id: 'MOT-009',
  notes: 'k1=ζ/(πf)、k2=1/(2πf)²、k3=r·ζ/(2πf) とした二次系を半陰的に積分し、安定のため k2 を max(k2, dt²/2+dt·k1/2, dt·k1) に補正。白い輪が入力、色の三角が出力。灰色の三角は同じ f・ζ で r=0 の参照。下段は x 成分の時間グラフで、r<0 の予備動作や r>1 の先行が見える。ドラッグで入力を直接動かす。',
  params: [
    { key: 'f', label: 'f（振動数 Hz）', type: 'number', min: 0.2, max: 6, step: 0.05, default: 1.4 },
    { key: 'zeta', label: 'ζ（減衰）', type: 'number', min: 0, max: 2, step: 0.01, default: 0.5 },
    { key: 'r', label: 'r（初期応答）', type: 'number', min: -3, max: 4, step: 0.05, default: 2 },
    {
      key: 'input', label: '入力の種類', type: 'select', default: 'square',
      options: [
        { value: 'square', label: '矩形波（四隅へ跳ぶ）' },
        { value: 'sine', label: '正弦波（横往復）' },
        { value: 'circle', label: '円運動' },
        { value: 'pointer', label: 'ポインタのみ' },
      ],
    },
  ],
  create(env) {
    const pt = new PointerTracker();
    const mk = (): SO => ({ y: [0, 3], yd: [0, 0], xp: [0, 3], trail: new Trail(300), hist: new Trail(500) });
    const main = mk(), ref = mk();
    let time = 0;
    let input: [number, number] = [0, 3];
    let ptr: [number, number] | null = null;
    let k = [0, 0, 0];
    const update = (s: SO, x: [number, number], dt: number, f: number, z: number, r: number) => {
      const k1 = z / (Math.PI * f), k2 = 1 / ((2 * Math.PI * f) ** 2), k3 = (r * z) / (2 * Math.PI * f);
      const k2s = Math.max(k2, (dt * dt) / 2 + (dt * k1) / 2, dt * k1);
      for (let i = 0; i < 2; i++) {
        const xd = (x[i] - s.xp[i]) / dt;
        s.xp[i] = x[i];
        s.y[i] += dt * s.yd[i];
        s.yd[i] += (dt * (x[i] + k3 * xd - s.y[i] - k1 * s.yd[i])) / k2s;
      }
      return [k1, k2, k3];
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        time += dt;
        if (ptr) input = [ptr[0], ptr[1]];
        else if (p.input === 'square') {
          const ph = Math.floor(time / 1.5) % 4;
          input = [ph === 0 || ph === 3 ? -7 : 7, ph < 2 ? 6.5 : 0.5];
        } else if (p.input === 'sine') input = [Math.sin(time * 1.6) * 7, 3.5];
        else if (p.input === 'circle') input = [Math.cos(time * 2) * 5, 3.5 + Math.sin(time * 2) * 3];
        const f = Number(p.f), z = Number(p.zeta), r = Number(p.r);
        k = update(main, input, dt, f, z, r);
        update(ref, input, dt, f, z, 0);
        main.trail.push(main.y[0], main.y[1]);
        ref.trail.push(ref.y[0], ref.y[1]);
        main.hist.push(time, main.y[0]);
        ref.hist.push(time, input[0]);
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const { w } = env.bounds();
        g.line(-w, -1.2, w, -1.2, 0x3a4070);
        if (p.showTrails) {
          g.polyline(ref.trail.points(), 0x7a7f9a, { fade: true, alpha: 0.6 });
          g.polyline(main.trail.points(), 0xffa040, { fade: true });
        }
        g.circle(input[0], input[1], 0.5, 0xffffff);
        g.circle(input[0], input[1], 0.08, 0xffffff, { fill: true });
        const ang = (s: SO) => Math.atan2(s.yd[1], s.yd[0]);
        g.agent(ref.y[0], ref.y[1], ang(ref), 0.35, 0x7a7f9a);
        g.agent(main.y[0], main.y[1], ang(main), 0.45, 0xffa040);
        g.arrow(main.y[0], main.y[1], main.yd[0] * 0.08, main.yd[1] * 0.08, 0xffd36b, 0.8);
        g.line(main.y[0], main.y[1], input[0], input[1], 0xffffff, 0.15);
        // 下段：x 成分の時間グラフ（白＝入力、橙＝出力）
        const gy = -5.6, sc = 0.45, span = 6;
        const map = (tr: Trail) => {
          const pts = tr.points(), out: number[] = [];
          for (let i = 0; i < pts.length; i += 2) {
            const x = w - 0.5 - ((time - pts[i]) / span) * (2 * w - 1);
            if (x > -w + 0.5) out.push(x, gy + pts[i + 1] * sc);
          }
          return out;
        };
        g.rect(-w + 0.5, gy - 3.8, 2 * w - 1, 7.6, 0x2a3050);
        g.polyline(map(ref.hist), 0xffffff, { alpha: 0.7 });
        g.polyline(map(main.hist), 0xffa040);
      },
      pointer(x, y, down, p) {
        const ev = pt.update(down);
        if (ev === 'press' || ev === 'drag') ptr = [x, Math.max(-0.5, y)];
        // ポインタのみの時は離した位置に入力を残す
        else if (ev === 'release') {
          if (p.input === 'pointer' && ptr) input = ptr;
          ptr = null;
        }
      },
      status(p) {
        return `k1=${k[0].toFixed(3)} k2=${k[1].toFixed(4)} k3=${k[2].toFixed(3)} · r=${Number(p.r).toFixed(2)}${Number(p.r) < 0 ? '（予備動作）' : Number(p.r) > 1 ? '（先行・行き過ぎ）' : ''} · ドラッグで入力を動かす`;
      },
    };
  },
});
