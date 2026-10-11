import * as THREE from 'three';

/**
 * 面リスト型の軽量多面体（GEO-001/002/003/007 などで共有）。
 * verts: 頂点座標、faces: 外側から見て反時計回りの頂点番号の環。
 */
export interface Poly {
  name: string;
  verts: THREE.Vector3[];
  faces: number[][];
}

export const SOLID_OPTIONS = [
  { value: 'T', label: '正四面体 (T)' },
  { value: 'C', label: '立方体 (C)' },
  { value: 'O', label: '正八面体 (O)' },
  { value: 'D', label: '正十二面体 (D)' },
  { value: 'I', label: '正二十面体 (I)' },
];

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** 外接球半径を r にそろえる */
export function normalizeRadius(p: Poly, r = 1): Poly {
  let m = 0;
  for (const v of p.verts) m = Math.max(m, v.length());
  if (m > 0) for (const v of p.verts) v.multiplyScalar(r / m);
  return p;
}

/** 面の向きを外向き（重心から見て）にそろえる。凸の種多面体の生成直後だけに使う */
function orientOutward(p: Poly): Poly {
  for (let i = 0; i < p.faces.length; i++) {
    const f = p.faces[i];
    if (faceNormal(p, f).dot(faceCentroid(p, f)) < 0) p.faces[i] = [...f].reverse();
  }
  return p;
}

