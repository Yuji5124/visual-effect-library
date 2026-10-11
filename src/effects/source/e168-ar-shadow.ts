import * as THREE from 'three';
import { SceneSource, disposeObject } from '../../engine/sceneSource';
import { planarShadowMatrix } from '../../engine/planarShadow';
import type { SourceEffect } from '../../engine/types';

/** 「カメラ映像」の代わりに使う、手続き生成の机と壁の背景 */
const BACKDROP_FRAG = /* glsl */ `
varying vec2 vUv;
float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 wall = mix(vec3(0.55, 0.52, 0.5), vec3(0.75, 0.72, 0.68), vUv.y);
  float horizon = 0.52;
  vec3 col = wall;
  if (vUv.y < horizon) {
    float z = 1.0 / max(horizon - vUv.y, 0.02);
    float grain = sin(vUv.x * z * 6.0 + sin(z * 3.0) * 2.0) * 0.5 + 0.5;
    col = mix(vec3(0.42, 0.27, 0.16), vec3(0.55, 0.36, 0.22), grain) * (0.75 + 0.35 * (horizon - vUv.y));
  }
  col *= 0.94 + 0.06 * h(floor(vUv * 600.0));
  // HDR→トーンマップの経路に乗るため、表示色を線形値に戻しておく
  gl_FragColor = vec4(pow(col, vec3(2.2)) * 1.6, 1.0);
}
`;

const effect: SourceEffect = {
  id: '168',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'softness', label: '影のぼけ（重ね回数）', type: 'number', min: 1, max: 8, step: 1, default: 5 },
    { key: 'opacity', label: '影の濃さ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: 'lightAngle', label: '光の向き（度）', type: 'number', min: 0, max: 360, step: 1, default: 40 },
    { key: 'compare', label: '影なしと比較（左半分）', type: 'bool', default: false },
  ],
  notes:
    '現実の映像（ここでは手続き生成の机の画像で代用）の上に仮想物体を置くとき、接地面に影がないと浮いて見える。物体を光源方向から机の平面へ押しつぶす「平面投影シャドウ行列」で影を描き、光源を少しずつずらして半透明で重ねることで柔らかい半影を作る。シャドウマップ不要で軽く、ARのシャドウキャッチャーの代わりになる。',
  create(ctx) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, ctx.width / ctx.height, 0.1, 50);
    const backdrop = new THREE.Mesh(
      new THREE.PlaneGeometry(2, 2),
      new THREE.ShaderMaterial({
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.9999, 1.0); }',
        fragmentShader: BACKDROP_FRAG,
        depthWrite: false,
      }),
    );
    backdrop.frustumCulled = false;
    backdrop.renderOrder = -10;
    scene.add(backdrop);
    scene.add(new THREE.HemisphereLight(0xfff4e6, 0x6b5440, 1.5));
    const sun = new THREE.DirectionalLight(0xffffff, 2.5);
    scene.add(sun);
    const objects = new THREE.Group();
    const geos = [new THREE.TorusKnotGeometry(0.35, 0.12, 120, 16), new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.IcosahedronGeometry(0.32, 1)];
    const colors = [0xff3d6b, 0x3dc3ff, 0xffd23d];
    const items: THREE.Mesh[] = [];
    geos.forEach((g, i) => {
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: colors[i], roughness: 0.35, metalness: 0.2 }));
      m.position.set((i - 1) * 1.1, 0.5, 0);
      objects.add(m);
      items.push(m);
    });
    scene.add(objects);
    // 影：同じジオメトリを平面へ押しつぶして黒い半透明で描く
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.1, depthWrite: false });
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.001);
    const SH = 8;
    const shadows: THREE.Mesh[][] = items.map((m) =>
      Array.from({ length: SH }, () => {
        const s = new THREE.Mesh(m.geometry, shadowMat);
        s.matrixAutoUpdate = false;
        s.renderOrder = -1;
        scene.add(s);
        return s;
      }),
    );
    const light4 = new THREE.Vector4();
    const shadowM = new THREE.Matrix4();
    let t = 0;
    const source = new SceneSource(ctx.renderer, scene, camera, ctx.width, ctx.height, (frame, params) => {
      t += frame.dt;
      // 手持ちカメラの微妙な揺れ
      camera.position.set(Math.sin(t * 0.3) * 0.6 + Math.sin(t * 2.1) * 0.01, 1.6 + Math.sin(t * 1.7) * 0.01, 3.4);
      camera.lookAt(0, 0.35, 0);
      items.forEach((m, i) => {
        m.position.y = 0.45 + Math.abs(Math.sin(t * 1.4 + i * 1.3)) * 0.5;
        m.rotation.set(t * 0.5 + i, t * 0.7, 0);
      });
      const a = (Number(params.lightAngle) * Math.PI) / 180;
      const lightDir = new THREE.Vector3(Math.cos(a) * 1.2, 2.2, Math.sin(a) * 1.2).normalize();
      sun.position.copy(lightDir).multiplyScalar(5);
      const soft = Math.round(Number(params.softness));
      shadowMat.opacity = Number(params.opacity) / soft;
      const compare = Boolean(params.compare);
      items.forEach((m, i) => {
        m.updateMatrixWorld();
        shadows[i].forEach((s, k) => {
          s.visible = k < soft && !(compare && m.position.x < 0);
          const j = (k / soft) * Math.PI * 2;
          const jit = k === 0 ? 0 : 0.08;
          light4.set(lightDir.x + Math.cos(j) * jit, lightDir.y, lightDir.z + Math.sin(j) * jit, 0);
          planarShadowMatrix(groundPlane, light4, shadowM);
          s.matrix.multiplyMatrices(shadowM, m.matrixWorld);
          s.matrixWorldNeedsUpdate = true;
        });
      });
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
