import * as THREE from 'three';
import { COPY_FRAGMENT, FullscreenQuad, createTarget, makeShader } from '../../engine/fullscreen';
import { fbm3 } from '../../engine/noise';
import { renderNoClear } from '../../engine/renderUtil';
import type { SourceEffect } from '../../engine/types';

const effect: SourceEffect = {
  id: '053',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'speed', label: '速度', type: 'number', min: 0.1, max: 4, step: 0.01, default: 1 },
    { key: 'noiseScale', label: '流れ場のスケール', type: 'number', min: 0.3, max: 6, step: 0.01, default: 1.6 },
    { key: 'curl', label: '渦の強さ', type: 'number', min: 0.5, max: 6, step: 0.01, default: 2.5 },
    { key: 'fade', label: '軌跡の消え方', type: 'number', min: 0.005, max: 0.3, step: 0.005, default: 0.04 },
    { key: 'hue', label: '色相', type: 'number', min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: 'hueRange', label: '色相の幅', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
  ],
  notes:
    'ノイズ値を角度に変換した2D流れ場（時間で変化）に沿って粒子を移動。前位置→現位置の線分を加算合成し、蓄積バッファを毎フレーム半透明の黒で薄めて軌跡を残す。粒子数は品質設定で自動調整。',
  create(ctx) {
    const N = ctx.quality === 'high' ? 7000 : 2500;
    const pos = new Float32Array(N * 2);
    const life = new Float32Array(N);
    const aspect = () => ctx.width / ctx.height;
    const respawn = (i: number) => {
      pos[i * 2] = (Math.random() * 2 - 1) * aspect();
      pos[i * 2 + 1] = Math.random() * 2 - 1;
      life[i] = 2 + Math.random() * 6;
    };
    for (let i = 0; i < N; i++) respawn(i);

    const lineGeo = new THREE.BufferGeometry();
    const linePos = new Float32Array(N * 2 * 3);
    const lineCol = new Float32Array(N * 2 * 3);
    lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
    lineGeo.setAttribute('color', new THREE.BufferAttribute(lineCol, 3).setUsage(THREE.DynamicDrawUsage));
    const lineMat = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
    });
    const lines = new THREE.LineSegments(lineGeo, lineMat);
    lines.frustumCulled = false;
    lines.renderOrder = 1;

    const fadeMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.04, depthTest: false, depthWrite: false });
    const fadeQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), fadeMat);
    fadeQuad.frustumCulled = false;
    fadeQuad.renderOrder = 0;

    const scene = new THREE.Scene();
    scene.add(fadeQuad, lines);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);

    const accum = createTarget(ctx.width, ctx.height);
    let needsClear = true;
    const quad = new FullscreenQuad();
    const copy = makeShader(COPY_FRAGMENT, { tDiffuse: { value: null } });
    const color = new THREE.Color();
    let t = 0;

    return {
      render(target, params, frame) {
        const a = aspect();
        camera.left = -a;
        camera.right = a;
        camera.updateProjectionMatrix();
        fadeQuad.scale.set(a, 1, 1);
        fadeMat.opacity = Number(params.fade);

        const speed = Number(params.speed) * 0.006;
        const sc = Number(params.noiseScale);
        const curl = Number(params.curl);
        const hue = Number(params.hue);
        const range = Number(params.hueRange);
        t += frame.dt * 0.08;
        for (let i = 0; i < N; i++) {
          const x = pos[i * 2];
          const y = pos[i * 2 + 1];
          const ang = fbm3(x * sc, y * sc, t, 2) * Math.PI * 2 * curl;
          const nx = x + Math.cos(ang) * speed;
          const ny = y + Math.sin(ang) * speed;
          const o = i * 6;
          linePos[o] = x;
          linePos[o + 1] = y;
          linePos[o + 3] = nx;
          linePos[o + 4] = ny;
          color.setHSL((hue + (ang / (Math.PI * 2 * curl)) * range + 1) % 1, 0.9, 0.55);
          lineCol[o] = lineCol[o + 3] = color.r;
          lineCol[o + 1] = lineCol[o + 4] = color.g;
          lineCol[o + 2] = lineCol[o + 5] = color.b;
          pos[i * 2] = nx;
          pos[i * 2 + 1] = ny;
          life[i] -= frame.dt;
          if (life[i] < 0 || nx < -a || nx > a || ny < -1 || ny > 1) {
            respawn(i);
            // 新しい位置から線を引かないよう、この線分を潰す
            linePos[o] = linePos[o + 3] = pos[i * 2];
            linePos[o + 1] = linePos[o + 4] = pos[i * 2 + 1];
          }
        }
        lineGeo.attributes.position.needsUpdate = true;
        lineGeo.attributes.color.needsUpdate = true;

        if (needsClear) {
          ctx.renderer.setRenderTarget(accum);
          ctx.renderer.setClearColor(0x000000, 1);
          ctx.renderer.clear();
          needsClear = false;
        }
        renderNoClear(ctx.renderer, scene, camera, accum);
        copy.uniforms.tDiffuse.value = accum.texture;
        quad.render(ctx.renderer, copy, target);
      },
      resize(w, h) {
        accum.setSize(w, h);
        needsClear = true;
        for (let i = 0; i < N; i++) respawn(i);
      },
      dispose() {
        lineGeo.dispose();
        lineMat.dispose();
        fadeQuad.geometry.dispose();
        fadeMat.dispose();
        accum.dispose();
        copy.dispose();
        quad.dispose();
      },
    };
  },
};

export default effect;
