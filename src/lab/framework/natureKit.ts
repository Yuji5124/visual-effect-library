import * as THREE from 'three';

/**
 * 自然・植生系デモ（WRD-021〜030）の共通部品：
 * ポアソンディスク（Bridson）、最近傍距離、半径の円、線分インスタンス行列、動的インスタンス、3D折れ線グラフ。
 */

export interface P2 {
  x: number;
  y: number;
}

/**
 * Bridson の高速ポアソンディスク。領域 [0,w]×[0,h]、最小距離 r、候補試行 k。
 * 戻り値は採用順（生成過程の再生に使える）。
 */
export function poissonDisk(rng: () => number, w: number, h: number, r: number, k = 30, max = 20000): P2[] {
  const cell = r / Math.SQRT2;
  const gw = Math.max(1, Math.ceil(w / cell)), gh = Math.max(1, Math.ceil(h / cell));
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts: P2[] = [];
  const active: number[] = [];
  const r2 = r * r;
  const put = (x: number, y: number) => {
    const i = pts.length;
    pts.push({ x, y });
    active.push(i);
    grid[Math.min(gh - 1, Math.floor(y / cell)) * gw + Math.min(gw - 1, Math.floor(x / cell))] = i;
  };
  put(rng() * w, rng() * h);
  while (active.length && pts.length < max) {
    const ai = Math.floor(rng() * active.length);
    const p = pts[active[ai]];
    let found = false;
    for (let t = 0; t < k; t++) {
      // r〜2r の環から面積一様に候補を取る
      const a = rng() * Math.PI * 2;
      const d = r * Math.sqrt(1 + 3 * rng());
      const x = p.x + Math.cos(a) * d, y = p.y + Math.sin(a) * d;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      const gx = Math.floor(x / cell), gy = Math.floor(y / cell);
      let ok = true;
      for (let j = Math.max(0, gy - 2); ok && j <= Math.min(gh - 1, gy + 2); j++) {
        for (let i = Math.max(0, gx - 2); i <= Math.min(gw - 1, gx + 2); i++) {
          const q = grid[j * gw + i];
          if (q < 0) continue;
          const dx = pts[q].x - x, dy = pts[q].y - y;
          if (dx * dx + dy * dy < r2) {
            ok = false;
            break;
          }
        }
      }
      if (ok) {
        put(x, y);
        found = true;
        break;
      }
    }
    if (!found) {
      active[ai] = active[active.length - 1];
      active.pop();
    }
  }
  return pts;
}

/** 一様ランダム配置 */
export function uniformPoints(rng: () => number, w: number, h: number, n: number): P2[] {
  return Array.from({ length: n }, () => ({ x: rng() * w, y: rng() * h }));
}

/** 各点の最近傍距離（空間ハッシュ） */
export function nearestDistances(pts: P2[], cell = 0.5): Float32Array {
  const map = new Map<number, number[]>();
  const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
  pts.forEach((p, k) => {
    const id = key(Math.floor(p.x / cell), Math.floor(p.y / cell));
    const a = map.get(id);
    if (a) a.push(k);
    else map.set(id, [k]);
  });
  const out = new Float32Array(pts.length);
  pts.forEach((p, k) => {
    const ci = Math.floor(p.x / cell), cj = Math.floor(p.y / cell);
    let best = Infinity;
    for (let ring = 1; ring < 64; ring++) {
      for (let j = cj - ring; j <= cj + ring; j++) {
        for (let i = ci - ring; i <= ci + ring; i++) {
          const a = map.get(key(i, j));
          if (!a) continue;
          for (const q of a) {
            if (q === k) continue;
            const d = Math.hypot(pts[q].x - p.x, pts[q].y - p.y);
            if (d < best) best = d;
          }
        }
      }
      // 見つかった距離が確定できる範囲まで調べたら打ち切り
      if (best <= ring * cell) break;
    }
    out[k] = best === Infinity ? 0 : best;
  });
  return out;
}

/** 円（xz 平面、高さ y）の集合を1つの LineSegments にする */
export function ringLines(items: { x: number; z: number; r: number }[], y: number, color: THREE.ColorRepresentation | ((i: number) => THREE.Color), seg = 20, opacity?: number): THREE.LineSegments {
  const pos = new Float32Array(Math.max(1, items.length) * seg * 6);
  const col = new Float32Array(Math.max(1, items.length) * seg * 6);
  const c = new THREE.Color();
  items.forEach((it, k) => {
    if (typeof color === 'function') c.copy(color(k));
    else c.set(color);
    for (let s = 0; s < seg; s++) {
      const a0 = (s / seg) * Math.PI * 2, a1 = ((s + 1) / seg) * Math.PI * 2;
      const o = (k * seg + s) * 6;
      pos[o] = it.x + Math.cos(a0) * it.r;
      pos[o + 1] = y;
      pos[o + 2] = it.z + Math.sin(a0) * it.r;
      pos[o + 3] = it.x + Math.cos(a1) * it.r;
      pos[o + 4] = y;
      pos[o + 5] = it.z + Math.sin(a1) * it.r;
      col.set([c.r, c.g, c.b, c.r, c.g, c.b], o);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setDrawRange(0, items.length * seg * 2);
  const mat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: opacity !== undefined, opacity: opacity ?? 1 });
  return new THREE.LineSegments(geo, mat);
}

const _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);
/**
 * 点 a から b へ伸びる部材の行列。ジオメトリは底面が原点・+y 方向に長さ1（unitCylinder など）を想定。
 * sx/sz は太さ（x は水平方向に揃える）。
 */
