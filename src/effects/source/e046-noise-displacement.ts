import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createDemoWorld } from '../../engine/demoWorld';
import { SceneSource } from '../../engine/sceneSource';
import type { SourceEffect } from '../../engine/types';
import { makeNoise3 } from '../../lab/framework/random';

/** 球の頂点を法線方向へ3Dノイズで押し出す（毎フレームCPUで変位し、法線を再計算） */
const effect: SourceEffect = {
  id: '046',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'amount', label: '押し出し量', type: 'number', min: 0, max: 1.2, step: 0.01, default: 0.45 },
    { key: 'freq', label: 'ノイズの周波数', type: 'number', min: 0.3, max: 4, step: 0.01, default: 1.3 },
    { key: 'octaves', label: 'オクターブ', type: 'number', min: 1, max: 4, step: 1, default: 3 },
    { key: 'flow', label: '流れる速さ', type: 'number', min: 0, max: 2, step: 0.01, default: 0.5 },
    { key: 'color', label: '色', type: 'color', default: '#ff6a3d' },
  ],
  notes:
    '細分化した二十面体の各頂点 p を p·(1 + 押し出し量·(fBm(p·周波数 + 時間) − 0.5)) へ動かす。ノイズは時間とともに流れるので、形が溶けるように変わり続ける。毎フレーム頂点を書き換えて法線を再計算するので、陰影も正しく追従する。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    const knot = world.subjects[0];
    knot.visible = false;
    const detail = ctx.quality === 'low' ? 20 : 32;
    const base = mergeVertices(new THREE.IcosahedronGeometry(1.2, detail));
    const orig = (base.attributes.position.array as Float32Array).slice();
    const mat = new THREE.MeshStandardMaterial({ color: 0xff6a3d, roughness: 0.35, metalness: 0.2 });
    const blob = new THREE.Mesh(base, mat);
    blob.position.copy(knot.position);
    world.scene.add(blob);
    const noise = makeNoise3(7);
    let t = 0;
    const source = new SceneSource(ctx.renderer, world.scene, world.camera, ctx.width, ctx.height, (frame, p) => {
      world.update(frame.dt);
      t += frame.dt * Number(p.flow);
      mat.color.set(String(p.color));
      const pos = base.attributes.position as THREE.BufferAttribute;
      const f = Number(p.freq), amt = Number(p.amount), oct = Number(p.octaves);
      for (let i = 0; i < pos.count; i++) {
        const x = orig[i * 3], y = orig[i * 3 + 1], z = orig[i * 3 + 2];
        let sum = 0, a = 0.5, fr = f, norm = 0;
        for (let o = 0; o < oct; o++) {
          sum += a * noise(x * fr + 10 + t, y * fr + 20, z * fr + 30 - t * 0.6);
          norm += a;
          a *= 0.5;
          fr *= 2;
        }
        const k = 1 + amt * (sum / norm - 0.5) * 2;
        pos.setXYZ(i, x * k, y * k, z * k);
      }
      pos.needsUpdate = true;
      base.computeVertexNormals();
      blob.rotation.y += frame.dt * 0.2;
    });
    return {
      render: (target, p, frame) => source.render(target, p, frame),
      resize: (w, h) => source.resize(w, h),
      status: () => `頂点 ${base.attributes.position.count.toLocaleString()}`,
      dispose() {
        source.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
