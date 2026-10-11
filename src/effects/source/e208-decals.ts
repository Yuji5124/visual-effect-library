import * as THREE from 'three';
import { DecalGeometry } from 'three/examples/jsm/geometries/DecalGeometry.js';
import { createDemoWorld } from '../../engine/demoWorld';
import { SceneSource } from '../../engine/sceneSource';
import type { SourceEffect } from '../../engine/types';

/** Canvas2D でペンキの飛び散り模様を手続き生成する */
function splatTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#fff';
  const blob = (x: number, y: number, r: number) => {
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  };
  blob(128, 128, 62);
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * Math.PI * 2;
    const d = 50 + Math.random() * 70;
    blob(128 + Math.cos(a) * d, 128 + Math.sin(a) * d, 4 + Math.random() * 14);
    g.lineWidth = 6 + Math.random() * 8;
    g.strokeStyle = '#fff';
    g.beginPath();
    g.moveTo(128, 128);
    g.lineTo(128 + Math.cos(a) * d * 0.9, 128 + Math.sin(a) * d * 0.9);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}

const effect: SourceEffect = {
  id: '208',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'rate', label: '自動で撃つ間隔(秒)', type: 'number', min: 0.05, max: 2, step: 0.01, default: 0.25 },
    { key: 'size', label: 'デカールの大きさ', type: 'number', min: 0.1, max: 2, step: 0.01, default: 0.6 },
    { key: 'max', label: '最大枚数（古い順に消える）', type: 'number', min: 10, max: 200, step: 1, default: 80 },
    { key: 'auto', label: '自動で撃つ', type: 'bool', default: true },
  ],
  notes:
    '物体表面のヒット位置から、向きと大きさを持つ箱で物体のメッシュを切り抜き（DecalGeometry）、模様を貼った薄いメッシュを生成する。生成したデカールは物体の子にして座標を変換しておくので、物体が回転しても表面に張り付いたまま動く。ポリゴンオフセットで本体とのちらつきを防ぐ。画面をクリックした場所にも貼れる。（着想: three.js examples の webgl_decals。DecalGeometry は three.js 同梱のMITライセンスのアドオンを使用）',
  create(ctx) {
    const world = createDemoWorld(ctx);
    const tex = splatTexture();
    const decals: { mesh: THREE.Mesh; mat: THREE.Material }[] = [];
    const ray = new THREE.Raycaster();
    const targets = world.subjects.filter((m) => m.geometry.type !== 'SphereGeometry');
    const orient = new THREE.Euler();
    const helper = new THREE.Object3D();
    const inv = new THREE.Matrix4();
    let maxDecals = 80;
    const place = (hit: THREE.Intersection, size: number) => {
      const mesh = hit.object as THREE.Mesh;
      if (!hit.face) return;
      const n = hit.face.normal.clone().transformDirection(mesh.matrixWorld);
      helper.position.copy(hit.point);
      helper.lookAt(hit.point.clone().add(n));
      helper.rotateZ(Math.random() * Math.PI * 2);
      orient.copy(helper.rotation);
      const s = size * (0.6 + Math.random() * 0.8);
      const geo = new DecalGeometry(mesh, hit.point, orient, new THREE.Vector3(s, s, s));
      // ワールド座標で作られるので、物体のローカル座標へ変換して子にする
      inv.copy(mesh.matrixWorld).invert();
      geo.applyMatrix4(inv);
      const mat = new THREE.MeshStandardMaterial({
        map: tex,
        color: new THREE.Color().setHSL(Math.random(), 0.85, 0.55),
        transparent: true,
        alphaTest: 0.5,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        roughness: 0.3,
      });
      const d = new THREE.Mesh(geo, mat);
      mesh.add(d);
      decals.push({ mesh: d, mat });
      while (decals.length > maxDecals) {
        const old = decals.shift()!;
        old.mesh.parent?.remove(old.mesh);
        old.mesh.geometry.dispose();
        old.mat.dispose();
      }
    };
    const pending: { x: number; y: number }[] = [];
    let acc = 0;
    const source = new SceneSource(ctx.renderer, world.scene, world.camera, ctx.width, ctx.height, (frame, params) => {
      world.update(frame.dt);
      world.scene.updateMatrixWorld();
      maxDecals = Math.round(Number(params.max));
      const size = Number(params.size);
      acc += frame.dt;
      if (params.auto && acc > Number(params.rate)) {
        acc = 0;
        // カメラから見える物体のランダムな位置を狙う
        const t = targets[Math.floor(Math.random() * targets.length)];
        const p = t.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
        ray.set(world.camera.position, p.sub(world.camera.position).normalize());
        const hit = ray.intersectObjects(targets, false)[0];
        if (hit) place(hit, size);
      }
      for (const p of pending.splice(0)) {
        ray.setFromCamera(new THREE.Vector2(p.x * 2 - 1, p.y * 2 - 1), world.camera);
        const hit = ray.intersectObjects(targets, false)[0];
        if (hit) place(hit, size * 1.3);
      }
    });
    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      pointer(x, y, down) {
        if (down) pending.push({ x, y });
      },
      dispose() {
        source.dispose();
        decals.forEach((d) => {
          d.mesh.geometry.dispose();
          d.mat.dispose();
        });
        tex.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
