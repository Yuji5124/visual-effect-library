import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { MinHeap } from '../framework/terrainKit';
import { BoxBatch, segments } from '../framework/worldKit';
import { prismMesh, type PrismItem, type V2 } from '../framework/urbanKit';

/** WRD-020 道路階層：拠点の組ごとの最短経路（ダイクストラ）が通る回数を道路に積算し、多い順に幹線・補助幹線・街路と格付けする */
const SIZE = 11;

export default defineWorldDemo({
  id: 'WRD-020',
  notes: '格子点を乱した道路グラフ（湖の部分は道路なし）に拠点（桃色の柱、高さ＝人口）を置き、人口の積に比例する確率で出発地−目的地の組を選んで、ダイクストラ法の最短経路が通る道路の通過回数を1本ずつ積算する（水色の線が今足した経路）。通過回数の上位「幹線の割合」を幹線（橙・太）、その次の2倍を補助幹線（黄）、残りを街路（灰）とし、太さも通過回数で変える。沿道の建物は面する道路の交通量が多いほど高くなる。比較の左は格付け前の一様な道路網。',
  params: [
    { key: 'hubs', label: '拠点数', type: 'number', min: 3, max: 40, step: 1, default: 12 },
    { key: 'paths', label: '経路の本数', type: 'number', min: 10, max: 1000, step: 10, default: 300 },
    { key: 'trunk', label: '幹線の割合', type: 'number', min: 0.02, max: 0.3, step: 0.01, default: 0.08 },
    { key: 'grid', label: '格子の数', type: 'number', min: 6, max: 22, step: 1, default: 15 },
    { key: 'jitter', label: '格子の乱れ', type: 'number', min: 0, max: 0.45, step: 0.01, default: 0.28 },
    { key: 'speed', label: '経路の追加速度（本/秒）', type: 'number', min: 2, max: 300, step: 1, default: 40 },
  ],
  liveKeys: ['trunk', 'speed'],
  distance: 15,
  elevation: 1.0,
  compareLabels: ['格付け前の道路網', '交通量による道路階層'],
  build(p, env) {
    const rng = env.rng;
    const n = env.quality === 'low' ? Math.min(13, Number(p.grid)) : Number(p.grid);
    const sp = SIZE / (n - 1), jit = Number(p.jitter);
    const lake = makeNoise2(env.seed + 5);
    const isLake = (x: number, z: number) => fbm2(lake, x * 0.17 + 7.3, z * 0.17 - 2.1, 3) > 0.32;
    const pos: V2[] = [];
    const alive = new Uint8Array(n * n);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const x = -SIZE / 2 + i * sp + (i > 0 && i < n - 1 ? (rng() - 0.5) * 2 * jit * sp : 0);
        const z = -SIZE / 2 + j * sp + (j > 0 && j < n - 1 ? (rng() - 0.5) * 2 * jit * sp : 0);
        pos.push([x, z]);
        alive[j * n + i] = isLake(x, z) ? 0 : 1;
      }
    // 辺（右・下）
    const ea: number[] = [], eb: number[] = [], ew: number[] = [];
    const adj: { to: number; e: number }[][] = pos.map(() => []);
    const addE = (a: number, b: number) => {
      if (!alive[a] || !alive[b]) return;
      const e = ea.length;
      ea.push(a);
      eb.push(b);
      ew.push(Math.hypot(pos[a][0] - pos[b][0], pos[a][1] - pos[b][1]) * (1 + 0.05 * rng()));
      adj[a].push({ to: b, e });
      adj[b].push({ to: a, e });
    };
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        if (i < n - 1) addE(j * n + i, j * n + i + 1);
        if (j < n - 1) addE(j * n + i, (j + 1) * n + i);
      }
    // 最大の連結成分だけを使う
    const comp = new Int32Array(n * n).fill(-1);
    let best = -1, bestSize = 0;
    for (let s = 0, c = 0; s < n * n; s++) {
      if (!alive[s] || comp[s] >= 0) continue;
      const st = [s];
      comp[s] = c;
      let size = 0;
      while (st.length) {
        const u = st.pop()!;
        size++;
        for (const { to } of adj[u]) if (comp[to] < 0) (comp[to] = c), st.push(to);
      }
      if (size > bestSize) (bestSize = size), (best = c);
      c++;
    }
    const inMain = (v: number) => comp[v] === best;
    const mainNodes = pos.map((_, i) => i).filter(inMain);
    const E = ea.length;

    // 拠点と出発地−目的地の組（重力モデル）
    const H = Math.min(Number(p.hubs), mainNodes.length);
    const hubs: number[] = [], wts: number[] = [];
    for (let t = 0; hubs.length < H && t < H * 50; t++) {
      const v = mainNodes[Math.floor(rng() * mainNodes.length)];
      if (hubs.includes(v)) continue;
      hubs.push(v);
      wts.push(1 + rng() * rng() * 4);
    }
    const dijkstra = (src: number) => {
      const dist = new Float64Array(n * n).fill(Infinity), prevE = new Int32Array(n * n).fill(-1);
      const heap = new MinHeap();
      dist[src] = 0;
      heap.push(0, src);
      while (heap.size) {
        const u = heap.pop();
        if (heap.lastKey > dist[u]) continue;
        for (const { to, e } of adj[u]) {
          const d = dist[u] + ew[e];
          if (d < dist[to]) (dist[to] = d), (prevE[to] = e), heap.push(d, to);
        }
      }
      return prevE;
    };
    const trees = hubs.map((h) => dijkstra(h));
    const pairW: [number, number, number][] = [];
    let wsum = 0;
    for (let a = 0; a < hubs.length; a++) for (let b = a + 1; b < hubs.length; b++) (wsum += wts[a] * wts[b]), pairW.push([a, b, wsum]);
    const P = Number(p.paths);
    const paths: number[][] = [];
    for (let k = 0; k < P && pairW.length; k++) {
      const r = rng() * wsum;
      const [a, b] = pairW.find((q) => q[2] >= r) ?? pairW[pairW.length - 1];
      const prevE = trees[a];
      const list: number[] = [];
      for (let v = hubs[b], g = 0; v !== hubs[a] && prevE[v] >= 0 && g < n * n; g++) {
        const e = prevE[v];
        list.push(e);
        v = ea[e] === v ? eb[e] : ea[e];
      }
      paths.push(list);
    }

    // ---- 描画 ----
    const object = new THREE.Group();
    const ground: PrismItem[] = [{ pts: [[-SIZE / 2 - 0.4, -SIZE / 2 - 0.4], [SIZE / 2 + 0.4, -SIZE / 2 - 0.4], [SIZE / 2 + 0.4, SIZE / 2 + 0.4], [-SIZE / 2 - 0.4, SIZE / 2 + 0.4]], base: -0.05, height: 0.05, color: 0x2a3326 }];
    const blocks: PrismItem[] = [];
    const water: PrismItem[] = [];
    // 街区：格子の各セル（4隅の交差点）を少し縮めた四角形。建物は四辺の道路ごとに1棟
    const bldRefs: { e: number; x: number; z: number; ry: number; s: number }[] = [];
    const edgeOf = new Map<string, number>();
    for (let e = 0; e < E; e++) edgeOf.set(`${Math.min(ea[e], eb[e])},${Math.max(ea[e], eb[e])}`, e);
    const findE = (a: number, b: number) => edgeOf.get(`${Math.min(a, b)},${Math.max(a, b)}`) ?? -1;
    for (let j = 0; j < n - 1; j++)
      for (let i = 0; i < n - 1; i++) {
        const q = [j * n + i, j * n + i + 1, (j + 1) * n + i + 1, (j + 1) * n + i];
        const pts = q.map((v) => pos[v]);
        const cx = pts.reduce((a, b) => a + b[0], 0) / 4, cz = pts.reduce((a, b) => a + b[1], 0) / 4;
        const shrink = (k: number) => pts.map(([x, z]) => [cx + (x - cx) * k, cz + (z - cz) * k] as V2);
        if (!q.every((v) => alive[v])) {
          if (q.some((v) => !alive[v])) water.push({ pts: pts, base: -0.02, height: 0.02, color: 0x2b5f9a });
          continue;
        }
        blocks.push({ pts: shrink(0.8), base: 0, height: 0.03, color: 0x8d8a7c, side: 0x6f6c60 });
        for (let k = 0; k < 4; k++) {
          const e = findE(q[k], q[(k + 1) % 4]);
          const a = pts[k], b = pts[(k + 1) % 4];
          const mx = (a[0] + b[0]) / 2, mz = (a[1] + b[1]) / 2;
          // 辺の中点から街区の中心へ少し入った位置
          const x = mx + (cx - mx) * 0.4, z = mz + (cz - mz) * 0.4;
          bldRefs.push({ e, x, z, ry: Math.atan2(-(b[1] - a[1]), b[0] - a[0]), s: sp * 0.3 });
        }
      }
    object.add(prismMesh(ground));
    if (water.length) object.add(prismMesh(water));
    object.add(prismMesh(blocks));

    const unit = new THREE.BoxGeometry(1, 1, 1);
    unit.translate(0, 0.5, 0);
    const roads = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.75 }), Math.max(1, E));
    roads.count = E;
    const blds = new THREE.InstancedMesh(unit, new THREE.MeshStandardMaterial({ roughness: 0.7 }), Math.max(1, bldRefs.length));
    blds.count = bldRefs.length;
    object.add(roads, blds);
    const hubBatch = new BoxBatch();
    hubs.forEach((h, k) => hubBatch.addOnGround(pos[h][0], pos[h][1], 0.22, 0.25 + wts[k] * 0.18, 0.22, 0xff4fa3));
    object.add(hubBatch.build(new THREE.MeshStandardMaterial({ roughness: 0.4, emissive: 0x3a0020 }), new THREE.CylinderGeometry(0.5, 0.5, 1, 14)));

    const load = new Float64Array(E);
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v1 = new THREE.Vector3(), v2 = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();
    const CLS = [0x8a8f9c, 0xffd23f, 0xff7a2f];
    let nArt = 0, nCol = 0, maxLoad = 0;
    const refresh = (trunk: number) => {
      maxLoad = 0;
      for (let e = 0; e < E; e++) maxLoad = Math.max(maxLoad, load[e]);
      const order = Array.from({ length: E }, (_, e) => e).filter((e) => load[e] > 0).sort((a, b) => load[b] - load[a]);
      const cls = new Uint8Array(E);
      const nA = Math.round(E * trunk), nC = Math.round(E * trunk * 2);
      order.forEach((e, r) => (cls[e] = r < nA ? 2 : r < nA + nC ? 1 : 0));
      nArt = Math.min(nA, order.length);
      nCol = Math.max(0, Math.min(nC, order.length - nA));
      for (let e = 0; e < E; e++) {
        const [x0, z0] = pos[ea[e]], [x1, z1] = pos[eb[e]];
        const len = Math.hypot(x1 - x0, z1 - z0);
        const t = maxLoad > 0 ? Math.sqrt(load[e] / maxLoad) : 0;
        const w = 0.05 + 0.2 * t + (cls[e] === 2 ? 0.04 : 0);
        q4.setFromAxisAngle(up, Math.atan2(-(z1 - z0), x1 - x0));
        m4.compose(v1.set((x0 + x1) / 2, 0.012 + cls[e] * 0.004, (z0 + z1) / 2), q4, v2.set(len + w * 0.9, 0.02, w));
        roads.setMatrixAt(e, m4);
        roads.setColorAt(e, col.set(CLS[cls[e]]));
      }
      roads.instanceMatrix.needsUpdate = true;
      if (roads.instanceColor) roads.instanceColor.needsUpdate = true;
      bldRefs.forEach((b, k) => {
        const t = b.e >= 0 && maxLoad > 0 ? load[b.e] / maxLoad : 0;
        const h = 0.06 + 1.1 * t * t + 0.05 * ((k * 7919) % 5) / 5;
        q4.setFromAxisAngle(up, b.ry);
        m4.compose(v1.set(b.x, 0.03, b.z), q4, v2.set(b.s * 1.4, h, b.s));
        blds.setMatrixAt(k, m4);
        blds.setColorAt(k, col.setHSL(0.6 - 0.55 * t, 0.25 + 0.4 * t, 0.62 - 0.1 * t));
      });
      blds.instanceMatrix.needsUpdate = true;
      if (blds.instanceColor) blds.instanceColor.needsUpdate = true;
      roads.computeBoundingSphere();
      blds.computeBoundingSphere();
    };
    refresh(Number(p.trunk));

    // 今足した経路の強調
    const curGeo = new THREE.BufferGeometry();
    const curPos = new Float32Array(n * n * 6);
    curGeo.setAttribute('position', new THREE.BufferAttribute(curPos, 3));
    curGeo.setDrawRange(0, 0);
    const cur = new THREE.LineSegments(curGeo, new THREE.LineBasicMaterial({ color: 0x5ff3ff }));
    cur.frustumCulled = false;
    const helpers = new THREE.Group();
    helpers.add(cur);

    // 比較：一様な道路網
    const before = new THREE.Group();
    before.add(prismMesh(ground));
    if (water.length) before.add(prismMesh(water));
    before.add(prismMesh(blocks));
    const lp: number[] = [];
    for (let e = 0; e < E; e++) lp.push(pos[ea[e]][0], 0.04, pos[ea[e]][1], pos[eb[e]][0], 0.04, pos[eb[e]][1]);
    before.add(segments(lp, 0xb8bcc8));
    before.add(hubBatch.build(new THREE.MeshStandardMaterial({ roughness: 0.4 }), new THREE.CylinderGeometry(0.5, 0.5, 1, 14)));

    let shown = 0, applied = 0, lastTrunk = Number(p.trunk);
    return {
      object,
      before,
      helpers,
      info: () => `経路 ${applied}/${paths.length} · 拠点 ${hubs.length} · 道路 ${E} 本（幹線 ${nArt} / 補助幹線 ${nCol}） · 最大通過回数 ${maxLoad}`,
      update(dt, _t, live) {
        const trunk = Number(live.trunk);
        let changed = trunk !== lastTrunk;
        lastTrunk = trunk;
        if (applied < paths.length) {
          shown = Math.min(paths.length, shown + dt * Number(live.speed));
          while (applied < Math.floor(shown)) {
            const path = paths[applied++];
            for (const e of path) load[e]++;
            let k = 0;
            for (const e of path) {
              curPos.set([pos[ea[e]][0], 0.08, pos[ea[e]][1], pos[eb[e]][0], 0.08, pos[eb[e]][1]], k);
              k += 6;
            }
            curGeo.setDrawRange(0, k / 3);
            curGeo.attributes.position.needsUpdate = true;
            changed = true;
          }
        } else cur.visible = false;
        if (changed) refresh(trunk);
      },
    };
  },
});
