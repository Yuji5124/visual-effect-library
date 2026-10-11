import * as THREE from 'three';
import { disposeObject } from './sceneSource';
import type { EffectContext } from './types';

export interface DemoWorld {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** 演出対象のメッシュ（地面・グリッドを除く） */
  subjects: THREE.Mesh[];
  floor: THREE.Mesh;
  grid: THREE.GridHelper;
  update(dt: number, speed?: number): void;
  dispose(): void;
}

/**
 * デモ用の3D世界。デモシーン本体と、深度・法線・ワイヤーフレーム・断面など
 * 「同じ世界を別の見せ方で描く」演出で共有する。
 */
export function createDemoWorld(ctx: Pick<EffectContext, 'width' | 'height' | 'quality'>): DemoWorld {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x070814);
  scene.fog = new THREE.Fog(0x070814, 9, 26);
  const camera = new THREE.PerspectiveCamera(50, ctx.width / ctx.height, 0.1, 60);

  scene.add(new THREE.HemisphereLight(0x8fb4ff, 0x261030, 1.2));
  const key = new THREE.DirectionalLight(0xffe2c0, 2.2);
  key.position.set(4, 6, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x40c8ff, 1.6);
  rim.position.set(-5, 2, -4);
  scene.add(rim);

  const low = ctx.quality === 'low';
  const subjects: THREE.Mesh[] = [];
  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.05, 0.34, low ? 96 : 180, low ? 12 : 24),
    new THREE.MeshStandardMaterial({ color: 0xff3d8b, metalness: 0.35, roughness: 0.28 }),
  );
  knot.position.y = 1.4;
  scene.add(knot);
  subjects.push(knot);

  const ring = new THREE.Group();
  const geos = [
    new THREE.BoxGeometry(0.8, 0.8, 0.8),
    new THREE.IcosahedronGeometry(0.55, 0),
    new THREE.ConeGeometry(0.5, 1, 6),
    new THREE.OctahedronGeometry(0.55, 0),
  ];
  const count = 10;
  for (let i = 0; i < count; i++) {
    const color = new THREE.Color().setHSL(i / count, 0.85, 0.55);
    const m = new THREE.Mesh(
      geos[i % geos.length],
      new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, flatShading: true }),
    );
    const a = (i / count) * Math.PI * 2;
    m.position.set(Math.cos(a) * 3.6, 0.6 + Math.sin(a * 3) * 0.35, Math.sin(a) * 3.6);
    ring.add(m);
    subjects.push(m);
  }
  scene.add(ring);

  const orbs: THREE.Mesh[] = [];
  const orbGeo = new THREE.SphereGeometry(0.16, 16, 12);
  const orbColors = [0x7dfcff, 0xfff27d, 0xff7df0];
  for (let i = 0; i < 3; i++) {
    const orb = new THREE.Mesh(
      orbGeo,
      new THREE.MeshStandardMaterial({ color: 0x000000, emissive: orbColors[i], emissiveIntensity: 6 }),
    );
    orbs.push(orb);
    subjects.push(orb);
    scene.add(orb);
  }

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: 0x141530, roughness: 0.9 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.2;
  scene.add(floor);
  const grid = new THREE.GridHelper(40, 40, 0x5a4dff, 0x2a2a60);
  grid.position.y = -0.19;
  scene.add(grid);

  let t = 0;
  return {
    scene,
    camera,
    subjects,
    floor,
    grid,
    update(dt, speed = 1) {
      t += dt * speed;
      knot.rotation.set(t * 0.4, t * 0.7, 0);
      ring.rotation.y = t * 0.25;
      ring.children.forEach((c, i) => {
        c.rotation.x = t * (0.5 + i * 0.07);
        c.rotation.y = t * 0.8;
      });
      orbs.forEach((o, i) => {
        const a = t * (0.9 + i * 0.35) + i * 2.1;
        o.position.set(Math.cos(a) * (2 + i * 0.4), 1.3 + Math.sin(a * 1.7) * 1.1, Math.sin(a) * (2 + i * 0.4));
      });
      const ca = t * 0.12;
      camera.position.set(Math.sin(ca) * 8.5, 3.6 + Math.sin(t * 0.21) * 0.6, Math.cos(ca) * 8.5);
      camera.lookAt(0, 1, 0);
    },
    dispose() {
      disposeObject(scene);
      geos.forEach((g) => g.dispose());
    },
  };
}
