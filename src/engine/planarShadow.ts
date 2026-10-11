import * as THREE from 'three';

/**
 * 平面投影シャドウ用の行列。点光源/平行光源 light（w=0で平行光）から
 * 平面 plane へ頂点を押しつぶす。シャドウマップを使わないので、
 * 共有レンダラーの設定を変えずに使え、モバイルでも軽い。
 */
export function planarShadowMatrix(plane: THREE.Plane, light: THREE.Vector4, out = new THREE.Matrix4()): THREE.Matrix4 {
  const n = plane.normal;
  const d = plane.constant;
  const dot = n.x * light.x + n.y * light.y + n.z * light.z + d * light.w;
  const p = [n.x, n.y, n.z, d];
  const l = [light.x, light.y, light.z, light.w];
  const e: number[] = [];
  // 列優先で格納（three.js の Matrix4.elements と同じ並び）
  for (let col = 0; col < 4; col++)
    for (let row = 0; row < 4; row++) e.push((row === col ? dot : 0) - l[row] * p[col]);
  out.fromArray(e);
  return out;
}
