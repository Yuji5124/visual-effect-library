import * as THREE from 'three';

/**
 * 迷路デモ（WRD-033 / 034）の共通部品。
 * 迷路は (2w+1)×(2h+1) のブロック格子で持つ：奇数×奇数がセル、間が壁、偶数×偶数が柱。
 * 生成器は1手ずつ進められ、途中経過（スタック・フロンティア）もブロックの状態として見える。
 */

export const WALL = 0;
export const OPEN = 1;
/** 探索中（穴掘り法のスタック、Prim法のフロンティア） */
export const ACTIVE = 2;
/** いま処理しているセル */
export const HEAD = 3;

export class MazeGrid {
  readonly W: number;
  readonly H: number;
  readonly blocks: Uint8Array;
  dirty = true;
  constructor(readonly w: number, readonly h: number) {
    this.W = 2 * w + 1;
    this.H = 2 * h + 1;
    this.blocks = new Uint8Array(this.W * this.H);
  }
  /** セル (i,j) のブロック番号 */
  cell(i: number, j: number): number {
    return (2 * j + 1) * this.W + 2 * i + 1;
  }
  /** 隣り合うセル間の壁ブロック番号 */
  between(i0: number, j0: number, i1: number, j1: number): number {
    return (j0 + j1 + 1) * this.W + (i0 + i1 + 1);
  }
  set(b: number, s: number): void {
    this.blocks[b] = s;
    this.dirty = true;
  }
  neighbors(i: number, j: number): [number, number][] {
    const out: [number, number][] = [];
    if (i > 0) out.push([i - 1, j]);
    if (i < this.w - 1) out.push([i + 1, j]);
    if (j > 0) out.push([i, j - 1]);
    if (j < this.h - 1) out.push([i, j + 1]);
    return out;
  }
  /** セル間がつながっているか */
  linked(i0: number, j0: number, i1: number, j1: number): boolean {
    return this.blocks[this.between(i0, j0, i1, j1)] !== WALL;
  }
  /** 行き止まり（通路が1本だけのセル）の数 */
  deadEnds(): number {
    let n = 0;
    for (let j = 0; j < this.h; j++) {
      for (let i = 0; i < this.w; i++) {
        let deg = 0;
        for (const [a, b] of this.neighbors(i, j)) if (this.linked(i, j, a, b)) deg++;
        if (deg === 1) n++;
      }
    }
    return n;
  }
  /** (i,j) からの BFS 距離（セル単位） */
  distances(i: number, j: number): Int32Array {
    const d = new Int32Array(this.w * this.h).fill(-1);
    const q = [j * this.w + i];
    d[q[0]] = 0;
    for (let k = 0; k < q.length; k++) {
      const c = q[k], ci = c % this.w, cj = Math.floor(c / this.w);
      for (const [a, b] of this.neighbors(ci, cj)) {
        const id = b * this.w + a;
        if (d[id] < 0 && this.linked(ci, cj, a, b)) {
          d[id] = d[c] + 1;
          q.push(id);
        }
      }
    }
    return d;
  }
  /** 最も遠い2点（BFS を2回：木の直径）とその間の経路（セル番号列） */
  longestPath(): number[] {
    const far = (d: Int32Array) => {
      let best = 0;
      for (let k = 1; k < d.length; k++) if (d[k] > d[best]) best = k;
      return best;
    };
    const a = far(this.distances(0, 0));
    const d = this.distances(a % this.w, Math.floor(a / this.w));
    let c = far(d);
    const path = [c];
    while (d[c] > 0) {
      const ci = c % this.w, cj = Math.floor(c / this.w);
      for (const [x, y] of this.neighbors(ci, cj)) {
        const id = y * this.w + x;
        if (d[id] === d[c] - 1 && this.linked(ci, cj, x, y)) {
          c = id;
          break;
        }
      }
      path.push(c);
    }
    return path;
  }
  /** 最も遠い2点間の経路長（BFS を2回：木の直径） */
  diameter(): number {
    const far = (d: Int32Array) => {
      let best = 0;
      for (let k = 1; k < d.length; k++) if (d[k] > d[best]) best = k;
      return best;
    };
    const a = far(this.distances(0, 0));
    const d2 = this.distances(a % this.w, Math.floor(a / this.w));
    return d2[far(d2)];
  }
}

