import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { polyline } from '../framework/deformKit';

/** GEO-035 平面切断：三角形を符号付き距離で分割し、交点列をつないだ閉ループを三角形分割して蓋にする */

function baseGeometry(shape: string, low: boolean): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  if (shape === 'torus') g = new THREE.TorusGeometry(1.3, 0.5, low ? 16 : 24, low ? 48 : 80).rotateX(Math.PI / 2.6);
  else if (shape === 'vase') {
    const prof = Array.from({ length: 24 }, (_, i) => {
      const t = i / 23;
      return new THREE.Vector2(0.05 + 0.9 + 0.5 * Math.sin(t * Math.PI * 1.6) - 0.3 * t, -1.6 + t * 3.2);
    });
    // 内側の壁を折り返して厚みのある器にする（切ると輪の断面＝穴あき）
    const inner = prof.filter((v) => v.y > -1.4).reverse().map((v) => new THREE.Vector2(v.x - 0.18, v.y));
    g = new THREE.LatheGeometry([new THREE.Vector2(0, -1.6), ...prof, ...inner, new THREE.Vector2(0, -1.42)], low ? 32 : 64);
  } else if (shape === 'box') g = new THREE.BoxGeometry(2.4, 2.4, 2.4, 4, 4, 4);
  else g = new THREE.TorusKnotGeometry(1.1, 0.38, low ? 128 : 220, low ? 12 : 20);
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-4);
  g.dispose();
  m.computeVertexNormals();
  return m;
}

interface CutResult {
  neg: THREE.BufferGeometry;
  pos: THREE.BufferGeometry;
  capNeg: THREE.BufferGeometry;
  capPos: THREE.BufferGeometry;
  loops: THREE.Vector3[][];
  open: number;
  holes: number;
}

