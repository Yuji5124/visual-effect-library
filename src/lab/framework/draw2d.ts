import * as THREE from 'three';

/**
 * 即時モードの2D描画（毎フレーム線・円・矢印を積み直す）。
 * 線分と三角形の2つの動的バッファだけでGPUに送るため、数千要素でもドローコールは2回。
 * 色は表示空間（sRGB）の値をそのまま書く。座標はワールド単位（y は -10〜10）。
 */
export class Draw2D {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.OrthographicCamera(-10, 10, 10, -10, -1, 1);
  private segPos = new Float32Array(0);
  private segCol = new Float32Array(0);
  private triPos = new Float32Array(0);
  private triCol = new Float32Array(0);
  private nSeg = 0;
  private nTri = 0;
  private readonly segGeo = new THREE.BufferGeometry();
  private readonly triGeo = new THREE.BufferGeometry();
  private readonly segMat = new THREE.LineBasicMaterial({ vertexColors: true });
  private readonly triMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
  private readonly tmp = new THREE.Color();
  readonly bg = new THREE.Color();
  /** 表示範囲の半分（x, y）。ズームで変わる */
  halfW = 10;
  halfH = 10;
  zoom = 1;
  centerX = 0;
  centerY = 0;

  constructor(background = 0x0b0d16) {
    this.bg.setHex(background, THREE.LinearSRGBColorSpace);
    this.scene.background = this.bg;
    const tris = new THREE.Mesh(this.triGeo, this.triMat);
    const segs = new THREE.LineSegments(this.segGeo, this.segMat);
    tris.frustumCulled = false;
    segs.frustumCulled = false;
    tris.renderOrder = 0;
    segs.renderOrder = 1;
    this.scene.add(tris, segs);
    this.ensure(4096, 4096);
  }

  private ensure(seg: number, tri: number): void {
    if (seg * 6 > this.segPos.length) {
      const n = Math.max(seg * 6, this.segPos.length * 2);
      const p = new Float32Array(n), c = new Float32Array(n);
      p.set(this.segPos);
      c.set(this.segCol);
      this.segPos = p;
      this.segCol = c;
      this.segGeo.setAttribute('position', new THREE.BufferAttribute(p, 3).setUsage(THREE.DynamicDrawUsage));
      this.segGeo.setAttribute('color', new THREE.BufferAttribute(c, 3).setUsage(THREE.DynamicDrawUsage));
    }
    if (tri * 9 > this.triPos.length) {
      const n = Math.max(tri * 9, this.triPos.length * 2);
      const p = new Float32Array(n), c = new Float32Array(n);
      p.set(this.triPos);
      c.set(this.triCol);
      this.triPos = p;
      this.triCol = c;
      this.triGeo.setAttribute('position', new THREE.BufferAttribute(p, 3).setUsage(THREE.DynamicDrawUsage));
      this.triGeo.setAttribute('color', new THREE.BufferAttribute(c, 3).setUsage(THREE.DynamicDrawUsage));
    }
  }

  /** 画面の縦横比に合わせて表示範囲を設定し、描画バッファを空にする */
  begin(aspect: number): void {
    this.halfH = 10 * this.zoom;
    this.halfW = this.halfH * aspect;
    this.camera.left = this.centerX - this.halfW;
    this.camera.right = this.centerX + this.halfW;
    this.camera.top = this.centerY + this.halfH;
    this.camera.bottom = this.centerY - this.halfH;
    this.camera.updateProjectionMatrix();
    this.nSeg = 0;
    this.nTri = 0;
  }

  /** 正規化ポインタ座標（0..1）→ワールド座標 */
  toWorld(x: number, y: number): [number, number] {
    return [this.centerX + (x * 2 - 1) * this.halfW, this.centerY + (y * 2 - 1) * this.halfH];
  }

  private col(c: THREE.ColorRepresentation, alpha: number): THREE.Color {
    this.tmp.set(c as THREE.Color);
    if (typeof c === 'number' || typeof c === 'string') this.tmp.convertLinearToSRGB();
    // 背景色へ向かって混ぜることで「薄さ」を表現（加算合成を使わず重なりでも破綻しない）
    if (alpha < 1) this.tmp.lerp(this.bg, 1 - Math.max(0, alpha));
    return this.tmp;
  }

  line(x1: number, y1: number, x2: number, y2: number, color: THREE.ColorRepresentation, alpha = 1): void {
    this.ensure(this.nSeg + 1, 0);
    const o = this.nSeg * 6;
    const c = this.col(color, alpha);
    this.segPos[o] = x1; this.segPos[o + 1] = y1; this.segPos[o + 2] = 0;
    this.segPos[o + 3] = x2; this.segPos[o + 4] = y2; this.segPos[o + 5] = 0;
    for (let k = 0; k < 2; k++) {
      this.segCol[o + k * 3] = c.r; this.segCol[o + k * 3 + 1] = c.g; this.segCol[o + k * 3 + 2] = c.b;
    }
    this.nSeg++;
  }

