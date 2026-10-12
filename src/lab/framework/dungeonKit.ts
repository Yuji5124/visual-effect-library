import * as THREE from 'three';
import { BoxBatch } from './worldKit';
import type { Rect } from './geom2d';

/** ダンジョン・迷路（WRD-D）用の部品：穴掘り法の迷路、格子BFS、BSP分割、格子→3D壁 */

/**
 * 穴掘り法（再帰的バックトラッカーを明示スタックで）。
 * 戻り値はブロック格子 (2cw+1)×(2ch+1)、1=壁 0=通路。
 */
export function carveMaze(cw: number, ch: number, rng: () => number): { grid: Uint8Array; w: number; h: number } {
  const w = cw * 2 + 1, h = ch * 2 + 1;
  const grid = new Uint8Array(w * h).fill(1);
  const seen = new Uint8Array(cw * ch);
  const stack: number[] = [0];
  seen[0] = 1;
  grid[1 * w + 1] = 0;
  const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  while (stack.length) {
    const c = stack[stack.length - 1];
    const cx = c % cw, cy = (c / cw) | 0;
    const opts: number[] = [];
    for (let d = 0; d < 4; d++) {
      const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
      if (nx >= 0 && ny >= 0 && nx < cw && ny < ch && !seen[ny * cw + nx]) opts.push(d);
    }
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const d = opts[Math.floor(rng() * opts.length)];
    const nx = cx + dirs[d][0], ny = cy + dirs[d][1];
    seen[ny * cw + nx] = 1;
    grid[(cy * 2 + 1 + dirs[d][1]) * w + cx * 2 + 1 + dirs[d][0]] = 0;
    grid[(ny * 2 + 1) * w + nx * 2 + 1] = 0;
    stack.push(ny * cw + nx);
  }
  return { grid, w, h };
}

/**
 * 格子の幅優先探索（4近傍）。dist は -1 が未到達、layers[d] は距離 d のセルの一覧。
 */
export function bfsGrid(w: number, h: number, open: (k: number) => boolean, start: number): { dist: Int32Array; layers: number[][] } {
  const dist = new Int32Array(w * h).fill(-1);
  const layers: number[][] = [];
  if (!open(start)) return { dist, layers };
  let front = [start];
  dist[start] = 0;
  while (front.length) {
    layers.push(front);
    const next: number[] = [];
    for (const k of front) {
      const i = k % w, j = (k / w) | 0;
      const nb = [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, j > 0 ? k - w : -1, j < h - 1 ? k + w : -1];
      for (const q of nb) {
        if (q >= 0 && dist[q] < 0 && open(q)) {
          dist[q] = dist[k] + 1;
          next.push(q);
        }
      }
    }
    front = next;
  }
  return { dist, layers };
}

/** 距離場を逆にたどって最短経路（goal→start）を得る */
export function tracePath(w: number, h: number, dist: Int32Array, goal: number): number[] {
  const path = [goal];
  let k = goal;
  while (dist[k] > 0) {
    const i = k % w, j = (k / w) | 0;
    const nb = [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, j > 0 ? k - w : -1, j < h - 1 ? k + w : -1];
    const q = nb.find((q) => q >= 0 && dist[q] === dist[k] - 1);
    if (q === undefined) break;
    path.push(q);
    k = q;
  }
  return path;
}

export interface BspLevel {
  leaves: Rect[];
  rooms: Rect[];
  /** 廊下（幅1の矩形の列） */
  corridors: Rect[];
  /** 廊下でつないだ部屋の組（部屋の添字） */
  links: [number, number][];
}

/**
 * BSP：最も大きい葉を分割することを繰り返して targetRooms 枚の葉を作り、
 * 各葉に部屋を置き、分割木の兄弟どうしを L 字の廊下でつなぐ。
 */