export function platonic(kind: string): Poly {
  const phi = (1 + Math.sqrt(5)) / 2;
  switch (kind) {
    case 'T':
      return normalizeRadius(orientOutward({ name: 'T', verts: [v3(1, 1, 1), v3(1, -1, -1), v3(-1, 1, -1), v3(-1, -1, 1)], faces: [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]] }));
    case 'C': {
      const verts: THREE.Vector3[] = [];
      for (let i = 0; i < 8; i++) verts.push(v3(i & 1 ? 1 : -1, i & 2 ? 1 : -1, i & 4 ? 1 : -1));
      const faces = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
      return normalizeRadius(orientOutward({ name: 'C', verts, faces }));
    }
    case 'O':
      return normalizeRadius(orientOutward({ name: 'O', verts: [v3(1, 0, 0), v3(-1, 0, 0), v3(0, 1, 0), v3(0, -1, 0), v3(0, 0, 1), v3(0, 0, -1)], faces: [[0, 2, 4], [2, 1, 4], [1, 3, 4], [3, 0, 4], [2, 0, 5], [1, 2, 5], [3, 1, 5], [0, 3, 5]] }));
    case 'D': {
      const d = dual(platonic('I'));
      d.name = 'D';
      return normalizeRadius(d);
    }
    default: {
      const verts = [
        v3(-1, phi, 0), v3(1, phi, 0), v3(-1, -phi, 0), v3(1, -phi, 0),
        v3(0, -1, phi), v3(0, 1, phi), v3(0, -1, -phi), v3(0, 1, -phi),
        v3(phi, 0, -1), v3(phi, 0, 1), v3(-phi, 0, -1), v3(-phi, 0, 1),
      ];
      const faces = [
        [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
        [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
      ];
      return normalizeRadius(orientOutward({ name: 'I', verts, faces }));
    }
  }
}

export function faceCentroid(p: Poly, f: number[], out = new THREE.Vector3()): THREE.Vector3 {
  out.set(0, 0, 0);
  for (const i of f) out.add(p.verts[i]);
  return out.multiplyScalar(1 / f.length);
}

/** Newell 法による面法線（非平面でも安定） */
export function faceNormal(p: Poly, f: number[], out = new THREE.Vector3()): THREE.Vector3 {
  out.set(0, 0, 0);
  for (let i = 0; i < f.length; i++) {
    const a = p.verts[f[i]], b = p.verts[f[(i + 1) % f.length]];
    out.x += (a.y - b.y) * (a.z + b.z);
    out.y += (a.z - b.z) * (a.x + b.x);
    out.z += (a.x - b.x) * (a.y + b.y);
  }
  return out.normalize();
}

const ek = (a: number, b: number) => a + ',' + b;

/** 有向辺 a→b を含む面の番号 */
function edgeFaceMap(p: Poly): Map<string, number> {
  const m = new Map<string, number>();
  p.faces.forEach((f, fi) => f.forEach((a, i) => m.set(ek(a, f[(i + 1) % f.length]), fi)));
  return m;
}

/** 頂点 v のまわりの面と隣接頂点を、外から見て反時計回りの順で返す */
export function vertexRings(p: Poly): { faces: number[]; nbrs: number[] }[] {
  const em = edgeFaceMap(p);
  const first: number[] = new Array(p.verts.length).fill(-1);
  p.faces.forEach((f, fi) => f.forEach((v) => first[v] < 0 && (first[v] = fi)));
  return p.verts.map((_, v) => {
    const faces: number[] = [];
    const nbrs: number[] = [];
    let fi = first[v];
    for (let guard = 0; fi >= 0 && guard < 64; guard++) {
      const f = p.faces[fi];
      const k = f.indexOf(v);
      faces.push(fi);
      nbrs.push(f[(k + 1) % f.length]);
      const prev = f[(k - 1 + f.length) % f.length];
      const nx = em.get(ek(v, prev));
      if (nx === undefined || nx === first[v]) break;
      fi = nx;
    }
    return { faces, nbrs };
  });
}

export function edgeCount(p: Poly): number {
  let s = 0;
  for (const f of p.faces) s += f.length;
  return s / 2;
}

export function vef(p: Poly): string {
  const V = p.verts.length, E = edgeCount(p), F = p.faces.length;
  return `V=${V} E=${E} F=${F} · V−E+F=${V - E + F}`;
}

/** 双対：各面の重心を頂点にし、元の頂点まわりの面の並びで新しい面を組む。radius>0 なら外接球（半径 radius）へ射影 */
export function dual(p: Poly, radius = 0): Poly {
  const verts = p.faces.map((f) => {
    const c = faceCentroid(p, f);
    return radius > 0 ? c.normalize().multiplyScalar(radius) : c;
  });
  const faces = vertexRings(p).map((r) => r.faces.slice());
  return { name: 'd' + p.name, verts, faces };
}

/** 切頂：各辺を両端から割合 t の点で切る。t=0.5 で平行化（ambo） */
export function truncate(p: Poly, t: number): Poly {
  const verts: THREE.Vector3[] = [];
  const idx = new Map<string, number>();
  const mid = Math.abs(t - 0.5) < 1e-6;
  const pt = (a: number, b: number) => {
    const key = mid ? ek(Math.min(a, b), Math.max(a, b)) : ek(a, b);
    let i = idx.get(key);
    if (i === undefined) {
      i = verts.length;
      verts.push(p.verts[a].clone().lerp(p.verts[b], t));
      idx.set(key, i);
    }
    return i;
  };
  const faces: number[][] = [];
  for (const f of p.faces) {
    const nf: number[] = [];
    for (let i = 0; i < f.length; i++) {
      const a = f[i], b = f[(i + 1) % f.length];
      nf.push(pt(a, b));
      const q = pt(b, a);
      if (q !== nf[nf.length - 1]) nf.push(q);
    }
    if (nf.length > 1 && nf[0] === nf[nf.length - 1]) nf.pop();
    faces.push(nf);
  }
  vertexRings(p).forEach((r, v) => faces.push(r.nbrs.map((w) => pt(v, w))));
  return { name: (mid ? 'a' : 't') + p.name, verts, faces };
}

export const ambo = (p: Poly) => truncate(p, 0.5);

/** kis：各面の重心から法線方向に h だけ持ち上げた頂点で角錐を立てる。h は面ごとの値も可 */
export function kis(p: Poly, h: number | ((f: number[], fi: number) => number), onlyDegree = 0): Poly {
  const verts = p.verts.map((v) => v.clone());
  const faces: number[][] = [];
  p.faces.forEach((f, fi) => {
    if (onlyDegree && f.length !== onlyDegree) {
      faces.push(f.slice());
      return;
    }
    const c = faceCentroid(p, f).add(faceNormal(p, f).multiplyScalar(typeof h === 'number' ? h : h(f, fi)));
    const ci = verts.length;
    verts.push(c);
    for (let i = 0; i < f.length; i++) faces.push([f[i], f[(i + 1) % f.length], ci]);
  });
  return { name: 'k' + p.name, verts, faces };
}

/** gyro：各面を辺の数だけの五角形に分ける（Hart の定義） */
export function gyro(p: Poly): Poly {
  const verts = p.verts.map((v) => v.clone());
  const idx = new Map<string, number>();
  const third = (a: number, b: number) => {
    const key = ek(a, b);
    let i = idx.get(key);
    if (i === undefined) {
      i = verts.length;
      verts.push(p.verts[a].clone().lerp(p.verts[b], 1 / 3));
      idx.set(key, i);
    }
    return i;
  };
  const faces: number[][] = [];
  for (const f of p.faces) {
    const ci = verts.length;
    verts.push(faceCentroid(p, f));
    const n = f.length;
    for (let i = 0; i < n; i++) {
      const a = f[i], b = f[(i + 1) % n], c = f[(i + 2) % n];
      faces.push([ci, third(a, b), third(b, a), b, third(b, c)]);
    }
  }
  return { name: 'g' + p.name, verts, faces };
}

export const snub = (p: Poly): Poly => {
  const s = dual(gyro(dual(p)));
  s.name = 's' + p.name;
  return s;
};

/** 簡易正準化（Hart の反復法）：辺を単位球に接するように押し、面を平面に寄せる */
export function canonicalize(p: Poly, iterations = 120): Poly {
  const edges: [number, number][] = [];
  for (const f of p.faces) for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length];
    if (a < b) edges.push([a, b]);
  }
  const tmp = new THREE.Vector3(), d = new THREE.Vector3(), c = new THREE.Vector3(), n = new THREE.Vector3();
  const acc = p.verts.map(() => new THREE.Vector3());
  for (let it = 0; it < iterations; it++) {
    // 接線化：辺上の原点最近点を単位長へ
    for (const a of acc) a.set(0, 0, 0);
    const center = new THREE.Vector3();
    for (const [a, b] of edges) {
      const A = p.verts[a], B = p.verts[b];
      d.subVectors(B, A);
      const t = -A.dot(d) / Math.max(1e-12, d.lengthSq());
      tmp.copy(A).addScaledVector(d, t);
      center.add(tmp);
      const len = tmp.length();
      tmp.multiplyScalar(((1 - len) / Math.max(len, 1e-9)) * 0.5);
      acc[a].add(tmp);
      acc[b].add(tmp);
    }
    center.multiplyScalar(1 / Math.max(1, edges.length));
    p.verts.forEach((v, i) => v.addScaledVector(acc[i], 0.5).sub(center));
    // 平面化：各面の頂点をその面の平面へ寄せる
    for (const a of acc) a.set(0, 0, 0);
    const cnt = new Float32Array(p.verts.length);
    for (const f of p.faces) {
      faceCentroid(p, f, c);
      faceNormal(p, f, n);
      for (const i of f) {
        const dist = tmp.subVectors(p.verts[i], c).dot(n);
        acc[i].addScaledVector(n, -dist);
        cnt[i]++;
      }
    }
    p.verts.forEach((v, i) => cnt[i] && v.addScaledVector(acc[i], 0.5 / cnt[i]));
  }
  return p;
}

