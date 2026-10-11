import * as THREE from 'three';

/** GEO-C / GEO-D（変形・メッシュ演算）共通の小道具 */

/** 変形の元になる位置を保持し、頂点ごとの写像を何度でも適用できるジオメトリ */
export interface Deformable {
  geo: THREE.BufferGeometry;
  orig: Float32Array;
  /** fn(x,y,z,out,i) で out に変形後の位置を書く。法線も再計算する */
  apply(fn: (x: number, y: number, z: number, out: THREE.Vector3, i: number) => void): void;
}

export function deformable(src: THREE.BufferGeometry): Deformable {
  const geo = src.clone();
  const orig = (src.attributes.position.array as Float32Array).slice();
  const out = new THREE.Vector3();
  return {
    geo,
    orig,
    apply(fn) {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const a = pos.array as Float32Array;
      for (let i = 0; i < pos.count; i++) {
        out.set(orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2]);
        fn(orig[i * 3], orig[i * 3 + 1], orig[i * 3 + 2], out, i);
        a[i * 3] = out.x;
        a[i * 3 + 1] = out.y;
        a[i * 3 + 2] = out.z;
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingBox();
      geo.computeBoundingSphere();
    },
  };
}

/** 符号付き体積（閉じたメッシュ用、インデックスあり・なし両対応） */
export function signedVolume(geo: THREE.BufferGeometry): number {
  const p = geo.attributes.position.array as ArrayLike<number>;
  const idx = geo.index ? (geo.index.array as ArrayLike<number>) : null;
  const n = idx ? idx.length : p.length / 3;
  let v = 0;
  for (let t = 0; t < n; t += 3) {
    const a = (idx ? idx[t] : t) * 3, b = (idx ? idx[t + 1] : t + 1) * 3, c = (idx ? idx[t + 2] : t + 2) * 3;
    v +=
      p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
      p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
      p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c]);
  }
  return v / 6;
}

/** 点列からの折れ線（補助線用） */
export function polyline(points: THREE.Vector3[], color: THREE.ColorRepresentation, opts: { closed?: boolean; opacity?: number } = {}): THREE.Line {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const m = new THREE.LineBasicMaterial({ color, transparent: opts.opacity !== undefined, opacity: opts.opacity ?? 1 });
  return opts.closed ? new THREE.LineLoop(g, m) : new THREE.Line(g, m);
}

/** 2点ずつの線分（補助線用）。positions は [x0,y0,z0,x1,y1,z1,...] */
export function lineSegs(positions: number[], color: THREE.ColorRepresentation, opacity?: number): THREE.LineSegments {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: opacity !== undefined, opacity: opacity ?? 1 }));
}

/** 点の表示（制御点など） */
export function dots(points: THREE.Vector3[] | number[], color: THREE.ColorRepresentation, size = 0.12): THREE.Points {
  const g = new THREE.BufferGeometry();
  if (points.length && typeof points[0] === 'number') g.setAttribute('position', new THREE.Float32BufferAttribute(points as number[], 3));
  else g.setFromPoints(points as THREE.Vector3[]);
  return new THREE.Points(g, new THREE.PointsMaterial({ color, size, sizeAttenuation: true }));
}

export interface Frames {
  points: THREE.Vector3[];
  tangents: THREE.Vector3[];
  normals: THREE.Vector3[];
  binormals: THREE.Vector3[];
  /** 累積弧長 */
  lengths: number[];
}

function tangentsOf(points: THREE.Vector3[], closed: boolean): THREE.Vector3[] {
  const n = points.length;
  return points.map((_, i) => {
    const a = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const b = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    return b.clone().sub(a).normalize();
  });
}

function cumulative(points: THREE.Vector3[]): number[] {
  const L = [0];
  for (let i = 1; i < points.length; i++) L.push(L[i - 1] + points[i].distanceTo(points[i - 1]));
  return L;
}

/**
 * 回転最小化フレーム（Wang et al. 2008 の二重反射法）。
 * closed のときは一周したときのずれ角を弧長に比例して配り、継ぎ目でねじれが跳ばないようにする。
 */
