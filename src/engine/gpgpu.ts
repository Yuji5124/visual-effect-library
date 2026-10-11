import * as THREE from 'three';
import { FullscreenQuad, createTarget } from './fullscreen';

/**
 * GPGPU用ピンポンバッファ。read を読み write に書き、swap で入れ替える。
 * セルオートマトン・反応拡散・流体などの状態保持に使う。
 */
export class PingPong {
  read: THREE.WebGLRenderTarget;
  write: THREE.WebGLRenderTarget;
  private readonly quad = new FullscreenQuad();

  constructor(
    width: number,
    height: number,
    opts: { float?: boolean; nearest?: boolean; wrap?: boolean } = {},
  ) {
    const make = () => {
      const t = createTarget(width, height, {
        float: opts.float,
        filter: opts.nearest ? THREE.NearestFilter : THREE.LinearFilter,
      });
      if (opts.wrap) {
        t.texture.wrapS = THREE.RepeatWrapping;
        t.texture.wrapT = THREE.RepeatWrapping;
      }
      return t;
    };
    this.read = make();
    this.write = make();
  }

  get width(): number {
    return this.read.width;
  }
  get height(): number {
    return this.read.height;
  }

  /** material を実行して write に書き込み、read と入れ替える */
  step(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial, stateUniform = 'tState'): void {
    material.uniforms[stateUniform].value = this.read.texture;
    this.quad.render(renderer, material, this.write);
    const t = this.read;
    this.read = this.write;
    this.write = t;
  }

  /** read に直接書き込む（初期化用） */
  fill(renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial): void {
    this.quad.render(renderer, material, this.read);
  }

  resize(width: number, height: number): void {
    this.read.setSize(width, height);
    this.write.setSize(width, height);
  }

  dispose(): void {
    this.read.dispose();
    this.write.dispose();
    this.quad.dispose();
  }
}
