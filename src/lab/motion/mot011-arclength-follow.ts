import { defineMotionDemo } from '../framework/motionLab';
import { PointerTracker, pickHandle } from '../framework/steerKit';

/** MOT-011 弧長パラメーター化：t 等速と、累積弧長表＋二分探索による等速を比べる */
const SHAPES: Record<string, number[]> = {
  // 閉じた Catmull-Rom の制御点（わざと間隔を不揃いにしてある）
  wave: [-12, 0, -10.5, 5, -9.8, 5.5, -4, -4, 0, -5, 1, 4, 2, 5, 9, 4, 12, -2, 6, -6, -2, -7, -8, -6],
  loop: [-10, -4, -6, 6, -5.5, 6.2, -5, 6, 0, -2, 6, 6, 10, 4, 10.5, -5, 3, -7.5, 2.5, -7.4, -4, -7],
  s: [-12, 6, -2, 6, -1.5, 5.8, -1, 0, -12, -1, -12.3, -1.5, -12, -7, 4, -7, 12, -6, 12, 7],
};

export default defineMotionDemo({
  id: 'MOT-011',
  notes: '閉じた Catmull-Rom 曲線を、橙は t を一定速度で、水色は「累積弧長の表から目標距離 s に当たる t を二分探索＋線形補間」で進める（1周の時間は同じ）。0.2秒ごとに落とす点の間隔で速さのむらが見える。表のサンプル数を減らすと水色にも誤差が出る。制御点（白い輪）はドラッグで動かせる。',
  params: [
    { key: 'speed', label: '速度（単位/秒）', type: 'number', min: 1, max: 20, step: 0.1, default: 7 },
    { key: 'samples', label: '表のサンプル数', type: 'number', min: 4, max: 400, step: 1, default: 200 },
    {
      key: 'shape', label: '曲線の形', type: 'select', default: 'wave',
      options: [
        { value: 'wave', label: '波（間隔不揃い）' },
        { value: 'loop', label: '輪' },
        { value: 's', label: 'S 字' },
      ],
    },
  ],
  resetKeys: ['shape'],
  create(env, params) {
    const pt = new PointerTracker();
    const { w } = env.bounds();
    const sx = Math.min(1, (w - 1) / 12.5);
    const cps = SHAPES[String(params.shape)].map((v, i) => (i % 2 === 0 ? v * sx : v));
    const m = cps.length / 2;
    let drag = -1;
    const evalCurve = (t: number): [number, number] => {
      const u = (((t % 1) + 1) % 1) * m;
      const i = Math.floor(u), s = u - i;
      const P = (k: number) => ((i + k) % m + m) % m;
      const p0 = P(-1), p1 = P(0), p2 = P(1), p3 = P(2);
      const s2 = s * s, s3 = s2 * s;
      const f = (a: number, b: number, c: number, d: number) => 0.5 * (2 * b + (-a + c) * s + (2 * a - 5 * b + 4 * c - d) * s2 + (-a + 3 * b - 3 * c + d) * s3);
      return [f(cps[p0 * 2], cps[p1 * 2], cps[p2 * 2], cps[p3 * 2]), f(cps[p0 * 2 + 1], cps[p1 * 2 + 1], cps[p2 * 2 + 1], cps[p3 * 2 + 1])];
    };
    // 累積弧長の表（n 区間）
    let table = new Float64Array(0), total = 1, tableN = 0;
    const build = (n: number) => {
      tableN = n;
      table = new Float64Array(n + 1);
      // 真の長さに近い値を得るため各区間を細分して積算
      let [px, py] = evalCurve(0);
      for (let k = 1; k <= n; k++) {
        let acc = 0;
        const sub = Math.max(1, Math.ceil(800 / n));
        for (let j = 1; j <= sub; j++) {
          const [x, y] = evalCurve((k - 1 + j / sub) / n);
          acc += Math.hypot(x - px, y - py);
          px = x; py = y;
        }
        table[k] = table[k - 1] + acc;
      }
      total = table[n];
    };
    const tFromS = (s: number): number => {
      s = ((s % total) + total) % total;
      let lo = 0, hi = tableN;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (table[mid] < s) lo = mid; else hi = mid;
      }
      const seg = table[hi] - table[lo];
      return (lo + (seg > 0 ? (s - table[lo]) / seg : 0)) / tableN;
    };
    build(Number(params.samples));
    let tNaive = 0, sArc = 0, dropT = 0;
    const drops: { naive: number[]; arc: number[] } = { naive: [], arc: [] };
    let prevN = evalCurve(0), prevA = evalCurve(0);
    const spd = { naive: [1e9, 0], arc: [1e9, 0] };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        if (Number(p.samples) !== tableN) {
          build(Number(p.samples));
          spd.naive = [1e9, 0];
          spd.arc = [1e9, 0];
        }
        const v = Number(p.speed);
        tNaive = (tNaive + (v / total) * dt) % 1;
        sArc = (sArc + v * dt) % total;
        const a = evalCurve(tNaive), b = evalCurve(tFromS(sArc));
        const vn = Math.hypot(a[0] - prevN[0], a[1] - prevN[1]) / dt, va = Math.hypot(b[0] - prevA[0], b[1] - prevA[1]) / dt;
        if (vn < v * 4) { spd.naive[0] = Math.min(spd.naive[0], vn); spd.naive[1] = Math.max(spd.naive[1], vn); }
        if (va < v * 4) { spd.arc[0] = Math.min(spd.arc[0], va); spd.arc[1] = Math.max(spd.arc[1], va); }
        prevN = a; prevA = b;
        dropT += dt;
        if (dropT > 0.2) {
          dropT = 0;
          drops.naive.push(a[0], a[1]);
          drops.arc.push(b[0], b[1]);
          const cap = 2 * Math.ceil(total / v / 0.2);
          while (drops.naive.length > cap) drops.naive.splice(0, 2);
          while (drops.arc.length > cap) drops.arc.splice(0, 2);
        }
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const pts: number[] = [];
        for (let k = 0; k <= 400; k++) { const [x, y] = evalCurve(k / 400); pts.push(x, y); }
        g.polyline(pts, 0x5a6090);
        // 制御多角形
        g.polyline(cps, 0x2a3050, { closed: true });
        for (let i = 0; i < m; i++) g.circle(cps[i * 2], cps[i * 2 + 1], 0.3, drag === i ? 0xffffff : 0x9aa0c8);
        // 表のサンプル点（t が等間隔の点）
        if (tableN <= 60) for (let k = 0; k < tableN; k++) { const [x, y] = evalCurve(k / tableN); g.circle(x, y, 0.08, 0x9aa0c8, { fill: true }); }
        if (p.showTrails) {
          for (let i = 0; i < drops.naive.length; i += 2) g.circle(drops.naive[i], drops.naive[i + 1], 0.17, 0xffa040, { fill: true, alpha: 0.85 });
          for (let i = 0; i < drops.arc.length; i += 2) g.circle(drops.arc[i], drops.arc[i + 1], 0.11, 0x4ad8ff, { fill: true });
        }
        const a = evalCurve(tNaive), b = evalCurve(tFromS(sArc));
        const da = evalCurve(tNaive + 0.002), db = evalCurve(tFromS(sArc) + 0.002);
        g.agent(a[0], a[1], Math.atan2(da[1] - a[1], da[0] - a[0]), 0.4, 0xffa040);
        g.agent(b[0], b[1], Math.atan2(db[1] - b[1], db[0] - b[0]), 0.4, 0x4ad8ff);
      },
      pointer(x, y, down) {
        const ev = pt.update(down);
        if (ev === 'press') drag = pickHandle(cps, x, y, 1.2);
        if ((ev === 'press' || ev === 'drag') && drag >= 0) {
          cps[drag * 2] = x;
          cps[drag * 2 + 1] = y;
          build(tableN);
          spd.naive = [1e9, 0];
          spd.arc = [1e9, 0];
        }
        if (ev === 'release') drag = -1;
      },
      status(p) {
        const v = Number(p.speed);
        const r = (q: number[]) => (q[1] > 0 ? `${(q[0] / v).toFixed(2)}〜${(q[1] / v).toFixed(2)}倍` : '—');
        return `全長 ${total.toFixed(1)} · t等速（橙）の速さ ${r(spd.naive)} · 弧長等速（水色）${r(spd.arc)} · 表 ${tableN} 区間 · 制御点をドラッグ`;
      },
    };
  },
});
