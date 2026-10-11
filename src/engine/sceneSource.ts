import * as THREE from 'three';
import { FullscreenQuad, createTarget, makeShader } from './fullscreen';
import type { FrameInfo, ParamValues, SourceInstance } from './types';

const TONEMAP_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uExposure;
varying vec2 vUv;
vec3 aces(vec3 x) {
  const float a = 2.51; const float b = 0.03; const float c = 2.43; const float d = 0.59; const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure;
  gl_FragColor = vec4(toSRGB(aces(c)), 1.0);
}
`;

/**
 * 任意の Three.js シーン + カメラをパイプラインの入力（ソース）として使うためのラッパー。
 * 線形HDRで描画 → ACESトーンマップ → sRGB化して出力する。
 * ゲーム側の既存シーンを演出パイプラインに流し込む時もこれを使う。
 */
export class SceneSource implements SourceInstance {
  private hdr: THREE.WebGLRenderTarget;
  private readonly quad = new FullscreenQuad();
  private readonly material = makeShader(TONEMAP_FRAGMENT, {
    tDiffuse: { value: null },
    uExposure: { value: 1 },
  });

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    public scene: THREE.Scene,
    public camera: THREE.Camera,
    width: number,
    height: number,
    private readonly onUpdate?: (frame: FrameInfo, params: ParamValues) => void,
  ) {
    this.hdr = createTarget(width, height, { float: true, depth: true });
    this.resize(width, height);
  }

  set exposure(v: number) {
    this.material.uniforms.uExposure.value = v;
  }

  resize(width: number, height: number): void {
    this.hdr.setSize(Math.max(1, width), Math.max(1, height));
    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = width / Math.max(1, height);
      this.camera.updateProjectionMatrix();
    }
  }

  render(target: THREE.WebGLRenderTarget, params: ParamValues, frame: FrameInfo): void {
    this.onUpdate?.(frame, params);
    this.renderer.setRenderTarget(this.hdr);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    this.material.uniforms.tDiffuse.value = this.hdr.texture;
    this.quad.render(this.renderer, this.material, target);
  }

  dispose(): void {
    this.hdr.dispose();
    this.material.dispose();
    this.quad.dispose();
  }
}

/** シーン内の geometry / material / texture をまとめて解放する */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((obj) => {
    if (obj instanceof THREE.InstancedMesh) obj.dispose();
    const mesh = obj as THREE.Mesh;
    mesh.geometry?.dispose();
    const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(mat) ? mat : mat ? [mat] : [];
    for (const m of mats) {
      for (const value of Object.values(m)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      m.dispose();
    }
  });
}
