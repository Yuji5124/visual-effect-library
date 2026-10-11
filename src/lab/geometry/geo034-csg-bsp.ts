import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';

/** GEO-034 CSG：BSP木で多角形を内側・外側に分類・分割するブーリアン演算（独自実装） */

const EPS = 1e-5;

interface Vert {
  p: THREE.Vector3;
  n: THREE.Vector3;
}

class Plane {
  constructor(public n: THREE.Vector3, public w: number) {}
  static from(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): Plane {
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    return new Plane(n, n.dot(a));
  }
  clone(): Plane {
    return new Plane(this.n.clone(), this.w);
  }
  flip(): void {
    this.n.negate();
    this.w = -this.w;
  }
}

class Poly {
  plane: Plane;
  /** 0=箱, 1=球（色分け用） */
  constructor(public verts: Vert[], public src: number, plane?: Plane) {
    this.plane = plane ?? Plane.from(verts[0].p, verts[1].p, verts[2].p);
  }
  clone(): Poly {
    return new Poly(this.verts.map((v) => ({ p: v.p.clone(), n: v.n.clone() })), this.src, this.plane.clone());
  }
  flip(): void {
    this.verts.reverse();
    for (const v of this.verts) v.n.negate();
    this.plane.flip();
  }
}

const COPLANAR = 0, FRONT = 1, BACK = 2, SPANNING = 3;

/** 平面で多角形を分類し、跨ぐものは2つに切る */
function splitPolygon(pl: Plane, poly: Poly, coFront: Poly[], coBack: Poly[], front: Poly[], back: Poly[]): void {
  let type = 0;
  const types: number[] = [];
  for (const v of poly.verts) {
    const t = pl.n.dot(v.p) - pl.w;
    const ty = t < -EPS ? BACK : t > EPS ? FRONT : COPLANAR;
    type |= ty;
    types.push(ty);
  }
  if (type === COPLANAR) (pl.n.dot(poly.plane.n) > 0 ? coFront : coBack).push(poly);
  else if (type === FRONT) front.push(poly);
  else if (type === BACK) back.push(poly);
  else {
    const f: Vert[] = [], b: Vert[] = [];
    const n = poly.verts.length;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const ti = types[i], tj = types[j];
      const vi = poly.verts[i], vj = poly.verts[j];
      if (ti !== BACK) f.push(vi);
      if (ti !== FRONT) b.push(ti !== BACK ? { p: vi.p.clone(), n: vi.n.clone() } : vi);
      if ((ti | tj) === SPANNING) {
        const t = (pl.w - pl.n.dot(vi.p)) / pl.n.dot(new THREE.Vector3().subVectors(vj.p, vi.p));
        const v = { p: vi.p.clone().lerp(vj.p, t), n: vi.n.clone().lerp(vj.n, t).normalize() };
        f.push(v);
        b.push({ p: v.p.clone(), n: v.n.clone() });
      }
    }
    if (f.length >= 3) front.push(new Poly(f, poly.src, poly.plane.clone()));
    if (b.length >= 3) back.push(new Poly(b, poly.src, poly.plane.clone()));
  }
}

class BspNode {
  plane: Plane | null = null;
  front: BspNode | null = null;
  back: BspNode | null = null;
  polys: Poly[] = [];
  constructor(polys?: Poly[]) {
    if (polys) this.build(polys);
  }
  invert(): void {
    for (const p of this.polys) p.flip();
    this.plane?.flip();
    this.front?.invert();
    this.back?.invert();
    [this.front, this.back] = [this.back, this.front];
  }
  /** この木の立体の内側にある部分を polys から取り除く */
  clipPolygons(polys: Poly[]): Poly[] {
    if (!this.plane) return polys.slice();
    let f: Poly[] = [], b: Poly[] = [];
    for (const p of polys) splitPolygon(this.plane, p, f, b, f, b);
    if (this.front) f = this.front.clipPolygons(f);
    b = this.back ? this.back.clipPolygons(b) : [];
    return f.concat(b);
  }
  clipTo(other: BspNode): void {
    this.polys = other.clipPolygons(this.polys);
    this.front?.clipTo(other);
    this.back?.clipTo(other);
  }
  all(): Poly[] {
    let out = this.polys.slice();
    if (this.front) out = out.concat(this.front.all());
    if (this.back) out = out.concat(this.back.all());
    return out;
  }
  build(polys: Poly[]): void {
    if (!polys.length) return;
    if (!this.plane) this.plane = polys[0].plane.clone();
    const f: Poly[] = [], b: Poly[] = [];
    for (const p of polys) splitPolygon(this.plane, p, this.polys, this.polys, f, b);
    if (f.length) (this.front ??= new BspNode()).build(f);
    if (b.length) (this.back ??= new BspNode()).build(b);
  }
}

