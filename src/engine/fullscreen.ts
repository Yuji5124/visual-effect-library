import * as THREE from 'three';

export const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** 画面全体を覆う1枚の板。ポストプロセスと生成シェーダーで共通利用する。 */
export class FullscreenQuad {
  private readonly camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly geometry = new THREE.PlaneGeometry(2, 2);
  private readonly mesh: THREE.Mesh;

  constructor(material?: THREE.Material) {
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.frustumCulled = false;
  }

  render(renderer: THREE.WebGLRenderer, material: THREE.Material, target: THREE.WebGLRenderTarget | null): void {
    this.mesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(this.mesh, this.camera);
  }

  dispose(): void {
    this.geometry.dispose();
  }
}

export function createTarget(
  width: number,
  height: number,
  opts: { float?: boolean; filter?: THREE.MagnificationTextureFilter; depth?: boolean } = {},
): THREE.WebGLRenderTarget {
  const filter = opts.filter ?? THREE.LinearFilter;
  return new THREE.WebGLRenderTarget(Math.max(1, width), Math.max(1, height), {
    type: opts.float ? THREE.HalfFloatType : THREE.UnsignedByteType,
    minFilter: filter,
    magFilter: filter,
    depthBuffer: opts.depth ?? false,
    stencilBuffer: false,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
  });
}

export function makeShader(fragment: string, uniforms: Record<string, THREE.IUniform>): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: fragment,
    uniforms,
    depthTest: false,
    depthWrite: false,
  });
}

export const COPY_FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tDiffuse, vUv).rgb, 1.0); }
`;
