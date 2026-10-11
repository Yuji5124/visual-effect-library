import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import { SceneSource } from '../../engine/sceneSource';
import { valueNoise3 } from '../../engine/noise';
import type { SourceEffect } from '../../engine/types';

const effect: SourceEffect = {
  id: '097',
  kind: 'source',
  status: 'implemented',
  params: [
    {
      key: 'rule',
      label: '異常の種類',
      type: 'select',
      options: [
        { value: 'constant', label: '遠近法の否定（どこでも同じ見かけの大きさ）' },
        { value: 'inverse', label: '逆遠近（遠いほど大きい）' },
        { value: 'pulse', label: 'ランダムな巨大化' },
      ],
      default: 'constant',
    },
    { key: 'amount', label: '異常の強さ', type: 'number', min: 0, max: 1, step: 0.01, default: 1 },
  ],
  notes:
    '各物体のスケールを「カメラからの距離」に応じて毎フレーム書き換える。距離に比例させると見かけの大きさが変わらず遠近感が消え、距離の2乗に比例させると遠いものほど大きく見える逆遠近法になる。脳が奥行きを読み違える不気味な空間を作る。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    const baseScale = world.subjects.map((m) => m.scale.clone());
    const wp = new THREE.Vector3();
    const ref = 8.5;
    let t = 0;
    const source = new SceneSource(ctx.renderer, world.scene, world.camera, ctx.width, ctx.height, (frame, params) => {
      world.update(frame.dt);
      t += frame.dt;
      const rule = String(params.rule);
      const k = Number(params.amount);
      world.subjects.forEach((m, i) => {
        m.getWorldPosition(wp);
        const d = wp.distanceTo(world.camera.position);
        let s = 1;
        if (rule === 'constant') s = d / ref;
        else if (rule === 'inverse') s = Math.pow(d / ref, 2.2);
        else s = 1 + Math.pow(valueNoise3(i * 3.1, t * 0.4, 0), 6) * 25;
        s = 1 + (s - 1) * k;
        m.scale.copy(baseScale[i]).multiplyScalar(s);
      });
    });
    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      dispose() {
        source.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
