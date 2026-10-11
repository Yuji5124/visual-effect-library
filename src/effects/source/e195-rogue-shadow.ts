import * as THREE from 'three';
import { SceneSource, disposeObject } from '../../engine/sceneSource';
import { planarShadowMatrix } from '../../engine/planarShadow';
import type { SourceEffect } from '../../engine/types';

/** カプセルを組み合わせた簡単な人形（腕と脚を回転できる） */
function makeFigure(material: THREE.Material) {
  const root = new THREE.Group();
  const cap = (r: number, l: number) => new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 4, 12), material);
  const body = cap(0.28, 0.6);
  body.position.y = 1.35;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), material);
  head.position.y = 2.05;
  const limb = (x: number, y: number, len: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const l = cap(0.09, len);
    l.position.y = -len / 2 - 0.05;
    pivot.add(l);
    root.add(pivot);
    return pivot;
  };
  root.add(body, head);
  const armL = limb(-0.38, 1.65, 0.55);
  const armR = limb(0.38, 1.65, 0.55);
  const legL = limb(-0.14, 0.95, 0.75);
  const legR = limb(0.14, 0.95, 0.75);
  return { root, head, armL, armR, legL, legR };
}

const effect: SourceEffect = {
  id: '195',
  kind: 'source',
  status: 'implemented',
  params: [
    {
      key: 'behavior',
      label: '影のふるまい',
      type: 'select',
      options: [
        { value: 'wave', label: '手を振る' },
        { value: 'delay', label: '数秒遅れてついてくる' },
        { value: 'dance', label: '勝手に踊る' },
        { value: 'grow', label: '巨大化する' },
      ],
      default: 'wave',
    },
    { key: 'divergence', label: '本体とのずれ', type: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'lightHeight', label: '光源の高さ', type: 'number', min: 0.5, max: 8, step: 0.01, default: 4.5 },
  ],
  notes:
    '影は本体から計算せず、目に見えない「影専用の分身」から平面投影シャドウ行列で地面へ投影する。分身だけに別のアニメーションを与えると、本体は普通に歩いているのに影だけが手を振ったり、遅れたり、踊ったりする。描画のパイプラインは普通の影と全く同じ。',
  create(ctx) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xd8cbb8);
    scene.fog = new THREE.Fog(0xd8cbb8, 12, 40);
    const camera = new THREE.PerspectiveCamera(45, ctx.width / ctx.height, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xfff6e8, 0x8a7a68, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 1.8);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0xe8dcc8, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3a6bff, roughness: 0.5 });
    const fig = makeFigure(bodyMat);
    scene.add(fig.root);
    // 影専用の分身（描画はしない）と、その影
    const twin = makeFigure(bodyMat);
    twin.root.visible = false;
    scene.add(twin.root);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x1a1410, transparent: true, opacity: 0.75, depthWrite: false });
    const shadowParts: { src: THREE.Mesh; dst: THREE.Mesh }[] = [];
    twin.root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const s = new THREE.Mesh(o.geometry, shadowMat);
        s.matrixAutoUpdate = false;
        scene.add(s);
        shadowParts.push({ src: o, dst: s });
      }
    });
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.002);
    const lightPos = new THREE.Vector4();
    const sm = new THREE.Matrix4();
    const past: { x: number; z: number; ry: number; ph: number }[] = [];
    let t = 0;
    const pose = (f: ReturnType<typeof makeFigure>, ph: number, extra: (f: ReturnType<typeof makeFigure>) => void) => {
      f.legL.rotation.x = Math.sin(ph) * 0.6;
      f.legR.rotation.x = -Math.sin(ph) * 0.6;
      f.armL.rotation.set(-Math.sin(ph) * 0.5, 0, 0);
      f.armR.rotation.set(Math.sin(ph) * 0.5, 0, 0);
      f.root.position.y = Math.abs(Math.cos(ph)) * 0.05;
      f.root.scale.setScalar(1);
      extra(f);
    };
    const source = new SceneSource(ctx.renderer, scene, camera, ctx.width, ctx.height, (frame, params) => {
      t += frame.dt;
      const r = 4;
      const a = t * 0.25;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const ry = -a; // 円周に沿って歩く向き
      const ph = t * 5;
      fig.root.position.set(x, 0, z);
      fig.root.rotation.y = ry;
      pose(fig, ph, () => {});
      past.push({ x, z, ry, ph });
      if (past.length > 240) past.shift();
      const k = Number(params.divergence);
      const behavior = String(params.behavior);
      if (behavior === 'delay') {
        const p = past[Math.max(0, past.length - 1 - Math.round(150 * k))];
        twin.root.position.set(p.x, 0, p.z);
        twin.root.rotation.y = p.ry;
        pose(twin, p.ph, () => {});
      } else {
        twin.root.position.set(x, 0, z);
        twin.root.rotation.y = ry;
        pose(twin, ph, (f) => {
          if (behavior === 'wave') {
            f.armR.rotation.set(0, 0, Math.PI * 0.85 * k + Math.sin(t * 8) * 0.3 * k);
          } else if (behavior === 'dance') {
            f.armL.rotation.set(0, 0, -(1.2 + Math.sin(t * 6) * 0.8) * k);
            f.armR.rotation.set(0, 0, (1.2 + Math.cos(t * 6) * 0.8) * k);
            f.legL.rotation.z = Math.sin(t * 6) * 0.4 * k;
            f.root.rotation.y = ry + t * 4 * k;
          } else if (behavior === 'grow') {
            f.root.scale.setScalar(1 + (0.5 + 0.5 * Math.sin(t * 0.6)) * 2.2 * k);
          }
        });
      }
      twin.root.updateMatrixWorld(true);
      fig.root.updateMatrixWorld(true);
      // 点光源（本体の斜め上）から地面へ投影
      lightPos.set(x - Math.cos(a) * 1.8, Number(params.lightHeight) + 1.5, z - Math.sin(a) * 1.8, 1);
      planarShadowMatrix(plane, lightPos, sm);
      for (const p of shadowParts) {
        p.dst.matrix.multiplyMatrices(sm, p.src.matrixWorld);
        p.dst.matrixWorldNeedsUpdate = true;
      }
      sun.position.set(lightPos.x, lightPos.y, lightPos.z);
      sun.target.position.set(x, 0, z);
      sun.target.updateMatrixWorld();
      camera.position.set(x * 1.9 + 3, 4.5, z * 1.9 + 3);
      camera.lookAt(x, 0.8, z);
    });
    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      dispose() {
        source.dispose();
        shadowMat.dispose();
        disposeObject(scene);
      },
    };
  },
};

export default effect;
