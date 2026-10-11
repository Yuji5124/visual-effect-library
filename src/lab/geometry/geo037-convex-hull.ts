import * as THREE from 'three';
import { ConvexHull } from 'three/examples/jsm/math/ConvexHull.js';
import { defineGeometryDemo, std } from '../framework/sceneLab';

/** GEO-037 凸包：動く点群に毎フレーム Quickhull（three.js の ConvexHull）を掛け、凸包の頂点と内部の点を色分けする */
export default defineGeometryDemo({
  id: 'GEO-037',
  notes: '動く点群に毎フレーム three.js の ConvexHull（Quickhull）を掛け、面を三角形メッシュにする。凸包の頂点になった点は橙、内側の点は青。「1点ずつ追加」をオンにすると点を順に加え、外側の点が来たときだけ凸包が張り替わる様子を追える。',
  params: [
    { key: 'count', label: '点の数', type: 'number', min: 4, max: 600, step: 1, default: 120 },
    { key: 'distribution', label: '分布', type: 'select', options: [{ value: 'ball', label: '球の内部' }, { value: 'cube', label: '立方体の内部' }, { value: 'gauss', label: '正規分布' }, { value: 'shell', label: '球面付近' }], default: 'ball' },
    { key: 'motion', label: '点の動き（速さ）', type: 'number', min: 0, max: 2, step: 0.01, default: 0.6 },
    { key: 'incremental', label: '1点ずつ追加して凸包を更新', type: 'bool', default: false },
    { key: 'seed', label: 'シード', type: 'number', min: 1, max: 9999, step: 1, default: 1 },
  ],
  liveKeys: ['motion', 'incremental'],
  distance: 8,
  compareLabels: ['点群', '凸包'],
  build(p, env) {
    const rng = env.rng;
    let n = Number(p.count);
    if (env.quality === 'low') n = Math.min(n, 300);
    const dist = String(p.distribution);
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    const base: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3();
      if (dist === 'cube') v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1).multiplyScalar(1.6);
      else if (dist === 'gauss') v.set(gauss(), gauss(), gauss()).multiplyScalar(0.7);
      else {
        do v.set(rng() * 2 - 1, rng() * 2 - 1, rng() * 2 - 1);
        while (v.lengthSq() > 1 || v.lengthSq() < 1e-4);
        if (dist === 'shell') v.setLength(1.6 + (rng() - 0.5) * 0.25);
        else v.multiplyScalar(1.9);
      }
      base.push(v);
    }
    // 各点は自分の周波数・位相で小さな軌道を描く
    const phase = base.map(() => [rng() * 6.28, rng() * 6.28, rng() * 6.28, 0.6 + rng()]);
    const pts = base.map((v) => v.clone());
    const indexOf = new Map(pts.map((v, i) => [v, i] as const));

    const maxTri = 2 * n;
    const posArr = new Float32Array(maxTri * 9);
    const nrmArr = new Float32Array(maxTri * 9);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(posArr, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nrmArr, 3).setUsage(THREE.DynamicDrawUsage));
    const hullMesh = new THREE.Mesh(geo, std(0xffb84d, { transparent: true, opacity: 0.45, side: THREE.DoubleSide, depthWrite: false, flatShading: true }));
    const edges = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd28a }));
    const edgeArr = new Float32Array(maxTri * 18);
    edges.geometry.setAttribute('position', new THREE.BufferAttribute(edgeArr, 3).setUsage(THREE.DynamicDrawUsage));

    const dotGeo = new THREE.IcosahedronGeometry(0.045, 1);
    const dots = new THREE.InstancedMesh(dotGeo, new THREE.MeshStandardMaterial({ roughness: 0.4 }), n);
    const object = new THREE.Group();
    object.add(hullMesh, edges, dots);
    const beforeDots = new THREE.InstancedMesh(dotGeo.clone(), new THREE.MeshStandardMaterial({ color: 0x9ab0e0 }), n);
    const m = new THREE.Matrix4();
    base.forEach((v, i) => beforeDots.setMatrixAt(i, m.makeTranslation(v.x, v.y, v.z)));

    const cHull = new THREE.Color(0xff8a2a);
    const cIn = new THREE.Color(0x4a8cff);
    const cHidden = new THREE.Color(0x30344a);
    const onHull = new Uint8Array(n);
    const hull = new ConvexHull();
    let hullCount = 0, faceCount = 0, ms = 0, active = n;
    let prevTri = 0, prevEc = 0;
    let incT = 0;

    const recompute = (k: number) => {
      const t0 = performance.now();
      onHull.fill(0);
      let tri = 0;
      if (k >= 4) {
        hull.setFromPoints(pts.slice(0, k));
        for (const face of hull.faces) {
          // 面は凸多角形なので扇形に三角形化する
          const ring: THREE.Vector3[] = [];
          let e = face.edge;
          do {
            ring.push(e.head().point);
            e = e.next;
          } while (e !== face.edge);
          for (let j = 1; j + 1 < ring.length && tri < maxTri; j++) {
            const o = tri * 9;
            [ring[0], ring[j], ring[j + 1]].forEach((q, s) => {
              posArr[o + s * 3] = q.x; posArr[o + s * 3 + 1] = q.y; posArr[o + s * 3 + 2] = q.z;
              nrmArr[o + s * 3] = face.normal.x; nrmArr[o + s * 3 + 1] = face.normal.y; nrmArr[o + s * 3 + 2] = face.normal.z;
            });
            tri++;
          }
        }
        // 頂点に使われた点に印を付ける（VertexNode.point は元の点への参照）
        for (const face of hull.faces) {
          let e = face.edge;
          do {
            const idx = indexOf.get(e.head().point);
            if (idx !== undefined) onHull[idx] = 1;
            e = e.next;
          } while (e !== face.edge);
        }
        faceCount = hull.faces.length;
      } else faceCount = 0;
      // 凸包の辺（半辺構造をたどる）
      let ec = 0;
      for (const face of k >= 4 ? hull.faces : []) {
        let e = face.edge;
        do {
          const a = e.tail().point, b = e.head().point;
          if (ec < maxTri * 3) {
            edgeArr.set([a.x, a.y, a.z, b.x, b.y, b.z], ec * 6);
            ec++;
          }
          e = e.next;
        } while (e !== face.edge);
      }
      // 書き出し時に古い三角形が残らないよう、使わなくなった末尾を潰す
      if (tri < prevTri) {
        posArr.fill(0, tri * 9, prevTri * 9);
        nrmArr.fill(0, tri * 9, prevTri * 9);
      }
      prevTri = tri;
      if (ec < prevEc) edgeArr.fill(0, ec * 6, prevEc * 6);
      prevEc = ec;
      geo.setDrawRange(0, tri * 3);
      geo.attributes.position.needsUpdate = true;
      geo.attributes.normal.needsUpdate = true;
      geo.computeBoundingSphere();
      edges.geometry.setDrawRange(0, ec * 2);
      edges.geometry.attributes.position.needsUpdate = true;
      edges.geometry.computeBoundingSphere();
      hullCount = 0;
      for (let i = 0; i < n; i++) {
        dots.setMatrixAt(i, m.makeTranslation(pts[i].x, pts[i].y, pts[i].z));
        dots.setColorAt(i, i >= k ? cHidden : onHull[i] ? cHull : cIn);
        if (i < k) hullCount += onHull[i];
      }
      dots.instanceMatrix.needsUpdate = true;
      if (dots.instanceColor) dots.instanceColor.needsUpdate = true;
      dots.computeBoundingSphere();
      ms = performance.now() - t0;
    };
    recompute(n);

    let time = 0;
    return {
      object,
      before: beforeDots,
      info: () => `凸包の頂点 ${hullCount}/${active} 点 · 面 ${faceCount} · 計算 ${ms.toFixed(2)}ms`,
      update(dt, _t, live) {
        const speed = Number(live.motion);
        time += dt * speed;
        if (speed > 0) {
          for (let i = 0; i < n; i++) {
            const [a, b, c, f] = phase[i];
            const r = 0.25;
            pts[i].set(base[i].x + r * Math.sin(time * f + a), base[i].y + r * Math.sin(time * f * 1.3 + b), base[i].z + r * Math.sin(time * f * 0.7 + c));
          }
        }
        if (live.incremental) {
          incT += dt;
          // 約6秒で全点を追加し、少し待って最初から
          const dur = 6;
          active = Math.min(n, 4 + Math.floor((incT / dur) * (n - 4)));
          if (incT > dur + 1.5) incT = 0;
        } else {
          incT = 0;
          active = n;
        }
        if (speed > 0 || live.incremental || active !== n) recompute(active);
      },
    };
  },
});
