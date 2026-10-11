import { createDemoWorld } from './demoWorld';
import { SceneSource } from './sceneSource';
import type { SourceEffect } from './types';

/**
 * ポストプロセス系演出の確認用デモシーン。
 * 輪郭・高輝度・彩度・動きを含むように構成している。
 */
export const demoScene: SourceEffect = {
  id: 'demo',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'speed', label: '速度', type: 'number', min: 0, max: 3, step: 0.01, default: 1 },
    { key: 'exposure', label: '露出', type: 'number', min: 0.2, max: 3, step: 0.01, default: 1.1 },
  ],
  create(ctx) {
    const world = createDemoWorld(ctx);
    const source = new SceneSource(ctx.renderer, world.scene, world.camera, ctx.width, ctx.height, (frame, params) => {
      world.update(frame.dt, Number(params.speed ?? 1));
      source.exposure = Number(params.exposure ?? 1.1);
    });
    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      dispose: () => {
        source.dispose();
        world.dispose();
      },
    };
  },
};