export function segmentMatrix(m: THREE.Matrix4, a: THREE.Vector3, b: THREE.Vector3, sx: number, sz = sx): THREE.Matrix4 {
  _y.subVectors(b, a);
  const len = _y.length();
  if (len < 1e-7) return m.makeScale(0, 0, 0);
  _y.divideScalar(len);
  _x.crossVectors(_y, UP);
  if (_x.lengthSq() < 1e-8) _x.set(1, 0, 0);
  _x.normalize();
  _z.crossVectors(_x, _y);
  m.makeBasis(_x.multiplyScalar(sx), _y.multiplyScalar(len), _z.multiplyScalar(sz));
  m.setPosition(a);
  return m;
}

/** 底面が原点で +y に長さ1、上端が細い円柱（枝用） */
export function unitBranch(radial = 6, taper = 0.7): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(taper, 1, 1, radial, 1, false);
  g.translate(0, 0.5, 0);
  return g;
}

/**
 * 容量固定の動的インスタンス集合。put で順に詰め、commit で表示数を確定する。
 * 個体ごとの色は instanceColor（マテリアル色と乗算）。
 */
export class InstSet {
  readonly mesh: THREE.InstancedMesh;
  count = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly p = new THREE.Vector3();
  private readonly s = new THREE.Vector3();
  private readonly c = new THREE.Color();
  constructor(geometry: THREE.BufferGeometry, material: THREE.Material, readonly capacity: number) {
    this.mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, capacity));
    const white = new THREE.Color(1, 1, 1);
    for (let i = 0; i < Math.max(1, capacity); i++) this.mesh.setColorAt(i, white);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
  }

  /** 位置・寸法・y軸回転・色を i 番目に書く */
  setAt(i: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, color: THREE.ColorRepresentation): void {
    this.p.set(x, y, z);
    this.s.set(sx, sy, sz);
    this.q.setFromAxisAngle(UP, ry);
    this.m.compose(this.p, this.q, this.s);
    this.mesh.setMatrixAt(i, this.m);
    this.mesh.setColorAt(i, this.c.set(color));
  }

  setMatrixAt(i: number, m: THREE.Matrix4, color: THREE.ColorRepresentation): void {
    this.mesh.setMatrixAt(i, m);
    this.mesh.setColorAt(i, this.c.set(color));
  }

  put(x: number, y: number, z: number, sx: number, sy: number, sz: number, ry: number, color: THREE.ColorRepresentation): number {
    if (this.count >= this.capacity) return -1;
    this.setAt(this.count, x, y, z, sx, sy, sz, ry, color);
    return this.count++;
  }

  putMatrix(m: THREE.Matrix4, color: THREE.ColorRepresentation): number {
    if (this.count >= this.capacity) return -1;
    this.setMatrixAt(this.count, m, color);
    return this.count++;
  }

  reset(): void {
    this.count = 0;
  }

  commit(count = this.count): void {
    this.mesh.count = Math.min(count, this.capacity);
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }
}

/** 幹（円柱）＋樹冠（円錐または球）の木をまとめて描く */
export class TreeSet {
  readonly group = new THREE.Group();
  readonly trunks: InstSet;
  readonly crowns: InstSet;
  constructor(capacity: number, readonly shape: 'cone' | 'ball', opts: { radial?: number } = {}) {
    const radial = opts.radial ?? 7;
    const trunkGeo = new THREE.CylinderGeometry(0.5, 0.6, 1, 5);
    trunkGeo.translate(0, 0.5, 0);
    const crownGeo = shape === 'cone' ? new THREE.ConeGeometry(0.5, 1, radial) : new THREE.IcosahedronGeometry(0.5, 1);
    crownGeo.translate(0, 0.5, 0);
    const mat = () => new THREE.MeshStandardMaterial({ roughness: 0.85, metalness: 0, flatShading: true });
    this.trunks = new InstSet(trunkGeo, mat(), capacity);
    this.crowns = new InstSet(crownGeo, mat(), capacity);
    this.group.add(this.trunks.mesh, this.crowns.mesh);
  }