export function bspLevel(W: number, H: number, targetRooms: number, rng: () => number, minLeaf = 6): BspLevel {
  interface Node { r: Rect; kids?: [Node, Node]; room?: number }
  const root: Node = { r: { x: 0, y: 0, w: W, h: H } };
  const leaves: Node[] = [root];
  while (leaves.length < targetRooms) {
    leaves.sort((a, b) => b.r.w * b.r.h - a.r.w * a.r.h);
    let split = false;
    for (let li = 0; li < leaves.length && !split; li++) {
      const n = leaves[li];
      const { x, y, w, h } = n.r;
      const vertical = w > h * 1.2 ? true : h > w * 1.2 ? false : rng() < 0.5;
      const len = vertical ? w : h;
      if (len < minLeaf * 2) continue;
      const cut = minLeaf + Math.floor(rng() * (len - minLeaf * 2 + 1));
      const a: Node = { r: vertical ? { x, y, w: cut, h } : { x, y, w, h: cut } };
      const b: Node = { r: vertical ? { x: x + cut, y, w: w - cut, h } : { x, y: y + cut, w, h: h - cut } };
      n.kids = [a, b];
      leaves.splice(li, 1, a, b);
      split = true;
    }
    if (!split) break;
  }
  const rooms: Rect[] = [];
  for (const n of leaves) {
    const rw = Math.max(3, Math.floor(n.r.w * (0.42 + rng() * 0.3)));
    const rh = Math.max(3, Math.floor(n.r.h * (0.42 + rng() * 0.3)));
    const rx = n.r.x + 1 + Math.floor(rng() * Math.max(1, n.r.w - rw - 1));
    const ry = n.r.y + 1 + Math.floor(rng() * Math.max(1, n.r.h - rh - 1));
    n.room = rooms.length;
    rooms.push({ x: rx, y: ry, w: Math.min(rw, n.r.w - 2), h: Math.min(rh, n.r.h - 2) });
  }
  const corridors: Rect[] = [];
  const links: [number, number][] = [];
  const pick = (n: Node): number => {
    if (n.room !== undefined) return n.room;
    return pick(n.kids![rng() < 0.5 ? 0 : 1]);
  };
  const center = (r: Rect) => [Math.floor(r.x + r.w / 2), Math.floor(r.y + r.h / 2)];
  const walk = (n: Node) => {
    if (!n.kids) return;
    walk(n.kids[0]);
    walk(n.kids[1]);
    const a = pick(n.kids[0]), b = pick(n.kids[1]);
    links.push([a, b]);
    const [ax, ay] = center(rooms[a]);
    const [bx, by] = center(rooms[b]);
    if (rng() < 0.5) {
      corridors.push({ x: Math.min(ax, bx), y: ay, w: Math.abs(bx - ax) + 1, h: 1 });
      corridors.push({ x: bx, y: Math.min(ay, by), w: 1, h: Math.abs(by - ay) + 1 });
    } else {
      corridors.push({ x: ax, y: Math.min(ay, by), w: 1, h: Math.abs(by - ay) + 1 });
      corridors.push({ x: Math.min(ax, bx), y: by, w: Math.abs(bx - ax) + 1, h: 1 });
    }
  };
  walk(root);
  return { leaves: leaves.map((n) => n.r), rooms, corridors, links };
}

/**
 * ブロック格子（1=壁）を、壁のブロックを箱として並べた InstancedMesh にする。
 * cell はワールドでの1セルの大きさ、格子の中心が原点。
 */
export function wallMesh(grid: ArrayLike<number>, w: number, h: number, cell: number, height: number, color: number, isWall: (v: number) => boolean = (v) => v === 1): THREE.InstancedMesh {
  const b = new BoxBatch();
  const c = new THREE.Color(color);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      if (!isWall(grid[j * w + i])) continue;
      b.addOnGround((i + 0.5 - w / 2) * cell, (j + 0.5 - h / 2) * cell, cell, height, cell, c);
    }
  }
  return b.build();
}
