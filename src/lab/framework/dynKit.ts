import * as THREE from 'three';
import { linearOf } from './caKit';

/**
 * WRD-E（動的な世界）用の部品。
 * AgentDots：毎フレーム数が変わるエージェント・ボクセルを1つの InstancedMesh で描く（上限 cap）。
 */
export class AgentDots {
  readonly mesh: THREE.InstancedMesh;
  private readonly mat: Float32Array;
  private readonly col: Float32Array;
  private n = 0;
  constructor(
    readonly cap: number,
    geometry: THREE.BufferGeometry = new THREE.BoxGeometry(1, 1, 1),
    material: THREE.Material = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.05 }),
  ) {
    this.mesh = new THREE.InstancedMesh(geometry, material, cap);
    this.mesh.frustumCulled = false;
    this.mesh.setColorAt(0, new THREE.Color(1, 1, 1));
    this.mat = this.mesh.instanceMatrix.array as Float32Array;
    this.col = this.mesh.instanceColor!.array as Float32Array;
    this.mesh.count = 0;
  }

  get count(): number {
    return this.n;
  }

  begin(): void {
    this.n = 0;
  }

  /** 中心 (x,y,z)、寸法 (sx,sy,sz)、色（16進 sRGB） */
  push(x: number, y: number, z: number, sx: number, sy: number, sz: number, hex: number): void {
    if (this.n >= this.cap) return;
    const c = linearOf(hex);
    this.pushLinear(x, y, z, sx, sy, sz, c[0], c[1], c[2]);
  }

  /** 色を線形RGBで直接与える版 */
  pushLinear(x: number, y: number, z: number, sx: number, sy: number, sz: number, r: number, g: number, b: number): void {
    if (this.n >= this.cap) return;
    const o = this.n * 16;
    const m = this.mat;
    m[o] = sx; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
    m[o + 4] = 0; m[o + 5] = sy; m[o + 6] = 0; m[o + 7] = 0;
    m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = sz; m[o + 11] = 0;
    m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
    const k = this.n * 3;
    this.col[k] = r;
    this.col[k + 1] = g;
    this.col[k + 2] = b;
    this.n++;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.instanceColor!.needsUpdate = true;
  }
}

/** 場の奥に立てるグラフ枠の位置（size 四方の場に対して、左右に2枚まで） */
export function chartSlot(size: number, slot: 0 | 1 | 'full', height = 2.4): { width: number; height: number; x0: number; y0: number; z0: number } {
  const z0 = -size / 2 - 0.6;
  if (slot === 'full') return { width: size, height, x0: -size / 2, y0: 0.3, z0 };
  const w = size / 2 - 0.25;
  return { width: w, height, x0: slot === 0 ? -size / 2 : 0.25, y0: 0.3, z0 };
}

/** 0..1 の値で2色を補間した16進色 */
export function lerpHex(a: number, b: number, t: number): number {
  const u = Math.min(1, Math.max(0, t));
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  // linearOf のキャッシュが溢れないよう、各成分を 16 段階に量子化する
  const q = (x: number) => Math.min(255, Math.round(x / 17) * 17);
  return (q(ar + (br - ar) * u) << 16) | (q(ag + (bg - ag) * u) << 8) | q(ab + (bb - ab) * u);
}
