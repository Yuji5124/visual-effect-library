import * as THREE from 'three';
import { SceneSource, disposeObject } from '../../engine/sceneSource';
import { injectWorldShader } from '../../engine/materialInject';
import type { SourceEffect } from '../../engine/types';

const effect: SourceEffect = {
  id: '194',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'breath', label: '呼吸の深さ', type: 'number', min: 0, max: 0.6, step: 0.01, default: 0.22 },
    { key: 'pulse', label: '脈動の速さ', type: 'number', min: 0, max: 3, step: 0.01, default: 0.9 },
    { key: 'sway', label: 'うねり', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'veins', label: '発光する血管', type: 'number', min: 0, max: 3, step: 0.01, default: 1.2 },
  ],
  notes:
    '数百棟のビルを InstancedMesh 1回で描き、頂点シェーダーで「高さに応じた膨張（呼吸）」「建物ごとに位相のずれた脈動」「上層ほど大きい揺れ」を加える。フラグメント側ではワールド座標のノイズで血管のような発光模様を流す。ジオメトリは箱のままで、生き物らしさは全てシェーダーで作っている。',
  create(ctx) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x120814);
    scene.fog = new THREE.Fog(0x120814, 10, 45);
    const camera = new THREE.PerspectiveCamera(55, ctx.width / ctx.height, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xffb0c0, 0x200818, 1.4));
    const sun = new THREE.DirectionalLight(0xffd0b0, 2);
    sun.position.set(5, 10, 3);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x1a0e1a }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const hi = ctx.quality === 'high';
    const G = hi ? 18 : 12;
    const geo = new THREE.BoxGeometry(1, 1, 1, 2, hi ? 16 : 8, 2);
    geo.translate(0, 0.5, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a8090, roughness: 0.6, metalness: 0.1 });
    const uniforms = { uTime: { value: 0 }, uBreath: { value: 0.2 }, uPulse: { value: 1 }, uSway: { value: 0.3 }, uVeins: { value: 1 } };
    injectWorldShader(mat, {
      key: 'vfx-living-buildings',
      uniforms,
      head: 'uniform float uTime; uniform float uVeins;',
      late: `float vn = sin(vWPos.x * 2.1 + sin(vWPos.y * 1.3 + uTime) * 2.0) * sin(vWPos.z * 1.7 - uTime * 0.7 + vWPos.y * 0.8);
float vein = smoothstep(0.92, 1.0, abs(vn));
gl_FragColor.rgb += vec3(1.0, 0.15, 0.35) * vein * uVeins * (0.6 + 0.4 * sin(uTime * 3.0 + vWPos.y));`,
    });
    // 頂点変形は別途差し込む（injectWorldShader の後に onBeforeCompile を連結）
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (shader, renderer) => {
      prev.call(mat, shader, renderer);
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime; uniform float uBreath; uniform float uPulse; uniform float uSway;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
vec3 inst = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
float phase = inst.x * 0.37 + inst.z * 0.53;
float hgt = transformed.y; // 0〜1（建物の底〜屋上）
float breath = sin(uTime * uPulse + phase) * 0.5 + 0.5;
transformed.xz *= 1.0 + uBreath * breath * sin(hgt * 3.14159) * 0.8;
transformed.x += sin(uTime * 0.8 + phase + hgt * 2.0) * uSway * hgt * hgt * 0.3;
transformed.z += cos(uTime * 0.6 + phase * 1.3 + hgt * 2.0) * uSway * hgt * hgt * 0.3;`,
        );
    };
    const N = G * G;
    const city = new THREE.InstancedMesh(geo, mat, N);
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    let k = 0;
    for (let i = 0; i < G; i++)
      for (let j = 0; j < G; j++) {
        const x = (i - G / 2) * 2.2 + (Math.random() - 0.5) * 0.3;
        const z = (j - G / 2) * 2.2 + (Math.random() - 0.5) * 0.3;
        const d = Math.hypot(x, z);
        const h = (1.5 + Math.random() * 5) * (1.4 - Math.min(d / 25, 1));
        m.makeScale(1.2 + Math.random() * 0.4, Math.max(0.6, h), 1.2 + Math.random() * 0.4).setPosition(x, 0, z);
        city.setMatrixAt(k, m);
        city.setColorAt(k, c.setHSL(0.9 + Math.random() * 0.1, 0.2, 0.45 + Math.random() * 0.2));
        k++;
      }
    scene.add(city);
    let t = 0;
    const source = new SceneSource(ctx.renderer, scene, camera, ctx.width, ctx.height, (frame, params) => {
      t += frame.dt;
      uniforms.uTime.value = t;
      uniforms.uBreath.value = Number(params.breath);
      uniforms.uPulse.value = Number(params.pulse) * 2;
      uniforms.uSway.value = Number(params.sway);
      uniforms.uVeins.value = Number(params.veins);
      camera.position.set(Math.sin(t * 0.07) * 16, 7 + Math.sin(t * 0.13) * 2, Math.cos(t * 0.07) * 16);
      camera.lookAt(0, 2, 0);
    });
    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      dispose() {
        source.dispose();
        disposeObject(scene);
      },
    };
  },
};

export default effect;
