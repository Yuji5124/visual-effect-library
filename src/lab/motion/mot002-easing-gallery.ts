import { defineMotionDemo } from '../framework/motionLab';

/** MOT-002 イージング関数のギャラリー：グラフと実際に動く点を並べる */
type Ease = (t: number) => number;

const C1 = 1.70158, C3 = C1 + 1, C4 = (2 * Math.PI) / 3;
const bounceOut: Ease = (t) => {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
  if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
  return n * (t -= 2.625 / d) * t + 0.984375;
};
// すべて「In」形で定義し、Out・InOut は変換で作る
const EASE_IN: [string, Ease, number][] = [
  ['linear', (t) => t, 0x9aa0c8],
  ['sine', (t) => 1 - Math.cos((t * Math.PI) / 2), 0x6bd0ff],
  ['quad', (t) => t * t, 0x5ab8ff],
  ['cubic', (t) => t * t * t, 0x7d8aff],
  ['quart', (t) => t * t * t * t, 0xa87dff],
  ['expo', (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)), 0xe07dff],
  ['circ', (t) => 1 - Math.sqrt(Math.max(0, 1 - t * t)), 0xff7dc0],
  ['back', (t) => C3 * t * t * t - C1 * t * t, 0xff8a6b],
  ['elastic', (t) => (t <= 0 ? 0 : t >= 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * C4)), 0xffd36b],
  ['bounce', (t) => 1 - bounceOut(1 - t), 0x7dff8a],
];

function shaped(f: Ease, mode: string): Ease {
  if (mode === 'out') return (t) => 1 - f(1 - t);
  if (mode === 'inout') return (t) => (t < 0.5 ? f(2 * t) / 2 : 1 - f(2 - 2 * t) / 2);
  return f;
}

export default defineMotionDemo({
  id: 'MOT-002',
  notes: '10種のイージング（linear・sine・quad・cubic・quart・expo・circ・back・elastic・bounce）を In 形で実装し、Out は 1−f(1−t)、InOut は前半・後半の合成で作る。各セルの左が t→f(t) のグラフ、右の縦の溝を同じ時間で点が動く。クリックで時間を 0 に戻す。',
  params: [
    {
      key: 'mode', label: '種類', type: 'select', default: 'out',
      options: [
        { value: 'in', label: 'In（始めが遅い）' },
        { value: 'out', label: 'Out（終わりが遅い）' },
        { value: 'inout', label: 'InOut（両方）' },
      ],
    },
    { key: 'period', label: '周期（秒）', type: 'number', min: 0.5, max: 5, step: 0.1, default: 1.6 },
    {
      key: 'only', label: '表示する関数', type: 'select', default: 'all',
      options: [{ value: 'all', label: 'すべて' }, ...EASE_IN.map(([n]) => ({ value: n, label: n }))],
    },
  ],
  create(env) {
    let time = 0;
    const histories = EASE_IN.map(() => [] as number[]);
    let lastT = 0;
    return {
      step(dt) {
        time += dt;
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const period = Number(p.period);
        // 1周期 = 動く時間 + 端での停止（0.35周期）
        const ph = (time / period) % 1.35;
        const t = Math.min(1, ph);
        if (t < lastT) for (const h of histories) h.length = 0;
        lastT = t;
        const list = p.only === 'all' ? EASE_IN.map((_e, i) => i) : [EASE_IN.findIndex((e) => e[0] === p.only)];
        const { w, h } = env.bounds();
        const cols = list.length === 1 ? 1 : w > h * 1.3 ? 5 : 3;
        const rows = Math.ceil(list.length / cols);
        const cw = (2 * w - 1) / cols, ch = (2 * h - 1) / rows;
        list.forEach((idx, k) => {
          const [, fin, color] = EASE_IN[idx];
          const f = shaped(fin, String(p.mode));
          const c = k % cols, r = Math.floor(k / cols);
          const x0 = -w + 0.5 + c * cw, y0 = h - 0.5 - (r + 1) * ch;
          const gw = cw * 0.68, gh = ch - 1.2;
          const gx = x0 + 0.3, gy = y0 + 0.6;
          // 出力の範囲 -0.5..1.5 を縦に割り当てる（back・elastic の行き過ぎを見せる）
          const my = (v: number) => gy + gh * ((v + 0.5) / 2);
          g.rect(gx, gy, gw, gh, 0x2a3050);
          g.line(gx, my(0), gx + gw, my(0), 0x3a4070);
          g.line(gx, my(1), gx + gw, my(1), 0x3a4070);
          const pts: number[] = [];
          for (let i = 0; i <= 60; i++) pts.push(gx + (gw * i) / 60, my(f(i / 60)));
          g.polyline(pts, color, { alpha: 0.85 });
          const v = f(t);
          const hist = histories[idx];
          hist.push(gx + gw * t, my(v));
          if (hist.length > 400) hist.splice(0, 2);
          if (p.showTrails) g.polyline(hist, 0xffffff, { alpha: 0.8 });
          g.line(gx + gw * t, gy, gx + gw * t, gy + gh, 0xffffff, 0.25);
          g.circle(gx + gw * t, my(v), 0.14, 0xffffff, { fill: true });
          // 右の溝：同じ時刻の値で縦に動く点
          const tx = gx + gw + cw * 0.14;
          g.line(tx, my(0), tx, my(1), 0x3a4070);
          g.line(tx - 0.25, my(0), tx + 0.25, my(0), 0x5a6090);
          g.line(tx - 0.25, my(1), tx + 0.25, my(1), 0x5a6090);
          g.circle(tx, my(v), Math.min(0.45, cw * 0.08), color, { fill: true });
          g.line(gx + gw * t, my(v), tx, my(v), color, 0.25);
        });
      },
      pointer(_x, _y, down) {
        if (down) {
          time = 0;
          for (const h of histories) h.length = 0;
        }
      },
      status(p) {
        const period = Number(p.period);
        const t = Math.min(1, ((time / period) % 1.35));
        const parts = EASE_IN.filter((e) => p.only === 'all' ? ['sine', 'back', 'elastic', 'bounce'].includes(e[0]) : e[0] === p.only)
          .map(([n, f]) => `${n} ${shaped(f, String(p.mode))(t).toFixed(2)}`);
        return `t=${t.toFixed(2)} · ${parts.join(' · ')} · クリックで最初から`;
      },
    };
  },
});
