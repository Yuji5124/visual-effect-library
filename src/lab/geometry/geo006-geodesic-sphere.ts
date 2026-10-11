import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';
import { platonic } from '../framework/polyhedra';

/** GEO-006 ジオデシック球：正二十面体の各面を周波数 ν で ν² 個に分け、頂点を球へ射影する */

interface Geodesic {
  flat: THREE.Vector3[];
  tris: number[];
  valence: number[];
}

function subdivideIcosa(nu: number): Geodesic {
  const ico = platonic('I');
  const flat: THREE.Vector3[] = [];
  const map = new Map<string, number>();
  // 共有辺上の点は、元の頂点番号と重心座標から作る鍵で統合する（位置ハッシュ）
  const vid = (p: THREE.Vector3) => {
    const k = `${Math.round(p.x * 1e5)},${Math.round(p.y * 1e5)},${Math.round(p.z * 1e5)}`;
    let i = map.get(k);
    if (i === undefined) {
      i = flat.length;
      flat.push(p);
      map.set(k, i);
    }
    return i;
  };
  const tris: number[] = [];
  for (const f of ico.faces) {
    const [A, B, C] = f.map((i) => ico.verts[i]);
    const grid: number[][] = [];
    for (let i = 0; i <= nu; i++) {
      const row: number[] = [];
      for (let j = 0; j <= nu - i; j++) {
        // 重心座標 (ν−i−j, i, j)/ν
        const p = new THREE.Vector3()
          .addScaledVector(A, (nu - i - j) / nu)
          .addScaledVector(B, i / nu)
          .addScaledVector(C, j / nu);
        row.push(vid(p));
      }
      grid.push(row);
    }
    for (let i = 0; i < nu; i++) {
      for (let j = 0; j < nu - i; j++) {
        tris.push(grid[i][j], grid[i + 1][j], grid[i][j + 1]);
        if (j < nu - i - 1) tris.push(grid[i + 1][j], grid[i + 1][j + 1], grid[i][j + 1]);
      }
    }
  }
  // 価数＝接続する辺の数
  const edges = new Set<string>();
  for (let t = 0; t < tris.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = tris[t + e], b = tris[t + ((e + 1) % 3)];
      edges.add(a < b ? `${a}_${b}` : `${b}_${a}`);
    }
  }
  const valence = new Array(flat.length).fill(0);
  for (const e of edges) {
    const [a, b] = e.split('_').map(Number);
    valence[a]++;
    valence[b]++;
  }
  return { flat, tris, valence };
}

export default defineGeometryDemo({
  id: 'GEO-006',
  notes: '正二十面体の各三角形に重心座標の格子点を作り、共有辺上の点を位置ハッシュで統合してから球へ正規化する（射影率で平らな二十面体との間を補間）。辺の集合から各頂点の価数を数えて色分けし、価数5（赤）が ν によらず常に12個、残りは価数6になることと、頂点数 10ν²+2 を確認できる。',
  params: [
    { key: 'nu', label: '分割周波数 ν', type: 'number', min: 1, max: 24, step: 1, default: 4 },
    { key: 'colorValence', label: '価数で色分け', type: 'bool', default: true },
    { key: 'project', label: '球への射影率', type: 'number', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  liveKeys: ['project'],
  distance: 5.5,
  compareLabels: ['正二十面体（ν=1）', 'ジオデシック球'],
  build(p, env) {
    const nu = Math.min(Math.round(Number(p.nu)), env.quality === 'low' ? 16 : 24);
    const geo = subdivideIcosa(nu);
    const n = geo.flat.length;
    // 三角形ごとに頂点を分けてフラットシェーディングにする
    const tri = geo.tris;
    const pos = new Float32Array(tri.length * 3);
    const col = new Float32Array(tri.length * 3);
    const c5 = new THREE.Color(0xff4d5e), c6 = new THREE.Color(0x4ca3ff), plain = new THREE.Color(0xd8dce8);
    for (let k = 0; k < tri.length; k++) {
      const v = geo.valence[tri[k]];
      const c = !p.colorValence ? plain : v === 5 ? c5 : c6;
      col.set([c.r, c.g, c.b], k * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5 }));
    // 価数5の頂点の目印
    const five = geo.valence.map((v, i) => (v === 5 ? i : -1)).filter((i) => i >= 0);
    const marks = new THREE.InstancedMesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffe14d }), five.length);
    const ico = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8890b0, flatShading: true }));
    const cur = geo.flat.map((v) => v.clone());
    let shown = -1;
    let ratio = 1;
    const apply = (t: number) => {
      shown = t;
      geo.flat.forEach((v, i) => cur[i].copy(v).lerp(v.clone().normalize(), t));
      for (let k = 0; k < tri.length; k++) {
        const v = cur[tri[k]];
        pos[k * 3] = v.x; pos[k * 3 + 1] = v.y; pos[k * 3 + 2] = v.z;
      }
      g.attributes.position.needsUpdate = true;
      g.computeVertexNormals();
      g.computeBoundingSphere();
      const m = new THREE.Matrix4();
      five.forEach((i, j) => marks.setMatrixAt(j, m.makeTranslation(cur[i].x, cur[i].y, cur[i].z)));
      marks.instanceMatrix.needsUpdate = true;
      // 辺長の最短/最長比（均一さの指標）
      let mn = Infinity, mx = 0;
      for (let k = 0; k < tri.length; k += 3) for (let e = 0; e < 3; e++) {
        const d = cur[tri[k + e]].distanceTo(cur[tri[k + ((e + 1) % 3)]]);
        mn = Math.min(mn, d); mx = Math.max(mx, d);
      }
      ratio = mn / mx;
    };
    apply(Number(p.project));
    return {
      object: mesh,
      before: ico,
      helpers: marks,
      info: () => {
        const c5n = geo.valence.filter((v) => v === 5).length;
        return `ν=${nu} · 頂点 ${n}（10ν²+2=${10 * nu * nu + 2}）· 三角形 ${tri.length / 3}（20ν²）· 価数5=${c5n} 個 · 価数6=${geo.valence.filter((v) => v === 6).length} 個 · 辺長比 最短/最長=${ratio.toFixed(3)}`;
      },
      update(_dt, _t, live) {
        const t = Number(live.project);
        if (t !== shown) apply(t);
      },
    };
  },
});
