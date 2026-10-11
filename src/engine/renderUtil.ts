import type * as THREE from 'three';

/** autoClear を一時的に無効化して描画する（共有レンダラーの状態を汚さない） */
export function renderNoClear(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Object3D,
  camera: THREE.Camera,
  target: THREE.WebGLRenderTarget | null,
): void {
  const prev = renderer.autoClear;
  renderer.autoClear = false;
  renderer.setRenderTarget(target);
  renderer.render(scene, camera);
  renderer.autoClear = prev;
}
