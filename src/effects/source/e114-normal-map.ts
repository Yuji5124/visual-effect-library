import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import type { SourceEffect } from '../../engine/types';

const VERT = /* glsl */ `
uniform float uSpace;
varying vec3 vN;
void main() {
  vec3 n = uSpace < 0.5 ? normalize(normalMatrix * normal) : normalize(mat3(modelMatrix) * normal);
  vN = n;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;
const FRAG = /* glsl */ `
uniform float uQuantize;
varying vec3 vN;
void main() {
  vec3 n = normalize(vN);
  if (uQuantize > 0.5) n = normalize(floor(n * 3.0 + 0.5) / 3.0);
  gl_FragColor = vec4(n * 0.5 + 0.5, 1.0);
}
`;

const effect: SourceEffect = {
  id: '114',
  kind: 'source',
  status: 'implemented',
  params: [
    {
      key: 'space',
      label: '座標系',
      type: 'select',
      options: [
        { value: 'view', label: 'カメラ空間（法線マップでおなじみの青紫）' },
        { value: 'world', label: 'ワールド空間' },
      ],
      default: 'view',
    },
    { key: 'quantize', label: '向きを量子化', type: 'bool', default: false },
  ],
  notes: '各面の法線ベクトル(x,y,z)を -1〜1 から 0〜1 に変換してそのまま RGB として描く。カメラ空間ではこちらを向く面が (0.5, 0.5, 1) の青紫になる。ディファードレンダリングのGバッファやセグメンテーション学習データの可視化に使われる表現。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    world.scene.background = new THREE.Color(0.5, 0.5, 0.5);
    world.scene.fog = null;
    world.grid.visible = false;
    const mat = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms: { uSpace: { value: 0 }, uQuantize: { value: 0 } } });
    world.scene.overrideMaterial = mat;
    return {
      render(target, params, frame) {
        world.update(frame.dt);
        world.camera.aspect = ctx.width / ctx.height;
        world.camera.updateProjectionMatrix();
        mat.uniforms.uSpace.value = params.space === 'world' ? 1 : 0;
        mat.uniforms.uQuantize.value = params.quantize ? 1 : 0;
        ctx.renderer.setRenderTarget(target);
        ctx.renderer.render(world.scene, world.camera);
      },
      dispose() {
        world.scene.overrideMaterial = null;
        mat.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
