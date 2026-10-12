import * as THREE from 'three';

/**
 * WORLD GENERATION 用の共通部品：高さ場メッシュ、格子テクスチャ、インスタンス箱、線分。
 * どれも返したオブジェクトを sceneLab の group に入れれば、再生成時に自動で解放される。
 */

/** 標高→色（海・浜・草・森・岩・雪） */
export function terrainColor(h: number, sea = 0, out = new THREE.Color()): THREE.Color {
  if (h < sea - 0.25) return out.setRGB(0.05, 0.12, 0.32);
  if (h < sea) return out.setRGB(0.1, 0.25, 0.5);
  const t = h - sea;
  if (t < 0.04) return out.setRGB(0.76, 0.7, 0.48);
  if (t < 0.3) return out.setRGB(0.28, 0.52, 0.22);
  if (t < 0.55) return out.setRGB(0.17, 0.36, 0.16);
  if (t < 0.8) return out.setRGB(0.42, 0.38, 0.34);
  return out.setRGB(0.92, 0.93, 0.96);
}

/**
 * n×n の高さ場メッシュ（中心原点、xz 平面に size 四方）。
 * heights は行優先 (j*n+i)。setHeights / setColors で動的に更新できる。
 */
export class Heightfield {
  readonly mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  readonly geometry: THREE.BufferGeometry;
  constructor(
    readonly n: number,
    readonly size: number,
    opts: { flat?: boolean; material?: THREE.MeshStandardMaterial } = {},
  ) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * n * 3);
    const col = new Float32Array(n * n * 3).fill(1);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = (j * n + i) * 3;
        pos[k] = (i / (n - 1) - 0.5) * size;
        pos[k + 2] = (j / (n - 1) - 0.5) * size;
      }
    }
    const idx: number[] = [];
    for (let j = 0; j < n - 1; j++) {
      for (let i = 0; i < n - 1; i++) {
        const a = j * n + i, b = a + 1, c = a + n, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.geometry = geo;
    const mat = opts.material ?? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0, flatShading: opts.flat ?? false });
    this.mesh = new THREE.Mesh(geo, mat);
  }

  /** 格子 (i,j) のワールド座標 x,z */
  worldX(i: number): number {
    return (i / (this.n - 1) - 0.5) * this.size;
  }

  setHeights(h: ArrayLike<number>, scale = 1): void {
    const pos = this.geometry.attributes.position as THREE.BufferAttribute;
    for (let k = 0; k < this.n * this.n; k++) pos.array[k * 3 + 1] = h[k] * scale;
    pos.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.geometry.computeBoundingSphere();
    this.geometry.computeBoundingBox();
  }

  /** colorOf(k) で各頂点の色を決める */
  setColors(colorOf: (k: number, out: THREE.Color) => THREE.Color): void {
    const col = this.geometry.attributes.color as THREE.BufferAttribute;
    const c = new THREE.Color();
    for (let k = 0; k < this.n * this.n; k++) {
      colorOf(k, c);
      col.array[k * 3] = c.r;
      col.array[k * 3 + 1] = c.g;
      col.array[k * 3 + 2] = c.b;
    }
    col.needsUpdate = true;
  }

  /** 双線形補間で高さを取得（x,z はワールド座標） */
  sample(h: ArrayLike<number>, x: number, z: number): number {
    const n = this.n;
    const fx = THREE.MathUtils.clamp((x / this.size + 0.5) * (n - 1), 0, n - 1.001);
    const fz = THREE.MathUtils.clamp((z / this.size + 0.5) * (n - 1), 0, n - 1.001);
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j;
    const a = h[j * n + i], b = h[j * n + i + 1], c = h[(j + 1) * n + i], d = h[(j + 1) * n + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  }
}

/**
 * w×h の格子をテクスチャとして平面に貼る（セルオートマトン・迷路・用途地図の表示用）。
 * set でセル色を書き、commit で GPU に送る。最近傍補間なのでセルがくっきり見える。
 */
