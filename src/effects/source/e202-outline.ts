import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import { SceneSource } from '../../engine/sceneSource';
import { FullscreenQuad, createTarget, makeShader } from '../../engine/fullscreen';
import type { SourceEffect } from '../../engine/types';

const MASK_FRAG = /* glsl */ `
uniform vec3 uChannel;
void main() { gl_FragColor = vec4(uChannel, 1.0); }
`;
const MASK_VERT = /* glsl */ `
void main() { gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tBeauty;
uniform sampler2D tMask;
uniform vec2 uTexel;
uniform float uWidth;
uniform vec3 uVisible;
uniform vec3 uHidden;
uniform float uTime;
uniform float uPulse;
uniform float uXray;
varying vec2 vUv;
void main() {
  vec3 col = texture2D(tBeauty, vUv).rgb;
  vec2 m = texture2D(tMask, vUv).rg;         // r: シルエット全体, g: 見えている部分
  float dilR = 0.0, dilG = 0.0;
  for (int i = 0; i < 16; i++) {
    float a = float(i) / 16.0 * 6.2831853;
    for (int k = 1; k <= 3; k++) {
      vec2 o = vec2(cos(a), sin(a)) * uTexel * uWidth * float(k) / 3.0;
      vec2 s = texture2D(tMask, vUv + o).rg;
      dilR = max(dilR, s.r);
      dilG = max(dilG, s.g);
    }
  }
  float edgeVisible = clamp(dilG - m.g, 0.0, 1.0) * (1.0 - m.r * (1.0 - m.g));
  float edgeHidden = clamp(dilR - m.r, 0.0, 1.0) * (1.0 - edgeVisible);
  float pulse = 1.0 + uPulse * 0.5 * sin(uTime * 5.0);
  col = mix(col, uVisible * 1.4 * pulse, edgeVisible);
  col = mix(col, uHidden, edgeHidden * 0.8);
  // 遮られている部分を透かして見せる（X線）
  col = mix(col, uHidden * 0.6, (m.r - m.g) * uXray * 0.5);
  gl_FragColor = vec4(col, 1.0);
}
`;

