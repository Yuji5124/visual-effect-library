import * as THREE from 'three';

/** GEO-B（曲線・曲面）共通：ベジェ・Bスプライン・NURBS の独自評価と、補助表示の部品 */

/** ド・カステリョ法の全段階（levels[0] が制御点、最後が曲線上の1点） */
export function deCasteljauLevels(pts: THREE.Vector3[], t: number): THREE.Vector3[][] {
  const levels: THREE.Vector3[][] = [pts];
  let cur = pts;
  while (cur.length > 1) {
    const next: THREE.Vector3[] = [];
    for (let i = 0; i < cur.length - 1; i++) next.push(cur[i].clone().lerp(cur[i + 1], t));
    levels.push(next);
    cur = next;
  }
  return levels;
}

export function deCasteljau(pts: THREE.Vector3[], t: number, out = new THREE.Vector3()): THREE.Vector3 {
  const tmp = pts.map((p) => p.clone());
  for (let r = tmp.length - 1; r > 0; r--) for (let i = 0; i < r; i++) tmp[i].lerp(tmp[i + 1], t);
  return out.copy(tmp[0]);
}

/** バーンスタイン基底 B_{i,n}(t) */
export function bernstein(n: number, i: number, t: number): number {
  let c = 1;
  for (let k = 1; k <= i; k++) c = (c * (n - k + 1)) / k;
  return c * Math.pow(t, i) * Math.pow(1 - t, n - i);
}

/** ノットベクトル：クランプ（両端 p+1 重）／開いた一様 */
export function makeKnots(nCtrl: number, p: number, kind: 'clamped' | 'uniform'): number[] {
  const m = nCtrl + p + 1;
  const k: number[] = [];
  if (kind === 'uniform') {
    for (let i = 0; i < m; i++) k.push(i / (m - 1));
    return k;
  }
  const inner = nCtrl - p;
  for (let i = 0; i < m; i++) {
    if (i <= p) k.push(0);
    else if (i >= nCtrl) k.push(1);
    else k.push((i - p) / inner);
  }
  return k;
}

/** 曲線の定義域 [u_p, u_{n}]（n=制御点数） */
export function knotDomain(knots: number[], p: number, nCtrl: number): [number, number] {
  return [knots[p], knots[nCtrl]];
}

/** Cox–de Boor の再帰式による基底関数 N_{i,p}(u)。最終区間の右端は閉じる */
export function coxDeBoor(i: number, p: number, u: number, knots: number[]): number {
  if (p === 0) {
    const a = knots[i], b = knots[i + 1];
    if (u >= a && u < b) return 1;
    // ノット列の右端（クランプ時の u=1）を最後の非退化区間に含める
    const end = knots[knots.length - 1];
    if (u === end && b === end && a < b) return 1;
    return 0;
  }
  let s = 0;
  const d1 = knots[i + p] - knots[i];
  const d2 = knots[i + p + 1] - knots[i + 1];
  if (d1 > 0) s += ((u - knots[i]) / d1) * coxDeBoor(i, p - 1, u, knots);
  if (d2 > 0) s += ((knots[i + p + 1] - u) / d2) * coxDeBoor(i + 1, p - 1, u, knots);
  return s;
}

/** 全基底関数を一度に（長さ nCtrl） */
export function basisAll(nCtrl: number, p: number, u: number, knots: number[], out: number[] = []): number[] {
  for (let i = 0; i < nCtrl; i++) out[i] = coxDeBoor(i, p, u, knots);
  return out;
}

/** 有理Bスプライン（NURBS）曲線の点。weights 省略で非有理 */
export function nurbsPoint(ctrl: THREE.Vector3[], weights: number[] | null, p: number, knots: number[], u: number, out = new THREE.Vector3()): THREE.Vector3 {
  out.set(0, 0, 0);
  let wsum = 0;
  for (let i = 0; i < ctrl.length; i++) {
    const N = coxDeBoor(i, p, u, knots);
    if (N === 0) continue;
    const w = N * (weights ? weights[i] : 1);
    out.addScaledVector(ctrl[i], w);
    wsum += w;
  }
  return wsum > 0 ? out.multiplyScalar(1 / wsum) : out;
}

