import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { PointerTracker } from '../framework/steerKit';

/** MOT-010 キーフレーム補間：ステップ・線形・3次エルミート（カーディナル／Catmull-Rom 接線） */
const COLORS = { step: 0xff7dc0, linear: 0x6bd0ff, hermite: 0xffd36b };

export default defineMotionDemo({
  id: 'MOT-010',
  notes: '等間隔のキー列を、ステップ（値を保持）・線形・3次エルミートで評価する。エルミートの接線は m_i=(1−張力)(p_{i+1}−p_{i−1})/2（張力0で Catmull-Rom）で、キーの短い線が接線。再生ヘッドに合わせて下の3本の溝の点が各方式の値で動く。キーはクリック・ドラッグで上下できる。',
  params: [
    {
      key: 'mode', label: '補間方式', type: 'select', default: 'all',
      options: [
        { value: 'all', label: '3方式を重ねる' },
        { value: 'step', label: 'ステップ' },
        { value: 'linear', label: '線形' },
        { value: 'hermite', label: '3次エルミート' },
      ],
    },
    { key: 'keys', label: 'キーの数', type: 'number', min: 3, max: 12, step: 1, default: 7 },
    { key: 'tension', label: '張力', type: 'number', min: -1, max: 1, step: 0.01, default: 0 },
    { key: 'duration', label: '1周の時間（秒）', type: 'number', min: 1, max: 12, step: 0.1, default: 5 },
  ],
  resetKeys: ['keys'],
  create(env, params) {
    const pt = new PointerTracker();
    const n = Number(params.keys);
    const vals = Array.from({ length: n }, () => (env.rng() * 2 - 1) * 4.5);
    let drag = -1;
    let time = 0;
    const trails = { step: new Trail(300), linear: new Trail(300), hermite: new Trail(300) };
    const tangent = (i: number, tension: number) => {
      const a = vals[Math.max(0, i - 1)], b = vals[Math.min(n - 1, i + 1)];
      const span = Math.min(n - 1, i + 1) - Math.max(0, i - 1);
      return ((1 - tension) * (b - a)) / span;
    };
    const evalAt = (mode: string, u: number, tension: number): number => {
      // u は 0..n-1 のキー単位の時刻
      const i = Math.min(n - 2, Math.floor(u));
      const s = u - i;
      if (mode === 'step') return vals[Math.min(n - 1, Math.floor(u))];
      if (mode === 'linear') return vals[i] + (vals[i + 1] - vals[i]) * s;
      const s2 = s * s, s3 = s2 * s;
      const h00 = 2 * s3 - 3 * s2 + 1, h10 = s3 - 2 * s2 + s, h01 = -2 * s3 + 3 * s2, h11 = s3 - s2;
      return h00 * vals[i] + h10 * tangent(i, tension) + h01 * vals[i + 1] + h11 * tangent(i + 1, tension);
    };
    const layout = () => {
      const { w } = env.bounds();
      return { x0: -w + 1.5, x1: w - 1.5, y0: 4, sy: 0.9 };
    };
    const modes = ['step', 'linear', 'hermite'] as const;
    return {
      step(dt, p) {
        time += dt;
        const L = layout();
        const u = ((time / Number(p.duration)) % 1) * (n - 1);
        if (u < 0.05) for (const m of modes) trails[m].clear();
        modes.forEach((m, k) => {
          trails[m].push(L.x0 + ((L.x1 - L.x0) * evalAt(m, u, Number(p.tension)) + 4.5 * (L.x1 - L.x0)) / 9, -5 - k * 1.8);
        });
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const L = layout();
        const tension = Number(p.tension);
        const mx = (u: number) => L.x0 + ((L.x1 - L.x0) * u) / (n - 1);
        const my = (v: number) => L.y0 + v * L.sy;
        g.rect(L.x0 - 0.5, my(-5.5), L.x1 - L.x0 + 1, 11 * L.sy, 0x2a3050);
        for (let i = 0; i < n; i++) g.line(mx(i), my(-5.5), mx(i), my(5.5), 0x1d2238);
        for (const m of modes) {
          if (p.mode !== 'all' && p.mode !== m) continue;
          const pts: number[] = [];
          const N = 40 * (n - 1);
          for (let k = 0; k <= N; k++) {
            const u = (k / N) * (n - 1);
            if (m === 'step' && k > 0) {
              const prev = evalAt(m, ((k - 1) / N) * (n - 1), tension), cur = evalAt(m, u, tension);
              if (prev !== cur) pts.push(mx(u), my(prev));
            }
            pts.push(mx(u), my(evalAt(m, u, tension)));
          }
          g.polyline(pts, COLORS[m], { alpha: 0.9 });
        }
        // キーと接線
        for (let i = 0; i < n; i++) {
          if (p.mode === 'all' || p.mode === 'hermite') {
            const m = tangent(i, tension), dx = 0.6;
            const sx = (L.x1 - L.x0) / (n - 1);
            g.line(mx(i) - dx, my(vals[i] - (m * dx) / sx), mx(i) + dx, my(vals[i] + (m * dx) / sx), COLORS.hermite, 0.7);
          }
          g.circle(mx(i), my(vals[i]), 0.28, drag === i ? 0xffffff : 0xdde0ff, { fill: true });
        }
        const u = ((time / Number(p.duration)) % 1) * (n - 1);
        g.line(mx(u), my(-5.5), mx(u), my(5.5), 0xffffff, 0.5);
        // 下：各方式の値で横に動く物体
        modes.forEach((m, k) => {
          const yy = -5 - k * 1.8;
          const on = p.mode === 'all' || p.mode === m;
          g.line(L.x0, yy, L.x1, yy, 0x3a4070);
          if (!on) return;
          if (p.showTrails) g.polyline(trails[m].points(), COLORS[m], { fade: true, alpha: 0.7 });
          const v = evalAt(m, u, tension);
          g.circle(L.x0 + ((L.x1 - L.x0) * (v + 4.5)) / 9, yy, 0.5, COLORS[m], { fill: true });
          g.circle(mx(u), my(v), 0.16, COLORS[m], { fill: true });
        });
      },
      pointer(x, y, down) {
        const ev = pt.update(down);
        const L = layout();
        if (ev === 'press') {
          const u = ((x - L.x0) / (L.x1 - L.x0)) * (n - 1);
          const i = Math.round(u);
          drag = y > -3 && i >= 0 && i < n && Math.abs(u - i) < 0.45 ? i : -1;
        }
        if ((ev === 'press' || ev === 'drag') && drag >= 0) vals[drag] = Math.max(-5.5, Math.min(5.5, (y - L.y0) / L.sy));
        if (ev === 'release') drag = -1;
      },
      status(p) {
        const u = ((time / Number(p.duration)) % 1) * (n - 1);
        const t = Number(p.tension);
        return `時刻 ${u.toFixed(2)}（キー単位）· ステップ ${evalAt('step', u, t).toFixed(2)} · 線形 ${evalAt('linear', u, t).toFixed(2)} · エルミート ${evalAt('hermite', u, t).toFixed(2)} · キーをドラッグで編集`;
      },
    };
  },
});