const effect: SourceEffect = {
  id: '202',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'width', label: '線の太さ(px)', type: 'number', min: 1, max: 12, step: 0.5, default: 4 },
    { key: 'visible', label: '見えている輪郭の色', type: 'color', default: '#ffd23d' },
    { key: 'hidden', label: '隠れた輪郭の色', type: 'color', default: '#3d8bff' },
    { key: 'pulse', label: '明滅', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'xray', label: '遮られた部分を透かす', type: 'bool', default: true },
  ],
  notes:
    '選択中の物体だけを、①深度テストなし（シルエット全体）と②シーン全体の深度で隠れた部分を除いたもの（見えている部分）の2通りでマスクに描く。マスクを周囲に膨らませた差分が輪郭になり、①だけにある輪郭は「壁の向こうにいる」選択物として別色で描ける。マウス／タッチで指した物体が選択され、何もしなければ自動で切り替わる。（着想: pmndrs/postprocessing の OutlineEffect。実装は独自）',
  create(ctx) {
    const world = createDemoWorld(ctx);
    const r = ctx.renderer;
    const source = new SceneSource(r, world.scene, world.camera, ctx.width, ctx.height, (frame) => world.update(frame.dt));
    let beauty = createTarget(ctx.width, ctx.height, { depth: true });
    let mask = createTarget(ctx.width, ctx.height, { depth: true });
    // 深度プリパスを少し奥へずらし、選択物の「見えている部分」判定でちらつかないようにする
    const depthOnly = new THREE.MeshBasicMaterial({ colorWrite: false, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 });
    const maskAll = new THREE.ShaderMaterial({
      vertexShader: MASK_VERT,
      fragmentShader: MASK_FRAG,
      uniforms: { uChannel: { value: new THREE.Vector3(1, 0, 0) } },
      depthTest: false,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
    const maskVisible = new THREE.ShaderMaterial({
      vertexShader: MASK_VERT,
      fragmentShader: MASK_FRAG,
      uniforms: { uChannel: { value: new THREE.Vector3(0, 1, 0) } },
      depthFunc: THREE.LessEqualDepth,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      transparent: true,
    });
    const quad = new FullscreenQuad();
    const comp = makeShader(COMPOSITE, {
      tBeauty: { value: beauty.texture },
      tMask: { value: mask.texture },
      uTexel: { value: new THREE.Vector2(1 / ctx.width, 1 / ctx.height) },
      uWidth: { value: 4 },
      uVisible: { value: new THREE.Color() },
      uHidden: { value: new THREE.Color() },
      uTime: { value: 0 },
      uPulse: { value: 0.5 },
      uXray: { value: 1 },
    });
    const selectable = world.subjects;
    let selected = new Set<THREE.Mesh>([selectable[0]]);
    const ray = new THREE.Raycaster();
    let hover: THREE.Vector2 | null = null;
    let sincePointer = 99;
    let autoT = 0;
    const maskScene = new THREE.Scene();
    return {
      render(target, params, frame) {
        source.render(beauty, params, frame);
        autoT += frame.dt;
        sincePointer += frame.dt;
        if (hover && sincePointer < 3) {
          ray.setFromCamera(hover, world.camera);
          const hit = ray.intersectObjects(selectable, false)[0];
          if (hit) selected = new Set([hit.object as THREE.Mesh]);
        } else if (autoT > 2.2) {
          autoT = 0;
          // 結び目と、その時々でランダムな2つを選択
          selected = new Set([selectable[0], selectable[1 + Math.floor(Math.random() * 10)], selectable[1 + Math.floor(Math.random() * 10)]]);
        }
        // 1) シーン全体の深度だけを書く
        r.setRenderTarget(mask);
        r.setClearColor(0x000000, 1);
        r.clear();
        world.scene.overrideMaterial = depthOnly;
        const bg = world.scene.background;
        world.scene.background = null;
        r.render(world.scene, world.camera);
        world.scene.overrideMaterial = null;
        world.scene.background = bg;
        // 2) 選択物だけをマスクとして描く（シルエット全体＋見えている部分）
        const autoClear = r.autoClear;
        r.autoClear = false;
        for (const mat of [maskAll, maskVisible]) {
          for (const m of selected) {
            const proxy = new THREE.Mesh(m.geometry, mat);
            m.updateMatrixWorld();
            proxy.matrixAutoUpdate = false;
            proxy.matrix.copy(m.matrixWorld);
            maskScene.add(proxy);
          }
          r.render(maskScene, world.camera);
          maskScene.clear();
        }
        r.autoClear = autoClear;
        const u = comp.uniforms;
        u.uWidth.value = Number(params.width) * Math.max(1, ctx.height / 700);
        (u.uVisible.value as THREE.Color).set(String(params.visible));
        (u.uHidden.value as THREE.Color).set(String(params.hidden));
        u.uTime.value = frame.time;
        u.uPulse.value = Number(params.pulse);
        u.uXray.value = params.xray ? 1 : 0;
        quad.render(r, comp, target);
      },
      pointer(x, y) {
        hover = new THREE.Vector2(x * 2 - 1, y * 2 - 1);
        sincePointer = 0;
      },
      resize(w, h) {
        source.resize(w, h);
        beauty.dispose();
        mask.dispose();
        beauty = createTarget(w, h, { depth: true });
        mask = createTarget(w, h, { depth: true });
        comp.uniforms.tBeauty.value = beauty.texture;
        comp.uniforms.tMask.value = mask.texture;
        comp.uniforms.uTexel.value.set(1 / w, 1 / h);
      },
      dispose() {
        source.dispose();
        beauty.dispose();
        mask.dispose();
        [depthOnly, maskAll, maskVisible, comp].forEach((m) => m.dispose());
        quad.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