  /** 点列を結ぶ。fade=true なら古い点ほど薄く（軌跡表示用） */
  polyline(pts: ArrayLike<number>, color: THREE.ColorRepresentation, opts: { fade?: boolean; alpha?: number; closed?: boolean } = {}): void {
    const n = pts.length / 2;
    const a0 = opts.alpha ?? 1;
    for (let i = 1; i < n; i++) {
      const a = opts.fade ? a0 * (i / n) : a0;
      this.line(pts[(i - 1) * 2], pts[(i - 1) * 2 + 1], pts[i * 2], pts[i * 2 + 1], color, a);
    }
    if (opts.closed && n > 2) this.line(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1], pts[0], pts[1], color, a0);
  }

  tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, color: THREE.ColorRepresentation, alpha = 1): void {
    this.ensure(0, this.nTri + 1);
    const o = this.nTri * 9;
    const c = this.col(color, alpha);
    const p = this.triPos;
    p[o] = x1; p[o + 1] = y1; p[o + 2] = 0; p[o + 3] = x2; p[o + 4] = y2; p[o + 5] = 0; p[o + 6] = x3; p[o + 7] = y3; p[o + 8] = 0;
    for (let k = 0; k < 3; k++) {
      this.triCol[o + k * 3] = c.r; this.triCol[o + k * 3 + 1] = c.g; this.triCol[o + k * 3 + 2] = c.b;
    }
    this.nTri++;
  }

  circle(x: number, y: number, r: number, color: THREE.ColorRepresentation, opts: { fill?: boolean; alpha?: number; segments?: number } = {}): void {
    const n = opts.segments ?? (r * this.halfH > 2 ? 24 : 12);
    const a = opts.alpha ?? 1;
    let px = x + r, py = y;
    for (let i = 1; i <= n; i++) {
      const t = (i / n) * Math.PI * 2;
      const nx = x + Math.cos(t) * r, ny = y + Math.sin(t) * r;
      if (opts.fill) this.tri(x, y, px, py, nx, ny, color, a);
      else this.line(px, py, nx, ny, color, a);
      px = nx;
      py = ny;
    }
  }

  rect(x: number, y: number, w: number, h: number, color: THREE.ColorRepresentation, opts: { fill?: boolean; alpha?: number } = {}): void {
    const a = opts.alpha ?? 1;
    if (opts.fill) {
      this.tri(x, y, x + w, y, x + w, y + h, color, a);
      this.tri(x, y, x + w, y + h, x, y + h, color, a);
    } else {
      this.line(x, y, x + w, y, color, a);
      this.line(x + w, y, x + w, y + h, color, a);
      this.line(x + w, y + h, x, y + h, color, a);
      this.line(x, y + h, x, y, color, a);
    }
  }

  /** 向きを持つ三角形（エージェントの表示） */
  agent(x: number, y: number, angle: number, size: number, color: THREE.ColorRepresentation, alpha = 1): void {
    const c = Math.cos(angle), s = Math.sin(angle);
    this.tri(x + c * size * 1.4, y + s * size * 1.4, x - c * size * 0.8 - s * size * 0.7, y - s * size * 0.8 + c * size * 0.7, x - c * size * 0.8 + s * size * 0.7, y - s * size * 0.8 - c * size * 0.7, color, alpha);
  }

  arrow(x: number, y: number, dx: number, dy: number, color: THREE.ColorRepresentation, alpha = 1): void {
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return;
    this.line(x, y, x + dx, y + dy, color, alpha);
    const ux = dx / len, uy = dy / len, h = Math.min(0.35, len * 0.35);
    this.line(x + dx, y + dy, x + dx - ux * h - uy * h * 0.6, y + dy - uy * h + ux * h * 0.6, color, alpha);
    this.line(x + dx, y + dy, x + dx - ux * h + uy * h * 0.6, y + dy - uy * h - ux * h * 0.6, color, alpha);
  }

  /** 背景の方眼 */
  grid(step = 1, color: THREE.ColorRepresentation = 0x1d2238): void {
    const x0 = Math.floor((this.centerX - this.halfW) / step) * step;
    const y0 = Math.floor((this.centerY - this.halfH) / step) * step;
    for (let x = x0; x <= this.centerX + this.halfW; x += step) this.line(x, this.centerY - this.halfH, x, this.centerY + this.halfH, color);
    for (let y = y0; y <= this.centerY + this.halfH; y += step) this.line(this.centerX - this.halfW, y, this.centerX + this.halfW, y, color);
  }

  /** バッファをGPUへ送り、target に描く */
  render(renderer: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget): void {
    const sp = this.segGeo.attributes.position as THREE.BufferAttribute;
    const sc = this.segGeo.attributes.color as THREE.BufferAttribute;
    const tp = this.triGeo.attributes.position as THREE.BufferAttribute;
    const tc = this.triGeo.attributes.color as THREE.BufferAttribute;
    sp.clearUpdateRanges(); sc.clearUpdateRanges(); tp.clearUpdateRanges(); tc.clearUpdateRanges();
    sp.addUpdateRange(0, this.nSeg * 6); sc.addUpdateRange(0, this.nSeg * 6);
    tp.addUpdateRange(0, this.nTri * 9); tc.addUpdateRange(0, this.nTri * 9);
    sp.needsUpdate = sc.needsUpdate = tp.needsUpdate = tc.needsUpdate = true;
    this.segGeo.setDrawRange(0, this.nSeg * 2);
    this.triGeo.setDrawRange(0, this.nTri * 3);
    renderer.setRenderTarget(target);
    renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.segGeo.dispose();
    this.triGeo.dispose();
    this.segMat.dispose();
    this.triMat.dispose();
  }
}

/** 一定長の軌跡バッファ（x,y の組を保持） */
export class Trail {
  private readonly data: Float32Array;
  private n = 0;
  constructor(readonly capacity = 240) {
    this.data = new Float32Array(capacity * 2);
  }
  push(x: number, y: number): void {
    if (this.n === this.capacity) {
      this.data.copyWithin(0, 2);
      this.n--;
    }
    this.data[this.n * 2] = x;
    this.data[this.n * 2 + 1] = y;
    this.n++;
  }
  clear(): void {
    this.n = 0;
  }
  get length(): number {
    return this.n;
  }
  points(): Float32Array {
    return this.data.subarray(0, this.n * 2);
  }
}
