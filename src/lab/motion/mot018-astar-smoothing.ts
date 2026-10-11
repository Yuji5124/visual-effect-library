import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';

/** MOT-018 A*（二分ヒープ・8近傍・角の切り抜き禁止）と、見通しによる経路の間引き */

/** f 値の最小を取り出す二分ヒープ（ノード番号を格納） */
class MinHeap {
  private a: number[] = [];
  constructor(private readonly key: Float64Array) {}
  get size(): number { return this.a.length; }
  push(n: number): void {
    const a = this.a, k = this.key;
    a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[a[p]] <= k[a[i]]) break;
      [a[p], a[i]] = [a[i], a[p]];
      i = p;
    }
  }
  pop(): number {
    const a = this.a, k = this.key;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1;
        let s = i;
        if (l < a.length && k[a[l]] < k[a[s]]) s = l;
        if (r < a.length && k[a[r]] < k[a[s]]) s = r;
        if (s === i) break;
        [a[s], a[i]] = [a[i], a[s]];
        i = s;
      }
    }
    return top;
  }
}

export default defineMotionDemo({
  id: 'MOT-018',
  notes: '格子上の A*：f=g+w·h（h はオクタイル距離）が最小のセルを二分ヒープから取り出して展開し、8近傍（角の切り抜き禁止）を緩和する。探索済み（青）と展開待ち（緑）の広がりを順に再生し、橙が格子の最短経路、水色が「見通せる点を飛ばす」平滑化後の経路。エージェントは水色を歩く。クリックで目的地。',
  params: [
    { key: 'density', label: '障害物の密度', type: 'number', min: 0, max: 0.45, step: 0.01, default: 0.28 },
    { key: 'weight', label: 'ヒューリスティックの重み w', type: 'number', min: 0, max: 5, step: 0.05, default: 1 },
    { key: 'smooth', label: 'スムージング', type: 'bool', default: true },
    { key: 'revealRate', label: '探索の再生速度（セル/秒）', type: 'number', min: 50, max: 3000, step: 10, default: 600 },
    { key: 'walkSpeed', label: '歩く速さ', type: 'number', min: 1, max: 15, step: 0.1, default: 6 },
  ],
  resetKeys: ['density'],
  create(env, params) {
    const { w, h } = env.bounds();
    const cell = env.quality === 'low' ? 1.25 : 1;
    const cols = Math.max(8, Math.floor((2 * w - 0.5) / cell)), rows = Math.max(8, Math.floor((2 * h - 0.5) / cell));
    const ox = -cols * cell * 0.5, oy = -rows * cell * 0.5;
    const N = cols * rows;
    const wall = new Uint8Array(N);
    // 塊になった障害物：ランダムな短い壁を置く
    const dens = Number(params.density);
    let filled = 0, guard = 0;
    while (filled < N * dens && guard++ < N * 4) {
      let cx = Math.floor(env.rng() * cols), cy = Math.floor(env.rng() * rows);
      const horiz = env.rng() < 0.5, len = 2 + Math.floor(env.rng() * 5);
      for (let k = 0; k < len; k++) {
        if (cx < 0 || cy < 0 || cx >= cols || cy >= rows) break;
        if (!wall[cy * cols + cx]) { wall[cy * cols + cx] = 1; filled++; }
        if (horiz) cx++; else cy++;
      }
    }
    const cx = (i: number) => ox + ((i % cols) + 0.5) * cell;
    const cy = (i: number) => oy + (Math.floor(i / cols) + 0.5) * cell;
    const cellAt = (x: number, y: number) => {
      const c = Math.floor((x - ox) / cell), r = Math.floor((y - oy) / cell);
      return c < 0 || r < 0 || c >= cols || r >= rows ? -1 : r * cols + c;
    };
    const freeNear = (i: number): number => {
      if (i >= 0 && !wall[i]) return i;
      let best = -1, bd = Infinity;
      const c0 = i >= 0 ? i % cols : cols >> 1, r0 = i >= 0 ? Math.floor(i / cols) : rows >> 1;
      for (let k = 0; k < N; k++) if (!wall[k]) { const d = (k % cols - c0) ** 2 + (Math.floor(k / cols) - r0) ** 2; if (d < bd) { bd = d; best = k; } }
      return best;
    };
    const g = new Float64Array(N), f = new Float64Array(N);
    const parent = new Int32Array(N);
    const state = new Uint8Array(N); // 0 未訪問 1 展開待ち 2 探索済み
    let order: number[] = []; // 探索済みになった順
    let openOrder: number[] = []; // 展開待ちに入った順と時点
    let raw: number[] = [], smooth: number[] = [];
    let reveal = 0, lastW = -1;
    const agent = { x: 0, y: 0, a: 0, seg: 0, trail: new Trail(600) };
    let start = freeNear(cellAt(-w + 2, -h + 2));
    agent.x = cx(start); agent.y = cy(start);
    let goal = -1, waitT = 0;
    const lineOfSight = (x0: number, y0: number, x1: number, y1: number): boolean => {
      const d = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.ceil(d / (cell * 0.2));
      const nx = (-(y1 - y0) / (d || 1)) * cell * 0.3, ny = ((x1 - x0) / (d || 1)) * cell * 0.3;
      for (let k = 0; k <= n; k++) {
        const t = k / n;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        for (const s of [-1, 0, 1]) {
          const i = cellAt(x + nx * s, y + ny * s);
          if (i < 0 || wall[i]) return false;
        }
      }
      return true;
    };
    const solve = (wt: number) => {
      lastW = wt;
      g.fill(Infinity);
      state.fill(0);
      parent.fill(-1);
      order = [];
      openOrder = [];
      raw = [];
      smooth = [];
      reveal = 0;
      if (goal < 0) return;
      const gc = goal % cols, gr = Math.floor(goal / cols);
      const H = (i: number) => {
        const dx = Math.abs((i % cols) - gc), dy = Math.abs(Math.floor(i / cols) - gr);
        return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
      };
      const heap = new MinHeap(f);
      g[start] = 0;
      f[start] = wt * H(start);
      heap.push(start);
      state[start] = 1;
      openOrder.push(start, 0);
      while (heap.size) {
        const cur = heap.pop();
        if (state[cur] === 2) continue;
        state[cur] = 2;
        order.push(cur);
        if (cur === goal) break;
        const c = cur % cols, r = Math.floor(cur / cols);
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dy) continue;
            const nc = c + dx, nr = r + dy;
            if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
            const ni = nr * cols + nc;
            if (wall[ni] || state[ni] === 2) continue;
            // 斜め移動で壁の角をすり抜けない
            if (dx && dy && (wall[r * cols + nc] || wall[nr * cols + c])) continue;
            const ng = g[cur] + (dx && dy ? Math.SQRT2 : 1);
            if (ng < g[ni]) {
              g[ni] = ng;
              f[ni] = ng + wt * H(ni);
              parent[ni] = cur;
              heap.push(ni); // 古い要素は取り出し時に読み飛ばす（遅延削除）
              if (state[ni] === 0) openOrder.push(ni, order.length);
              state[ni] = 1;
            }
          }
        }
      }
      if (parent[goal] < 0 && goal !== start) return;
      for (let i = goal; i >= 0; i = parent[i]) raw.unshift(cx(i), cy(i));
      // 見通しによる間引き：今の点から見通せる最も遠い点まで飛ぶ
      smooth = [raw[0], raw[1]];
      let k = 0;
      const n = raw.length / 2;
      while (k < n - 1) {
        let j = n - 1;
        while (j > k + 1 && !lineOfSight(raw[k * 2], raw[k * 2 + 1], raw[j * 2], raw[j * 2 + 1])) j--;
        smooth.push(raw[j * 2], raw[j * 2 + 1]);
        k = j;
      }
      agent.seg = 1;
    };
    const len = (pts: number[]) => { let s = 0; for (let i = 2; i < pts.length; i += 2) s += Math.hypot(pts[i] - pts[i - 2], pts[i + 1] - pts[i - 1]); return s; };
    const pickGoal = (i: number) => {
      start = freeNear(cellAt(agent.x, agent.y));
      goal = freeNear(i);
      solve(lastW < 0 ? 1 : lastW);
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        if (goal < 0) pickGoal(cellAt(w - 2, h - 2));
        if (Number(p.weight) !== lastW) { start = freeNear(cellAt(agent.x, agent.y)); solve(Number(p.weight)); }
        const total = order.length;
        if (reveal < total) { reveal = Math.min(total, reveal + Number(p.revealRate) * dt); return; }
        const path = p.smooth ? smooth : raw;
        if (!path.length) { waitT += dt; if (waitT > 2) { waitT = 0; pickGoal(Math.floor(env.rng() * N)); } return; }
        if (agent.seg < path.length / 2) {
          const tx = path[agent.seg * 2], ty = path[agent.seg * 2 + 1];
          const dx = tx - agent.x, dy = ty - agent.y, d = Math.hypot(dx, dy);
          const s = Number(p.walkSpeed) * dt;
          if (d > 1e-6) agent.a = Math.atan2(dy, dx);
          if (d <= s) { agent.x = tx; agent.y = ty; agent.seg++; }
          else { agent.x += (dx / d) * s; agent.y += (dy / d) * s; }
          agent.trail.push(agent.x, agent.y);
        } else {
          waitT += dt;
          if (waitT > 1.5) { waitT = 0; pickGoal(Math.floor(env.rng() * N)); }
        }
      },
      draw(gr, p) {
        const shown = Math.floor(reveal);
        const closedSet = new Uint8Array(N);
        for (let k = 0; k < shown; k++) closedSet[order[k]] = 1;
        const half = cell * 0.46;
        for (let i = 0; i < N; i++) {
          const x = cx(i), y = cy(i);
          if (wall[i]) gr.rect(x - half, y - half, half * 2, half * 2, 0x4a5078, { fill: true });
          else if (closedSet[i]) gr.rect(x - half, y - half, half * 2, half * 2, 0x1d3a6a, { fill: true });
        }
        // 展開待ち：その時点までに開かれていて、まだ閉じていないセル
        for (let k = 0; k < openOrder.length; k += 2) {
          const i = openOrder[k];
          if (openOrder[k + 1] <= shown && !closedSet[i]) gr.rect(cx(i) - half, cy(i) - half, half * 2, half * 2, 0x2f7a4a, { fill: true });
        }
        const done = shown >= order.length;
        if (done && raw.length) {
          gr.polyline(raw, 0xffa040, { alpha: p.smooth ? 0.6 : 1 });
          if (p.smooth) {
            gr.polyline(smooth, 0x4ad8ff);
            for (let k = 0; k < smooth.length; k += 2) gr.circle(smooth[k], smooth[k + 1], 0.18, 0x4ad8ff, { fill: true });
          }
        }
        if (p.showTrails) gr.polyline(agent.trail.points(), 0xffffff, { fade: true, alpha: 0.6 });
        if (goal >= 0) {
          gr.circle(cx(goal), cy(goal), cell * 0.45, 0xff5c8a, { fill: true });
          gr.circle(cx(goal), cy(goal), cell * 0.8, 0xff5c8a);
        }
        gr.circle(cx(start), cy(start), cell * 0.3, 0x7dff8a);
        gr.agent(agent.x, agent.y, agent.a, 0.45, 0xffffff);
      },
      pointer(x, y, down) {
        if (!down) return;
        const i = cellAt(x, y);
        if (i >= 0 && freeNear(i) !== goal) pickGoal(i);
      },
      status(p) {
        if (!raw.length && order.length) return `到達不能 · 展開 ${order.length} セル · クリックで目的地`;
        return `展開 ${order.length} セル（w=${Number(p.weight).toFixed(2)}）· 格子経路 ${len(raw).toFixed(1)}（${raw.length / 2}点）· 平滑化 ${len(smooth).toFixed(1)}（${smooth.length / 2}点）· クリックで目的地`;
      },
    };
  },
});
