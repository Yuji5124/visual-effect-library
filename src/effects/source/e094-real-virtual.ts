import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import { SceneSource } from '../../engine/sceneSource';
import { injectWorldShader } from '../../engine/materialInject';
import type { SourceEffect } from '../../engine/types';

const effect: SourceEffect = {
  id: '094',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'speed', label: '境界の速さ', type: 'number', min: 0, max: 2, step: 0.01, default: 0.5 },
    { key: 'maxRadius', label: '最大半径', type: 'number', min: 2, max: 20, step: 0.1, default: 12 },
    { key: 'virtualColor', label: '仮想世界の色', type: 'color', default: '#3dfff0' },
    { key: 'seam', label: '境界の発光', type: 'number', min: 0, max: 5, step: 0.01, default: 2.5 },
  ],
  notes:
    '中心から広がる球面を境界として、外側は通常のマテリアル（現実）、内側は輪郭線と格子だけの仮想世界として描く。両方のマテリアルにワールド座標を渡し、境界までの距離で破棄・発光させている。境界が往復して2つの世界が入れ替わり続ける。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    const uniforms = { uRadius: { value: 0 }, uSeam: { value: 2 }, uVColor: { value: new THREE.Color() } };
    for (const m of [...world.subjects, world.floor]) {
      injectWorldShader(m.material as THREE.Material, {
        key: 'vfx-real',
        uniforms,
        head: 'uniform float uRadius; uniform float uSeam; uniform vec3 uVColor;',
        early: 'if (length(vWPos.xz) < uRadius) discard;',
        late: 'gl_FragColor.rgb += uVColor * uSeam * exp(-abs(length(vWPos.xz) - uRadius) * 6.0);',
      });
    }
    world.grid.visible = false;
    const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff });
    injectWorldShader(lineMat, {
      key: 'vfx-virtual',
      uniforms,
      head: 'uniform float uRadius; uniform float uSeam; uniform vec3 uVColor;',
      early: 'if (length(vWPos.xz) > uRadius) discard;',
      late: 'gl_FragColor.rgb = uVColor * (1.2 + uSeam * exp(-abs(length(vWPos.xz) - uRadius) * 3.0));',
    });
    const lines: THREE.LineSegments[] = [];
    for (const m of world.subjects) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 12), lineMat);
      m.add(l);
      lines.push(l);
    }
    const gridGeo = new THREE.WireframeGeometry(new THREE.PlaneGeometry(40, 40, 60, 60));
    const grid = new THREE.LineSegments(gridGeo, lineMat);
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = -0.19;
    world.scene.add(grid);
    let t = 0;
    const source = new SceneSource(ctx.renderer, world.scene, world.camera, ctx.width, ctx.height, (frame, params) => {
      world.update(frame.dt);
      t += frame.dt * Number(params.speed);
      uniforms.uRadius.value = (0.5 - 0.5 * Math.cos(t)) * Number(params.maxRadius);
      uniforms.uSeam.value = Number(params.seam);
      uniforms.uVColor.value.set(String(params.virtualColor));
    });
    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      dispose() {
        source.dispose();
        lines.forEach((l) => l.geometry.dispose());
        gridGeo.dispose();
        lineMat.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
