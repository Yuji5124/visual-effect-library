import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import { SceneSource, disposeObject } from '../../engine/sceneSource';
import { createTarget } from '../../engine/fullscreen';
import type { SourceEffect } from '../../engine/types';

const PORTAL_FRAG = /* glsl */ `
uniform sampler2D tOther;
uniform vec2 uResolution;
uniform float uTime;
varying vec2 vUv;
void main() {
  vec2 suv = gl_FragCoord.xy / uResolution;
  float r = length(vUv - 0.5) * 2.0;
  vec2 wobble = vec2(sin(r * 20.0 - uTime * 4.0), cos(r * 17.0 - uTime * 3.0)) * 0.004 * smoothstep(0.7, 1.0, r);
  vec3 col = texture2D(tOther, suv + wobble).rgb;
  col += vec3(1.2, 0.6, 2.0) * smoothstep(0.8, 1.0, r) * 1.5;
  if (r > 1.0) discard;
  gl_FragColor = vec4(col, 1.0);
}
`;
const PORTAL_VERT = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/** ポータルの向こう側の世界：夕焼けの下に結晶が立ち並ぶ */
function buildOtherWorld(): THREE.Scene {
  const s = new THREE.Scene();
  s.background = new THREE.Color(0xff7a3a);
  s.fog = new THREE.Fog(0xff8a4a, 6, 30);
  s.add(new THREE.HemisphereLight(0xffd0a0, 0x402050, 2));
  const sun = new THREE.DirectionalLight(0xffe0c0, 3);
  sun.position.set(-3, 4, -6);
  s.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x5a2a4a, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  s.add(ground);
  const geo = new THREE.OctahedronGeometry(0.5, 0);
  for (let i = 0; i < 70; i++) {
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.75 + Math.random() * 0.2, 0.7, 0.6), emissive: 0x220833, roughness: 0.2, metalness: 0.3 }));
    const a = Math.random() * Math.PI * 2;
    const r = 3 + Math.random() * 18;
    m.position.set(Math.cos(a) * r, 0.5 + Math.random() * 2, Math.sin(a) * r);
    m.scale.set(0.6 + Math.random(), 1.5 + Math.random() * 4, 0.6 + Math.random());
    s.add(m);
  }
  return s;
}

const effect: SourceEffect = {
  id: '164',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'size', label: 'ポータルの大きさ', type: 'number', min: 0.5, max: 4, step: 0.01, default: 2 },
    { key: 'parallax', label: '向こう側の視差', type: 'number', min: 0, max: 2, step: 0.01, default: 1 },
    { key: 'face', label: '常にこちらを向く', type: 'bool', default: true },
  ],
  notes:
    '別の世界を、こちらのカメラと同じ位置・向きのカメラでテクスチャに描画し（レンダーテクスチャ）、ポータルの円盤には画面座標でそのテクスチャを貼る。視点を動かすと向こう側の世界も正しく視差で動くので、空間に穴が開いているように見える（ステンシル方式と同じ見え方をRTTで実現）。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    world.subjects[0].visible = false; // 中央の結び目の位置にポータルを置く
    const other = buildOtherWorld();
    const otherCam = new THREE.PerspectiveCamera();
    let rt = createTarget(ctx.width, ctx.height, { float: true, depth: true });
    const mat = new THREE.ShaderMaterial({
      vertexShader: PORTAL_VERT,
      fragmentShader: PORTAL_FRAG,
      uniforms: { tOther: { value: rt.texture }, uResolution: { value: new THREE.Vector2(ctx.width, ctx.height) }, uTime: { value: 0 } },
      side: THREE.DoubleSide,
    });
    const portal = new THREE.Mesh(new THREE.CircleGeometry(1, 64), mat);
    portal.position.set(0, 1.5, 0);
    world.scene.add(portal);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.05, 12, 96), new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xb070ff, emissiveIntensity: 4 }));
    portal.add(ring);
    const source = new SceneSource(ctx.renderer, world.scene, world.camera, ctx.width, ctx.height, (frame, params) => {
      world.update(frame.dt);
      const s = Number(params.size);
      portal.scale.setScalar(s * (1 + Math.sin(frame.time * 2) * 0.02));
      if (params.face) portal.lookAt(world.camera.position);
      else portal.rotation.set(0, frame.time * 0.3, 0);
      // 向こう側のカメラ：こちらのカメラ姿勢を（視差量を掛けて）そのまま使う
      otherCam.copy(world.camera);
      otherCam.position.multiplyScalar(Number(params.parallax));
      otherCam.position.y = world.camera.position.y;
      otherCam.quaternion.copy(world.camera.quaternion);
      otherCam.updateMatrixWorld();
      ctx.renderer.setRenderTarget(rt);
      ctx.renderer.render(other, otherCam);
      mat.uniforms.uTime.value = frame.time;
    });
    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => {
        source.resize(w, h);
        rt.dispose();
        rt = createTarget(w, h, { float: true, depth: true });
        mat.uniforms.tOther.value = rt.texture;
        mat.uniforms.uResolution.value.set(w, h);
      },
      dispose() {
        source.dispose();
        rt.dispose();
        mat.dispose();
        portal.geometry.dispose();
        ring.geometry.dispose();
        (ring.material as THREE.Material).dispose();
        disposeObject(other);
        world.dispose();
      },
    };
  },
};

export default effect;