export function rmfFrames(points: THREE.Vector3[], closed = false): Frames {
  const n = points.length;
  const T = tangentsOf(points, closed);
  const N: THREE.Vector3[] = [];
  // 初期法線：接線に最も直交する座標軸から作る
  const t0 = T[0];
  const ax = Math.abs(t0.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  N.push(ax.sub(t0.clone().multiplyScalar(ax.dot(t0))).normalize());
  const v1 = new THREE.Vector3(), rL = new THREE.Vector3(), tL = new THREE.Vector3(), v2 = new THREE.Vector3();
  const step = (i: number, j: number) => {
    v1.subVectors(points[j], points[i]);
    const c1 = v1.dot(v1);
    if (c1 < 1e-12) return N[N.length - 1].clone();
    rL.copy(N[N.length - 1]).addScaledVector(v1, (-2 / c1) * v1.dot(N[N.length - 1]));
    tL.copy(T[i]).addScaledVector(v1, (-2 / c1) * v1.dot(T[i]));
    v2.subVectors(T[j], tL);
    const c2 = v2.dot(v2);
    if (c2 < 1e-12) return rL.clone().normalize();
    return rL.clone().addScaledVector(v2, (-2 / c2) * v2.dot(rL)).normalize();
  };
  for (let i = 0; i < n - 1; i++) N.push(step(i, i + 1));
  const lengths = cumulative(points);
  if (closed) {
    // 最後の点から始点へもう一歩進めて、始点の法線とのずれ角を求める
    const last = step(n - 1, 0);
    const b0 = new THREE.Vector3().crossVectors(T[0], N[0]);
    const err = Math.atan2(last.dot(b0), last.dot(N[0]));
    const total = lengths[n - 1] + points[n - 1].distanceTo(points[0]);
    for (let i = 0; i < n; i++) N[i].applyAxisAngle(T[i], (-err * lengths[i]) / total).normalize();
    lengths.push(total);
  }
  const B = T.map((t, i) => new THREE.Vector3().crossVectors(t, N[i]).normalize());
  return { points, tangents: T, normals: N, binormals: B, lengths };
}

/** フレネ枠（2階差分から主法線を求める。曲率が0付近で反転しうる） */
export function frenetFrames(points: THREE.Vector3[], closed = false): Frames {
  const n = points.length;
  const T = tangentsOf(points, closed);
  const N: (THREE.Vector3 | null)[] = [];
  const a = new THREE.Vector3();
  let prev: THREE.Vector3 | null = null;
  for (let i = 0; i < n; i++) {
    const p0 = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)];
    const p2 = points[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    a.copy(p0).add(p2).addScaledVector(points[i], -2);
    a.addScaledVector(T[i], -a.dot(T[i]));
    if (a.lengthSq() < 1e-10 || (!closed && (i === 0 || i === n - 1))) {
      // 曲率0：主法線が定まらないので直前の法線を流用する
      N.push(prev ? prev.clone().addScaledVector(T[i], -prev.dot(T[i])).normalize() : null);
      continue;
    }
    prev = a.clone().normalize();
    N.push(prev);
  }
  const first = N.find((v) => v) ?? new THREE.Vector3(0, 1, 0);
  const NN = N.map((v, i) => v ?? first.clone().addScaledVector(T[i], -first.dot(T[i])).normalize());
  const B = T.map((t, i) => new THREE.Vector3().crossVectors(t, NN[i]).normalize());
  return { points, tangents: T, normals: NN, binormals: B, lengths: cumulative(points) };
}

/** 曲線を弧長で等間隔に n 点サンプリング */
export function sampleCurve(curve: THREE.Curve<THREE.Vector3>, n: number, closed = false): THREE.Vector3[] {
  return (curve.getSpacedPoints(closed ? n : n - 1) as THREE.Vector3[]).slice(0, n);
}

/** 星形（外半径 r1・内半径 r2・k角）の2D点列（反時計回り） */
export function starPoints(k: number, r1: number, r2: number, rot = Math.PI / 2): THREE.Vector2[] {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i < k * 2; i++) {
    const r = i % 2 ? r2 : r1;
    const a = rot + (i / (k * 2)) * Math.PI * 2;
    pts.push(new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

/** 断面（2D点列）をフレーム列に沿って掃引した管（両端に蓋） */
export function sweepSection(frames: Frames, section: THREE.Vector2[], closed: boolean, scale: (i: number) => number = () => 1): THREE.BufferGeometry {
  const n = frames.points.length;
  const m = section.length;
  const pos: number[] = [];
  const idx: number[] = [];
  const tmp = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const s = scale(i);
    for (let j = 0; j <= m; j++) {
      const q = section[j % m];
      tmp.copy(frames.points[i]).addScaledVector(frames.normals[i], q.x * s).addScaledVector(frames.binormals[i], q.y * s);
      pos.push(tmp.x, tmp.y, tmp.z);
    }
  }
  const rows = closed ? n : n - 1;
  for (let i = 0; i < rows; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < m; j++) {
      const a = i * (m + 1) + j, b = i2 * (m + 1) + j, c = i2 * (m + 1) + j + 1, d = i * (m + 1) + j + 1;
      idx.push(a, b, d, b, c, d);
    }
  }
  if (!closed) {
    // 蓋（中心からの扇）
    for (const [i, flip] of [[0, true], [n - 1, false]] as [number, boolean][]) {
      const center = pos.length / 3;
      pos.push(frames.points[i].x, frames.points[i].y, frames.points[i].z);
      for (let j = 0; j < m; j++) {
        const a = i * (m + 1) + j, b = i * (m + 1) + j + 1;
        if (flip) idx.push(center, b, a);
        else idx.push(center, a, b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** フレームの法線・従法線を短い線で示す補助線 */
export function frameTicks(frames: Frames, every: number, len: number): THREE.Group {
  const nPos: number[] = [], bPos: number[] = [];
  for (let i = 0; i < frames.points.length; i += every) {
    const p = frames.points[i];
    nPos.push(p.x, p.y, p.z, p.x + frames.normals[i].x * len, p.y + frames.normals[i].y * len, p.z + frames.normals[i].z * len);
    bPos.push(p.x, p.y, p.z, p.x + frames.binormals[i].x * len, p.y + frames.binormals[i].y * len, p.z + frames.binormals[i].z * len);
  }
  const g = new THREE.Group();
  g.add(lineSegs(nPos, 0xff6b6b), lineSegs(bPos, 0x6bff9a));
  return g;
}