function csg(op: string, a: Poly[], b: Poly[]): Poly[] {
  const A = new BspNode(a.map((p) => p.clone()));
  const B = new BspNode(b.map((p) => p.clone()));
  if (op === 'union') {
    A.clipTo(B);
    B.clipTo(A);
    B.invert();
    B.clipTo(A);
    B.invert();
    A.build(B.all());
    return A.all();
  }
  if (op === 'subtract') {
    A.invert();
    A.clipTo(B);
    B.clipTo(A);
    B.invert();
    B.clipTo(A);
    B.invert();
    A.build(B.all());
    A.invert();
    return A.all();
  }
  // 積
  A.invert();
  B.clipTo(A);
  B.invert();
  A.clipTo(B);
  B.clipTo(A);
  A.build(B.all());
  A.invert();
  return A.all();
}

/** BufferGeometry → 三角形の多角形列 */
function toPolys(geo: THREE.BufferGeometry, m: THREE.Matrix4, src: number): Poly[] {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  g.applyMatrix4(m);
  const pos = g.attributes.position, nrm = g.attributes.normal;
  const out: Poly[] = [];
  for (let i = 0; i < pos.count; i += 3) {
    const verts: Vert[] = [0, 1, 2].map((k) => ({ p: new THREE.Vector3().fromBufferAttribute(pos, i + k), n: new THREE.Vector3().fromBufferAttribute(nrm, i + k) }));
    // 極付近の潰れた三角形は除く
    if (new THREE.Vector3().subVectors(verts[1].p, verts[0].p).cross(new THREE.Vector3().subVectors(verts[2].p, verts[0].p)).lengthSq() < 1e-12) continue;
    out.push(new Poly(verts, src));
  }
  g.dispose();
  return out;
}

