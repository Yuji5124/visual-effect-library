import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { createDemoWorld } from '../../engine/demoWorld';
import { SceneSource } from '../../engine/sceneSource';
import type { SourceEffect } from '../../engine/types';

/**
 * 動いているメッシュの表面点を毎フレームワールド座標の格子へ量子化し、
 * 占有された格子だけに立方体を置く（表面ボクセル化）。
 */
const effect: SourceEffect = {
  id: '026',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'size', label: 'ボクセルの大きさ', type: 'number', min: 0.08, max: 0.6, step: 0.01, default: 0.2 },
    { key: 'gap', label: 'すき間', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0.08 },
    { key: 'ghost', label: '元の形を半透明で重ねる', type: 'bool', default: false },
    { key: 'speed', label: '動きの速さ', type: 'number', min: 0, max: 2, step: 0.01, default: 1 },
  ],
  notes:
    'MeshSurfaceSampler で各メッシュの表面に面積比例の点を事前に打ち、毎フレームその点をワールド座標へ変換して格子座標に丸め、重複を除いた格子だけに InstancedMesh の立方体を置く。回転すると量子化の境目が変わり、段々が流れるように見える。格子が粗いほど細部が消える。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    const low = ctx.quality === 'low';
    const perMesh: { mesh: THREE.Mesh; pts: Float32Array; color: THREE.Color }[] = [];
    const total = low ? 9000 : 22000;
    const areas = world.subjects.map((m) => {
      const g = m.geometry;
      g.computeBoundingSphere();
      const r = g.boundingSphere!.radius * Math.max(m.scale.x, 1);
      return r * r;
    });
    const sumArea = areas.reduce((a, b) => a + b, 0);
    const tmp = new THREE.Vector3();
    world.subjects.forEach((m, i) => {
      const geo = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry;
      const sampler = new MeshSurfaceSampler(new THREE.Mesh(geo)).build();
      const n = Math.max(200, Math.round((total * areas[i]) / sumArea));
      const pts = new Float32Array(n * 3);
      for (let k = 0; k < n; k++) {
        sampler.sample(tmp);
        pts.set([tmp.x, tmp.y, tmp.z], k * 3);
      }
      if (geo !== m.geometry) geo.dispose();
      const mat = m.material as THREE.MeshStandardMaterial;
      const color = mat.emissive.getHex() ? mat.emissive.clone() : mat.color.clone();
      perMesh.push({ mesh: m, pts, color });
    });
    const ghostMats = world.subjects.map((m) => m.material as THREE.MeshStandardMaterial);
    const max = low ? 6000 : 14000;
    const cubes = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1 }), max);
    cubes.frustumCulled = false;
    world.scene.add(cubes);
    const seen = new Set<string>();
    const m4 = new THREE.Matrix4();
    let used = 0;
    const source = new SceneSource(ctx.renderer, world.scene, world.camera, ctx.width, ctx.height, (frame, p) => {
      world.update(frame.dt, Number(p.speed));
      world.scene.updateMatrixWorld();
      const s = Number(p.size);
      const cube = s * (1 - Number(p.gap));
      const ghost = Boolean(p.ghost);
      ghostMats.forEach((mat) => {
        mat.transparent = ghost;
        mat.opacity = ghost ? 0.25 : 1;
        mat.depthWrite = !ghost;
      });
      world.subjects.forEach((m) => (m.visible = ghost));
      seen.clear();
      used = 0;
      for (const { mesh, pts, color } of perMesh) {
        for (let k = 0; k < pts.length && used < max; k += 3) {
          tmp.set(pts[k], pts[k + 1], pts[k + 2]).applyMatrix4(mesh.matrixWorld);
          const ix = Math.round(tmp.x / s), iy = Math.round(tmp.y / s), iz = Math.round(tmp.z / s);
          const key = `${ix},${iy},${iz}`;
          if (seen.has(key)) continue;
          seen.add(key);
          m4.makeScale(cube, cube, cube).setPosition(ix * s, iy * s, iz * s);
          cubes.setMatrixAt(used, m4);
          cubes.setColorAt(used, color);
          used++;
        }
      }
      cubes.count = used;
      cubes.instanceMatrix.needsUpdate = true;
      if (cubes.instanceColor) cubes.instanceColor.needsUpdate = true;
    });
    return {
      render: (target, p, frame) => source.render(target, p, frame),
      resize: (w, h) => source.resize(w, h),
      status: () => `ボクセル ${used.toLocaleString()} 個`,
      dispose() {
        cubes.geometry.dispose();
        (cubes.material as THREE.Material).dispose();
        cubes.dispose();
        source.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