  /** (x, base, z) に高さ h・樹冠半径 cr の木を置く（cone は樹冠が高さの 75%、ball は上半分） */
  put(x: number, base: number, z: number, h: number, cr: number, color: THREE.ColorRepresentation, trunkColor: THREE.ColorRepresentation = 0x6b4a2f, ry = 0): void {
    const tr = Math.max(0.015, cr * 0.18);
    if (this.shape === 'cone') {
      this.trunks.put(x, base, z, tr, h * 0.3, tr, ry, trunkColor);
      this.crowns.put(x, base + h * 0.2, z, cr * 2, h * 0.8, cr * 2, ry, color);
    } else {
      this.trunks.put(x, base, z, tr, h * 0.5, tr, ry, trunkColor);
      const ch = Math.min(h * 0.75, cr * 2);
      this.crowns.put(x, base + h - ch, z, cr * 2, ch, cr * 2, ry, color);
    }
  }

  reset(): void {
    this.trunks.reset();
    this.crowns.reset();
  }

  commit(): void {
    this.trunks.commit();
    this.crowns.commit();
  }

  get count(): number {
    return this.crowns.count;
  }
}

/**
 * 縦に立てた3Dの折れ線グラフパネル（時間変化の面積割合、両対数グラフなど）。
 * 系列ごとに 0..1 正規化した (u, v) を書き込む。
 */
export class LineChart3D {
  readonly group = new THREE.Group();
  private readonly lines: THREE.Line[] = [];
  constructor(
    readonly width: number,
    readonly height: number,
    colors: THREE.ColorRepresentation[],
    readonly cap: number,
    opts: { gridX?: number; gridY?: number; background?: number } = {},
  ) {
    const back = new THREE.Mesh(
      new THREE.PlaneGeometry(width * 1.08, height * 1.12),
      new THREE.MeshBasicMaterial({ color: opts.background ?? 0x10142a, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    back.position.set(width / 2, height / 2, -0.01);
    this.group.add(back);
    const g: number[] = [];
    const gx = opts.gridX ?? 4, gy = opts.gridY ?? 4;
    for (let i = 0; i <= gx; i++) g.push((i / gx) * width, 0, 0, (i / gx) * width, height, 0);
    for (let j = 0; j <= gy; j++) g.push(0, (j / gy) * height, 0, width, (j / gy) * height, 0);
    const grid = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(g, 3)),
      new THREE.LineBasicMaterial({ color: 0x3a4170, transparent: true, opacity: 0.8 }),
    );
    this.group.add(grid);
    for (const c of colors) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
      geo.setDrawRange(0, 0);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: c }));
      line.frustumCulled = false;
      line.position.z = 0.01;
      this.lines.push(line);
      this.group.add(line);
    }
  }

  /** 系列 s を (u[i], v[i]) で置き換える（0..1） */
  set(s: number, u: ArrayLike<number>, v: ArrayLike<number>): void {
    const line = this.lines[s];
    const attr = line.geometry.attributes.position as THREE.BufferAttribute;
    const n = Math.min(this.cap, u.length);
    for (let i = 0; i < n; i++) {
      attr.array[i * 3] = THREE.MathUtils.clamp(u[i], 0, 1) * this.width;
      attr.array[i * 3 + 1] = THREE.MathUtils.clamp(v[i], 0, 1) * this.height;
      attr.array[i * 3 + 2] = 0;
    }
    attr.needsUpdate = true;
    line.geometry.setDrawRange(0, n);
  }
}

/** 0..1 → 青→緑→黄→赤 のヒートマップ色 */
export function heatColor(t: number, out = new THREE.Color()): THREE.Color {
  t = THREE.MathUtils.clamp(t, 0, 1);
  const stops: [number, number, number][] = [
    [0.08, 0.1, 0.35],
    [0.1, 0.45, 0.65],
    [0.2, 0.7, 0.4],
    [0.95, 0.85, 0.25],
    [0.9, 0.3, 0.15],
  ];
  const f = t * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(f));
  const u = f - i;
  const a = stops[i], b = stops[i + 1];
  return out.setRGB(a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u);
}

/** ヒストグラム（xz 平面に並ぶ棒、高さは最大値で正規化） */
export function histogramBars(values: ArrayLike<number>, width: number, height: number, color: THREE.ColorRepresentation): THREE.InstancedMesh {
  const n = values.length;
  let mx = 1e-9;
  for (let i = 0; i < n; i++) mx = Math.max(mx, values[i]);
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const set = new InstSet(geo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), n);
  const bw = width / n;
  for (let i = 0; i < n; i++) set.put((i + 0.5) * bw, 0, 0, bw * 0.85, Math.max(0.001, (values[i] / mx) * height), bw * 0.85, 0, color);
  set.commit();
  return set.mesh;
}
