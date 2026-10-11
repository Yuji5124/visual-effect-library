import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { clamp, hsl, limit } from '../framework/crowdKit';

type Fn = { f: (x: number, y: number) => number; span: number; minima: [number, number][] };
const FUNCS: Record<string, Fn> = {
  rastrigin: { f: (x, y) => 20 + x * x - 10 * Math.cos(2 * Math.PI * x) + y * y - 10 * Math.cos(2 * Math.PI * y), span: 5.12, minima: [[0, 0]] },
  ackley: {
    f: (x, y) => -20 * Math.exp(-0.2 * Math.sqrt(0.5 * (x * x + y * y))) - Math.exp(0.5 * (Math.cos(2 * Math.PI * x) + Math.cos(2 * Math.PI * y))) + Math.E + 20,
    span: 5, minima: [[0, 0]],
  },
  himmelblau: { f: (x, y) => (x * x + y - 11) ** 2 + (x + y * y - 7) ** 2, span: 5, minima: [[3, 2], [-2.805118, 3.131312], [-3.77931, -3.283186], [3.584428, -1.848126]] },
  sphere: { f: (x, y) => x * x + y * y, span: 5, minima: [[0, 0]] },
};

/** MOT-038 粒子群最適化：v ← w v + c1 r1 (p_best − x) + c2 r2 (g_best − x) */
export default defineMotionDemo({
  id: 'MOT-038',
  notes: '多峰関数の値を背景の色（暗い=低い）で描き、その上で粒子群最適化を回す。各反復で v ← w·v + c1·r1·(自分の最良 − x) + c2·r2·(群れの最良 − x)、x ← x + v。粒子から自分の最良位置への細線、群れの最良を白い円、真の最小を緑の十字で表示。反復の間は位置を補間して描く。クリックした所へ地形（最小点）を移すと、記憶を評価し直して探し直す。',
  params: [
    { key: 'w', label: '慣性 w', type: 'number', min: 0, max: 1.2, step: 0.01, default: 0.72 },
    { key: 'c1', label: '自己 c1', type: 'number', min: 0, max: 3, step: 0.01, default: 1.49 },
    { key: 'c2', label: '社会 c2', type: 'number', min: 0, max: 3, step: 0.01, default: 1.49 },
    {
      key: 'fn', label: '関数', type: 'select', default: 'rastrigin',
      options: [{ value: 'rastrigin', label: 'Rastrigin（格子状の局所解）' }, { value: 'ackley', label: 'Ackley' }, { value: 'himmelblau', label: 'Himmelblau（最小が4つ）' }, { value: 'sphere', label: '球（単峰）' }],
    },
    { key: 'count', label: '粒子の数', type: 'number', min: 3, max: 120, step: 1, default: 30 },
    { key: 'rate', label: '反復／秒', type: 'number', min: 1, max: 30, step: 1, default: 6 },
  ],
  resetKeys: ['count', 'fn'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    const fn = FUNCS[String(p0.fn)] ?? FUNCS.rastrigin;
    let ox = 0, oy = 0;
    const S = 9; // ワールドの ±9 を関数の定義域 ±span に対応
    const val = (wx: number, wy: number) => fn.f(((wx - ox) / S) * fn.span, ((wy - oy) / S) * fn.span);
    const { w: bw } = env.bounds();
    const xmax = bw - 0.5, ymax = 9.5;
    const P = Array.from({ length: n }, () => {
      const x = (env.rng() * 2 - 1) * xmax, y = (env.rng() * 2 - 1) * ymax;
      return { x, y, px: x, py: y, vx: (env.rng() - 0.5) * 2, vy: (env.rng() - 0.5) * 2, bx: x, by: y, bf: Infinity, trail: new Trail(40) };
    });
    let gx = 0, gy = 0, gf = Infinity;
    const evalAll = () => {
      gf = Infinity;
      for (const q of P) {
        q.bf = val(q.bx, q.by);
        const f = val(q.x, q.y);
        if (f < q.bf) { q.bf = f; q.bx = q.x; q.by = q.y; }
        if (q.bf < gf) { gf = q.bf; gx = q.bx; gy = q.by; }
      }
    };
    evalAll();
    let iter = 0, acc = 0;
    // 背景の値は地形が変わった時だけ計算し直す
    let field: Float32Array | null = null;
    let fw = 0, fh = 0, fkey = '';
    const cell = env.quality === 'low' ? 0.6 : 0.4;
    return {
      step(dt, p) {
        if (dt <= 0) return;
        const rate = Number(p.rate);
        acc += dt * rate;
        while (acc >= 1) {
          acc -= 1;
          iter++;
          const w = Number(p.w), c1 = Number(p.c1), c2 = Number(p.c2);
          for (const q of P) {
            q.px = q.x; q.py = q.y;
            q.vx = w * q.vx + c1 * env.rng() * (q.bx - q.x) + c2 * env.rng() * (gx - q.x);
            q.vy = w * q.vy + c1 * env.rng() * (q.by - q.y) + c2 * env.rng() * (gy - q.y);
            [q.vx, q.vy] = limit(q.vx, q.vy, 6);
            q.x = clamp(q.x + q.vx, -xmax, xmax);
            q.y = clamp(q.y + q.vy, -ymax, ymax);
            const f = val(q.x, q.y);
            if (f < q.bf) { q.bf = f; q.bx = q.x; q.by = q.y; }
          }
          for (const q of P) if (q.bf < gf) { gf = q.bf; gx = q.bx; gy = q.by; }
        }
        const a = acc;
        for (const q of P) q.trail.push(q.px + (q.x - q.px) * a, q.py + (q.y - q.py) * a);
      },
      draw(g, p) {
        const { w, h } = env.bounds();
        const key = `${ox},${oy},${w.toFixed(2)},${h.toFixed(2)}`;
        if (key !== fkey) {
          fkey = key;
          fw = Math.ceil((2 * w) / cell);
          fh = Math.ceil((2 * h) / cell);
          field = new Float32Array(fw * fh);
          let mn = Infinity, mx = -Infinity;
          for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
            const v = val(-w + (i + 0.5) * cell, -h + (j + 0.5) * cell);
            field[j * fw + i] = v;
            if (v < mn) mn = v;
            if (v > mx) mx = v;
          }
          for (let k = 0; k < field.length; k++) field[k] = Math.sqrt((field[k] - mn) / (mx - mn || 1));
        }
        for (let j = 0; j < fh; j++) for (let i = 0; i < fw; i++) {
          const t = field![j * fw + i];
          g.rect(-w + i * cell, -h + j * cell, cell, cell, hsl(0.7 - t * 0.6, 0.55, 0.08 + t * 0.32), { fill: true });
        }
        for (const [mx, my] of fn.minima) {
          const x = (mx / fn.span) * S + ox, y = (my / fn.span) * S + oy;
          g.line(x - 0.5, y, x + 0.5, y, 0x7dff8a);
          g.line(x, y - 0.5, x, y + 0.5, 0x7dff8a);
        }
        const a = acc;
        for (const q of P) {
          const x = q.px + (q.x - q.px) * a, y = q.py + (q.y - q.py) * a;
          if (p.showTrails) g.polyline(q.trail.points(), 0xffffff, { fade: true, alpha: 0.4 });
          g.line(x, y, q.bx, q.by, 0xffd166, 0.25);
          g.circle(q.bx, q.by, 0.08, 0xffd166, { fill: true, segments: 4 });
          g.arrow(x, y, q.vx * 0.5, q.vy * 0.5, 0x6fd3ff, 0.8);
          g.circle(x, y, 0.16, 0xff6b8a, { fill: true, segments: 8 });
        }
        g.circle(gx, gy, 0.45, 0xffffff);
        g.circle(gx, gy, 0.6, 0xffffff, { alpha: 0.5 });
      },
      pointer(x, y, down) {
        if (!down) return;
        // 地形の最小点（Himmelblau は中心）をクリック位置へ移し、記憶を評価し直す
        ox = x;
        oy = y;
        evalAll();
      },
      status() {
        let best = Infinity;
        for (const [mx, my] of fn.minima) best = Math.min(best, Math.hypot((mx / fn.span) * S + ox - gx, (my / fn.span) * S + oy - gy));
        let spread = 0;
        for (const q of P) spread += Math.hypot(q.x - gx, q.y - gy);
        return `反復 ${iter} · 群れの最良値 ${gf.toFixed(4)} · 真の最小までの距離 ${best.toFixed(2)} · 群れの広がり ${(spread / n).toFixed(2)} · クリックで地形を移動`;
      },
    };
  },
});