/** 多角形列 → 扇形に三角形化した BufferGeometry（出所で頂点色を分ける） */
function toGeometry(polys: Poly[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const pos: number[] = [], nrm: number[] = [], col: number[] = [];
  const colors = [new THREE.Color(0xffa94d), new THREE.Color(0x5ab8ff)];
  for (const p of polys) {
    const c = colors[p.src];
    for (let i = 1; i + 1 < p.verts.length; i++) {
      for (const v of [p.verts[0], p.verts[i], p.verts[i + 1]]) {
        pos.push(v.p.x, v.p.y, v.p.z);
        nrm.push(v.n.x, v.n.y, v.n.z);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  return geo;
}

export default defineGeometryDemo({
  id: 'GEO-034',
  notes: '箱と球を多角形の集合に変え、それぞれ BSP 木を作る。相手の木で多角形を前（外）・後（内）・同一平面に分類し、跨ぐものは平面で切る（clipTo）。和は互いの外側を残し、差と積は木を反転（invert）して組み合わせる。色は元の立体（橙=箱、青=球）。アニメーション中は約8回/秒で演算し直す。',
  params: [
    { key: 'op', label: '演算', type: 'select', options: [{ value: 'subtract', label: '差（箱 − 球）' }, { value: 'union', label: '和（箱 ∪ 球）' }, { value: 'intersect', label: '積（箱 ∩ 球）' }], default: 'subtract' },
    { key: 'sx', label: '球の位置 x', type: 'number', min: -1.8, max: 1.8, step: 0.01, default: 0.7 },
    { key: 'sy', label: '球の位置 y', type: 'number', min: -1.2, max: 1.2, step: 0.01, default: 0.5 },
    { key: 'radius', label: '球の半径', type: 'number', min: 0.4, max: 1.6, step: 0.01, default: 1.15 },
    { key: 'segments', label: '球の分割数', type: 'number', min: 6, max: 40, step: 1, default: 20 },
    { key: 'animate', label: '球の位置をアニメーション', type: 'bool', default: false },
  ],
  liveKeys: ['sx', 'sy', 'animate'],
  distance: 8,
  compareLabels: ['入力（箱と球）', 'CSG結果'],
  build(p, env) {
    const seg = Math.min(Number(p.segments), env.quality === 'low' ? 24 : 40);
    const boxGeo = new THREE.BoxGeometry(2.2, 2.2, 2.2);
    const sphGeo = new THREE.SphereGeometry(Number(p.radius), seg, Math.max(4, Math.round(seg * 0.6)));
    const boxPolys = toPolys(boxGeo, new THREE.Matrix4(), 0);
    const object = new THREE.Mesh(new THREE.BufferGeometry(), std(0xffffff, { vertexColors: true, side: THREE.DoubleSide }));
    // 処理前：箱と球を半透明で重ねる
    const before = new THREE.Group();
    const beforeSph = new THREE.Mesh(sphGeo.clone(), std(0x5ab8ff, { transparent: true, opacity: 0.55 }));
    before.add(new THREE.Mesh(boxGeo.clone(), std(0xffa94d, { transparent: true, opacity: 0.55 })), beforeSph);
    // 補助：入力の輪郭線
    const helpers = new THREE.Group();
    const boxEdges = new THREE.LineSegments(new THREE.EdgesGeometry(boxGeo), new THREE.LineBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.5 }));
    const sphEdges = new THREE.LineSegments(new THREE.WireframeGeometry(sphGeo), new THREE.LineBasicMaterial({ color: 0x6bd3ff, transparent: true, opacity: 0.12 }));
    helpers.add(boxEdges, sphEdges);
    let ms = 0, nPoly = 0, nIn = 0;
    let cur = '';
    const apply = (x: number, y: number) => {
      const t0 = performance.now();
      const m = new THREE.Matrix4().makeTranslation(x, y, 0.3);
      const sphPolys = toPolys(sphGeo, m, 1);
      nIn = boxPolys.length + sphPolys.length;
      const res = csg(String(p.op), boxPolys, sphPolys);
      nPoly = res.length;
      // 属性を差し替えると古いGPUバッファが残るので、ジオメトリごと作り直して古い方を解放する
      const old = object.geometry;
      object.geometry = toGeometry(res);
      old.dispose();
      beforeSph.position.set(x, y, 0.3);
      sphEdges.position.set(x, y, 0.3);
      ms = performance.now() - t0;
    };
    let acc = 0;
    let phase = 0;
    apply(Number(p.sx), Number(p.sy));
    cur = `${Number(p.sx).toFixed(4)},${Number(p.sy).toFixed(4)}`;
    return {
      object,
      before,
      helpers,
      info: () => `入力 ${nIn} 多角形 → 出力 ${nPoly} 多角形 · 演算 ${ms.toFixed(1)} ms`,
      update(dt, _time, live) {
        let x = Number(live.sx), y = Number(live.sy);
        if (live.animate) {
          phase += dt;
          acc += dt;
          x = Math.sin(phase * 0.7) * 1.4;
          y = Math.sin(phase * 1.1) * 0.6;
          if (acc < 1 / 8) return;
          acc = 0;
        }
        const key = `${x.toFixed(4)},${y.toFixed(4)}`;
        if (key === cur) return;
        cur = key;
        apply(x, y);
      },
      dispose() {
        boxGeo.dispose();
        sphGeo.dispose();
      },
    };
  },
});
