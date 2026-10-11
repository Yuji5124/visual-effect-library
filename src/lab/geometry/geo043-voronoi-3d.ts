import * as THREE from 'three';
import { ConvexGeometry } from 'three/examples/jsm/geometries/ConvexGeometry.js';
import { defineGeometryDemo } from '../framework/sceneLab';

/** GEO-043 3Dボロノイ：外枠の箱を、近い母点との垂直二等分平面で順に切り落としてセルを作る */
type Face = THREE.Vector3[];

function boxFaces(h: number): Face[] {
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x * h, y * h, z * h);
  return [
    [v(1, -1, -1), v(1, 1, -1), v(1, 1, 1), v(1, -1, 1)],
    [v(-1, -1, -1), v(-1, -1, 1), v(-1, 1, 1), v(-1, 1, -1)],
    [v(-1, 1, -1), v(-1, 1, 1), v(1, 1, 1), v(1, 1, -1)],
    [v(-1, -1, -1), v(1, -1, -1), v(1, -1, 1), v(-1, -1, 1)],
    [v(-1, -1, 1), v(1, -1, 1), v(1, 1, 1), v(-1, 1, 1)],
    [v(-1, -1, -1), v(-1, 1, -1), v(1, 1, -1), v(1, -1, -1)],
  ];
}

/** 凸多面体（面のリスト）を半空間 n·x ≤ d で切る。切り口には新しい面を張る */
function clip(faces: Face[], n: THREE.Vector3, d: number): Face[] {
  const out: Face[] = [];
  const cut: THREE.Vector3[] = [];
  for (const f of faces) {
    const poly: THREE.Vector3[] = [];
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const da = n.dot(a) - d, db = n.dot(b) - d;
      if (da <= 0) poly.push(a);
      if (da <= 0 !== db <= 0) {
        const q = a.clone().lerp(b, da / (da - db));
        poly.push(q);
        // 辺は2つの面に共有されるので、同じ交点は1度だけ切り口に加える
        if (!cut.some((c) => c.distanceToSquared(q) < 1e-12)) cut.push(q);
      }
    }
    if (poly.length >= 3) out.push(poly);
  }
  if (cut.length >= 3) {
    const cen = cut.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(cut.length);
    const u = new THREE.Vector3().subVectors(cut[0], cen).normalize();
    const w = new THREE.Vector3().crossVectors(n, u);
    const ang = (v: THREE.Vector3) => {
      const t = v.clone().sub(cen);
      return Math.atan2(t.dot(w), t.dot(u));
    };
    out.push(cut.sort((a, b) => ang(a) - ang(b)));
  }
  return out;
}

