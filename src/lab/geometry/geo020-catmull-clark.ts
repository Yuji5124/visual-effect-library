import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { Markers } from '../framework/splineKit';

/** GEO-020 Catmull–Clark 細分割：面点・辺点・頂点の移動 (F+2R+(n−3)P)/n で四角形に組み直す */

interface PolyMesh {
  verts: THREE.Vector3[];
  faces: number[][];
  /** 各面の元のケージ面番号（色分け用） */
  origin: number[];
}

/** ボクセルの集合から外側の面だけを四角形で張ったケージ（頂点は共有） */
function voxelCage(vox: [number, number, number][], scale: number): PolyMesh {
  const has = new Set(vox.map((v) => v.join(',')));
  const index = new Map<string, number>();
  const verts: THREE.Vector3[] = [];
  const vid = (c: number[]) => {
    const k = c.join(',');
    let i = index.get(k);
    if (i === undefined) {
      i = verts.length;
      index.set(k, i);
      verts.push(new THREE.Vector3(c[0], c[1], c[2]));
    }
    return i;
  };
  const faces: number[][] = [];
  for (const v of vox) for (let d = 0; d < 3; d++) for (const s of [1, -1]) {
    const nb = [...v];
    nb[d] += s;
    if (has.has(nb.join(','))) continue;
    const u = (d + 1) % 3, w = (d + 2) % 3;
    const corner = (a: number, b: number) => {
      const c = [...v];
      c[d] += s > 0 ? 1 : 0;
      c[u] += a;
      c[w] += b;
      return vid(c);
    };
    // e_u × e_w = e_d なので、+ 側はこの順、− 側は逆順で外向き
    const q = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
    faces.push(s > 0 ? q : q.reverse());
  }
  const box = new THREE.Box3().setFromPoints(verts);
  const c = box.getCenter(new THREE.Vector3());
  for (const p of verts) p.sub(c).multiplyScalar(scale).add(new THREE.Vector3(0, ((box.max.y - box.min.y) / 2) * scale + 0.3, 0));
  return { verts, faces, origin: faces.map((_, i) => i) };
}

function cage(kind: string): PolyMesh {
  if (kind === 'L') return voxelCage([[0, 0, 0], [1, 0, 0], [2, 0, 0], [0, 1, 0], [0, 2, 0]], 1.05);
  if (kind === 'torus') {
    const v: [number, number, number][] = [];
    for (let x = 0; x < 3; x++) for (let z = 0; z < 3; z++) if (x !== 1 || z !== 1) v.push([x, 0, z]);
    return voxelCage(v, 1.25);
  }
  if (kind === 'cross') return voxelCage([[1, 0, 1], [0, 0, 1], [2, 0, 1], [1, 0, 0], [1, 0, 2], [1, 1, 1], [1, 2, 1]], 1.0);
  return voxelCage([[0, 0, 0]], 2.4);
}

const ekey = (a: number, b: number) => (a < b ? a * 1e7 + b : b * 1e7 + a);

/** Catmull–Clark 1段 */
function subdivide(m: PolyMesh): PolyMesh {
  const V = m.verts.length;
  const fp = m.faces.map((f) => f.reduce((s, i) => s.add(m.verts[i]), new THREE.Vector3()).divideScalar(f.length));
  // 辺の隣接情報
  const edgeIndex = new Map<number, number>();
  const edges: { a: number; b: number; faces: number[] }[] = [];
  const vFaces: number[][] = Array.from({ length: V }, () => []);
  const vEdges: number[][] = Array.from({ length: V }, () => []);
  m.faces.forEach((f, fi) => {
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      const k = ekey(a, b);
      let e = edgeIndex.get(k);
      if (e === undefined) {
        e = edges.length;
        edgeIndex.set(k, e);
        edges.push({ a, b, faces: [] });
        vEdges[a].push(e);
        vEdges[b].push(e);
      }
      edges[e].faces.push(fi);
      vFaces[a].push(fi);
    }
  });
  const ep = edges.map((e) => {
    const p = m.verts[e.a].clone().add(m.verts[e.b]);
    if (e.faces.length !== 2) return p.multiplyScalar(0.5);
    return p.add(fp[e.faces[0]]).add(fp[e.faces[1]]).multiplyScalar(0.25);
  });
  const vp = m.verts.map((P, v) => {
    const boundary = vEdges[v].filter((e) => edges[e].faces.length !== 2);
    if (boundary.length >= 2) {
      // 境界：3/4 P + 1/8 (両隣)
      const q = P.clone().multiplyScalar(0.75);
      for (const e of boundary.slice(0, 2)) q.addScaledVector(m.verts[edges[e].a === v ? edges[e].b : edges[e].a], 0.125);
      return q;
    }
    const n = vFaces[v].length;
    const F = vFaces[v].reduce((s, f) => s.add(fp[f]), new THREE.Vector3()).divideScalar(n);
    const R = vEdges[v].reduce((s, e) => s.add(m.verts[edges[e].a]).add(m.verts[edges[e].b]), new THREE.Vector3()).multiplyScalar(0.5 / vEdges[v].length);
    return F.add(R.multiplyScalar(2)).addScaledVector(P, n - 3).divideScalar(n);
  });
  const verts = [...vp, ...ep, ...fp];
  const E = edges.length;
  const faces: number[][] = [];
  const origin: number[] = [];
  m.faces.forEach((f, fi) => {
    const k = f.length;
    for (let i = 0; i < k; i++) {
      const prev = f[(i - 1 + k) % k], cur = f[i], next = f[(i + 1) % k];
      faces.push([cur, V + edgeIndex.get(ekey(cur, next))!, V + E + fi, V + edgeIndex.get(ekey(prev, cur))!]);
      origin.push(m.origin[fi]);
    }
  });
  return { verts, faces, origin };
}

