import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { defineGeometryDemo } from '../framework/sceneLab';
import { makeRng } from '../framework/random';

/** GEO-010 ゾーン多面体：生成ベクトル（線分）のミンコフスキー和＝ 2^k 個の部分和の凸包 */

const phi = (1 + Math.sqrt(5)) / 2;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).normalize();

function generators(kind: string, k: number, seed: number): THREE.Vector3[] {
  switch (kind) {
    case 'cube':
      return [V(1, 0, 0), V(0, 1, 0), V(0, 0, 1)];
    case 'rhombicDodeca':
      return [V(1, 1, 1), V(1, -1, -1), V(-1, 1, -1), V(-1, -1, 1)];
    case 'truncOcta':
      return [V(1, 1, 0), V(1, -1, 0), V(1, 0, 1), V(1, 0, -1), V(0, 1, 1), V(0, 1, -1)];
    case 'rhombicIcosa':
      return [V(0, 1, phi), V(0, -1, phi), V(1, phi, 0), V(-1, phi, 0), V(phi, 0, 1)];
    case 'triaconta':
      return [V(0, 1, phi), V(0, -1, phi), V(1, phi, 0), V(-1, phi, 0), V(phi, 0, 1), V(-phi, 0, 1)];
    case 'prism': {
      // 平面内の k−1 本＋縦1本 → 2(k−1) 角柱
      const out: THREE.Vector3[] = [new THREE.Vector3(0, 1, 0)];
      for (let i = 0; i < k - 1; i++) {
        const a = (i / (k - 1)) * Math.PI;
        out.push(new THREE.Vector3(Math.cos(a), 0, Math.sin(a)));
      }
      return out;
    }
    default: {
      const rnd = makeRng(seed);
      const out: THREE.Vector3[] = [];
      for (let i = 0; i < k; i++) {
        const z = rnd() * 2 - 1, a = rnd() * Math.PI * 2, s = Math.sqrt(1 - z * z);
        out.push(new THREE.Vector3(s * Math.cos(a), z, s * Math.sin(a)).multiplyScalar(0.7 + rnd() * 0.6));
      }
      return out;
    }
  }
}

const HUES = [0.0, 0.08, 0.15, 0.3, 0.45, 0.55, 0.62, 0.72, 0.82, 0.9];

