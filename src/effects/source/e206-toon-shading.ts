import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import { SceneSource } from '../../engine/sceneSource';
import type { SourceEffect } from '../../engine/types';

const OUTLINE_VERT = /* glsl */ `
uniform float uThickness;
void main() {
  // 背面だけを法線方向に押し出して描く「反転ハル」方式の輪郭線
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  mv.xyz += n * uThickness * (0.6 + 0.08 * -mv.z);
  gl_Position = projectionMatrix * mv;
}
`;

function gradientMap(steps: number): THREE.DataTexture {
  const data = new Uint8Array(steps * 4);
  for (let i = 0; i < steps; i++) {
    const v = Math.round((i / (steps - 1)) * 255 * 0.85 + 38);
    data.set([v, v, v, 255], i * 4);
  }
  const tex = new THREE.DataTexture(data, steps, 1, THREE.RGBAFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

const effect: SourceEffect = {
  id: '206',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'steps', label: '陰影の段数', type: 'number', min: 2, max: 6, step: 1, default: 3 },
    { key: 'outline', label: '輪郭線の太さ', type: 'number', min: 0, max: 0.06, step: 0.001, default: 0.025 },
    { key: 'lineColor', label: '輪郭線の色', type: 'color', default: '#1a1022' },
    { key: 'rim', label: 'リムライト', type: 'bool', default: true },
  ],
  notes:
    'ライティングの明るさを段数ぶんのグラデーションマップ（最近傍フィルタの小さなテクスチャ）で量子化し、陰影をくっきりとした塗り分けにする（MeshToonMaterial）。輪郭線はメッシュを法線方向に少し太らせて裏面だけを描く反転ハル方式で、ポストプロセス不要・物体ごとに太さを変えられるためゲームで定番。（着想: three.js examples の webgl_materials_toon。実装は独自）',
  create(ctx) {
    const world = createDemoWorld(ctx);
    let steps = 3;
    let grad = gradientMap(steps);
    const toonMats: THREE.MeshToonMaterial[] = [];
    const lineMat = new THREE.ShaderMaterial({
      vertexShader: OUTLINE_VERT,
      fragmentShader: 'uniform vec3 uColor; void main(){ gl_FragColor = vec4(uColor, 1.0); }',
      uniforms: { uThickness: { value: 0.025 }, uColor: { value: new THREE.Color() } },
      side: THREE.BackSide,
    });
    const outlines: THREE.Mesh[] = [];
    for (const m of [...world.subjects, world.floor]) {
      const old = m.material as THREE.MeshStandardMaterial;
      const toon = new THREE.MeshToonMaterial({ color: old.color, gradientMap: grad, emissive: old.emissive, emissiveIntensity: old.emissiveIntensity });
      old.dispose();
      m.material = toon;
      toonMats.push(toon);
      if (m !== world.floor) {
        const o = new THREE.Mesh(m.geometry, lineMat);
        m.add(o);
        outlines.push(o);
      }
    }
    world.scene.background = new THREE.Color(0xbfe3ff);
    world.scene.fog = new THREE.Fog(0xbfe3ff, 14, 30);
    (world.floor.material as THREE.MeshToonMaterial).color.set(0x6fbf73);
    world.grid.visible = false;
    const rimLight = new THREE.DirectionalLight(0xffffff, 1.5);
    world.scene.add(rimLight);
    const source = new SceneSource(ctx.renderer, world.scene, world.camera, ctx.width, ctx.height, (frame, params) => {
      world.update(frame.dt);
      const s = Math.round(Number(params.steps));
      if (s !== steps) {
        steps = s;
        grad.dispose();
        grad = gradientMap(steps);
        toonMats.forEach((m) => {
          m.gradientMap = grad;
          m.needsUpdate = true;
        });
      }
      lineMat.uniforms.uThickness.value = Number(params.outline);
      (lineMat.uniforms.uColor.value as THREE.Color).set(String(params.lineColor));
      outlines.forEach((o) => (o.visible = Number(params.outline) > 0));
      rimLight.visible = Boolean(params.rim);
      rimLight.position.copy(world.camera.position).multiplyScalar(-1).setY(3);
    });
    source.exposure = 1.25;
    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      dispose() {
        source.dispose();
        grad.dispose();
        lineMat.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
