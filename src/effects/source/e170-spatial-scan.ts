import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import { SceneSource } from '../../engine/sceneSource';
import { injectWorldShader } from '../../engine/materialInject';
import type { SourceEffect } from '../../engine/types';

const effect: SourceEffect = {
  id: '170',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'speed', label: 'スキャン速度', type: 'number', min: 0.2, max: 8, step: 0.1, default: 3 },
    { key: 'color', label: 'スキャン光の色', type: 'color', default: '#3dd8ff' },
    { key: 'grid', label: '計測グリッド', type: 'bool', default: true },
    { key: 'hold', label: '全体表示の時間(秒)', type: 'number', min: 0, max: 6, step: 0.1, default: 2 },
  ],
  notes:
    'ARの空間認識やゲームの「スキャナー」演出。中心から球面状の波面が広がり、波面が通過した場所だけ世界が実体化する。波面付近は強く発光し、通過後もしばらくワールド座標の格子（計測グリッド）が残る。未スキャン領域は輪郭線だけで示す。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    const uniforms = { uScan: { value: 0 }, uColor: { value: new THREE.Color() }, uGrid: { value: 1 } };
    const head = 'uniform float uScan; uniform vec3 uColor; uniform float uGrid;';
    for (const m of [...world.subjects, world.floor]) {
      injectWorldShader(m.material as THREE.Material, {
        key: 'vfx-scan',
        uniforms,
        head,
        early: 'float sd = length(vWPos - vec3(0.0, 0.0, 0.0)); if (sd > uScan) discard;',
        late: `float band = exp(-abs(sd - uScan) * 4.0);
vec3 g = abs(fract(vWPos * 2.0) - 0.5);
float gridLine = smoothstep(0.47, 0.5, max(g.x, max(g.y, g.z))) * uGrid * exp(-(uScan - sd) * 0.4);
gl_FragColor.rgb = mix(gl_FragColor.rgb, uColor * 3.0, band * 0.85) + uColor * gridLine * 0.8;`,
      });
    }
    world.grid.visible = false;
    const ghostMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18 });
    injectWorldShader(ghostMat, {
      key: 'vfx-scan-ghost',
      uniforms,
      head,
      early: 'if (length(vWPos) < uScan) discard;',
      late: 'gl_FragColor.rgb = uColor * 0.6;',
    });
    const ghosts: THREE.LineSegments[] = [];
    for (const m of world.subjects) {
      const l = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry, 25), ghostMat);
      m.add(l);
      ghosts.push(l);
    }
    let t = 0;
    const source = new SceneSource(ctx.renderer, world.scene, world.camera, ctx.width, ctx.height, (frame, params) => {
      world.update(frame.dt * 0.5);
      const sp = Number(params.speed);
      const maxR = 22;
      const cycle = maxR / sp + Number(params.hold);
      t = (t + frame.dt) % cycle;
      uniforms.uScan.value = Math.min(maxR, t * sp);
      uniforms.uColor.value.set(String(params.color));
      uniforms.uGrid.value = params.grid ? 1 : 0;
    });
    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      dispose() {
        source.dispose();
        ghosts.forEach((g) => g.geometry.dispose());
        ghostMat.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