export default defineGeometryDemo({
  id: 'GEO-043',
  notes: '母点ごとに外枠の箱（6平面）から始め、近い順に他の母点との垂直二等分平面で凸多面体を切り落とす（半空間の共通部分）。これ以上どの平面も届かない距離に来たら打ち切り、残った頂点を ConvexGeometry でメッシュ化する。セルの縮小・分解で内部の詰まり方が見える。',
  params: [
    { key: 'count', label: '母点の数', type: 'number', min: 2, max: 150, step: 1, default: 40 },
    { key: 'shrink', label: 'セルの縮小', type: 'number', min: 0.3, max: 1, step: 0.01, default: 0.9 },
    { key: 'explode', label: '分解（外へ離す）', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.25 },
    { key: 'distribution', label: '母点の配置', type: 'select', options: [{ value: 'uniform', label: '一様乱数' }, { value: 'center', label: '中心に集中' }, { value: 'layer', label: '上下の層' }], default: 'uniform' },
    { key: 'seed', label: 'シード', type: 'number', min: 1, max: 9999, step: 1, default: 1 },
  ],
  liveKeys: ['shrink', 'explode'],
  distance: 8,
  compareLabels: ['母点と外枠', 'ボロノイセル'],
  build(p, env) {
    const rng = env.rng;
    let n = Number(p.count);
    if (env.quality === 'low') n = Math.min(n, 80);
    const H = 1.6;
    const dist = String(p.distribution);
    const seeds: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
      if (dist === 'center') v.multiplyScalar(Math.pow(rng(), 0.8));
      if (dist === 'layer') v.y = (rng() < 0.5 ? -0.7 : 0.7) + (rng() - 0.5) * 0.25;
      seeds.push(v.multiplyScalar(H * 0.98));
    }
    const t0 = performance.now();
    const object = new THREE.Group();
    const cells: { mesh: THREE.Mesh; c: THREE.Vector3 }[] = [];
    let planes = 0;
    const color = new THREE.Color();
    const nrm = new THREE.Vector3();
    seeds.forEach((s, i) => {
      let faces = boxFaces(H);
      const others = seeds.map((o, j) => ({ o, j, d: o.distanceTo(s) })).filter((x) => x.j !== i).sort((a, b) => a.d - b.d);
      for (const { o, d } of others) {
        // セルの最遠頂点までの距離の2倍より遠い母点の平面はセルに届かない
        let rmax = 0;
        for (const f of faces) for (const v of f) rmax = Math.max(rmax, v.distanceToSquared(s));
        if (d > 2 * Math.sqrt(rmax)) break;
        nrm.subVectors(o, s).normalize();
        faces = clip(faces, nrm, nrm.dot(new THREE.Vector3().addVectors(o, s).multiplyScalar(0.5)));
        planes++;
        if (faces.length < 4) break;
      }
      const pts: THREE.Vector3[] = [];
      for (const f of faces) for (const v of f) if (!pts.some((q) => q.distanceToSquared(v) < 1e-10)) pts.push(v);
      if (pts.length < 4) return;
      const c = pts.reduce((a, v) => a.add(v), new THREE.Vector3()).divideScalar(pts.length);
      const geo = new ConvexGeometry(pts.map((v) => v.clone().sub(c)));
      color.setHSL((i * 0.618) % 1, 0.55, 0.6);
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.55, flatShading: true }));
      object.add(mesh);
      cells.push({ mesh, c });
    });
    const ms = performance.now() - t0;

    const dotGeo = new THREE.SphereGeometry(0.05, 8, 6);
    const mkSeeds = () => {
      const d = new THREE.InstancedMesh(dotGeo.clone(), new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
      const m = new THREE.Matrix4();
      seeds.forEach((v, i) => d.setMatrixAt(i, m.makeTranslation(v.x, v.y, v.z)));
      return d;
    };
    const frame = () => new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * H, 2 * H, 2 * H)), new THREE.LineBasicMaterial({ color: 0x4a5080 }));
    const before = new THREE.Group();
    before.add(mkSeeds(), frame());
    const helpers = new THREE.Group();
    const seedDots = mkSeeds();
    helpers.add(seedDots, frame());
    dotGeo.dispose();

    let lastS = -1, lastE = -1;
    const apply = (shrink: number, explode: number) => {
      for (const { mesh, c } of cells) {
        mesh.position.copy(c).multiplyScalar(1 + explode);
        mesh.scale.setScalar(shrink);
      }
      const m = new THREE.Matrix4();
      seeds.forEach((v, i) => seedDots.setMatrixAt(i, m.makeTranslation(v.x * (1 + explode), v.y * (1 + explode), v.z * (1 + explode))));
      seedDots.instanceMatrix.needsUpdate = true;
      seedDots.computeBoundingSphere();
      lastS = shrink;
      lastE = explode;
    };
    apply(Number(p.shrink), Number(p.explode));
    return {
      object,
      before,
      helpers,
      info: `セル ${cells.length} · 切断に使った平面 ${planes}（全組合せ ${n * (n - 1)}） · ${ms.toFixed(0)}ms`,
      update(_dt, _t, live) {
        const s = Number(live.shrink), e = Number(live.explode);
        if (s !== lastS || e !== lastE) apply(s, e);
      },
    };
  },
});
