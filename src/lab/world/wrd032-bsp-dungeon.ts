import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { BoxBatch, segments } from '../framework/worldKit';
import { bfsGrid } from '../framework/dungeonKit';
import { distinctColor } from '../framework/caKit';

/** WRD-032 BSPダンジョン：深さ制限つきの再帰二分割、葉ごとの部屋、兄弟部分木を結ぶ L 字通路 */

interface Node {
  x: number; y: number; w: number; h: number; depth: number;
  kids?: [Node, Node];
  cut?: { vertical: boolean; at: number };
  room?: { x: number; y: number; w: number; h: number };
}

const GW = 64, GH = 44, CS = 0.17;

export default defineWorldDemo({
  id: 'WRD-032',
  notes: '長方形を縦長なら横に・横長なら縦に（同程度なら乱数で）二分割することを「分割の深さ」まで再帰し、葉が最小部屋サイズ＋余白×2より小さくなる分割はしない。各葉に余白を残して部屋を置き、木を下から上へたどって左右の部分木の中で最も近い部屋どうしを L 字の通路で結ぶので全部屋が連結する。分割線は深さごとに色分けし（赤＝根）、「表示する分割の深さ」で浅い分割から順に重ねて見られる。比較の左は部屋を置く前の葉の区画。',
  params: [
    { key: 'minRoom', label: '最小部屋サイズ（マス）', type: 'number', min: 3, max: 10, step: 1, default: 4 },
    { key: 'depth', label: '分割の深さ', type: 'number', min: 1, max: 8, step: 1, default: 5 },
    { key: 'margin', label: '余白（マス）', type: 'number', min: 1, max: 4, step: 1, default: 1 },
    { key: 'splits', label: '分割線を表示', type: 'bool', default: true },
    { key: 'viewDepth', label: '表示する分割の深さ', type: 'number', min: 1, max: 8, step: 1, default: 8 },
    { key: 'wallHeight', label: '壁の高さ', type: 'number', min: 0.1, max: 1.2, step: 0.05, default: 0.5 },
  ],
  liveKeys: ['splits', 'viewDepth'],
  distance: 13,
  elevation: 1.05,
  compareLabels: ['BSP の葉（区画）', '部屋と通路'],
  build(p, env) {
    const rng = env.rng;
    const minRoom = Number(p.minRoom), maxDepth = Number(p.depth), margin = Number(p.margin);
    const minLeaf = minRoom + margin * 2;
    const root: Node = { x: 0, y: 0, w: GW, h: GH, depth: 0 };
    const leaves: Node[] = [];
    const internal: Node[] = [];
    let reached = 0;
    const split = (n: Node) => {
      reached = Math.max(reached, n.depth);
      if (n.depth < maxDepth) {
        let vertical = n.w > n.h * 1.25 ? true : n.h > n.w * 1.25 ? false : rng() < 0.5;
        if ((vertical ? n.w : n.h) < minLeaf * 2) vertical = !vertical;
        const len = vertical ? n.w : n.h;
        if (len >= minLeaf * 2) {
          const at = minLeaf + Math.floor(rng() * (len - minLeaf * 2 + 1));
          n.cut = { vertical, at };
          const d = n.depth + 1;
          n.kids = vertical
            ? [{ x: n.x, y: n.y, w: at, h: n.h, depth: d }, { x: n.x + at, y: n.y, w: n.w - at, h: n.h, depth: d }]
            : [{ x: n.x, y: n.y, w: n.w, h: at, depth: d }, { x: n.x, y: n.y + at, w: n.w, h: n.h - at, depth: d }];
          internal.push(n);
          split(n.kids[0]);
          split(n.kids[1]);
          return;
        }
      }
      leaves.push(n);
    };
    split(root);

    // 部屋：葉の内側に余白を残して置く
    const grid = new Uint8Array(GW * GH); // 0=岩 1=部屋 2=通路
    for (const n of leaves) {
      const aw = n.w - margin * 2, ah = n.h - margin * 2;
      const rw = Math.max(Math.min(minRoom, aw), Math.floor(aw * (0.55 + 0.45 * rng())));
      const rh = Math.max(Math.min(minRoom, ah), Math.floor(ah * (0.55 + 0.45 * rng())));
      const rx = n.x + margin + Math.floor(rng() * (aw - rw + 1));
      const ry = n.y + margin + Math.floor(rng() * (ah - rh + 1));
      n.room = { x: rx, y: ry, w: rw, h: rh };
      for (let j = ry; j < ry + rh; j++) for (let i = rx; i < rx + rw; i++) grid[j * GW + i] = 1;
    }
    const roomsOf = (n: Node): NonNullable<Node['room']>[] => (n.kids ? [...roomsOf(n.kids[0]), ...roomsOf(n.kids[1])] : [n.room!]);
    const cx = (r: NonNullable<Node['room']>) => r.x + Math.floor(r.w / 2);
    const cy = (r: NonNullable<Node['room']>) => r.y + Math.floor(r.h / 2);
    let corridorCells = 0;
    const carve = (i: number, j: number) => {
      const k = j * GW + i;
      if (grid[k] === 0) { grid[k] = 2; corridorCells++; }
    };
    // 下から上へ（深い節点から順に）兄弟の部分木を結ぶ
    const links: [number, number, number, number][] = [];
    for (const n of [...internal].sort((a, b) => b.depth - a.depth)) {
      const A = roomsOf(n.kids![0]), B = roomsOf(n.kids![1]);
      let best = Infinity, ra = A[0], rb = B[0];
      for (const a of A) for (const b of B) {
        const d = Math.abs(cx(a) - cx(b)) + Math.abs(cy(a) - cy(b));
        if (d < best) { best = d; ra = a; rb = b; }
      }
      const ax = cx(ra), ay = cy(ra), bx = cx(rb), by = cy(rb);
      const hLine = (j: number, i0: number, i1: number) => { for (let i = Math.min(i0, i1); i <= Math.max(i0, i1); i++) carve(i, j); };
      const vLine = (i: number, j0: number, j1: number) => { for (let j = Math.min(j0, j1); j <= Math.max(j0, j1); j++) carve(i, j); };
      if (rng() < 0.5) { hLine(ay, ax, bx); vLine(bx, ay, by); }
      else { vLine(ax, ay, by); hLine(by, ax, bx); }
      links.push([ax, ay, bx, by]);
    }

    const X = (i: number) => (i - GW / 2) * CS;
    const Z = (j: number) => (j - GH / 2) * CS;
    const wallH = Number(p.wallHeight);
    // 床・壁を3Dの箱で（床に隣接する岩が壁）
    const floors = new BoxBatch();
    const walls = new BoxBatch();
    const roomColor = new Map<number, number>();
    leaves.forEach((n, q) => {
      const r = n.room!;
      const col = distinctColor(q, 0.35, 0.62);
      for (let j = r.y; j < r.y + r.h; j++) for (let i = r.x; i < r.x + r.w; i++) roomColor.set(j * GW + i, col);
    });
    for (let j = 0; j < GH; j++) {
      for (let i = 0; i < GW; i++) {
        const k = j * GW + i;
        const x = X(i + 0.5), z = Z(j + 0.5);
        if (grid[k] === 1) floors.addOnGround(x, z, CS, 0.04, CS, roomColor.get(k) ?? 0xc8c0a8);
        else if (grid[k] === 2) floors.addOnGround(x, z, CS, 0.03, CS, 0xe0a050);
        else {
          let adj = false;
          for (let dj = -1; dj <= 1 && !adj; dj++) for (let di = -1; di <= 1; di++) {
            const x2 = i + di, y2 = j + dj;
            if (x2 >= 0 && y2 >= 0 && x2 < GW && y2 < GH && grid[y2 * GW + x2]) { adj = true; break; }
          }
          if (adj) walls.addOnGround(x, z, CS, wallH, CS, 0x5a5f78);
        }
      }
    }
    const object = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(GW * CS, 0.05, GH * CS), new THREE.MeshStandardMaterial({ color: 0x1c1e2a, roughness: 1 }));
    base.position.y = -0.025;
    object.add(base, floors.build(), walls.build());

    // 分割線（深さ別の色、壁の上に浮かせる）
    const helpers = new THREE.Group();
    const lineY = wallH + 0.05;
    const byDepth: THREE.LineSegments[] = [];
    for (let d = 0; d < reached; d++) {
      const pts: number[] = [];
      for (const n of internal) {
        if (n.depth !== d) continue;
        if (n.cut!.vertical) pts.push(X(n.x + n.cut!.at), lineY, Z(n.y), X(n.x + n.cut!.at), lineY, Z(n.y + n.h));
        else pts.push(X(n.x), lineY, Z(n.y + n.cut!.at), X(n.x + n.w), lineY, Z(n.y + n.cut!.at));
      }
      const col = new THREE.Color().setHSL((d / Math.max(1, maxDepth)) * 0.7, 0.85, 0.6);
      const ls = segments(pts.length ? pts : [0, 0, 0, 0, 0, 0], col);
      byDepth.push(ls);
      helpers.add(ls);
    }
    const outline = segments([X(0), lineY, Z(0), X(GW), lineY, Z(0), X(GW), lineY, Z(0), X(GW), lineY, Z(GH), X(GW), lineY, Z(GH), X(0), lineY, Z(GH), X(0), lineY, Z(GH), X(0), lineY, Z(0)], 0x8088b0);
    helpers.add(outline);

    // 処理前：葉の区画
    const pre = new BoxBatch();
    leaves.forEach((n, q) => pre.addOnGround(X(n.x + n.w / 2), Z(n.y + n.h / 2), n.w * CS - 0.06, 0.05 + n.depth * 0.03, n.h * CS - 0.06, distinctColor(q, 0.45, 0.45)));
    const before = pre.build();

    // 連結の確認（最初の部屋から床をたどる）
    const r0 = leaves[0].room!;
    const { dist } = bfsGrid(GW, GH, (k) => grid[k] > 0, cy(r0) * GW + cx(r0));
    const reachedRooms = leaves.filter((n) => dist[cy(n.room!) * GW + cx(n.room!)] >= 0).length;
    return {
      object,
      before,
      helpers,
      info: () => `${GW}×${GH} マス · 葉（部屋）${leaves.length} · 到達した深さ ${reached} · 通路 ${links.length} 本 / ${corridorCells} マス · 連結 ${reachedRooms}/${leaves.length} 部屋`,
      update(_dt, _t, live) {
        helpers.visible = Boolean(live.splits);
        const vd = Number(live.viewDepth);
        byDepth.forEach((l, d) => (l.visible = d < vd));
      },
    };
  },
});
