import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { BoxBatch, segments } from '../framework/worldKit';
import { delaunay, pointInPolygon, polygonCentroid, voronoiCells, type Pt } from '../framework/voronoiKit';

/** WRD-019 ボロノイ城郭都市：中心ほど密な種点 → ドロネー（ボウヤー・ワトソン）→ ボロノイ → 広場・市街・城外・城壁・門 */
const HALF = 6;

interface Graph {
  pos: [number, number][];
  adj: Map<number, { to: number; w: number; wall: boolean; inner: boolean }[]>;
}

export default defineWorldDemo({
  id: 'WRD-019',
  notes: '種点を中心ほど密にばらまき、ボウヤー・ワトソン法のドロネー分割から各セルを隣接点の垂直二等分線で切り取ってボロノイを作る。中心に近い順に「広場→城内（市街）→城外（畑・郊外）」を割り当て、城内と城外の境の辺をつないで城壁にし、城壁の頂点から門を選んで、広場⇔門⇔外周を辺に沿った最短経路で結ぶ大通りにする。比較の左は元のボロノイ図とドロネー網。',
  params: [
    { key: 'cells', label: 'セル数', type: 'number', min: 40, max: 320, step: 1, default: 150 },
    { key: 'inner', label: '城内のセル数', type: 'number', min: 4, max: 80, step: 1, default: 26 },
    { key: 'density', label: '建物の密度', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.75 },
    { key: 'gates', label: '門の数', type: 'number', min: 2, max: 6, step: 1, default: 4 },
    { key: 'showDelaunay', label: 'ドロネー網を重ねる', type: 'bool', default: false },
  ],
  liveKeys: ['showDelaunay'],
  distance: 15,
  elevation: 0.85,
  compareLabels: ['ボロノイ図', '城郭都市'],
  build(p, env) {
    const rng = env.rng;
    const N = Number(p.cells);
    const K = Math.min(N - 2, Number(p.inner));
    // 中心ほど密な種点（半径を u^1.5 で偏らせる）。近すぎる点は捨てる
    const pts: Pt[] = [];
    for (let tries = 0; pts.length < N && tries < N * 40; tries++) {
      const r = HALF * 1.35 * Math.pow(rng(), 1.5), a = rng() * Math.PI * 2;
      const x = Math.cos(a) * r, y = Math.sin(a) * r;
      if (Math.abs(x) > HALF - 0.05 || Math.abs(y) > HALF - 0.05) continue;
      const minD = 0.12 + 0.18 * (r / HALF);
      if (pts.some((q) => Math.hypot(q.x - x, q.y - y) < minD)) continue;
      pts.push({ x, y });
    }
    const dl = delaunay(pts);
    const cells = voronoiCells(pts, dl.neighbors, [-HALF, -HALF, HALF, HALF]);
    const order = pts.map((_, i) => i).sort((a, b) => Math.hypot(pts[a].x, pts[a].y) - Math.hypot(pts[b].x, pts[b].y));
    const role = new Int8Array(pts.length); // 0=城外 1=城内 2=広場 3=郊外
    order.forEach((ci, k) => (role[ci] = k === 0 ? 2 : k < K ? 1 : k < K + Math.round(K * 0.6) ? 3 : 0));
    const inside = (i: number) => role[i] === 1 || role[i] === 2;

    // セルの辺から道路グラフ（頂点は近いものを統合）
    const g: Graph = { pos: [], adj: new Map() };
    const vmap = new Map<string, number>();
    const vid = (x: number, y: number) => {
      const kx = Math.round(x * 200), ky = Math.round(y * 200);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const f = vmap.get(`${kx + dx},${ky + dy}`);
        if (f !== undefined) return f;
      }
      const id = g.pos.length;
      g.pos.push([x, y]);
      vmap.set(`${kx},${ky}`, id);
      g.adj.set(id, []);
      return id;
    };
    const wallSegs: [number, number][] = [];
    const edgeSeen = new Set<string>();
    cells.forEach((c, i) => {
      for (let k = 0; k < c.poly.length; k++) {
        const a = vid(c.poly[k][0], c.poly[k][1]);
        const b = vid(c.poly[(k + 1) % c.poly.length][0], c.poly[(k + 1) % c.poly.length][1]);
        if (a === b) continue;
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        if (edgeSeen.has(key)) continue;
        edgeSeen.add(key);
        const j = c.labels[k];
        const wall = j >= 0 && inside(i) !== inside(j);
        const inner = inside(i) && (j < 0 || inside(j));
        if (wall) wallSegs.push([a, b]);
        const w = Math.hypot(g.pos[a][0] - g.pos[b][0], g.pos[a][1] - g.pos[b][1]);
        g.adj.get(a)!.push({ to: b, w, wall, inner });
        g.adj.get(b)!.push({ to: a, w, wall, inner });
      }
    });
    const dijkstra = (src: number, cost: (e: { w: number; wall: boolean; inner: boolean }) => number) => {
      const n = g.pos.length;
      const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), done = new Uint8Array(n);
      dist[src] = 0;
      for (;;) {
        let u = -1, best = Infinity;
        for (let i = 0; i < n; i++) if (!done[i] && dist[i] < best) (best = dist[i]), (u = i);
        if (u < 0) break;
        done[u] = 1;
        for (const e of g.adj.get(u)!) {
          const d = best + cost(e);
          if (d < dist[e.to]) (dist[e.to] = d), (prev[e.to] = u);
        }
      }
      return { dist, prev };
    };
    const pathTo = (prev: Int32Array, t: number) => {
      const out = [t];
      while (prev[out[out.length - 1]] >= 0) out.push(prev[out[out.length - 1]]);
      return out;
    };
    // 門：城壁の頂点から方位がばらけるように選ぶ
    const wallVerts = [...new Set(wallSegs.flat())];
    const nGates = Math.min(wallVerts.length, Number(p.gates));
    const a0 = rng() * Math.PI * 2;
    const gates: number[] = [];
    for (let k = 0; k < nGates; k++) {
      const ta = a0 + (k / nGates) * Math.PI * 2;
      let best = -1, bd = Infinity;
      for (const v of wallVerts) {
        if (gates.includes(v)) continue;
        const [x, y] = g.pos[v];
        const d = Math.abs(Math.atan2(Math.sin(Math.atan2(y, x) - ta), Math.cos(Math.atan2(y, x) - ta)));
        if (d < bd) (bd = d), (best = v);
      }
      if (best >= 0) gates.push(best);
    }
    const plazaVerts = new Set(cells[order[0]].poly.map(([x, y]) => vid(x, y)));
    const mainRoads: number[][] = [];
    for (const gv of gates) {
      // 内側：城壁沿いは通れない、城外の辺は割高
      const din = dijkstra(gv, (e) => (e.wall ? 1e6 : e.inner ? e.w : e.w * 4));
      let tIn = -1, bd = Infinity;
      for (const v of plazaVerts) if (din.dist[v] < bd) (bd = din.dist[v]), (tIn = v);
      if (tIn >= 0) mainRoads.push(pathTo(din.prev, tIn));
      // 外側：門の方向の外周の点へ
      const dout = dijkstra(gv, (e) => (e.wall ? 1e6 : e.inner ? e.w * 6 : e.w));
      const [gx, gy] = g.pos[gv];
      const s = HALF / Math.max(Math.abs(gx), Math.abs(gy), 1e-6);
      let tOut = -1;
      bd = Infinity;
      g.pos.forEach(([x, y], v) => {
        if (Math.max(Math.abs(x), Math.abs(y)) < HALF - 1e-3) return;
        const d = Math.hypot(x - gx * s, y - gy * s);
        if (d < bd) (bd = d), (tOut = v);
      });
      if (tOut >= 0) mainRoads.push(pathTo(dout.prev, tOut));
    }
    const mainSet = new Set<string>();
    for (const r of mainRoads) for (let k = 0; k + 1 < r.length; k++) mainSet.add(r[k] < r[k + 1] ? `${r[k]},${r[k + 1]}` : `${r[k + 1]},${r[k]}`);

    const object = new THREE.Group();
    // 地面：セルごとの扇形三角形（役割で色分け）
    const gpos: number[] = [], gcol: number[] = [];
    const c = new THREE.Color();
    cells.forEach((cell, i) => {
      if (cell.poly.length < 3) return;
      const ct = polygonCentroid(cell.poly);
      if (role[i] === 2) c.set(0xc9b48a);
      else if (role[i] === 1) c.set(0x8c7d63);
      else if (role[i] === 3) c.set(0x6f7a46);
      else c.setHSL(0.17 + rng() * 0.12, 0.45, 0.3 + rng() * 0.12);
      for (let k = 0; k < cell.poly.length; k++) {
        const A = cell.poly[k], B = cell.poly[(k + 1) % cell.poly.length];
        gpos.push(ct.x, 0.01, ct.y, B[0], 0.01, B[1], A[0], 0.01, A[1]);
        for (let t = 0; t < 3; t++) gcol.push(c.r, c.g, c.b);
      }
    });
    const ggeo = new THREE.BufferGeometry();
    ggeo.setAttribute('position', new THREE.Float32BufferAttribute(gpos, 3));
    ggeo.setAttribute('color', new THREE.Float32BufferAttribute(gcol, 3));
    ggeo.computeVertexNormals();
    object.add(new THREE.Mesh(ggeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, side: THREE.DoubleSide })));

    // 道路：城内の辺＝石畳、城外＝細いあぜ道、大通り＝太い
    const roads = new BoxBatch();
    const strip = (a: number, b: number, w: number, col: number, y: number) => {
      const [x0, z0] = g.pos[a], [x1, z1] = g.pos[b];
      const len = Math.hypot(x1 - x0, z1 - z0);
      roads.add((x0 + x1) / 2, y, (z0 + z1) / 2, len + w * 0.6, 0.02, w, col, Math.atan2(-(z1 - z0), x1 - x0));
    };
    for (const [a, list] of g.adj) {
      for (const e of list) {
        if (e.to < a || e.wall) continue;
        const main = mainSet.has(`${a},${e.to}`);
        if (main) strip(a, e.to, 0.17, 0xd8c8a0, 0.025);
        else if (e.inner) strip(a, e.to, 0.09, 0x5e5448, 0.02);
        else strip(a, e.to, 0.035, 0x4a4a32, 0.018);
      }
    }
    object.add(roads.build(new THREE.MeshStandardMaterial({ roughness: 0.9 })));

    // 城壁と塔・門
    const walls = new BoxBatch(), towers = new BoxBatch();
    const gateSet = new Set(gates);
    const towerAt = new Set<number>();
    for (const [a, b] of wallSegs) {
      let [x0, z0] = g.pos[a], [x1, z1] = g.pos[b];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const ux = (x1 - x0) / len, uz = (z1 - z0) / len;
      const gap = Math.min(0.22, len * 0.35);
      // 門の頂点側を少し空けて、両脇に門塔を立てる
      if (gateSet.has(a)) {
        x0 += ux * gap;
        z0 += uz * gap;
        towers.addOnGround(x0, z0, 0.3, 0.95, 0.3, 0x9d9484);
      }
      if (gateSet.has(b)) {
        x1 -= ux * gap;
        z1 -= uz * gap;
        towers.addOnGround(x1, z1, 0.3, 0.95, 0.3, 0x9d9484);
      }
      const l2 = Math.hypot(x1 - x0, z1 - z0);
      walls.addOnGround((x0 + x1) / 2, (z0 + z1) / 2, l2, 0.55, 0.12, 0xb5ab98, 0, Math.atan2(-(z1 - z0), x1 - x0));
      for (const v of [a, b]) {
        if (gateSet.has(v) || towerAt.has(v)) continue;
        towerAt.add(v);
        towers.addOnGround(g.pos[v][0], g.pos[v][1], 0.22, 0.72, 0.22, 0xa79f8f);
      }
    }
    object.add(walls.build());
    object.add(towers.build(new THREE.MeshStandardMaterial({ roughness: 0.8 }), new THREE.CylinderGeometry(0.5, 0.55, 1, 10)));

    // 建物：セルを縮めた多角形の中に、最長辺に沿った格子で敷地を並べる
    const houses = new BoxBatch(), roofs = new BoxBatch();
    const dens = Number(p.density);
    let nHouse = 0;
    cells.forEach((cell, i) => {
      if (role[i] === 0 || cell.poly.length < 3) return;
      const ct = polygonCentroid(cell.poly);
      if (role[i] === 2) {
        // 広場：中央に市場の建物
        houses.addOnGround(ct.x, ct.y, 0.28, 0.22, 0.28, 0xd9c79c);
        roofs.add(ct.x, 0.22 + 0.1, ct.y, 0.4, 0.2, 0.4, 0x7a3b2a);
        return;
      }
      const shrink = role[i] === 3 ? 0.7 : 0.84;
      const poly = cell.poly.map(([x, y]) => [ct.x + (x - ct.x) * shrink, ct.y + (y - ct.y) * shrink] as [number, number]);
      let ux = 1, uz = 0, bl = 0;
      for (let k = 0; k < poly.length; k++) {
        const A = poly[k], B = poly[(k + 1) % poly.length];
        const l = Math.hypot(B[0] - A[0], B[1] - A[1]);
        if (l > bl) (bl = l), (ux = (B[0] - A[0]) / l), (uz = (B[1] - A[1]) / l);
      }
      const vx = -uz, vz = ux;
      let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
      for (const [x, y] of poly) {
        const a = (x - ct.x) * ux + (y - ct.y) * uz, b = (x - ct.x) * vx + (y - ct.y) * vz;
        minA = Math.min(minA, a);
        maxA = Math.max(maxA, a);
        minB = Math.min(minB, b);
        maxB = Math.max(maxB, b);
      }
      const step = role[i] === 3 ? 0.42 : 0.3;
      const fill = role[i] === 3 ? dens * 0.35 : dens;
      const ry = Math.atan2(-uz, ux);
      for (let a = minA + step / 2; a < maxA; a += step) {
        for (let b = minB + step / 2; b < maxB; b += step) {
          const at = (da: number, db: number) => [ct.x + (a + da) * ux + (b + db) * vx, ct.y + (a + da) * uz + (b + db) * vz] as const;
          const h = step * 0.45;
          if (![at(-h, -h), at(h, -h), at(h, h), at(-h, h)].every(([x, y]) => pointInPolygon(x, y, poly))) continue;
          if (rng() > fill) continue;
          const [x, z] = at(0, 0);
          const sa = step * (0.7 + rng() * 0.22), sb = step * (0.6 + rng() * 0.3);
          const hh = (role[i] === 1 ? 0.18 : 0.12) + rng() * 0.16;
          c.setHSL(0.09 + rng() * 0.04, 0.25, 0.62 + rng() * 0.15);
          houses.addOnGround(x, z, sa, hh, sb, c, 0.02, ry);
          c.setHSL(0.02 + rng() * 0.03, 0.55, 0.32 + rng() * 0.1);
          roofs.add(x, 0.02 + hh + 0.06, z, sa * 1.05, 0.12, sb * 1.05, c, ry);
          nHouse++;
        }
      }
    });
    object.add(houses.build());
    const roofGeo = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
    roofGeo.rotateY(Math.PI / 4);
    object.add(roofs.build(new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), roofGeo));

    // 補助表示：ドロネー網
    const dlPts: number[] = [];
    for (let t = 0; t < dl.triangles.length; t += 3) {
      const [a, b, cc] = [dl.triangles[t], dl.triangles[t + 1], dl.triangles[t + 2]];
      for (const [u, v] of [[a, b], [b, cc], [cc, a]]) dlPts.push(pts[u].x, 0.06, pts[u].y, pts[v].x, 0.06, pts[v].y);
    }
    const helpers = segments(dlPts, 0x5ad1ff, { opacity: 0.6 });

    // 比較用：元のボロノイ図＋ドロネー網＋種点
    const before = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(HALF * 2, 0.04, HALF * 2), new THREE.MeshStandardMaterial({ color: 0x1b2036, roughness: 1 }));
    plate.position.y = -0.02;
    const vpts: number[] = [];
    for (const [a, list] of g.adj) for (const e of list) if (e.to > a) vpts.push(g.pos[a][0], 0.02, g.pos[a][1], g.pos[e.to][0], 0.02, g.pos[e.to][1]);
    const seeds = new BoxBatch();
    for (const q of pts) seeds.addOnGround(q.x, q.y, 0.07, 0.07, 0.07, 0xffcf5a);
    before.add(plate, segments(vpts, 0xe8ecff), segments(dlPts, 0x3f6bd0, { opacity: 0.5 }), seeds.build());

    return {
      object,
      before,
      helpers,
      info: `セル ${pts.length} · ドロネー三角形 ${dl.triangles.length / 3} · 城内 ${K} · 城壁 ${wallSegs.length} 辺 · 門 ${gates.length} · 建物 ${nHouse}`,
      update(_dt, _t, live) {
        helpers.visible = Boolean(live.showDelaunay);
      },
    };
  },
});
