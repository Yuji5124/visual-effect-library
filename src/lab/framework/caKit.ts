import * as THREE from 'three';

/**
 * 格子シミュレーション（セルオートマトン・エージェント）の3D表示用の部品。
 * ColumnField：w×h の柱を1つの InstancedMesh で描き、高さと色でセルの状態を表す。
 * TimeChart：場の奥に立てる時系列グラフ（人口・面積・平均値など）。
 */

const colorCache = new Map<number, [number, number, number]>();
/** sRGB の16進色 → 線形RGB（キャッシュ付き） */
export function linearOf(hex: number): [number, number, number] {
  let v = colorCache.get(hex);
  if (!v) {
    const c = new THREE.Color().setHex(hex);
    v = [c.r, c.g, c.b];
    if (colorCache.size < 4096) colorCache.set(hex, v);
  }
  return v;
}

function srgbToLinear(c: number): number {
  return c < 0.04045 ? c * 0.0773993808 : Math.pow(c * 0.9478672986 + 0.0521327014, 2.4);
}

export class ColumnField {
  readonly mesh: THREE.InstancedMesh;
  readonly cell: number;
  private readonly mat: Float32Array;
  private readonly col: Float32Array;
  constructor(
    readonly w: number,
    readonly h: number,
    readonly size: number,
    opts: { gap?: number; material?: THREE.Material; minHeight?: number } = {},
  ) {
    this.cell = size / Math.max(w, h);
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const material = opts.material ?? new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.02 });
    this.mesh = new THREE.InstancedMesh(geo, material, w * h);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mat = this.mesh.instanceMatrix.array as Float32Array;
    this.col = this.mesh.instanceColor!.array as Float32Array;
    const s = this.cell * (1 - (opts.gap ?? 0.06));
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const o = (j * w + i) * 16;
        const m = this.mat;
        m[o] = s; m[o + 5] = 0.01; m[o + 10] = s; m[o + 15] = 1;
        m[o + 12] = this.x(i);
        m[o + 14] = this.z(j);
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    // 比較表示の配置に使う外形（xz の広がりは変わらないので一度だけ）
    this.mesh.computeBoundingBox();
    this.mesh.computeBoundingSphere();
  }

  x(i: number): number {
    return (i + 0.5) * this.cell - (this.w * this.cell) / 2;
  }

  z(j: number): number {
    return (j + 0.5) * this.cell - (this.h * this.cell) / 2;
  }

  /** セル (i,j) の高さ（ワールド単位）と色（16進 sRGB） */
  set(i: number, j: number, height: number, hex: number, base = 0): void {
    this.setK(j * this.w + i, height, hex, base);
  }

  setK(k: number, height: number, hex: number, base = 0): void {
    const o = k * 16;
    this.mat[o + 5] = Math.max(0.005, height);
    this.mat[o + 13] = base;
    const c = linearOf(hex);
    this.col[k * 3] = c[0];
    this.col[k * 3 + 1] = c[1];
    this.col[k * 3 + 2] = c[2];
  }

  /** 色を RGB(0..1, sRGB) で直接指定する版（連続値の色分け用） */
  setRGB(k: number, height: number, r: number, g: number, b: number, base = 0): void {
    const o = k * 16;
    this.mat[o + 5] = Math.max(0.005, height);
    this.mat[o + 13] = base;
    this.col[k * 3] = srgbToLinear(r);
    this.col[k * 3 + 1] = srgbToLinear(g);
    this.col[k * 3 + 2] = srgbToLinear(b);
  }

  commit(): void {
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

/** 時系列グラフ。xz 平面の奥（z=z0）に縦に立てた枠の中へ折れ線を描く */
export class TimeChart {
  readonly group = new THREE.Group();
  private readonly lines: THREE.Line[] = [];
  private readonly data: number[][];
  private yMax: number;
  private readonly cap: number;
  constructor(
    series: number[],
    readonly opts: { width: number; height: number; cap?: number; x0: number; y0: number; z0: number; yMax?: number },
  ) {
    const cap = (this.cap = opts.cap ?? 240);
    this.yMax = opts.yMax ?? 1e-9;
    this.data = series.map(() => []);
    const { width: W, height: H, x0, y0, z0 } = opts;
    const frame = new THREE.BufferGeometry();
    frame.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z0, x0 + W, y0, z0, x0, y0, z0, x0, y0 + H, z0, x0, y0 + H, z0, x0 + W, y0 + H, z0, x0 + W, y0, z0, x0 + W, y0 + H, z0], 3));
    this.group.add(new THREE.LineSegments(frame, new THREE.LineBasicMaterial({ color: 0x5a6090, transparent: true, opacity: 0.6 })));
    const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ color: 0x10142a, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false }));
    back.position.set(x0 + W / 2, y0 + H / 2, z0 - 0.01);
    this.group.add(back);
    for (const color of series) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(cap * 3), 3));
      g.setDrawRange(0, 0);
      const line = new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
      line.frustumCulled = false;
      this.lines.push(line);
      this.group.add(line);
    }
  }

  push(values: number[]): void {
    const cap = this.cap;
    values.forEach((v, s) => {
      const d = this.data[s];
      d.push(v);
      if (d.length > cap) d.shift();
      if (this.opts.yMax === undefined && v > this.yMax) this.yMax = v * 1.1;
    });
    this.redraw();
  }

  private redraw(): void {
    const cap = this.cap;
    const { width: W, height: H, x0, y0, z0 } = this.opts;
    this.lines.forEach((line, s) => {
      const d = this.data[s];
      const pos = line.geometry.attributes.position as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < d.length; i++) {
        arr[i * 3] = x0 + (i / (cap - 1)) * W;
        arr[i * 3 + 1] = y0 + Math.min(1, Math.max(0, d[i] / this.yMax)) * H;
        arr[i * 3 + 2] = z0;
      }
      pos.needsUpdate = true;
      line.geometry.setDrawRange(0, d.length);
    });
  }
}