export interface MazeGenerator {
  readonly grid: MazeGrid;
  done: boolean;
  steps: number;
  /** 1手進める */
  step(): void;
}

/** 穴掘り法（深さ優先＋スタック） */
export class BacktrackerGen implements MazeGenerator {
  done = false;
  steps = 0;
  private readonly stack: [number, number][] = [];
  private readonly visited: Uint8Array;
  maxStack = 0;
  constructor(readonly grid: MazeGrid, private readonly rng: () => number) {
    this.visited = new Uint8Array(grid.w * grid.h);
    const i = Math.floor(rng() * grid.w), j = Math.floor(rng() * grid.h);
    this.visited[j * grid.w + i] = 1;
    this.stack.push([i, j]);
    grid.set(grid.cell(i, j), HEAD);
  }
  get stackSize(): number {
    return this.stack.length;
  }
  step(): void {
    if (this.done) return;
    this.steps++;
    const g = this.grid;
    const [i, j] = this.stack[this.stack.length - 1];
    const cand = g.neighbors(i, j).filter(([a, b]) => !this.visited[b * g.w + a]);
    if (cand.length) {
      const [a, b] = cand[Math.floor(this.rng() * cand.length)];
      this.visited[b * g.w + a] = 1;
      g.set(g.cell(i, j), ACTIVE);
      g.set(g.between(i, j, a, b), ACTIVE);
      g.set(g.cell(a, b), HEAD);
      this.stack.push([a, b]);
      this.maxStack = Math.max(this.maxStack, this.stack.length);
    } else {
      // 行き止まり：戻る（通った道は確定した通路になる）
      this.stack.pop();
      g.set(g.cell(i, j), OPEN);
      const top = this.stack[this.stack.length - 1];
      if (top) {
        g.set(g.between(i, j, top[0], top[1]), OPEN);
        g.set(g.cell(top[0], top[1]), HEAD);
      } else this.done = true;
    }
  }
}

/** ランダム化 Prim 法（迷路に接するフロンティアのセルから無作為に選んで延ばす） */
export class PrimGen implements MazeGenerator {
  done = false;
  steps = 0;
  private readonly inMaze: Uint8Array;
  private readonly frontier: [number, number][] = [];
  private readonly inFrontier: Uint8Array;
  private last = -1;
  constructor(readonly grid: MazeGrid, private readonly rng: () => number) {
    this.inMaze = new Uint8Array(grid.w * grid.h);
    this.inFrontier = new Uint8Array(grid.w * grid.h);
    this.add(Math.floor(rng() * grid.w), Math.floor(rng() * grid.h));
  }
  private add(i: number, j: number): void {
    const g = this.grid;
    this.inMaze[j * g.w + i] = 1;
    if (this.last >= 0 && g.blocks[this.last] === HEAD) g.set(this.last, OPEN);
    this.last = g.cell(i, j);
    g.set(this.last, HEAD);
    for (const [a, b] of g.neighbors(i, j)) {
      const id = b * g.w + a;
      if (!this.inMaze[id] && !this.inFrontier[id]) {
        this.inFrontier[id] = 1;
        this.frontier.push([a, b]);
        g.set(g.cell(a, b), ACTIVE);
      }
    }
  }
  step(): void {
    if (this.done) return;
    this.steps++;
    const g = this.grid;
    if (!this.frontier.length) {
      if (this.last >= 0) g.set(this.last, OPEN);
      this.done = true;
      return;
    }
    const k = Math.floor(this.rng() * this.frontier.length);
    const [i, j] = this.frontier[k];
    this.frontier[k] = this.frontier[this.frontier.length - 1];
    this.frontier.pop();
    const ins = g.neighbors(i, j).filter(([a, b]) => this.inMaze[b * g.w + a]);
    const [a, b] = ins[Math.floor(this.rng() * ins.length)];
    g.set(g.between(i, j, a, b), OPEN);
    this.add(i, j);
    if (!this.frontier.length) {
      g.set(this.last, OPEN);
      this.done = true;
    }
  }
}