/** Conway 記法（右から左へ適用）。対応: d a k t g s j e o b（例 "dtI" は I に t、続けて d） */
export function conway(notation: string, seed: string, opts: { canonical?: boolean } = {}): Poly {
  let p = platonic(seed);
  const ops = notation.split('').reverse();
  for (const op of ops) {
    switch (op) {
      case 'd': p = dual(p); break;
      case 'a': p = ambo(p); break;
      case 'k': p = kis(p, 0.1 * meanEdge(p)); break;
      case 't': p = truncate(p, 1 / 3); break;
      case 'g': p = gyro(p); break;
      case 's': p = snub(p); break;
      case 'j': p = dual(ambo(p)); break;
      case 'e': p = ambo(ambo(p)); break;
      case 'o': p = dual(ambo(dual(ambo(p)))); break;
      case 'b': p = truncate(ambo(p), 1 / 3); break;
      default: continue;
    }
    p = opts.canonical === false ? normalizeRadius(p) : canonicalize(normalizeRadius(p), 60);
  }
  p.name = notation + seed;
  return opts.canonical === false ? normalizeRadius(p) : normalizeRadius(canonicalize(p, 200));
}

export function meanEdge(p: Poly): number {
  let s = 0, n = 0;
  for (const f of p.faces) for (let i = 0; i < f.length; i++) {
    s += p.verts[f[i]].distanceTo(p.verts[f[(i + 1) % f.length]]);
    n++;
  }
  return n ? s / n : 1;
}