export class GridPlane {
  readonly data: Uint8Array;
  readonly texture: THREE.DataTexture;
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  constructor(
    readonly w: number,
    readonly h: number,
    sizeX: number,
    sizeZ = (sizeX * h) / w,
  ) {
    this.data = new Uint8Array(w * h * 4).fill(255);
    this.texture = new THREE.DataTexture(this.data, w, h, THREE.RGBAFormat);
    this.texture.magFilter = THREE.NearestFilter;
    this.texture.minFilter = THREE.NearestFilter;
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.needsUpdate = true;
    const geo = new THREE.PlaneGeometry(sizeX, sizeZ);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: this.texture, roughness: 0.95, metalness: 0 }));
  }

  /** (i,j) のセルに色（0..255 の sRGB）を書く。j=0 が奥側（-z） */
  set(i: number, j: number, r: number, g: number, b: number): void {
    const k = ((this.h - 1 - j) * this.w + i) * 4;
    this.data[k] = r;
    this.data[k + 1] = g;
    this.data[k + 2] = b;
    this.data[k + 3] = 255;
  }

  setHex(i: number, j: number, hex: number): void {
    this.set(i, j, (hex >> 16) & 255, (hex >> 8) & 255, hex & 255);
  }

  commit(): void {
    this.texture.needsUpdate = true;
  }
}

/** 箱をまとめて1つの InstancedMesh にする（建物・壁・木の幹など） */
export class BoxBatch {
  private readonly items: number[] = [];
  private readonly colors: number[] = [];
  /** 中心 (x,y,z)、寸法 (sx,sy,sz)、y軸回転 ry */
  add(x: number, y: number, z: number, sx: number, sy: number, sz: number, color: THREE.ColorRepresentation, ry = 0): void {
    const c = new THREE.Color(color);
    this.items.push(x, y, z, sx, sy, sz, ry);
    this.colors.push(c.r, c.g, c.b);
  }

  /** 底面を y=base に置く版 */
  addOnGround(x: number, z: number, sx: number, height: number, sz: number, color: THREE.ColorRepresentation, base = 0, ry = 0): void {
    this.add(x, base + height / 2, z, sx, height, sz, color, ry);
  }

  get count(): number {
    return this.items.length / 7;
  }

  build(material: THREE.Material = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0.05 }), geometry: THREE.BufferGeometry = new THREE.BoxGeometry(1, 1, 1)): THREE.InstancedMesh {
    const n = Math.max(1, this.count);
    const mesh = new THREE.InstancedMesh(geometry, material, n);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const c = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      const o = i * 7;
      p.set(this.items[o], this.items[o + 1], this.items[o + 2]);
      s.set(this.items[o + 3], this.items[o + 4], this.items[o + 5]);
      q.setFromAxisAngle(up, this.items[o + 6]);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, c.setRGB(this.colors[i * 3], this.colors[i * 3 + 1], this.colors[i * 3 + 2]));
    }
    mesh.count = this.count;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.computeBoundingSphere();
    return mesh;
  }
}

/** 線分の集合（x1,y1,z1,x2,y2,z2,...）。色は1色または頂点ごと */
export function segments(points: number[], color: THREE.ColorRepresentation | number[], opts: { opacity?: number } = {}): THREE.LineSegments {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
  const perVertex = Array.isArray(color);
  if (perVertex) geo.setAttribute('color', new THREE.Float32BufferAttribute(color as number[], 3));
  const mat = new THREE.LineBasicMaterial({
    color: perVertex ? 0xffffff : (color as THREE.ColorRepresentation),
    vertexColors: perVertex,
    transparent: opts.opacity !== undefined,
    opacity: opts.opacity ?? 1,
  });
  return new THREE.LineSegments(geo, mat);
}

/** 平面多角形（xz、y 固定）を三角形分割してメッシュにする */
export function flatPolygon(poly: [number, number][], y: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ShapeGeometry(shape);
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, y, 0);
  return new THREE.Mesh(geo, material);
}

/** 平面多角形を高さ h だけ押し出した建物ブロック */
export function extrudePolygon(poly: [number, number][], base: number, height: number, material: THREE.Material): THREE.Mesh {
  const shape = new THREE.Shape(poly.map(([x, z]) => new THREE.Vector2(x, -z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false });
  geo.rotateX(-Math.PI / 2);
  geo.translate(0, base, 0);
  return new THREE.Mesh(geo, material);
}

/** 動的な世界（CA など）で使う、固定時間刻みのアキュムレータ */
export class Ticker {
  private acc = 0;
  constructor(public rate: number) {}
  /** dt 秒の間に何回ステップすべきか（上限 max） */
  steps(dt: number, max = 8): number {
    this.acc += dt * this.rate;
    const n = Math.min(max, Math.floor(this.acc));
    this.acc -= n;
    if (this.acc > max) this.acc = 0;
    return n;
  }
}

/** 4近傍・8近傍のオフセット */
export const N4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const N8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
