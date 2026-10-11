import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { TreeSet, nearestDistances, poissonDisk, ringLines, uniformPoints, type P2 } from '../framework/natureKit';

/** WRD-021 ポアソンディスク配置の森：Bridson 法と一様ランダム配置を同じ本数で左右に並べる */
export default defineWorldDemo({
  id: 'WRD-021',
  notes: '右は Bridson 法（活性点の r〜2r の環から k 回候補を試し、セル幅 r/√2 の格子で近傍判定）、左は同じ本数の一様ランダム配置。各木に半径 r/2 の円を描くので、ポアソンディスクでは円が重ならず、ランダムでは重なり（赤）と空白ができるのが見える。再生をオンにすると採用順に木が生える。',
  params: [
    { key: 'r', label: '最小距離 r', type: 'number', min: 0.2, max: 1.2, step: 0.01, default: 0.5 },
    { key: 'k', label: '試行回数 k', type: 'number', min: 1, max: 60, step: 1, default: 30 },
    { key: 'circles', label: '最小距離の円を表示', type: 'bool', default: true },
    { key: 'replay', label: '採用順に生える様子を再生', type: 'bool', default: true },
  ],
  liveKeys: ['circles', 'replay'],
  distance: 15,
  elevation: 0.95,
  build(p, env) {
    const r = Number(p.r), k = Number(p.k);
    const S = 7.5, gap = 4.4;
    const max = env.quality === 'low' ? 1500 : 4000;
    const pd = poissonDisk(env.rng, S, S, r, k, max);
    const un = uniformPoints(env.rng, S, S, pd.length);
    const nnP = nearestDistances(pd, r);
    const nnU = nearestDistances(un, r);
    const object = new THREE.Group();
    const helpers = new THREE.Group();
    const sets: TreeSet[] = [];
    const add = (pts: P2[], nn: Float32Array, cx: number, ground: number, bad: boolean) => {
      const plate = new THREE.Mesh(new THREE.BoxGeometry(S + 0.3, 0.08, S + 0.3), new THREE.MeshStandardMaterial({ color: ground, roughness: 0.95 }));
      plate.position.set(cx, -0.04, 0);
      object.add(plate);
      const trees = new TreeSet(pts.length, 'cone');
      const green = new THREE.Color();
      pts.forEach((q, i) => {
        const h = r * (1.5 + env.rng() * 0.6);
        const tooClose = bad && nn[i] < r;
        green.setHSL(0.3 + env.rng() * 0.06, 0.55, tooClose ? 0.3 : 0.32 + env.rng() * 0.08);
        trees.put(cx + q.x - S / 2, 0, q.y - S / 2, h, r * 0.42, tooClose ? 0xc8553d : green, 0x6b4a2f, env.rng() * 6);
      });
      trees.commit();
      object.add(trees.group);
      sets.push(trees);
      const rings = ringLines(
        pts.map((q) => ({ x: cx + q.x - S / 2, z: q.y - S / 2, r: r / 2 })),
        0.03,
        (i) => new THREE.Color(nn[i] < r ? 0xff4d4d : 0xfff2b0),
        18,
      );
      helpers.add(rings);
    };
    add(un, nnU, -(S / 2 + gap / 2), 0x4a3b2a, true);
    add(pd, nnP, S / 2 + gap / 2, 0x2f4a26, false);
    const violations = Array.from(nnU).filter((d) => d < r).length;
    const mean = (a: Float32Array) => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
    const minP = nnP.length ? Math.min(...nnP) : 0;
    const total = pd.length;
    let shown = total;
    return {
      object,
      helpers,
      info: () =>
        `左=一様ランダム / 右=ポアソンディスク · ${shown}/${total} 本 · r 未満の近接（ランダム）${violations} 本 · 平均最近傍 ランダム ${mean(nnU).toFixed(2)} / PD ${mean(nnP).toFixed(2)}（PD最小 ${minP.toFixed(2)} ≥ r）`,
      update(_dt, time, live) {
        helpers.visible = Boolean(live.circles);
        shown = live.replay ? Math.min(total, Math.floor((time / 5) * total)) : total;
        for (const s of sets) {
          s.trunks.mesh.count = shown;
          s.crowns.mesh.count = shown;
        }
        // 円も同じ数だけ描く
        for (const l of helpers.children as THREE.LineSegments[]) l.geometry.setDrawRange(0, shown * 18 * 2);
      },
    };
  },
});