export default defineGeometryDemo({
  id: 'GEO-010',
  notes: '生成ベクトル g1..gk の 2^k 通りの部分和（各線分の端点の選び方すべて）を作り、その凸包を ConvexGeometry（Quickhull）で求める＝線分のミンコフスキー和。各面は2本の生成ベクトルが張る平行四辺形なので、面の法線が gi×gj と平行になる組 (i,j) ごとに色を付ける。一般の向きなら面数は k(k−1)。',
  params: [
    { key: 'set', label: '生成ベクトル', type: 'select', options: [
      { value: 'cube', label: '直交3本 → 立方体' },
      { value: 'rhombicDodeca', label: '立方体の対角線4本 → 菱形十二面体' },
      { value: 'truncOcta', label: '面対角線6本 → 切頂八面体' },
      { value: 'rhombicIcosa', label: '二十面体の軸5本 → 菱形二十面体' },
      { value: 'triaconta', label: '二十面体の軸6本 → 菱形三十面体' },
      { value: 'prism', label: '平面 k−1 本＋縦1本 → 角柱' },
      { value: 'random', label: 'ランダム k 本' },
    ], default: 'triaconta' },
    { key: 'k', label: 'ベクトル数 k（ランダム・角柱）', type: 'number', min: 3, max: 10, step: 1, default: 6 },
    { key: 'stretch', label: '伸縮（g1 の長さ）', type: 'number', min: 0.2, max: 3, step: 0.01, default: 1 },
    { key: 'seed', label: '乱数シード（ランダム）', type: 'number', min: 1, max: 999, step: 1, default: 7 },
    { key: 'showGen', label: '生成ベクトルを表示', type: 'bool', default: true },
  ],
  distance: 8,
  compareLabels: ['生成ベクトル（線分）', 'ミンコフスキー和'],
  build(p, env) {
    const k = Math.min(Math.round(Number(p.k)), env.quality === 'low' ? 8 : 10);
    const gens = generators(String(p.set), k, Number(p.seed)).map((g) => g.clone());
    gens[0].multiplyScalar(Number(p.stretch));
    const n = gens.length;
    // 2^n 個の部分和（原点中心にするため全体の半分を引く）
    const half = gens.reduce((s, g) => s.add(g), new THREE.Vector3()).multiplyScalar(0.5);
    const pts: THREE.Vector3[] = [];
    for (let m = 0; m < 1 << n; m++) {
      const v = new THREE.Vector3().sub(half);
      for (let i = 0; i < n; i++) if (m & (1 << i)) v.add(gens[i]);
      pts.push(v);
    }
    const hull = new ConvexGeometry(pts);
    const geo = hull.toNonIndexed();
    hull.dispose();
    // 三角形の法線から、どの (i,j) の平行四辺形かを判定して色分け
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const col = new Float32Array(pos.count * 3);
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), nrm = new THREE.Vector3(), cr = new THREE.Vector3();
    const planes: [THREE.Vector3, number][] = [];
    const pairs: [number, number, THREE.Vector3][] = [];
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const v = new THREE.Vector3().crossVectors(gens[i], gens[j]);
      if (v.lengthSq() > 1e-10) pairs.push([i, j, v.normalize()]);
    }
    const color = new THREE.Color();
    for (let t = 0; t < pos.count; t += 3) {
      a.fromBufferAttribute(pos, t); b.fromBufferAttribute(pos, t + 1); c.fromBufferAttribute(pos, t + 2);
      nrm.crossVectors(cr.subVectors(b, a), c.clone().sub(a)).normalize();
      let best = 0, bi = 0;
      pairs.forEach(([, , v], pi) => {
        const d = Math.abs(v.dot(nrm));
        if (d > best) { best = d; bi = pi; }
      });
      const [i, j] = pairs[bi] ?? [0, 1];
      color.setHSL(HUES[(i * 3 + j) % HUES.length], 0.6, 0.45 + 0.15 * ((i + j) % 2));
      for (let q = 0; q < 3; q++) col.set([color.r, color.g, color.b], (t + q) * 3);
      const d = nrm.dot(a);
      if (!planes.some(([pn, pd]) => pn.dot(nrm) > 0.9995 && Math.abs(pd - d) < 1e-3)) planes.push([nrm.clone(), d]);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.45 }));
    // 入力：原点を中心とした生成線分
    const segPts: number[] = [];
    gens.forEach((g) => segPts.push(-g.x / 2, -g.y / 2, -g.z / 2, g.x / 2, g.y / 2, g.z / 2));
    const segGeo = new THREE.BufferGeometry();
    segGeo.setAttribute('position', new THREE.Float32BufferAttribute(segPts, 3));
    const before = new THREE.LineSegments(segGeo, new THREE.LineBasicMaterial({ color: 0xffd24c }));
    let helpers: THREE.Object3D | undefined;
    if (p.showGen) {
      // 最下点の頂点から生成ベクトルを矢印で示す
      const grp = new THREE.Group();
      const corner = new THREE.Vector3().sub(half);
      const lp: number[] = [];
      const lc: number[] = [];
      const cones = new THREE.InstancedMesh(new THREE.ConeGeometry(0.06, 0.18, 10).translate(0, -0.09, 0), new THREE.MeshBasicMaterial({ depthTest: false }), n);
      cones.renderOrder = 10;
      const up = new THREE.Vector3(0, 1, 0);
      gens.forEach((g, i) => {
        const tip = corner.clone().add(g);
        const cc = new THREE.Color().setHSL(i / n, 0.85, 0.6);
        lp.push(corner.x, corner.y, corner.z, tip.x, tip.y, tip.z);
        lc.push(cc.r, cc.g, cc.b, cc.r, cc.g, cc.b);
        const q = new THREE.Quaternion().setFromUnitVectors(up, g.clone().normalize());
        cones.setMatrixAt(i, new THREE.Matrix4().compose(tip, q, new THREE.Vector3(1, 1, 1)));
        cones.setColorAt(i, cc);
      });
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      lg.setAttribute('color', new THREE.Float32BufferAttribute(lc, 3));
      const ln = new THREE.LineSegments(lg, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false }));
      ln.renderOrder = 10;
      grp.add(ln, cones);
      helpers = grp;
    }
    return {
      object: mesh,
      before,
      helpers,
      info: `k=${n} · 部分和 ${pts.length} 点 · 面（平面）数 ${planes.length}（一般の向きなら k(k−1)=${n * (n - 1)}）`,
    };
  },
});