function stats(m: PolyMesh) {
  const edges = new Set<number>();
  const valence = new Array(m.verts.length).fill(0);
  for (const f of m.faces) for (let i = 0; i < f.length; i++) {
    edges.add(ekey(f[i], f[(i + 1) % f.length]));
    valence[f[i]]++;
  }
  const V = m.verts.length, E = edges.size, F = m.faces.length;
  return { V, E, F, chi: V - E + F, extraordinary: valence.filter((n) => n !== 4).length, valence };
}

/** 多角形メッシュ → 三角形の BufferGeometry（滑らかな法線、面ごとの色） */
function toGeometry(m: PolyMesh, colorFaces: boolean): THREE.BufferGeometry {
  const pos = new Float32Array(m.verts.length * 3);
  m.verts.forEach((v, i) => v.toArray(pos, i * 3));
  const idx: number[] = [];
  const triOrigin: number[] = [];
  m.faces.forEach((f, fi) => {
    for (let i = 1; i < f.length - 1; i++) {
      idx.push(f[0], f[i], f[i + 1]);
      triOrigin.push(m.origin[fi]);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const out = g.toNonIndexed();
  g.dispose();
  const col = new Float32Array(out.attributes.position.count * 3);
  const c = new THREE.Color();
  triOrigin.forEach((o, t) => {
    if (colorFaces) c.setHSL((o * 0.618) % 1, 0.55, 0.62);
    else c.set(0x9fd0ff);
    for (let k = 0; k < 3; k++) c.toArray(col, (t * 3 + k) * 3);
  });
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

export default defineGeometryDemo({
  id: 'GEO-020',
  notes: '辺→隣接面の辞書を作り、面点（頂点の平均）・辺点（両端と両隣の面点の平均）・移動後の頂点 (F+2R+(n−3)P)/n から各面を四角形に組み直す処理を指定段数だけ繰り返す独自実装。面の色は元のケージ面を表す。赤い点は価数4以外の特異点で、そこ以外では極限曲面が双三次Bスプライン曲面と一致する。比較表示で制御ケージと並べられる。',
  params: [
    { key: 'level', label: '分割レベル', type: 'number', min: 0, max: 4, step: 1, default: 3 },
    { key: 'shape', label: 'ケージの形', type: 'select', options: [{ value: 'cube', label: '立方体' }, { value: 'L', label: 'L字' }, { value: 'torus', label: 'トーラス状（穴あき）' }, { value: 'cross', label: '十字' }], default: 'torus' },
    { key: 'showCage', label: 'ケージ表示', type: 'bool', default: true },
    { key: 'colorFaces', label: '元の面ごとに色分け', type: 'bool', default: true },
  ],
  liveKeys: ['showCage'],
  distance: 9,
  elevation: 0.5,
  target: [0, 1.3, 0],
  compareLabels: ['制御ケージ', '細分割曲面'],
  build(p, env) {
    const maxLevel = env.quality === 'low' ? 3 : 4;
    const level = Math.min(maxLevel, Math.round(Number(p.level)));
    const base = cage(String(p.shape));
    const history = [stats(base)];
    let m = base;
    const t0 = performance.now();
    for (let i = 0; i < level; i++) {
      m = subdivide(m);
      history.push(stats(m));
    }
    const ms = performance.now() - t0;
    const object = new THREE.Mesh(toGeometry(m, Boolean(p.colorFaces)), std(0xffffff, { vertexColors: true, roughness: 0.4 }));

    // ケージ（辺と頂点、特異点は赤）
    const helpers = new THREE.Group();
    const seg: THREE.Vector3[] = [];
    const seen = new Set<number>();
    for (const f of base.faces) for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      if (seen.has(ekey(a, b))) continue;
      seen.add(ekey(a, b));
      seg.push(base.verts[a], base.verts[b]);
    }
    helpers.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(seg), new THREE.LineBasicMaterial({ color: 0xffd23d, transparent: true, opacity: 0.85 })));
    const marks = new Markers(base.verts.length, 0.07);
    base.verts.forEach((v, i) => marks.set(i, v, history[0].valence[i] !== 4 ? 0xff4d4d : 0xffd23d, history[0].valence[i] !== 4 ? 1.5 : 1));
    marks.commit();
    helpers.add(marks.mesh);

    const bgeo = toGeometry(base, false);
    const before = new THREE.Mesh(bgeo, std(0x8890b0, { flatShading: true, vertexColors: false }));
    const last = history[history.length - 1];
    return {
      object,
      before,
      helpers,
      info: `レベル ${level} · ` + history.map((h, i) => `L${i}: V${h.V} E${h.E} F${h.F}`).join(' → ') + ` · χ=V−E+F=${last.chi} · 特異点（価数≠4）${history[0].extraordinary} 個 · ${ms.toFixed(0)} ms`,
      update(_dt, _time, live) {
        helpers.visible = Boolean(live.showCage);
      },
    };
  },
});