function slice(src: THREE.BufferGeometry, n: THREE.Vector3, h: number): CutResult {
  const P = src.attributes.position, Nm = src.attributes.normal;
  const idx = src.index!.array;
  const vc = P.count;
  const dist = new Float32Array(vc);
  for (let i = 0; i < vc; i++) {
    const d = n.x * P.getX(i) + n.y * P.getY(i) + n.z * P.getZ(i) - h;
    // ちょうど平面上の頂点は少しずらして退化した分割を避ける
    dist[i] = Math.abs(d) < 1e-7 ? 1e-7 : d;
  }
  const out = { neg: { p: [] as number[], n: [] as number[] }, pos: { p: [] as number[], n: [] as number[] } };
  const ip: THREE.Vector3[] = [], inn: THREE.Vector3[] = [];
  const keyToId = new Map<number, number>();
  // 辺 (a,b) の交点：端点の組をキーにして、隣の三角形と同じ点を共有する
  const cross = (a: number, b: number): number => {
    const key = a < b ? a * vc + b : b * vc + a;
    let id = keyToId.get(key);
    if (id === undefined) {
      const t = dist[a] / (dist[a] - dist[b]);
      ip.push(new THREE.Vector3().fromBufferAttribute(P, a).lerp(new THREE.Vector3().fromBufferAttribute(P, b), t));
      inn.push(new THREE.Vector3().fromBufferAttribute(Nm, a).lerp(new THREE.Vector3().fromBufferAttribute(Nm, b), t).normalize());
      id = ip.length - 1;
      keyToId.set(key, id);
    }
    return id;
  };
  const vtx = (side: 'neg' | 'pos', v: number | { p: THREE.Vector3; n: THREE.Vector3 }) => {
    const o = out[side];
    if (typeof v === 'number') {
      o.p.push(P.getX(v), P.getY(v), P.getZ(v));
      o.n.push(Nm.getX(v), Nm.getY(v), Nm.getZ(v));
    } else {
      o.p.push(v.p.x, v.p.y, v.p.z);
      o.n.push(v.n.x, v.n.y, v.n.z);
    }
  };
  const adj = new Map<number, number[]>();
  const link = (a: number, b: number) => {
    if (!adj.has(a)) adj.set(a, []);
    if (!adj.has(b)) adj.set(b, []);
    adj.get(a)!.push(b);
    adj.get(b)!.push(a);
  };
  for (let t = 0; t < idx.length; t += 3) {
    const tri = [idx[t], idx[t + 1], idx[t + 2]];
    const s = tri.map((v) => dist[v] < 0);
    if (s[0] === s[1] && s[1] === s[2]) {
      for (const v of tri) vtx(s[0] ? 'neg' : 'pos', v);
      continue;
    }
    // 1つだけ反対側にある頂点を先頭へ回す（巻き順は保つ）
    const lone = s[0] !== s[1] && s[0] !== s[2] ? 0 : s[1] !== s[0] && s[1] !== s[2] ? 1 : 2;
    const a = tri[lone], b = tri[(lone + 1) % 3], c = tri[(lone + 2) % 3];
    const pi = cross(a, b), qi = cross(a, c);
    const Pp = { p: ip[pi], n: inn[pi] }, Qp = { p: ip[qi], n: inn[qi] };
    const loneSide = dist[a] < 0 ? 'neg' : 'pos';
    const other = loneSide === 'neg' ? 'pos' : 'neg';
    vtx(loneSide, a); vtx(loneSide, Pp); vtx(loneSide, Qp);
    vtx(other, Pp); vtx(other, b); vtx(other, c);
    vtx(other, Pp); vtx(other, c); vtx(other, Qp);
    link(pi, qi);
  }
  // 交点の線分をたどって閉ループにする
  const visited = new Set<number>();
  const loops: number[][] = [];
  let open = 0;
  for (const start of adj.keys()) {
    if (visited.has(start)) continue;
    const loop = [start];
    visited.add(start);
    let prev = -1, cur = start;
    for (;;) {
      const next = adj.get(cur)!.find((v) => v !== prev && !visited.has(v));
      if (next === undefined) break;
      visited.add(next);
      loop.push(next);
      prev = cur;
      cur = next;
    }
    if (adj.get(cur)!.includes(start) && loop.length >= 3) loops.push(loop);
    else open++;
  }
  // 平面上の2次元座標系
  const u = new THREE.Vector3(1, 0, 0);
  if (Math.abs(n.dot(u)) > 0.9) u.set(0, 0, 1);
  u.addScaledVector(n, -u.dot(n)).normalize();
  const w = new THREE.Vector3().crossVectors(n, u);
  const loops2 = loops.map((l) => l.map((i) => new THREE.Vector2(ip[i].dot(u), ip[i].dot(w))));
  const inside = (pt: THREE.Vector2, poly: THREE.Vector2[]) => {
    let c = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      if (poly[i].y > pt.y !== poly[j].y > pt.y && pt.x < ((poly[j].x - poly[i].x) * (pt.y - poly[i].y)) / (poly[j].y - poly[i].y) + poly[i].x) c = !c;
    }
    return c;
  };
  // 入れ子の深さ：奇数なら穴。穴は最も小さい外側ループに割り当てる
  const depth = loops2.map((l, i) => loops2.filter((o, j) => j !== i && inside(l[0], o)).length);
  const capTris: THREE.Vector3[] = [];
  let holes = 0;
  loops2.forEach((outer, i) => {
    if (depth[i] % 2) return;
    const hs = loops2
      .map((l, j) => ({ l, j }))
      .filter(({ l, j }) => depth[j] === depth[i] + 1 && inside(l[0], outer))
      .map(({ j }) => j);
    holes += hs.length;
    const contour = outer.map((v) => v.clone());
    const holePts = hs.map((j) => loops2[j].map((v) => v.clone()));
    const tris = THREE.ShapeUtils.triangulateShape(contour, holePts);
    const ids = [...loops[i], ...hs.flatMap((j) => loops[j])];
    for (const t of tris) for (const k of t) capTris.push(ip[ids[k]]);
  });
  // 蓋：負側の部品は +n、正側の部品は −n を向くように巻き順を合わせる
  const cap = (normal: THREE.Vector3) => {
    const p: number[] = [], nn: number[] = [];
    const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
    for (let i = 0; i < capTris.length; i += 3) {
      let [a, b, c] = [capTris[i], capTris[i + 1], capTris[i + 2]];
      e1.subVectors(b, a);
      e2.subVectors(c, a);
      if (e1.cross(e2).dot(normal) < 0) [b, c] = [c, b];
      for (const v of [a, b, c]) {
        p.push(v.x, v.y, v.z);
        nn.push(normal.x, normal.y, normal.z);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
    return g;
  };
  const mk = (o: { p: number[]; n: number[] }) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(o.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(o.n, 3));
    return g;
  };
  return {
    neg: mk(out.neg),
    pos: mk(out.pos),
    capNeg: cap(n),
    capPos: cap(n.clone().negate()),
    loops: loops.map((l) => l.map((i) => ip[i])),
    open,
    holes,
  };
}