/** 位相平面などの散布軌跡（x,y を枠内に描く） */
export class XYTrace {
  readonly group = new THREE.Group();
  private readonly line: THREE.Line;
  private readonly pts: number[] = [];
  private xMax = 1e-9;
  private yMax = 1e-9;
  constructor(
    color: number,
    readonly opts: { width: number; height: number; cap?: number; x0: number; y0: number; z0: number },
  ) {
    const { width: W, height: H, x0, y0, z0 } = opts;
    const frame = new THREE.BufferGeometry();
    frame.setAttribute('position', new THREE.Float32BufferAttribute([x0, y0, z0, x0 + W, y0, z0, x0, y0, z0, x0, y0 + H, z0], 3));
    this.group.add(new THREE.LineSegments(frame, new THREE.LineBasicMaterial({ color: 0x5a6090 })));
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array((opts.cap ?? 400) * 3), 3));
    g.setDrawRange(0, 0);
    this.line = new THREE.Line(g, new THREE.LineBasicMaterial({ color }));
    this.line.frustumCulled = false;
    this.group.add(this.line);
  }

  push(x: number, y: number): void {
    const cap = this.opts.cap ?? 400;
    this.pts.push(x, y);
    if (this.pts.length > cap * 2) this.pts.splice(0, 2);
    this.xMax = Math.max(this.xMax, x * 1.1);
    this.yMax = Math.max(this.yMax, y * 1.1);
    const { width: W, height: H, x0, y0, z0 } = this.opts;
    const pos = this.line.geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const n = this.pts.length / 2;
    for (let i = 0; i < n; i++) {
      arr[i * 3] = x0 + (this.pts[i * 2] / this.xMax) * W;
      arr[i * 3 + 1] = y0 + (this.pts[i * 2 + 1] / this.yMax) * H;
      arr[i * 3 + 2] = z0;
    }
    pos.needsUpdate = true;
    this.line.geometry.setDrawRange(0, n);
  }
}

/** 縦棒グラフ（ヒストグラム）。n 本の棒の高さを set で更新する */
export class BarChart {
  readonly mesh: THREE.InstancedMesh;
  constructor(
    readonly n: number,
    readonly opts: { width: number; height: number; x0: number; y0: number; z0: number; color: number },
  ) {
    const geo = new THREE.BoxGeometry(1, 1, 0.05);
    geo.translate(0, 0.5, 0);
    this.mesh = new THREE.InstancedMesh(geo, new THREE.MeshBasicMaterial({ color: opts.color }), n);
    this.mesh.frustumCulled = false;
    this.set(new Array(n).fill(0));
  }

  /** 値は 0..1 に正規化済みで渡す */
  set(values: number[]): void {
    const { width: W, height: H, x0, y0, z0 } = this.opts;
    const bw = W / this.n;
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.n; i++) {
      m.makeScale(bw * 0.8, Math.max(0.002, values[i] * H), 1);
      m.setPosition(x0 + (i + 0.5) * bw, y0, z0);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

/** 4近傍の連結成分ラベル付け。open(k) が真のセルを対象にし、ラベル（-1 は対象外）と各成分の大きさを返す */
export function components(w: number, h: number, open: (k: number) => boolean): { label: Int32Array; sizes: number[] } {
  const label = new Int32Array(w * h).fill(-1);
  const sizes: number[] = [];
  const stack = new Int32Array(w * h);
  for (let s = 0; s < w * h; s++) {
    if (label[s] !== -1 || !open(s)) continue;
    const id = sizes.length;
    let top = 0, size = 0;
    stack[top++] = s;
    label[s] = id;
    while (top > 0) {
      const k = stack[--top];
      size++;
      const i = k % w, j = (k / w) | 0;
      const nb = [i > 0 ? k - 1 : -1, i < w - 1 ? k + 1 : -1, j > 0 ? k - w : -1, j < h - 1 ? k + w : -1];
      for (const q of nb) {
        if (q >= 0 && label[q] === -1 && open(q)) {
          label[q] = id;
          stack[top++] = q;
        }
      }
    }
    sizes.push(size);
  }
  return { label, sizes };
}

/** 識別しやすい色（黄金角で色相をずらす） */
export function distinctColor(i: number, s = 0.6, l = 0.55): number {
  return new THREE.Color().setHSL(((i * 0.618034) % 1 + 1) % 1, s, l).getHex();
}

/** 0..1 → 青→シアン→黄→赤 の色（sRGB 0..1 の配列） */
export function heatRGB(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, t));
  const r = Math.min(1, Math.max(0, 1.6 * x - 0.3));
  const g = Math.min(1, Math.max(0, x < 0.6 ? 0.25 + x * 1.2 : 1.6 - x * 1.4));
  const b = Math.min(1, Math.max(0, 0.9 - x * 1.3));
  return [r, g, b];
}
