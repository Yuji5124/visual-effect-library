import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import { SceneSource } from '../../engine/sceneSource';
import { FullscreenQuad, createTarget, makeShader } from '../../engine/fullscreen';
import type { SourceEffect } from '../../engine/types';

const COMBINE = /* glsl */ `
uniform sampler2D tLeft;
uniform sampler2D tRight;
uniform float uMode;
varying vec2 vUv;
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
void main() {
  vec3 l = texture2D(tLeft, vUv).rgb;
  vec3 r = texture2D(tRight, vUv).rgb;
  vec3 col;
  if (uMode < 0.5) col = vec3(l.r, r.g, r.b);                    // カラー（赤＝左目、青緑＝右目）
  else if (uMode < 1.5) col = vec3(luma(l), luma(r), luma(r));   // グレー（色の競合が少なく見やすい）
  else col = vec3(luma(l) * 0.7 + l.r * 0.3, r.g, r.b);          // ハーフカラー
  gl_FragColor = vec4(col, 1.0);
}
`;

const effect: SourceEffect = {
  id: '205',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'separation', label: '目の間隔', type: 'number', min: 0, max: 0.8, step: 0.001, default: 0.3 },
    { key: 'focus', label: '焦点距離', type: 'number', min: 2, max: 20, step: 0.1, default: 8 },
    {
      key: 'mode',
      label: '方式',
      type: 'select',
      options: [
        { value: 'color', label: 'カラー' },
        { value: 'gray', label: 'グレー' },
        { value: 'half', label: 'ハーフカラー' },
      ],
      default: 'half',
    },
  ],
  notes:
    '左右の目の位置にずらした2台のカメラ（StereoCamera：焦点面で視線が交わる非対称視錐台）でシーンを2回描き、左目の像を赤チャンネル、右目の像を青緑チャンネルに入れて重ねる。赤青メガネをかけると左右の目に別々の像が届き立体に見える。メガネがなくても視差のずれが確認できる。（着想: three.js examples の webgl_effects_anaglyph。実装は独自）',
  create(ctx) {
    const world = createDemoWorld(ctx);
    const stereo = new THREE.StereoCamera();
    const source = new SceneSource(ctx.renderer, world.scene, world.camera, ctx.width, ctx.height);
    let left = createTarget(ctx.width, ctx.height);
    let right = createTarget(ctx.width, ctx.height);
    const quad = new FullscreenQuad();
    const combine = makeShader(COMBINE, { tLeft: { value: null }, tRight: { value: null }, uMode: { value: 2 } });
    const modes = ['color', 'gray', 'half'];
    return {
      render(target, params, frame) {
        world.update(frame.dt);
        world.camera.aspect = ctx.width / ctx.height;
        world.camera.focus = Number(params.focus);
        world.camera.updateProjectionMatrix();
        world.camera.updateMatrixWorld();
        stereo.eyeSep = Number(params.separation);
        stereo.update(world.camera);
        source.camera = stereo.cameraL;
        source.render(left, params, frame);
        source.camera = stereo.cameraR;
        source.render(right, params, frame);
        combine.uniforms.tLeft.value = left.texture;
        combine.uniforms.tRight.value = right.texture;
        combine.uniforms.uMode.value = Math.max(0, modes.indexOf(String(params.mode)));
        quad.render(ctx.renderer, combine, target);
      },
      resize(w, h) {
        source.resize(w, h);
        left.setSize(w, h);
        right.setSize(w, h);
      },
      dispose() {
        source.dispose();
        left.dispose();
        right.dispose();
        combine.dispose();
        quad.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
