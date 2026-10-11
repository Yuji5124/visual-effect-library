import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';

/** GEO-045 ラティス構造：単位セルの梁を周期的に並べ、外形の内側に中点がある梁だけを InstancedMesh の円柱で描く */
type Beam = [number, number, number, number, number, number]; // 半セル単位（0..2）の端点

function unitBeams(kind: string): Beam[] {
  const beams: Beam[] = [];
  const corners: [number, number, number][] = [];
  for (let i = 0; i < 8; i++) corners.push([(i & 1) * 2, ((i >> 1) & 1) * 2, ((i >> 2) & 1) * 2]);
  const cubeEdges = () => {
    for (let i = 0; i < 8; i++)
      for (let j = i + 1; j < 8; j++) {
        const d = (i ^ j);
        if (d === 1 || d === 2 || d === 4) beams.push([...corners[i], ...corners[j]]);
      }
  };
  if (kind === 'cubic') cubeEdges();
  else if (kind === 'bcc') {
    // 体心立方：中心と8隅を結ぶ（外枠の辺も持つ）
    cubeEdges();
    for (const c of corners) beams.push([1, 1, 1, ...c]);
  } else if (kind === 'bccOnly') {
    for (const c of corners) beams.push([1, 1, 1, ...c]);
  } else {
    // オクテットトラス：面心と、その面の4隅（面の対角線の半分）＋隣り合う面心どうし（八面体）
    const faces: [number, number, number][] = [[0, 1, 1], [2, 1, 1], [1, 0, 1], [1, 2, 1], [1, 1, 0], [1, 1, 2]];
    for (const f of faces) {
      const ax = f.findIndex((v) => v !== 1);
      for (const c of corners) if (c[ax] === f[ax]) beams.push([...f, ...c]);
    }
    for (let i = 0; i < 6; i++)
      for (let j = i + 1; j < 6; j++) {
        const a = faces[i], b = faces[j];
        // 向かい合う面どうしは結ばない（2軸で座標が違う＝隣り合う面）
        const diff = (a[0] !== b[0] ? 1 : 0) + (a[1] !== b[1] ? 1 : 0) + (a[2] !== b[2] ? 1 : 0);
        if (diff === 2) beams.push([...a, ...b]);
      }
  }
  return beams;
}

const INSIDE: Record<string, (x: number, y: number, z: number) => boolean> = {
  sphere: (x, y, z) => x * x + y * y + z * z <= 1,
  cube: (x, y, z) => Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) <= 1,
  cylinder: (x, y, z) => x * x + z * z <= 1 && Math.abs(y) <= 1,
  torus: (x, y, z) => {
    const q = Math.hypot(x, z) - 0.65;
    return q * q + y * y <= 0.35 * 0.35 * 1.4;
  },
};

