import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import { SceneSource } from '../../engine/sceneSource';
import { injectWorldShader } from '../../engine/materialInject';
import type { SourceEffect } from '../../engine/types';

const effect: SourceEffect = {
  id: '098',
  kind: 'source',
  status: 'implemented',
  params: [
    {
      key: 'axis',
      label: '切断面の向き',
      type: 'select',
      options: [
        { value: 'x', label: '縦（左右に移動）' },
        { value: 'y', label: '横（上下に移動）' },
        { value: 'diag', label: '斜め' },
      ],
      default: 'x',
    },
    { key: 'speed', label: '断面の移動速度', type: 'number', min: 0, max: 2, step: 0.01, default: 0.35 },
    { key: 'capColor', label: '断面の色', type: 'color', default: '#ffcf3d' },
    { key: 'hatch', label: '断面のハッチング', type: 'bool', default: true },
    { key: 'ghost', label: '切り取った側を半透明で残す', type: 'bool', default: true },
  ],
  notes:
    '無限平面で世界を切断し、平面の表側の部分を捨てる（フラグメントでの破棄）。物体の内側（裏面）が見えるところだけを断面色で塗ると、中身の詰まった断面に見える。設計図・医療画像・ゲームのX線視点などに使われる手法。切り取った側はワイヤーフレームの幽霊として残せる。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    const uniforms = {
      uPlane: { value: new THREE.Vector4(1, 0, 0, 0) },
      uCap: { value: new THREE.Color() },
      uHatch: { value: 1 },
    };
    for (const m of [...world.subjects, world.floor]) {
      const mat = m.material as THREE.MeshStandardMaterial;
      mat.side = THREE.DoubleSide;
      injectWorldShader(mat, {
        key: 'vfx-cross-section',
        uniforms,
        head: 'uniform vec4 uPlane; uniform vec3 uCap; uniform float uHatch;',
        early: 'if (dot(vWPos, uPlane.xyz) > uPlane.w) discard;',
        late: `if (!gl_FrontFacing) {
  float h = uHatch > 0.5 ? step(0.5, fract((gl_FragCoord.x + gl_FragCoord.y) / 10.0)) : 1.0;
  gl_FragColor = vec4(uCap * (0.6 + 0.4 * h), 1.0);
}`,
      });
    }
    // 切り取られた側の幽霊（輪郭線）
    const ghostMat = new THREE.LineBasicMaterial({ color: 0x5a7dff, transparent: true, opacity: 0.35, depthWrite: false });
    const ghosts: THREE.LineSegments[] = [];
    for (const m of world.subjects) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 20), ghostMat);
      m.add(l);
      ghosts.push(l);
    }
    const planeMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 8),
      new THREE.MeshBasicMaterial({ color: 0x66aaff, transparent: true, opacity: 0.06, side: THREE.DoubleSide, depthWrite: false }),
    );
    world.scene.add(planeMesh);
    let t = 0;
    const n = new THREE.Vector3();
    const source = new SceneSource(ctx.renderer, world.scene, world.camera, ctx.width, ctx.height, (frame, params) => {
      world.update(frame.dt);
      t += frame.dt * Number(params.speed);
      const axis = String(params.axis);
      if (axis === 'x') n.set(1, 0, 0);
      else if (axis === 'y') n.set(0, 1, 0);
      else n.set(1, 0.6, 0.4).normalize();
      const range = axis === 'y' ? 1.8 : 4.2;
      const off = (axis === 'y' ? 1.2 : 0) + Math.sin(t) * range;
      uniforms.uPlane.value.set(n.x, n.y, n.z, off);
      (uniforms.uCap.value as THREE.Color).set(String(params.capColor));
      uniforms.uHatch.value = params.hatch ? 1 : 0;
      ghosts.forEach((g) => (g.visible = Boolean(params.ghost)));
      planeMesh.position.copy(n).multiplyScalar(off);
      planeMesh.lookAt(planeMesh.position.clone().add(n));
    });
    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      dispose() {
        source.dispose();
        ghosts.forEach((g) => g.geometry.dispose());
        ghostMat.dispose();
        planeMesh.geometry.dispose();
        (planeMesh.material as THREE.Material).dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