export default defineGeometryDemo({
  id: 'GEO-035',
  notes: '各三角形の頂点を平面との符号付き距離で分類し、跨ぐ三角形は辺上の交点で「1つの三角形＋四角形（2三角形）」に分ける。交点は辺の端点の組をキーに共有するので、隣接三角形の線分がつながって断面の閉ループになる。ループを平面座標へ写し、入れ子の深さで穴を判定して ShapeUtils で三角形分割し、両方の部品に蓋（赤）を付けて離して表示する。',
  params: [
    { key: 'height', label: '切断の高さ', type: 'number', min: -1.5, max: 1.5, step: 0.01, default: 0.15 },
    { key: 'tilt', label: '切断の傾き（度）', type: 'number', min: -80, max: 80, step: 1, default: 20 },
    { key: 'gap', label: '部品の離れ', type: 'number', min: 0, max: 3, step: 0.01, default: 1.0 },
    { key: 'shape', label: '切る形', type: 'select', options: [{ value: 'knot', label: 'トーラス結び目' }, { value: 'torus', label: '傾けたトーラス' }, { value: 'vase', label: '厚みのある器' }, { value: 'box', label: '立方体' }], default: 'knot' },
  ],
  liveKeys: ['gap'],
  distance: 9,
  compareLabels: ['切断前', '切断して蓋'],
  build(p, env) {
    const src = baseGeometry(String(p.shape), env.quality === 'low');
    const tilt = THREE.MathUtils.degToRad(Number(p.tilt));
    const n = new THREE.Vector3(Math.sin(tilt), Math.cos(tilt), 0).normalize();
    const h = Number(p.height);
    const r = slice(src, n, h);
    const object = new THREE.Group();
    const partNeg = new THREE.Group(), partPos = new THREE.Group();
    const capMat = () => std(0xff5d73, { roughness: 0.7 });
    partNeg.add(new THREE.Mesh(r.neg, std(0x6bb8ff)), new THREE.Mesh(r.capNeg, capMat()));
    partPos.add(new THREE.Mesh(r.pos, std(0xffc46b)), new THREE.Mesh(r.capPos, capMat()));
    object.add(partNeg, partPos);
    const before = new THREE.Mesh(src, std(0x8890b0));
    // 補助：切断面の枠と、切り口のループ（各部品の蓋の位置に表示）
    const helpers = new THREE.Group();
    const u = new THREE.Vector3(0, 0, 1), w = new THREE.Vector3().crossVectors(n, u);
    const c0 = n.clone().multiplyScalar(h);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => c0.clone().addScaledVector(u, a * 2.6).addScaledVector(w, b * 2.6));
    const frame = polyline(corners, 0x9aa3ff, { closed: true, opacity: 0.5 });
    helpers.add(frame);
    const loopNeg = new THREE.Group(), loopPos = new THREE.Group();
    for (const l of r.loops) {
      loopNeg.add(polyline(l, 0xffffff, { closed: true }));
      loopPos.add(polyline(l, 0xffffff, { closed: true }));
    }
    helpers.add(loopNeg, loopPos);
    const place = (gap: number) => {
      partNeg.position.copy(n).multiplyScalar(-gap / 2);
      partPos.position.copy(n).multiplyScalar(gap / 2);
      loopNeg.position.copy(partNeg.position);
      loopPos.position.copy(partPos.position);
    };
    place(Number(p.gap));
    return {
      object,
      before,
      helpers,
      info: `断面ループ ${r.loops.length}（うち穴 ${r.holes}）${r.open ? ` · 閉じない鎖 ${r.open}` : ''} · 蓋の三角形 ${r.capNeg.attributes.position.count / 3}`,
      update(_dt, _t, live) {
        place(Number(live.gap));
      },
    };
  },
});