/** 面の辺数ごとの色 */
export const DEGREE_COLORS: Record<number, number> = { 3: 0xff8a4c, 4: 0x4ca3ff, 5: 0x5ad18a, 6: 0xffd24c, 7: 0xc77dff, 8: 0xff5c8a, 10: 0x4cf0e0 };
export const degreeColor = (n: number) => DEGREE_COLORS[n] ?? 0xbfc6d8;

/**
 * 三角形化したメッシュを作る（面ごとにフラットシェーディング、色は面の辺数または単色）。
 * n 角形は重心からの扇で分割する（非凸面・非平面にも安定）。
 */
export function polyToGeometry(p: Poly, color: 'degree' | number | ((f: number[], fi: number) => number) = 'degree'): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const cc = new THREE.Color();
  const c = new THREE.Vector3();
  p.faces.forEach((f, fi) => {
    cc.set(color === 'degree' ? degreeColor(f.length) : typeof color === 'function' ? color(f, fi) : color);
    const push = (v: THREE.Vector3) => {
      pos.push(v.x, v.y, v.z);
      col.push(cc.r, cc.g, cc.b);
    };
    if (f.length === 3) {
      push(p.verts[f[0]]); push(p.verts[f[1]]); push(p.verts[f[2]]);
      return;
    }
    faceCentroid(p, f, c);
    for (let i = 0; i < f.length; i++) {
      push(c); push(p.verts[f[i]]); push(p.verts[f[(i + 1) % f.length]]);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

/** 辺だけの線分ジオメトリ */
export function polyEdges(p: Poly): THREE.BufferGeometry {
  const pos: number[] = [];
  for (const f of p.faces) for (let i = 0; i < f.length; i++) {
    const a = f[i], b = f[(i + 1) % f.length];
    if (a > b) continue;
    const A = p.verts[a], B = p.verts[b];
    pos.push(A.x, A.y, A.z, B.x, B.y, B.z);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return g;
}

/** 面メッシュ＋辺の線をまとめたグループ */
export function polyObject(
  p: Poly,
  opts: { color?: 'degree' | number | ((f: number[], fi: number) => number); edgeColor?: number; opacity?: number; edges?: boolean } = {},
): THREE.Group {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.5, metalness: 0.05, flatShading: true, side: THREE.DoubleSide,
    transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1, depthWrite: (opts.opacity ?? 1) >= 1,
  });
  g.add(new THREE.Mesh(polyToGeometry(p, opts.color ?? 'degree'), mat));
  if (opts.edges !== false) g.add(new THREE.LineSegments(polyEdges(p), new THREE.LineBasicMaterial({ color: opts.edgeColor ?? 0x0b0d16 })));
  return g;
}

/** 面の辺数の内訳 "3×8 4×6" */
export function degreeSummary(p: Poly): string {
  const m = new Map<number, number>();
  for (const f of p.faces) m.set(f.length, (m.get(f.length) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => `${k}角形×${v}`).join(' ');
}
