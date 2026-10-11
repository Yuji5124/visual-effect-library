import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import { hexToVec3 } from '../../engine/shaderEffect';
import type { SourceEffect } from '../../engine/types';

const LINE_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uFogFar;
varying float vDepth;
void main() {
  float f = 1.0 - smoothstep(4.0, uFogFar, vDepth);
  gl_FragColor = vec4(uColor * (0.25 + f), 1.0);
}
`;
const LINE_VERT = /* glsl */ `
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;

const effect: SourceEffect = {
  id: '030',
  kind: 'source',
  status: 'implemented',
  params: [
    {
      key: 'mode',
      label: '線の種類',
      type: 'select',
      options: [
        { value: 'edges', label: '輪郭線のみ（角度しきい値）' },
        { value: 'all', label: '全ポリゴン' },
      ],
      default: 'edges',
    },
    { key: 'hidden', label: '隠線消去', type: 'bool', default: true },
    { key: 'threshold', label: '輪郭とみなす角度（度）', type: 'number', min: 1, max: 60, step: 1, default: 15 },
    { key: 'color', label: '線の色', type: 'color', default: '#3dff8b' },
  ],
  notes: 'EdgesGeometry（隣接面の角度がしきい値を超える辺だけ）またはWireframeGeometry（全三角形の辺）で線を作る。隠線消去は、メッシュを色を書かず深度だけ書く「深度プリパス」で先に描き、奥の線を隠す古典的な手法。初期の3Dゲームやベクタースキャン表示風。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    world.scene.fog = null;
    world.scene.background = new THREE.Color(0.0, 0.01, 0.0);
    world.scene.traverse((o) => {
      if (o instanceof THREE.Light) o.visible = false;
    });
    world.grid.visible = false;
    world.floor.visible = false;
    const lineMat = new THREE.ShaderMaterial({
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      uniforms: { uColor: { value: new THREE.Vector3() }, uFogFar: { value: 22 } },
    });
    const depthMat = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    // 元のマテリアルは使わないので解放し、深度専用マテリアルに差し替える
    for (const m of world.subjects) {
      (m.material as THREE.Material).dispose();
      m.material = depthMat;
    }
    const lines: THREE.LineSegments[] = [];
    const floorLines = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.PlaneGeometry(40, 40, 40, 40)), lineMat);
    floorLines.rotation.x = -Math.PI / 2;
    floorLines.position.y = -0.2;
    world.scene.add(floorLines);
    let key = '';
    const build = (mode: string, th: number) => {
      lines.forEach((l) => {
        l.parent?.remove(l);
        l.geometry.dispose();
      });
      lines.length = 0;
      for (const m of world.subjects) {
        const g = mode === 'all' ? new THREE.WireframeGeometry(m.geometry) : new THREE.EdgesGeometry(m.geometry, th);
        const l = new THREE.LineSegments(g, lineMat);
        m.add(l);
        lines.push(l);
      }
    };
    return {
      render(target, params, frame) {
        const k = `${params.mode}|${params.threshold}`;
        if (k !== key) {
          key = k;
          build(String(params.mode), Number(params.threshold));
        }
        depthMat.visible = Boolean(params.hidden);
        world.update(frame.dt);
        world.camera.aspect = ctx.width / ctx.height;
        world.camera.updateProjectionMatrix();
        hexToVec3(String(params.color), lineMat.uniforms.uColor.value);
        ctx.renderer.setRenderTarget(target);
        ctx.renderer.render(world.scene, world.camera);
      },
      dispose() {
        lines.forEach((l) => l.geometry.dispose());
        floorLines.geometry.dispose();
        lineMat.dispose();
        depthMat.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
