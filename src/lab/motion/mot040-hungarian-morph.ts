import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { hsl, segmentsCross, smoothstep } from '../framework/crowdKit';

/** ハンガリー法（ポテンシャル付き、O(n³)）。cost[i*n+j] の割り当てで、行 i に対応する列を返す */
export function hungarian(cost: Float64Array, n: number): Int32Array {
  const INF = Infinity;
  const u = new Float64Array(n + 1), v = new Float64Array(n + 1);
  const p = new Int32Array(n + 1), way = new Int32Array(n + 1);
  const minv = new Float64Array(n + 1);
  const used = new Uint8Array(n + 1);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    minv.fill(INF);
    used.fill(0);
    do {
      used[j0] = 1;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[(i0 - 1) * n + (j - 1)] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      // 双対変数（ポテンシャル）を更新して、新しい等号辺を作る
      for (let j = 0; j <= n; j++) {
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    // 増加道に沿って割り当てを入れ替える
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const res = new Int32Array(n);
  for (let j = 1; j <= n; j++) res[p[j] - 1] = j - 1;
  return res;
}

/** 折れ線群を弧長で n 等分して点列にする */
function samplePolys(polys: number[][], n: number, closed: boolean[]): [number, number][] {
  const segs: [number, number, number, number, number][] = [];
  let total = 0;
  polys.forEach((pl, k) => {
    const m = pl.length / 2;
    const cnt = closed[k] ? m : m - 1;
    for (let i = 0; i < cnt; i++) {
      const a = i, b = (i + 1) % m;
      const l = Math.hypot(pl[b * 2] - pl[a * 2], pl[b * 2 + 1] - pl[a * 2 + 1]);
      segs.push([pl[a * 2], pl[a * 2 + 1], pl[b * 2], pl[b * 2 + 1], l]);
      total += l;
    }
  });
  const out: [number, number][] = [];
  let si = 0, acc = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * total;
    while (si < segs.length - 1 && acc + segs[si][4] < s) { acc += segs[si][4]; si++; }
    const [ax, ay, bx, by, l] = segs[si];
    const t = l > 0 ? (s - acc) / l : 0;
    out.push([ax + (bx - ax) * t, ay + (by - ay) * t]);
  }
  return out;
}

const SHAPES = ['circle', 'star', 'heart', 'letter', 'grid'] as const;
const SHAPE_JA: Record<string, string> = { circle: '円', star: '星', heart: 'ハート', letter: '文字 A', grid: '格子' };

function shapePoints(kind: string, n: number): [number, number][] {
  if (kind === 'circle') return Array.from({ length: n }, (_, i) => [Math.cos((i / n) * Math.PI * 2) * 7, Math.sin((i / n) * Math.PI * 2) * 7]);
  if (kind === 'star') {
    const pl: number[] = [];
    for (let i = 0; i < 10; i++) { const a = Math.PI / 2 + (i / 10) * Math.PI * 2, r = i % 2 ? 3.4 : 8; pl.push(Math.cos(a) * r, Math.sin(a) * r); }
    return samplePolys([pl], n, [true]);
  }
  if (kind === 'heart') {
    const pl: number[] = [];
    for (let i = 0; i < 200; i++) {
      const t = (i / 200) * Math.PI * 2;
      pl.push(16 * Math.sin(t) ** 3 * 0.45, (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * 0.45 + 0.8);
    }
    return samplePolys([pl], n, [true]);
  }
  if (kind === 'letter') return samplePolys([[-5.5, -7.5, 0, 7.5, 5.5, -7.5], [-3, -0.6, 3, -0.6]], n, [false, false]);
  const k = Math.ceil(Math.sqrt(n)), sp = 15 / Math.max(1, k - 1);
  return Array.from({ length: n }, (_, i) => [(i % k) * sp - 7.5, Math.floor(i / k) * sp - 7.5]);
}

/** MOT-040 最適割り当てによる隊形変形：ハンガリー法で移動距離の二乗和を最小にする */
export default defineMotionDemo({
  id: 'MOT-040',
  notes: '点群を円→星→ハート→文字 A→格子へ順に変形させる。各点の行き先を、移動距離の二乗和を最小にする線形割り当て問題として自前のハンガリー法（ポテンシャル付き O(n³)）で解く。番号順の割り当てと切り替えて、直線経路の交差数と距離の二乗和をステータスで比較できる。細線は各点の経路。クリックした位置を中心に次の図形へ移る。',
  params: [
    { key: 'count', label: '点の数', type: 'number', min: 8, max: 150, step: 1, default: 72 },
    {
      key: 'method', label: '割り当て方式', type: 'select', default: 'hungarian',
      options: [{ value: 'hungarian', label: 'ハンガリー法（最適）' }, { value: 'index', label: '番号順' }],
    },
    { key: 'duration', label: '移動時間（秒）', type: 'number', min: 0.5, max: 8, step: 0.1, default: 2.5 },
    { key: 'auto', label: '自動で次の図形へ', type: 'bool', default: true },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    const xs = new Float64Array(n), ys = new Float64Array(n);
    const sx = new Float64Array(n), sy = new Float64Array(n), tx = new Float64Array(n), ty = new Float64Array(n);
    for (let i = 0; i < n; i++) { xs[i] = (env.rng() * 2 - 1) * 9; ys[i] = (env.rng() * 2 - 1) * 8; }
    const trails = Array.from({ length: n }, () => new Trail(90));
    let shapeIdx = -1, t = 0, cx = 0, cy = 0, solveMs = 0;
    const stats = { hungarian: { cross: 0, cost: 0 }, index: { cross: 0, cost: 0 } };
    let method = '';
    const crossings = (ax: Float64Array, ay: Float64Array, bx: Float64Array, by: Float64Array) => {
      let c = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) if (segmentsCross(ax[i], ay[i], bx[i], by[i], ax[j], ay[j], bx[j], by[j])) c++;
      return c;
    };
    const next = (m: string) => {
      shapeIdx = (shapeIdx + 1) % SHAPES.length;
      const pts = shapePoints(SHAPES[shapeIdx], n);
      sx.set(xs); sy.set(ys);
      const cost = new Float64Array(n * n);
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) cost[i * n + j] = (xs[i] - pts[j][0] - cx) ** 2 + (ys[i] - pts[j][1] - cy) ** 2;
      const t0 = performance.now();
      const opt = hungarian(cost, n);
      solveMs = performance.now() - t0;
      const ix = new Float64Array(n), iy = new Float64Array(n), hx = new Float64Array(n), hy = new Float64Array(n);
      let ci = 0, ch = 0;
      for (let i = 0; i < n; i++) {
        ix[i] = pts[i][0] + cx; iy[i] = pts[i][1] + cy;
        hx[i] = pts[opt[i]][0] + cx; hy[i] = pts[opt[i]][1] + cy;
        ci += cost[i * n + i];
        ch += cost[i * n + opt[i]];
      }
      stats.index = { cross: crossings(sx, sy, ix, iy), cost: ci };
      stats.hungarian = { cross: crossings(sx, sy, hx, hy), cost: ch };
      if (m === 'index') { tx.set(ix); ty.set(iy); } else { tx.set(hx); ty.set(hy); }
      method = m;
      t = 0;
    };
    next('hungarian');
    return {
      step(dt, p) {
        if (dt <= 0) return;
        const dur = Number(p.duration);
        t += dt;
        if (String(p.method) !== method) {
          // 方式を変えたら同じ図形をもう一度（現在位置から）
          shapeIdx = (shapeIdx - 1 + SHAPES.length) % SHAPES.length;
          next(String(p.method));
        }
        if (p.auto && t > dur + 1.2) next(String(p.method));
        const k = smoothstep(0, 1, Math.min(1, t / dur));
        for (let i = 0; i < n; i++) {
          xs[i] = sx[i] + (tx[i] - sx[i]) * k;
          ys[i] = sy[i] + (ty[i] - sy[i]) * k;
          trails[i].push(xs[i], ys[i]);
        }
      },
      draw(g, p) {
        g.grid(1);
        for (let i = 0; i < n; i++) {
          const col = hsl(i / n, 0.75, 0.6);
          g.line(sx[i], sy[i], tx[i], ty[i], col, 0.18);
          if (p.showTrails) g.polyline(trails[i].points(), col, { fade: true, alpha: 0.6 });
          g.circle(tx[i], ty[i], 0.12, col, { alpha: 0.5, segments: 6 });
          g.circle(xs[i], ys[i], 0.2, col, { fill: true, segments: 8 });
        }
        g.line(cx - 0.4, cy, cx + 0.4, cy, 0x666a90);
        g.line(cx, cy - 0.4, cx, cy + 0.4, 0x666a90);
      },
      pointer(x, y, down, p) {
        if (!down) return;
        cx = Math.max(-4, Math.min(4, x));
        cy = Math.max(-2, Math.min(2, y));
        next(String(p.method));
      },
      action(key, p) {
        if (key === 'next') next(String(p.method));
      },
      status(p) {
        const s = stats;
        return `→ ${SHAPE_JA[SHAPES[shapeIdx]]} · 交差数：最適 ${s.hungarian.cross} / 番号順 ${s.index.cross} · 距離²和：最適 ${s.hungarian.cost.toFixed(0)} / 番号順 ${s.index.cost.toFixed(0)} · 求解 ${solveMs.toFixed(1)}ms · 方式 ${p.method === 'index' ? '番号順' : 'ハンガリー法'}`;
      },
    };
  },
  extraActions: [{ key: 'next', label: '▶ 次の図形' }],
});
