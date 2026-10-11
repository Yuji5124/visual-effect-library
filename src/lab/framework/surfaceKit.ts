import * as THREE from 'three';

/** GEO-B（曲面）共通：(u,v) 格子のパラメトリック曲面と制御網の補助表示 */

export type SurfFn = (u: number, v: number, out: THREE.Vector3) => THREE.Vector3;

/**
 * (nu+1)×(nv+1) 頂点の格子曲面。u,v ∈ [0,1]。
 * update(fn) で位置だけを書き換え、法線を作り直す（毎フレーム呼んでもよい）。
 */
export class GridSurface {
  readonly geo = new THREE.BufferGeometry();
  private pos: Float32Array;
  private tmp = new THREE.Vector3();
  constructor(readonly nu: number, readonly nv: number, fn?: SurfFn) {
    const n = (nu + 1) * (nv + 1);
    this.pos = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const k = j * (nu + 1) + i;
      uv[k * 2] = i / nu;
      uv[k * 2 + 1] = j / nv;
    }
    const idx: number[] = [];
    for (let j = 0; j < nv; j++) for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      idx.push(a, b, d, a, d, c);
    }
    this.geo.setIndex(idx);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (fn) this.update(fn);
  }
  update(fn: SurfFn): void {
    const { nu, nv, pos, tmp } = this;
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      fn(i / nu, j / nv, tmp);
      const k = (j * (nu + 1) + i) * 3;
      pos[k] = tmp.x; pos[k + 1] = tmp.y; pos[k + 2] = tmp.z;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
    this.geo.computeBoundingSphere();
    this.geo.computeBoundingBox();
  }
  /** 頂点色を (u,v) の関数で塗る */
  colorize(fn: (u: number, v: number, c: THREE.Color, k: number) => void): void {
    const { nu, nv } = this;
    let attr = this.geo.attributes.color as THREE.BufferAttribute | undefined;
    if (!attr) {
      attr = new THREE.BufferAttribute(new Float32Array((nu + 1) * (nv + 1) * 3), 3).setUsage(THREE.DynamicDrawUsage);
      this.geo.setAttribute('color', attr);
    }
    const c = new THREE.Color();
    for (let j = 0; j <= nv; j++) for (let i = 0; i <= nu; i++) {
      const k = j * (nu + 1) + i;
      fn(i / nu, j / nv, c, k);
      attr.setXYZ(k, c.r, c.g, c.b);
    }
    attr.needsUpdate = true;
  }
}

/** rows×cols の制御網（行と列の折れ線）を毎フレーム書き換えられる線分 */
export class NetLines {
  readonly lines: THREE.LineSegments;
  private pos: Float32Array;
  constructor(readonly rows: number, readonly cols: number, color: THREE.ColorRepresentation, opacity = 0.9) {
    const segs = rows * (cols - 1) + cols * (rows - 1);
    this.pos = new Float32Array(segs * 6);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.lines = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
    this.lines.frustumCulled = false;
  }
  /** pts[r][c] */
  set(pts: THREE.Vector3[][]): void {
    let o = 0;
    const put = (a: THREE.Vector3, b: THREE.Vector3) => {
      this.pos.set([a.x, a.y, a.z, b.x, b.y, b.z], o);
      o += 6;
    };
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols - 1; c++) put(pts[r][c], pts[r][c + 1]);
    for (let c = 0; c < this.cols; c++) for (let r = 0; r < this.rows - 1; r++) put(pts[r][c], pts[r + 1][c]);
    this.lines.geometry.attributes.position.needsUpdate = true;
  }
}

/** 両面を別の色で塗る（裏表の確認用）：同じジオメトリを表用・裏用の2メッシュで描く */
export function twoSidedMesh(geo: THREE.BufferGeometry, front: THREE.ColorRepresentation, back: THREE.ColorRepresentation, vertexColors = false): THREE.Group {
  const g = new THREE.Group();
  const mk = (color: THREE.ColorRepresentation, side: THREE.Side) =>
    new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, side, roughness: 0.5, metalness: 0.05, vertexColors }));
  const f = mk(front, THREE.FrontSide);
  const b = mk(back, THREE.BackSide);
  // 2つめのメッシュは同じジオメトリを参照するので、解放は1回で足りる（dispose の二重呼び出しは無害）
  g.add(f, b);
  return g;
}