/** ランダム化 Kruskal 法（壁を無作為な順に壊し、Union-Find で閉路を避ける） */
export class KruskalGen implements MazeGenerator {
  done = false;
  steps = 0;
  private readonly parent: Int32Array;
  private readonly walls: [number, number, number, number][] = [];
  private cursor = 0;
  private last = -1;
  constructor(readonly grid: MazeGrid, rng: () => number) {
    const n = grid.w * grid.h;
    this.parent = new Int32Array(n).map((_, k) => k);
    for (let j = 0; j < grid.h; j++) {
      for (let i = 0; i < grid.w; i++) {
        grid.set(grid.cell(i, j), ACTIVE);
        if (i < grid.w - 1) this.walls.push([i, j, i + 1, j]);
        if (j < grid.h - 1) this.walls.push([i, j, i, j + 1]);
      }
    }
    for (let k = this.walls.length - 1; k > 0; k--) {
      const r = Math.floor(rng() * (k + 1));
      [this.walls[k], this.walls[r]] = [this.walls[r], this.walls[k]];
    }
  }
  private find(x: number): number {
    while (this.parent[x] !== x) {
      this.parent[x] = this.parent[this.parent[x]];
      x = this.parent[x];
    }
    return x;
  }
  step(): void {
    if (this.done) return;
    this.steps++;
    const g = this.grid;
    if (this.last >= 0) g.set(this.last, OPEN);
    // 同じ集合どうしの壁は飛ばし、実際に1枚壊すまで進む
    while (this.cursor < this.walls.length) {
      const [i0, j0, i1, j1] = this.walls[this.cursor++];
      const a = this.find(j0 * g.w + i0), b = this.find(j1 * g.w + i1);
      if (a === b) continue;
      this.parent[a] = b;
      g.set(g.cell(i0, j0), OPEN);
      g.set(g.cell(i1, j1), OPEN);
      this.last = g.between(i0, j0, i1, j1);
      g.set(this.last, HEAD);
      return;
    }
    this.last = -1;
    this.done = true;
  }
}

/**
 * ブロック格子の3D表示。壁は細め・セルは太めの不均一な格子で並べ、
 * 状態ごとに高さと色を変える（壁＝高い、通路＝床、探索中＝低い色付き）。
 */
export class MazeView {
  readonly mesh: THREE.InstancedMesh;
  readonly size: number;
  readonly xs: Float32Array;
  readonly zs: Float32Array;
  private readonly ws: Float32Array;
  private readonly ds: Float32Array;
  private readonly m = new THREE.Matrix4();
  private readonly c = new THREE.Color();
  wallHeight = 1;
  colors = { wall: 0x8a90b8, open: 0xd8d2c0, active: 0xff9a3c, head: 0xff3d6e };
  constructor(readonly grid: MazeGrid, size: number, wallRatio = 0.35) {
    const unitX = size / (grid.w + (grid.w + 1) * wallRatio);
    const unitZ = size / (grid.h + (grid.h + 1) * wallRatio);
    const u = Math.min(unitX, unitZ);
    const make = (N: number) => {
      const pos = new Float32Array(N), wid = new Float32Array(N);
      let acc = 0;
      for (let k = 0; k < N; k++) {
        const w = k % 2 ? u : u * wallRatio;
        pos[k] = acc + w / 2;
        wid[k] = w;
        acc += w;
      }
      for (let k = 0; k < N; k++) pos[k] -= acc / 2;
      return [pos, wid] as const;
    };
    [this.xs, this.ws] = make(grid.W);
    [this.zs, this.ds] = make(grid.H);
    this.size = this.xs[grid.W - 1] * 2 + this.ws[grid.W - 1];
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.05 }), grid.W * grid.H);
    this.mesh.setColorAt(0, this.c.set(0xffffff));
    this.mesh.frustumCulled = false;
    this.sync(true);
  }

  /** 状態の変化を反映する（dirty のときだけ） */
  sync(force = false): void {
    const g = this.grid;
    if (!g.dirty && !force) return;
    g.dirty = false;
    const hw = this.wallHeight;
    for (let j = 0; j < g.H; j++) {
      for (let i = 0; i < g.W; i++) {
        const k = j * g.W + i;
        const s = g.blocks[k];
        const h = s === WALL ? hw : s === OPEN ? 0.03 : s === ACTIVE ? 0.12 : Math.max(0.25, hw * 0.5);
        const col = s === WALL ? this.colors.wall : s === OPEN ? this.colors.open : s === ACTIVE ? this.colors.active : this.colors.head;
        this.m.makeScale(this.ws[i], h, this.ds[j]);
        this.m.setPosition(this.xs[i], 0, this.zs[j]);
        this.mesh.setMatrixAt(k, this.m);
        this.mesh.setColorAt(k, this.c.set(col));
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}
