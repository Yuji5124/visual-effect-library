import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';

/** GEO-049 4次元多胞体：4次元座標を6つの平面で回転し、w による透視投影 1/(d−w) で3次元へ落とす */
type V4 = [number, number, number, number];

function polytope(kind: string): { verts: V4[]; edges: [number, number][] } {
  const verts: V4[] = [];
  if (kind === 'cell24') {
    // 正24胞体：(±1,±1,0,0) の全ての並べ替え
    for (let i = 0; i < 4; i++)
      for (let j = i + 1; j < 4; j++)
        for (const a of [-1, 1])
          for (const b of [-1, 1]) {
            const v: V4 = [0, 0, 0, 0];
            v[i] = a; v[j] = b;
            verts.push(v);
          }
  } else if (kind === 'cell16') {
    for (let i = 0; i < 4; i++)
      for (const a of [-1.3, 1.3]) {
        const v: V4 = [0, 0, 0, 0];
        v[i] = a;
        verts.push(v);
      }
  } else {
    for (let i = 0; i < 16; i++) verts.push([i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1, i & 8 ? 1 : -1]);
  }
  // 最短距離の頂点対を辺とする
  const d2 = (a: V4, b: V4) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2 + (a[3] - b[3]) ** 2;
  let min = Infinity;
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) min = Math.min(min, d2(verts[i], verts[j]));
  const edges: [number, number][] = [];
  for (let i = 0; i < verts.length; i++) for (let j = i + 1; j < verts.length; j++) if (Math.abs(d2(verts[i], verts[j]) - min) < 1e-6) edges.push([i, j]);
  return { verts, edges };
}

/** 平面 (a,b) での回転を v に適用 */
function rot(v: V4, a: number, b: number, t: number): void {
  if (t === 0) return;
  const c = Math.cos(t), s = Math.sin(t);
  const x = v[a], y = v[b];
  v[a] = x * c - y * s;
  v[b] = x * s + y * c;
}

export default defineGeometryDemo({
  id: 'GEO-049',
  notes: '多胞体の頂点を4次元座標で持ち、XY・XZ・YZ・XW・YW・ZW の6平面の回転を順に掛け、3次元へ透視投影 (x,y,z)·k/(d−w) する。辺は円柱、頂点は球の InstancedMesh で毎フレーム置き直し、色は w 座標（手前=橙、奥=青）。W を含む平面で回すと内外の立方体が裏返る。',
  params: [
    { key: 'shape', label: '図形', type: 'select', options: [{ value: 'tesseract', label: '超立方体（テッセラクト）' }, { value: 'cell24', label: '正24胞体' }, { value: 'cell16', label: '正16胞体' }], default: 'tesseract' },
    { key: 'xw', label: 'XW回転（速さ）', type: 'number', min: -2, max: 2, step: 0.01, default: 0.6 },
    { key: 'yw', label: 'YW回転（速さ）', type: 'number', min: -2, max: 2, step: 0.01, default: 0 },
    { key: 'zw', label: 'ZW回転（速さ）', type: 'number', min: -2, max: 2, step: 0.01, default: 0.25 },
    { key: 'xy', label: 'XY回転（速さ、3次元内の回転）', type: 'number', min: -2, max: 2, step: 0.01, default: 0 },
    { key: 'dist', label: '投影距離 d', type: 'number', min: 2.2, max: 8, step: 0.05, default: 3 },
    { key: 'thick', label: '辺の太さ', type: 'number', min: 0.01, max: 0.08, step: 0.002, default: 0.03 },
  ],
  liveKeys: ['xw', 'yw', 'zw', 'xy', 'dist', 'thick'],
  distance: 8,
  compareLabels: ['回転前', '4次元回転'],
  build(p) {
    const { verts, edges } = polytope(String(p.shape));
    const mkMeshes = () => {
      const e = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 8, 1, true), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2 }), edges.length);
      const v = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 8), new THREE.MeshStandardMaterial({ roughness: 0.3 }), verts.length);
      const g = new THREE.Group();
      g.add(e, v);
      return { g, e, v };
    };
    const main = mkMeshes();
    const ref = mkMeshes();
    const angles = { xy: 0, xw: 0, yw: 0, zw: 0 };
    const proj: THREE.Vector3[] = verts.map(() => new THREE.Vector3());
    const ws = new Float32Array(verts.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), d = new THREE.Vector3(), mid = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const near = new THREE.Color(0xffa040), far = new THREE.Color(0x3f7cff), c = new THREE.Color();
    let wMin = 0, wMax = 0;
    const pose = (target: ReturnType<typeof mkMeshes>, dist: number, thick: number, a: typeof angles) => {
      const scale = 1.4;
      wMin = Infinity; wMax = -Infinity;
      verts.forEach((v0, i) => {
        const v: V4 = [...v0];
        rot(v, 0, 1, a.xy);
        rot(v, 0, 2, 0.35); // 少し傾けて3次元的に見やすくする
        rot(v, 1, 2, 0.25);
        rot(v, 0, 3, a.xw);
        rot(v, 1, 3, a.yw);
        rot(v, 2, 3, a.zw);
        const k = scale / Math.max(0.2, dist - v[3]);
        proj[i].set(v[0] * k, v[1] * k, v[2] * k);
        ws[i] = v[3];
        wMin = Math.min(wMin, v[3]); wMax = Math.max(wMax, v[3]);
      });
      const col = (w: number) => c.copy(far).lerp(near, wMax > wMin ? (w - wMin) / (wMax - wMin) : 0.5);
      verts.forEach((_, i) => {
        const r = thick * 2.2 * (scale / Math.max(0.2, dist - ws[i]));
        target.v.setMatrixAt(i, m.makeScale(r, r, r).setPosition(proj[i]));
        target.v.setColorAt(i, col(ws[i]));
      });
      edges.forEach(([i, j], k) => {
        d.subVectors(proj[j], proj[i]);
        const len = d.length();
        q.setFromUnitVectors(up, d.normalize());
        m.compose(mid.addVectors(proj[i], proj[j]).multiplyScalar(0.5), q, s.set(thick, len, thick));
        target.e.setMatrixAt(k, m);
        target.e.setColorAt(k, col((ws[i] + ws[j]) / 2));
      });
      for (const im of [target.v, target.e]) {
        im.instanceMatrix.needsUpdate = true;
        if (im.instanceColor) im.instanceColor.needsUpdate = true;
        im.computeBoundingSphere();
      }
    };
    pose(ref, Number(p.dist), Number(p.thick), { xy: 0, xw: 0, yw: 0, zw: 0 });
    pose(main, Number(p.dist), Number(p.thick), angles);
    const deg = (r: number) => ((THREE.MathUtils.radToDeg(r) % 360) + 360) % 360;
    return {
      object: main.g,
      before: ref.g,
      info: () => `頂点 ${verts.length} · 辺 ${edges.length} · XW ${deg(angles.xw).toFixed(0)}° YW ${deg(angles.yw).toFixed(0)}° ZW ${deg(angles.zw).toFixed(0)}° · w 範囲 ${wMin.toFixed(2)}〜${wMax.toFixed(2)}`,
      update(dt, _t, live) {
        angles.xw += dt * Number(live.xw);
        angles.yw += dt * Number(live.yw);
        angles.zw += dt * Number(live.zw);
        angles.xy += dt * Number(live.xy);
        pose(main, Number(live.dist), Number(live.thick), angles);
        if (live.compare) pose(ref, Number(live.dist), Number(live.thick), { xy: 0, xw: 0, yw: 0, zw: 0 });
      },
    };
  },
});
