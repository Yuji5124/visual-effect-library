import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { Heightfield, terrainColor } from '../framework/worldKit';

/** WRD-001 ノイズ高さマップ（fBm）：オクターブを重ねるほど細部が加わる */
export default defineWorldDemo({
  id: 'WRD-001',
  notes: 'シード付きグラディエントノイズを lacunarity 倍ずつ周波数を上げ、gain 倍ずつ振幅を下げて重ねる。比較では同じシードの1オクターブだけの地形を左に並べる。',
  params: [
    { key: 'octaves', label: 'オクターブ', type: 'number', min: 1, max: 8, step: 1, default: 6 },
    { key: 'lacunarity', label: 'lacunarity（周波数の倍率）', type: 'number', min: 1.5, max: 3, step: 0.05, default: 2 },
    { key: 'gain', label: 'gain（振幅の減衰）', type: 'number', min: 0.2, max: 0.8, step: 0.01, default: 0.5 },
    { key: 'scale', label: '地形の広がり（周波数）', type: 'number', min: 0.5, max: 4, step: 0.05, default: 1.6 },
    { key: 'height', label: '高さ', type: 'number', min: 0.5, max: 4, step: 0.05, default: 2.2 },
    { key: 'sea', label: '海面', type: 'number', min: -0.6, max: 0.4, step: 0.01, default: -0.05 },
    { key: 'res', label: '解像度', type: 'number', min: 32, max: 192, step: 16, default: 128 },
  ],
  distance: 13,
  elevation: 0.75,
  compareLabels: ['1オクターブ', 'fBm'],
  build(p, env) {
    const n = env.quality === 'low' ? Math.min(96, Number(p.res)) : Number(p.res);
    const noise = makeNoise2(env.seed);
    const size = 10;
    const make = (oct: number) => {
      const hf = new Heightfield(n, size);
      const h = new Float32Array(n * n);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const x = (i / (n - 1)) * Number(p.scale);
          const y = (j / (n - 1)) * Number(p.scale);
          h[j * n + i] = fbm2(noise, x, y, oct, Number(p.lacunarity), Number(p.gain));
        }
      }
      const sea = Number(p.sea);
      hf.setHeights(h, Number(p.height));
      hf.setColors((k, c) => terrainColor(h[k], sea, c));
      // 海面より下は海面の高さで平らにして水面に見せる
      const pos = hf.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < n * n; k++) if (h[k] < sea) pos.array[k * 3 + 1] = sea * Number(p.height);
      pos.needsUpdate = true;
      hf.geometry.computeVertexNormals();
      return hf.mesh;
    };
    const object = make(Number(p.octaves));
    return { object, before: make(1), info: `${n}×${n} 格子 · ${p.octaves} オクターブ` };
  },
});
