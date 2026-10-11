import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import type { SourceEffect } from '../../engine/types';

const VERT = /* glsl */ `
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const FRAG = /* glsl */ `
uniform float uNear;
uniform float uFar;
uniform float uMap;
uniform float uBands;
varying float vDepth;
vec3 colormap(float t) {
  // 青→シアン→緑→黄→赤（近いほど赤）
  vec3 c0 = vec3(0.10, 0.05, 0.45), c1 = vec3(0.05, 0.55, 0.95), c2 = vec3(0.15, 0.85, 0.45), c3 = vec3(0.98, 0.85, 0.15), c4 = vec3(0.95, 0.2, 0.1);
  float s = clamp(t, 0.0, 1.0) * 4.0;
  if (s < 1.0) return mix(c0, c1, s);
  if (s < 2.0) return mix(c1, c2, s - 1.0);
  if (s < 3.0) return mix(c2, c3, s - 2.0);
  return mix(c3, c4, s - 3.0);
}
void main() {
  float t = clamp((vDepth - uNear) / (uFar - uNear), 0.0, 1.0);
  vec3 col = uMap < 0.5 ? vec3(1.0 - t) : colormap(1.0 - t);
  if (uBands > 0.0) col *= 0.8 + 0.2 * step(0.5, fract(vDepth * uBands));
  gl_FragColor = vec4(col, 1.0);
}
`;

const effect: SourceEffect = {
  id: '113',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'near', label: '近い側(m)', type: 'number', min: 0.1, max: 10, step: 0.1, default: 4 },
    { key: 'far', label: '遠い側(m)', type: 'number', min: 2, max: 40, step: 0.1, default: 16 },
    {
      key: 'map',
      label: '配色',
      type: 'select',
      options: [
        { value: 'gray', label: 'グレースケール（近いほど白）' },
        { value: 'turbo', label: 'カラーマップ' },
      ],
      default: 'turbo',
    },
    { key: 'bands', label: '等深線の密度', type: 'number', min: 0, max: 6, step: 0.1, default: 2 },
  ],
  notes: 'デモ世界のすべての物体を「カメラ座標系での距離」を出力するマテリアルで描き直す（scene.overrideMaterial）。距離を指定範囲で正規化してグレースケールまたはカラーマップに変換する。深度センサーや機械学習の深度推定の出力表示と同じ見せ方。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    world.scene.background = new THREE.Color(0, 0, 0);
    world.scene.fog = null;
    world.grid.visible = false;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uNear: { value: 4 }, uFar: { value: 16 }, uMap: { value: 1 }, uBands: { value: 2 } },
    });
    world.scene.overrideMaterial = mat;
    return {
      render(target, params, frame) {
        world.update(frame.dt);
        world.camera.aspect = ctx.width / ctx.height;
        world.camera.updateProjectionMatrix();
        mat.uniforms.uNear.value = Number(params.near);
        mat.uniforms.uFar.value = Math.max(Number(params.far), Number(params.near) + 0.1);
        mat.uniforms.uMap.value = params.map === 'turbo' ? 1 : 0;
        mat.uniforms.uBands.value = Number(params.bands);
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
