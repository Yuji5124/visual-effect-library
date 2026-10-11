import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { MinHeap } from '../framework/terrainKit';
import { BoxBatch, GridPlane } from '../framework/worldKit';
import { fillMesh, pointInPoly, polyArea, prismMesh, type PrismItem, type V2 } from '../framework/urbanKit';

/**
 * WRD-011 L-システム道路網（Parish & Müller 2001 の考え方）：
 * 伸長要求を優先度付きキューで処理 → 局所制約（交差で切る・近い交差点へ吸着・近い道路へ延長・水域で止める）→
 * 大域目標（幹線は人口密度の高い方向へ、街路は格子状に分岐）で次の要求を出す。
 */
const HALF = 6;

interface Prop {
  from: number;
  x: number;
  z: number;
  ang: number;
  hw: boolean;
}

interface Vis {
  a: V2;
  b: V2;
  hw: boolean;
}

export default defineWorldDemo({
  id: 'WRD-011',
  notes: '背景は人口密度ノイズ（暗→明）と水域（青）。幹線（黄）は数方向を試して人口密度が最も高い方へ伸び、街路（白）は幹線や街路から直角に分岐して格子状に広がる。各伸長要求は優先度付きキューから取り出され、既存道路と交差すればそこで切って交差点を作り（橙）、終点の吸着半径内に交差点があれば吸着し（水色）、道路が近ければそこまで延長する（紫）。成長が終わると道路で囲まれた区画を面として抽出して色分けし、密度に応じた高さの建物を置く。成長中の水色の輪は吸着半径。',
  params: [
    { key: 'branch', label: '分岐確率', type: 'number', min: 0.05, max: 0.9, step: 0.01, default: 0.45 },
    { key: 'segLen', label: 'セグメント長', type: 'number', min: 0.25, max: 0.9, step: 0.01, default: 0.42 },
    { key: 'snap', label: '吸着半径', type: 'number', min: 0, max: 0.4, step: 0.01, default: 0.2 },
    { key: 'speed', label: '成長速度（本/秒）', type: 'number', min: 10, max: 600, step: 5, default: 120 },
    { key: 'maxSeg', label: '道路の上限本数', type: 'number', min: 100, max: 1400, step: 10, default: 900 },
    { key: 'water', label: '水域の広さ', type: 'number', min: 0, max: 0.4, step: 0.01, default: 0.14 },
    { key: 'showBlocks', label: '完成後に区画と建物を表示', type: 'bool', default: true },
  ],
  liveKeys: ['speed', 'showBlocks'],
  distance: 17,
  elevation: 1.05,
  compareLabels: ['人口密度と水域（入力）', '道路網'],
  build(p, env) {
    const rng = env.rng;
    const nDen = makeNoise2(env.seed), nWat = makeNoise2(env.seed + 77);
    const waterLv = Number(p.water);
    const isWater = (x: number, z: number) => waterLv > 0 && fbm2(nWat, x * 0.16 + 3.1, z * 0.16 - 1.7, 3) * 0.5 + 0.5 < waterLv + 0.12 * Math.max(0, Math.hypot(x, z) / HALF - 0.4);
    const density = (x: number, z: number) => {
      if (isWater(x, z)) return 0;
      const r = Math.hypot(x, z) / HALF;
      return Math.max(0, Math.min(1, 0.55 + 0.75 * fbm2(nDen, x * 0.2, z * 0.2, 4) - 0.45 * r * r));
    };
    const L = Number(p.segLen), snapR = Number(p.snap), branch = Number(p.branch);
    const maxSeg = Math.round(Number(p.maxSeg) * (env.quality === 'low' ? 0.6 : 1));

    // グラフ（分割可能な辺）と空間ハッシュ
    const nodes: V2[] = [];
    const edges: { a: number; b: number; hw: boolean; dead: boolean }[] = [];
    const CS = Math.max(L * 1.7, 0.4);
    const eGrid = new Map<number, number[]>(), nGrid = new Map<number, number[]>();
    const key = (i: number, j: number) => (i + 512) * 1024 + (j + 512);
    const cell = (v: number) => Math.floor(v / CS);
    const addNode = (x: number, z: number) => {
      nodes.push([x, z]);
      const k = key(cell(x), cell(z));
      (nGrid.get(k) ?? nGrid.set(k, []).get(k)!).push(nodes.length - 1);
      return nodes.length - 1;
    };
    const addEdge = (a: number, b: number, hw: boolean) => {
      edges.push({ a, b, hw, dead: false });
      const id = edges.length - 1;
      const [x0, z0] = nodes[a], [x1, z1] = nodes[b];
      for (let i = cell(Math.min(x0, x1)); i <= cell(Math.max(x0, x1)); i++)
        for (let j = cell(Math.min(z0, z1)); j <= cell(Math.max(z0, z1)); j++) {
          const k = key(i, j);
          (eGrid.get(k) ?? eGrid.set(k, []).get(k)!).push(id);
        }
      return id;
    };
    const near = (grid: Map<number, number[]>, x0: number, z0: number, x1: number, z1: number, pad: number) => {
      const out = new Set<number>();
      for (let i = cell(Math.min(x0, x1) - pad); i <= cell(Math.max(x0, x1) + pad); i++)
        for (let j = cell(Math.min(z0, z1) - pad); j <= cell(Math.max(z0, z1) + pad); j++) for (const id of grid.get(key(i, j)) ?? []) out.add(id);
      return out;
    };
    const splitEdge = (eid: number, x: number, z: number) => {
      const e = edges[eid];
      e.dead = true;
      const m = addNode(x, z);
      addEdge(e.a, m, e.hw);
      addEdge(m, e.b, e.hw);
      return m;
    };
    const connected = (a: number, b: number) => {
      for (const id of near(eGrid, nodes[a][0], nodes[a][1], nodes[a][0], nodes[a][1], 0)) {
        const e = edges[id];
        if (!e.dead && ((e.a === a && e.b === b) || (e.a === b && e.b === a))) return true;
      }
      return false;
    };
    // 線分 AB と既存の辺の最初の交差（A に接続する辺は除く）
    const firstHit = (a: number, bx: number, bz: number, skip = -1) => {
      const [ax, az] = nodes[a];
      let best: { t: number; e: number; u: number } | null = null;
      for (const id of near(eGrid, ax, az, bx, bz, 0)) {
        const e = edges[id];
        if (e.dead || e.a === a || e.b === a || e.a === skip || e.b === skip) continue;
        const [cx, cz] = nodes[e.a], [dx, dz] = nodes[e.b];
        const rx = bx - ax, rz = bz - az, sx = dx - cx, sz = dz - cz;
        const den = rx * sz - rz * sx;
        if (Math.abs(den) < 1e-12) continue;
        const t = ((cx - ax) * sz - (cz - az) * sx) / den;
        const u = ((cx - ax) * rz - (cz - az) * rx) / den;
        if (t > 1e-6 && t <= 1 && u >= 0 && u <= 1 && (!best || t < best.t)) best = { t, e: id, u };
      }
      return best;
    };
    // A から出る既存の辺と角度が近すぎないか
    const angleOk = (a: number, ang: number) => {
      for (const id of near(eGrid, nodes[a][0], nodes[a][1], nodes[a][0], nodes[a][1], 0)) {
        const e = edges[id];
        if (e.dead || (e.a !== a && e.b !== a)) continue;
        const o = e.a === a ? e.b : e.a;
        const ea = Math.atan2(nodes[o][1] - nodes[a][1], nodes[o][0] - nodes[a][0]);
        const d = Math.abs(Math.atan2(Math.sin(ea - ang), Math.cos(ea - ang)));
        if (d < 0.5) return false;
      }
      return true;
    };

    const vis: Vis[] = [];
    const marks: { x: number; z: number; kind: number; at: number }[] = [];
    const heap = new MinHeap();
    const props: Prop[] = [];
    const push = (t: number, pr: Prop) => {
      props.push(pr);
      heap.push(t + props.length * 1e-7, props.length - 1);
    };
    // 出発点：中心付近で人口密度が最も高い点
    let sx = 0, sz = 0, sd = -1;
    for (let k = 0; k < 40; k++) {
      const x = (rng() - 0.5) * HALF * 0.6, z = (rng() - 0.5) * HALF * 0.6;
      const d = density(x, z);
      if (d > sd) (sd = d), (sx = x), (sz = z);
    }
    const start = addNode(sx, sz);
    const a0 = rng() * Math.PI;
    for (const s of [0, Math.PI]) push(0, { from: start, x: sx + Math.cos(a0 + s) * L * 1.6, z: sz + Math.sin(a0 + s) * L * 1.6, ang: a0 + s, hw: true });

    const inBounds = (x: number, z: number) => Math.abs(x) < HALF - 0.05 && Math.abs(z) < HALF - 0.05;
    let iter = 0, nCross = 0, nSnap = 0, nExt = 0;
    while (heap.size > 0 && vis.length < maxSeg && iter++ < 30000) {
      const t = heap.pop();
      const pr = props[t];
      const tNow = heap.lastKey;
      const A = pr.from;
      const [ax, az] = nodes[A];
      let bx = pr.x, bz = pr.z;
      if (!inBounds(bx, bz)) continue;
      // 水域：幹線は半分の長さで再挑戦、街路は止まる
      if (isWater(bx, bz) || isWater((ax + bx) / 2, (az + bz) / 2)) {
        if (!pr.hw) continue;
        bx = (ax + bx) / 2;
        bz = (az + bz) / 2;
        if (isWater(bx, bz) || Math.hypot(bx - ax, bz - az) < L * 0.4) continue;
      }
      const ang = Math.atan2(bz - az, bx - ax);
      if (!angleOk(A, ang)) continue;
      const accept = (to: number, kind: number) => {
        addEdge(A, to, pr.hw);
        vis.push({ a: [ax, az], b: [nodes[to][0], nodes[to][1]], hw: pr.hw });
        if (kind > 0) marks.push({ x: nodes[to][0], z: nodes[to][1], kind, at: vis.length });
      };
      // 1) 既存の道路と交差 → 交点で切って止める
      const hit = firstHit(A, bx, bz);
      if (hit) {
        const e = edges[hit.e];
        const hx = ax + (bx - ax) * hit.t, hz = az + (bz - az) * hit.t;
        if (Math.hypot(hx - ax, hz - az) < L * 0.2) continue;
        // 交点が既存の交差点に近ければそこへ
        let to = -1;
        for (const v of [e.a, e.b]) if (Math.hypot(nodes[v][0] - hx, nodes[v][1] - hz) < Math.max(snapR * 0.6, 0.04)) to = v;
        if (to === A || (to >= 0 && connected(A, to))) continue;
        if (to < 0) to = splitEdge(hit.e, hx, hz);
        accept(to, 1);
        nCross++;
        continue;
      }
      // 2) 吸着半径内の交差点へ吸着
      let snapTo = -1, sdBest = snapR;
      for (const v of near(nGrid, bx, bz, bx, bz, snapR)) {
        if (v === A) continue;
        const d = Math.hypot(nodes[v][0] - bx, nodes[v][1] - bz);
        if (d < sdBest) (sdBest = d), (snapTo = v);
      }
      if (snapTo >= 0) {
        const [vx, vz] = nodes[snapTo];
        if (connected(A, snapTo) || !angleOk(A, Math.atan2(vz - az, vx - ax)) || firstHit(A, vx, vz, snapTo)) continue;
        accept(snapTo, 2);
        nSnap++;
        continue;
      }
      // 3) 吸着半径内の道路へ延長して T 字路にする
      let extE = -1, eBest = snapR, px = 0, pz = 0;
      for (const id of near(eGrid, bx, bz, bx, bz, snapR)) {
        const e = edges[id];
        if (e.dead || e.a === A || e.b === A) continue;
        const [cx, cz] = nodes[e.a], [dx, dz] = nodes[e.b];
        const sxv = dx - cx, szv = dz - cz;
        const u = Math.max(0, Math.min(1, ((bx - cx) * sxv + (bz - cz) * szv) / (sxv * sxv + szv * szv || 1)));
        const qx = cx + sxv * u, qz = cz + szv * u;
        const d = Math.hypot(qx - bx, qz - bz);
        if (d < eBest && u > 0.05 && u < 0.95) (eBest = d), (extE = id), (px = qx), (pz = qz);
      }
      if (extE >= 0) {
        if (!angleOk(A, Math.atan2(pz - az, px - ax))) continue;
        const h2 = firstHit(A, px, pz);
        if (h2 && h2.e !== extE) continue;
        accept(splitEdge(extE, px, pz), 3);
        nExt++;
        continue;
      }
      // 4) そのまま採用して、大域目標で次の要求を出す
      const B = addNode(bx, bz);
      accept(B, 0);
      const d = density(bx, bz);
      if (pr.hw) {
        // 幹線：いくつかの方向を試し、先の人口密度が最も高い方向へ
        let bestA = ang, bestD = -1;
        for (let k = 0; k < 7; k++) {
          const ta = ang + (rng() - 0.5) * 0.6;
          const dd = density(bx + Math.cos(ta) * L * 3, bz + Math.sin(ta) * L * 3);
          if (dd > bestD) (bestD = dd), (bestA = ta);
        }
        const hl = L * 1.6;
        push(tNow + 1, { from: B, x: bx + Math.cos(bestA) * hl, z: bz + Math.sin(bestA) * hl, ang: bestA, hw: true });
        if (rng() < branch * 0.12) {
          const s = rng() < 0.5 ? 1 : -1;
          push(tNow + 1, { from: B, x: bx + Math.cos(ang + s * Math.PI / 2) * hl, z: bz + Math.sin(ang + s * Math.PI / 2) * hl, ang: ang + (s * Math.PI) / 2, hw: true });
        }
        for (const s of [1, -1]) {
          if (d > 0.15 && rng() < branch) push(tNow + 5, { from: B, x: bx + Math.cos(ang + s * Math.PI / 2) * L, z: bz + Math.sin(ang + s * Math.PI / 2) * L, ang: ang + (s * Math.PI) / 2, hw: false });
        }
      } else if (d > 0.15) {
        // 街路：直進と直角の分岐（格子パターン）
        const na = ang + (rng() - 0.5) * 0.08;
        if (rng() < 0.92) push(tNow + 1, { from: B, x: bx + Math.cos(na) * L, z: bz + Math.sin(na) * L, ang: na, hw: false });
        for (const s of [1, -1]) {
          if (rng() < branch) push(tNow + 1 + rng() * 2, { from: B, x: bx + Math.cos(ang + s * Math.PI / 2) * L, z: bz + Math.sin(ang + s * Math.PI / 2) * L, ang: ang + (s * Math.PI) / 2, hw: false });
        }
      }
    }

    // ---- 区画（道路で囲まれた面）の抽出：行き止まりを刈り取ってから、各有向辺をたどる ----
    const adj: number[][] = nodes.map(() => []);
    for (const e of edges) if (!e.dead && e.a !== e.b) (adj[e.a].push(e.b), adj[e.b].push(e.a));
    const deg = adj.map((l) => l.length);
    const alive = new Uint8Array(nodes.length).fill(1);
    const stack: number[] = [];
    deg.forEach((dg, i) => dg <= 1 && stack.push(i));
    while (stack.length) {
      const v = stack.pop()!;
      if (!alive[v]) continue;
      alive[v] = 0;
      for (const w of adj[v]) if (alive[w] && --deg[w] <= 1) stack.push(w);
    }
    const sorted = adj.map((l, v) => l.filter((w) => alive[w] && alive[v]).sort((a, b) => Math.atan2(nodes[a][1] - nodes[v][1], nodes[a][0] - nodes[v][0]) - Math.atan2(nodes[b][1] - nodes[v][1], nodes[b][0] - nodes[v][0])));
    const used = new Set<number>();
    const hk = (u: number, v: number) => u * 1000003 + v;
    const faces: V2[][] = [];
    for (let u = 0; u < nodes.length; u++) {
      for (const v0 of sorted[u]) {
        if (used.has(hk(u, v0))) continue;
        const face: V2[] = [];
        let a = u, b = v0, guard = 0;
        while (!used.has(hk(a, b)) && guard++ < 400) {
          used.add(hk(a, b));
          face.push(nodes[a]);
          const lst = sorted[b];
          const i = lst.indexOf(a);
          const w = lst[(i - 1 + lst.length) % lst.length];
          a = b;
          b = w;
        }
        const ar = polyArea(face);
        if (face.length >= 3 && ar > 0.02 && ar < 6) faces.push(face);
      }
    }

    // ---- 描画 ----
    const object = new THREE.Group();
    const G = env.quality === 'low' ? 96 : 160;
    const map = new GridPlane(G, G, HALF * 2);
    const c = new THREE.Color();
    for (let j = 0; j < G; j++)
      for (let i = 0; i < G; i++) {
        const x = ((i + 0.5) / G - 0.5) * HALF * 2, z = ((j + 0.5) / G - 0.5) * HALF * 2;
        if (isWater(x, z)) map.set(i, j, 40, 90, 160);
        else {
          const d = density(x, z);
          c.setRGB(0.1 + 0.55 * d, 0.12 + 0.3 * d, 0.16 + 0.05 * d);
          map.set(i, j, c.r * 255, c.g * 255, c.b * 255);
        }
      }
    map.commit();
    // GridPlane の j=0 は奥側（-z）
    object.add(map.mesh);

    const roadBatch = new BoxBatch();
    for (const s of vis) {
      const dx = s.b[0] - s.a[0], dz = s.b[1] - s.a[1];
      const len = Math.hypot(dx, dz), w = s.hw ? 0.11 : 0.05;
      roadBatch.add((s.a[0] + s.b[0]) / 2, s.hw ? 0.035 : 0.03, (s.a[1] + s.b[1]) / 2, len + w * 0.8, 0.02, w, s.hw ? 0xffc857 : 0xe6e8f0, Math.atan2(-dz, dx));
    }
    const roads = roadBatch.build(new THREE.MeshStandardMaterial({ roughness: 0.7 }));
    object.add(roads);
    const MK = [0, 0xff6a3d, 0x3dd6ff, 0xb46bff];
    const markBatch = new BoxBatch();
    for (const m of marks) markBatch.add(m.x, 0.06, m.z, 0.09, 0.07, 0.09, MK[m.kind]);
    const markMesh = markBatch.build(new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: 0x222222 }), new THREE.CylinderGeometry(0.5, 0.5, 1, 10));
    object.add(markMesh);

    // 区画の面と建物
    const city = new THREE.Group();
    const fills = faces.map((f) => ({ pts: f, y: 0.012, color: c.setHSL(rng(), 0.45, 0.45).getHex() }));
    if (fills.length) city.add(fillMesh(fills, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, transparent: true, opacity: 0.85 })));
    const blds: PrismItem[] = [];
    const maxB = env.quality === 'low' ? 700 : 1600;
    for (const f of faces) {
      const ar = polyArea(f);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [x, z] of f) (x0 = Math.min(x0, x)), (x1 = Math.max(x1, x)), (z0 = Math.min(z0, z)), (z1 = Math.max(z1, z));
      const want = Math.min(30, Math.floor(ar / 0.05));
      for (let k = 0, tries = 0; k < want && tries < want * 6 && blds.length < maxB; tries++) {
        const x = x0 + rng() * (x1 - x0), z = z0 + rng() * (z1 - z0);
        if (!pointInPoly(x, z, f)) continue;
        // 道路からの距離（辺までの最短距離）
        let dmin = Infinity, ex = 1, ez = 0;
        for (let i = 0; i < f.length; i++) {
          const [ax, az] = f[i], [bx, bz] = f[(i + 1) % f.length];
          const sxv = bx - ax, szv = bz - az;
          const u = Math.max(0, Math.min(1, ((x - ax) * sxv + (z - az) * szv) / (sxv * sxv + szv * szv || 1)));
          const d = Math.hypot(ax + sxv * u - x, az + szv * u - z);
          if (d < dmin) (dmin = d), (ex = sxv), (ez = szv);
        }
        const s = 0.07 + rng() * 0.05;
        if (dmin < 0.07 + s * 0.75) continue;
        const el = Math.hypot(ex, ez) || 1;
        const ux = ex / el, uz = ez / el;
        const hh = 0.05 + density(x, z) * (0.25 + rng() * 0.6);
        const sq: V2[] = [[x - ux * s + uz * s, z - uz * s - ux * s], [x + ux * s + uz * s, z + uz * s - ux * s], [x + ux * s - uz * s, z + uz * s + ux * s], [x - ux * s - uz * s, z - uz * s + ux * s]];
        if (blds.some((b) => Math.hypot(b.pts[0][0] - sq[0][0], b.pts[0][1] - sq[0][1]) < s * 1.6)) continue;
        c.setHSL(0.08 + rng() * 0.05, 0.15, 0.55 + hh * 0.4);
        blds.push({ pts: sq, base: 0.012, height: hh, color: c.getHex() });
        k++;
      }
    }
    if (blds.length) city.add(prismMesh(blds));
    object.add(city);

    // 補助：吸着半径の輪（成長中の先端）
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.92, 1, 40), new THREE.MeshBasicMaterial({ color: 0x3dd6ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2;
    ring.scale.setScalar(Math.max(snapR, 0.02));
    const helpers = new THREE.Group();
    helpers.add(ring);

    // 比較：入力（人口密度と水域）と出発点
    const before = new THREE.Group();
    const map2 = new GridPlane(G, G, HALF * 2);
    map2.data.set(map.data);
    map2.commit();
    before.add(map2.mesh);
    const st = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.2, 16), new THREE.MeshStandardMaterial({ color: 0xffc857 }));
    st.position.set(sx, 0.1, sz);
    before.add(st);

    let shown = 0;
    roads.count = 0;
    markMesh.count = 0;
    city.visible = false;
    return {
      object,
      before,
      helpers,
      info: () =>
        `道路 ${Math.floor(shown)}/${vis.length} 本（幹線 ${vis.filter((v) => v.hw).length}） · 交差で切断 ${nCross} · 交差点へ吸着 ${nSnap} · 道路へ延長 ${nExt} · 区画 ${faces.length} · 建物 ${blds.length}${shown >= vis.length ? ' · 完成' : ' · 成長中'}`,
      update(dt, _t, live) {
        if (shown < vis.length) shown = Math.min(vis.length, shown + dt * Number(live.speed));
        const k = Math.floor(shown);
        roads.count = Math.max(0, k);
        let m = 0;
        while (m < marks.length && marks[m].at <= k) m++;
        markMesh.count = m;
        const done = k >= vis.length;
        city.visible = done && Boolean(live.showBlocks);
        ring.visible = !done && k > 0;
        if (k > 0 && !done) ring.position.set(vis[k - 1].b[0], 0.07, vis[k - 1].b[1]);
      },
    };
  },
});