export default defineGeometryDemo({
  id: 'GEO-045',
  notes: '単位セル（立方・体心・オクテット）の梁を n×n×n に並べ、共有する梁は1本にまとめる。外形（球・立方体・円柱・トーラス）の内側に中点がある梁だけを残し、InstancedMesh の円柱1つと節点の球1つで描く。比較の左は切り出す前の外形。',
  params: [
    { key: 'cell', label: '単位セル', type: 'select', options: [{ value: 'cubic', label: '立方（単純立方）' }, { value: 'bcc', label: '体心立方（BCC）' }, { value: 'bccOnly', label: '体心のみ（対角梁）' }, { value: 'octet', label: 'オクテットトラス' }], default: 'octet' },
    { key: 'cells', label: 'セル数（一辺）', type: 'number', min: 2, max: 12, step: 1, default: 6 },
    { key: 'radius', label: '梁の太さ', type: 'number', min: 0.005, max: 0.08, step: 0.001, default: 0.022 },
    { key: 'shape', label: '外形', type: 'select', options: [{ value: 'sphere', label: '球' }, { value: 'cube', label: '立方体' }, { value: 'cylinder', label: '円柱' }, { value: 'torus', label: 'トーラス' }], default: 'sphere' },
    { key: 'nodes', label: '節点の球を表示', type: 'bool', default: true },
  ],
  distance: 7,
  compareLabels: ['外形', 'ラティス'],
  build(p, env) {
    let n = Number(p.cells);
    if (env.quality === 'low') n = Math.min(n, 7);
    const S = 1.8;
    const shape = String(p.shape);
    const inside = INSIDE[shape] ?? INSIDE.sphere;
    const unit = unitBeams(String(p.cell));
    // 半セル単位の整数格子で重複を除く
    const seen = new Set<string>();
    const beams: Beam[] = [];
    const nodes = new Map<string, [number, number, number]>();
    const toW = (g: number) => (g / (2 * n)) * 2 * S - S;
    for (let z = 0; z < n; z++)
      for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++)
          for (const b of unit) {
            const a: [number, number, number] = [b[0] + 2 * x, b[1] + 2 * y, b[2] + 2 * z];
            const c: [number, number, number] = [b[3] + 2 * x, b[4] + 2 * y, b[5] + 2 * z];
            const ka = a.join(','), kc = c.join(',');
            const key = ka < kc ? ka + '|' + kc : kc + '|' + ka;
            if (seen.has(key)) continue;
            seen.add(key);
            const mx = (toW(a[0]) + toW(c[0])) / 2, my = (toW(a[1]) + toW(c[1])) / 2, mz = (toW(a[2]) + toW(c[2])) / 2;
            if (!inside(mx / S, my / S, mz / S)) continue;
            beams.push([...a, ...c]);
            nodes.set(ka, a);
            nodes.set(kc, c);
          }
    const r = Number(p.radius);
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 6, 1, true);
    const beamMesh = new THREE.InstancedMesh(cyl, new THREE.MeshStandardMaterial({ color: 0xc8d4e8, roughness: 0.35, metalness: 0.6 }), Math.max(1, beams.length));
    const m = new THREE.Matrix4();
    const A = new THREE.Vector3(), C = new THREE.Vector3(), D = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const sc = new THREE.Vector3();
    let totalLen = 0;
    beams.forEach((b, i) => {
      A.set(toW(b[0]), toW(b[1]), toW(b[2]));
      C.set(toW(b[3]), toW(b[4]), toW(b[5]));
      D.subVectors(C, A);
      const len = D.length();
      totalLen += len;
      q.setFromUnitVectors(up, D.normalize());
      m.compose(A.add(C).multiplyScalar(0.5), q, sc.set(r, len, r));
      beamMesh.setMatrixAt(i, m);
    });
    beamMesh.count = beams.length;
    const object = new THREE.Group();
    object.add(beamMesh);
    if (p.nodes && nodes.size) {
      const nodeMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffb84d, roughness: 0.4, metalness: 0.3 }), nodes.size);
      let i = 0;
      for (const g of nodes.values()) nodeMesh.setMatrixAt(i++, m.makeScale(r * 1.6, r * 1.6, r * 1.6).setPosition(toW(g[0]), toW(g[1]), toW(g[2])));
      object.add(nodeMesh);
    }
    let envGeo: THREE.BufferGeometry;
    if (shape === 'cube') envGeo = new THREE.BoxGeometry(2 * S, 2 * S, 2 * S);
    else if (shape === 'cylinder') envGeo = new THREE.CylinderGeometry(S, S, 2 * S, 48);
    else if (shape === 'torus') envGeo = new THREE.TorusGeometry(0.65 * S, 0.35 * S * Math.sqrt(1.4), 24, 64).rotateX(Math.PI / 2);
    else envGeo = new THREE.SphereGeometry(S, 48, 32);
    const before = new THREE.Mesh(envGeo, new THREE.MeshStandardMaterial({ color: 0x8890b0, roughness: 0.6 }));
    const vol = beams.length > 0 ? (totalLen * Math.PI * r * r) : 0;
    return {
      object,
      before,
      info: `梁 ${beams.length.toLocaleString()} 本 · 節点 ${nodes.size.toLocaleString()} · 単位セルの梁 ${unit.length} 本 · 梁の総延長 ${totalLen.toFixed(1)} · 体積 ≈ ${vol.toFixed(3)}`,
    };
  },
});
