import * as THREE from 'three';
import { SceneSource, disposeObject } from '../../engine/sceneSource';
import type { EffectContext, FrameInfo, ParamValues } from '../../engine/types';
import { OrbitRig } from './orbit';

export interface LabStage {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  rig: OrbitRig;
  source: SceneSource;
  /** 生成物を入れる親。dispose で中身ごと解放される */
  root: THREE.Group;
  grid: THREE.GridHelper;
  dispose(): void;
}

/**
 * GEOMETRY / WORLD の3D実験場に共通の舞台：照明・床グリッド・軌道カメラ・HDR描画。
 */
export function createLabStage(
  ctx: EffectContext,
  opts: {
    background?: number;
    distance?: number;
    elevation?: number;
    target?: THREE.Vector3;
    gridSize?: number;
    fog?: boolean;
    onUpdate?: (frame: FrameInfo, params: ParamValues) => void;
  } = {},
): LabStage {
  const scene = new THREE.Scene();
  const bg = opts.background ?? 0x0b0d16;
  scene.background = new THREE.Color(bg);
  if (opts.fog !== false) scene.fog = new THREE.Fog(bg, (opts.distance ?? 8) * 2.5, (opts.distance ?? 8) * 6);
  const camera = new THREE.PerspectiveCamera(45, ctx.width / ctx.height, 0.05, 1000);
  const rig = new OrbitRig(camera, { distance: opts.distance ?? 8, elevation: opts.elevation, target: opts.target });
  scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x2a2238, 1.4));
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(5, 9, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0x8fb8ff, 0.8);
  fill.position.set(-6, 3, -4);
  scene.add(fill);
  const gridSize = opts.gridSize ?? 20;
  const grid = new THREE.GridHelper(gridSize, gridSize, 0x3a3f6a, 0x1f2340);
  scene.add(grid);
  const root = new THREE.Group();
  scene.add(root);
  const source = new SceneSource(ctx.renderer, scene, camera, ctx.width, ctx.height, (frame, params) => {
    opts.onUpdate?.(frame, params);
    rig.update(frame.dt, ctx.width / ctx.height);
  });
  return {
    scene,
    camera,
    rig,
    source,
    root,
    grid,
    dispose() {
      source.dispose();
      disposeObject(scene);
    },
  };
}

/** 子オブジェクトのgeometry/materialを解放して取り除く */
export function clearGroup(group: THREE.Object3D): void {
  for (const child of [...group.children]) {
    group.remove(child);
    disposeObject(child);
  }
}

/** シーン内の全メッシュのワイヤーフレーム表示を切り替える */
export function setWireframe(root: THREE.Object3D, on: boolean): void {
  root.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
    const mats = Array.isArray(m) ? m : m ? [m] : [];
    for (const mat of mats) {
      if ('wireframe' in mat && (o as THREE.Mesh).isMesh) (mat as THREE.MeshStandardMaterial).wireframe = on;
    }
  });
}

/** 頂点数・三角形数を数える（ステータス表示用） */
export function countGeometry(root: THREE.Object3D): { vertices: number; triangles: number } {
  let vertices = 0;
  let triangles = 0;
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const g = mesh.geometry;
    const n = g.attributes.position?.count ?? 0;
    const inst = (mesh as THREE.InstancedMesh).isInstancedMesh ? (mesh as THREE.InstancedMesh).count : 1;
    vertices += n * inst;
    triangles += (g.index ? g.index.count / 3 : n / 3) * inst;
  });
  return { vertices, triangles: Math.round(triangles) };
}
