import { createDemoWorld } from '../../engine/demoWorld';
import { SceneSource } from '../../engine/sceneSource';
import type { SourceEffect } from '../../engine/types';

const effect: SourceEffect = {
  id: '014', kind: 'source', status: 'implemented',
  params: [
    { key: 'frozen', label: '物体の時間を停止', type: 'bool', default: true },
    { key: 'speed', label: '物体の速度', type: 'number', min: 0, max: 3, step: .01, default: 1 },
    { key: 'orbit', label: 'カメラ周回速度', type: 'number', min: -2, max: 2, step: .01, default: .4 },
    { key: 'height', label: 'カメラの高さ', type: 'number', min: 1, max: 8, step: .1, default: 3.6 },
    { key: 'exposure', label: '露出', type: 'number', min: .2, max: 3, step: .01, default: 1.1 },
  ],
  notes: '物体とカメラの時間を分離した3Dタイムフリーズ。停止中はメッシュの姿勢と位置を維持し、カメラだけが周回する。停止を解除すると同じ姿勢から再開する。平面画像の疑似3Dワープではない。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    // Choose an interesting initial pose, then retain it until simulation resumes.
    world.update(1.7);
    let angle = 0;
    const source = new SceneSource(ctx.renderer,world.scene,world.camera,ctx.width,ctx.height,(frame,params) => {
      if (!params.frozen) world.update(Math.max(0,frame.dt),Number(params.speed ?? 1));
      angle += Math.max(0,frame.dt)*Number(params.orbit ?? .4);
      world.camera.position.set(Math.sin(angle)*8.5,Number(params.height ?? 3.6),Math.cos(angle)*8.5);
      world.camera.lookAt(0,1,0);
      source.exposure=Number(params.exposure ?? 1.1);
    });
    return {
      render:(target,params,frame)=>source.render(target,params,frame),
      resize:(w,h)=>source.resize(w,h),
      dispose(){source.dispose();world.dispose();},
    };
  },
};
export default effect;