/** 関数で与える曲線（TubeGeometry 用）。t∈[0,1] */
export class FnCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private fn: (t: number, out: THREE.Vector3) => THREE.Vector3) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    return this.fn(t, target);
  }
}

/** 点列（等間隔のサンプル）を折れ線補間する曲線 */
export class SampledCurve extends THREE.Curve<THREE.Vector3> {
  constructor(public pts: THREE.Vector3[]) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const n = this.pts.length - 1;
    const x = Math.min(Math.max(t, 0), 1) * n;
    const i = Math.min(Math.floor(x), n - 1);
    return target.copy(this.pts[i]).lerp(this.pts[i + 1], x - i);
  }
}

/** 曲線用チューブ：毎フレーム作り直しても古いジオメトリを解放する */
export class TubeLine {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  constructor(color: THREE.ColorRepresentation, readonly radius = 0.05, readonly segments = 160, readonly radial = 8, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
    this.mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.1, ...opts }));
  }
  set(curve: THREE.Curve<THREE.Vector3>, closed = false): THREE.TubeGeometry {
    const g = new THREE.TubeGeometry(curve, this.segments, this.radius, this.radial, closed);
    this.mesh.geometry.dispose();
    this.mesh.geometry = g;
    return g;
  }
  /** チューブの輪ごとに色を塗る（t∈[0,1] → 色） */
  colorRings(fn: (t: number, c: THREE.Color) => void): void {
    const g = this.mesh.geometry;
    const n = g.attributes.position.count;
    const ring = this.radial + 1;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let j = 0; j <= this.segments; j++) {
      fn(j / this.segments, c);
      for (let k = 0; k < ring; k++) {
        const o = (j * ring + k) * 3;
        col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
      }
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.mesh.material.vertexColors = true;
    this.mesh.material.needsUpdate = true;
  }
}

/** 位置を毎フレーム書き換えられる線分（LineSegments、最大本数固定） */
export class DynLines {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  private col: Float32Array;
  private n = 0;
  constructor(readonly max: number, opts: { opacity?: number } = {}) {
    this.pos = new Float32Array(max * 6);
    this.col = new Float32Array(max * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true, transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1 }));
    this.lines.frustumCulled = false;
  }
  clear(): void {
    this.n = 0;
  }
  seg(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Color): void {
    if (this.n >= this.max) return;
    const o = this.n * 6;
    this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], o);
    this.col.set([c.r, c.g, c.b, c.r, c.g, c.b], o);
    this.n++;
  }
  polyline(pts: THREE.Vector3[], c: THREE.Color, closed = false): void {
    for (let i = 0; i < pts.length - 1; i++) this.seg(pts[i], pts[i + 1], c);
    if (closed && pts.length > 2) this.seg(pts[pts.length - 1], pts[0], c);
  }
  commit(): void {
    const g = this.lines.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.setDrawRange(0, this.n * 2);
  }
}

/** 位置・大きさ・色を毎フレーム変えられる球マーカー群 */
export class Markers {
  readonly mesh: THREE.InstancedMesh;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3();
  private c = new THREE.Color();
  constructor(readonly max: number, radius = 0.08) {
    this.mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(radius, 14, 10), new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.05 }), max);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(max * 3).fill(1), 3);
  }
  set(i: number, p: THREE.Vector3, color: THREE.ColorRepresentation, scale = 1): void {
    if (i >= this.max) return;
    this.s.setScalar(scale);
    this.m.compose(p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.setColorAt(i, this.c.set(color));
    if (i + 1 > this.mesh.count) this.mesh.count = i + 1;
  }
  commit(count?: number): void {
    if (count !== undefined) this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** 静的な折れ線 */
export function polyline(pts: THREE.Vector3[], color: THREE.ColorRepresentation, opts: { closed?: boolean; opacity?: number; dashed?: boolean } = {}): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints(opts.closed ? [...pts, pts[0]] : pts);
  const mat = opts.dashed
    ? new THREE.LineDashedMaterial({ color, dashSize: 0.12, gapSize: 0.08, transparent: true, opacity: opts.opacity ?? 1 })
    : new THREE.LineBasicMaterial({ color, transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1 });
  const l = new THREE.Line(g, mat);
  if (opts.dashed) l.computeLineDistances();
  return l;
}
