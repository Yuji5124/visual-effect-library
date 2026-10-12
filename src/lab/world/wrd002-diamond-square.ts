import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { Heightfield, terrainColor } from '../framework/worldKit';
import { normalize } from '../framework/terrainKit';

/** WRD-002 ダイヤモンド・スクエア法：中点変位を段階ごとに乱数幅 2^(−H) 倍で繰り返す */

interface DsResult {
  h: Float32Array;
  /** 最後の段階で加えた点（diamond / square）の格子番号 */
  lastDiamond: number[];
  lastSquare: number[];
}

function diamondSquare(K: number, stages: number, H: number, rng: () => number): DsResult {
  const N = (1 << K) + 1;
  const h = new Float32Array(N * N);
  const r = () => rng() * 2 - 1;
  h[0] = r() * 0.5;
  h[N - 1] = r() * 0.5;
  h[(N - 1) * N] = r() * 0.5;
  h[N * N - 1] = r() * 0.5;
  let step = N - 1;
  let amp = 1;
  let lastDiamond: number[] = [];
  let lastSquare: number[] = [];
  for (let s = 0; s < stages; s++) {
    const half = step >> 1;
    lastDiamond = [];
    lastSquare = [];
    // diamond：正方形の中心＝四隅の平均＋乱数
    for (let j = half; j < N; j += step) {
      for (let i = half; i < N; i += step) {
        const a = h[(j - half) * N + i - half], b = h[(j - half) * N + i + half];
        const c = h[(j + half) * N + i - half], d = h[(j + half) * N + i + half];
        h[j * N + i] = (a + b + c + d) / 4 + r() * amp;
        lastDiamond.push(j * N + i);
      }
    }
    // square：辺の中点＝上下左右（格子内にあるもの）の平均＋乱数
    for (let j = 0; j < N; j += half) {
      for (let i = (j / half) % 2 === 0 ? half : 0; i < N; i += step) {
        let sum = 0, cnt = 0;
        if (i - half >= 0) (sum += h[j * N + i - half]), cnt++;
        if (i + half < N) (sum += h[j * N + i + half]), cnt++;
        if (j - half >= 0) (sum += h[(j - half) * N + i]), cnt++;
        if (j + half < N) (sum += h[(j + half) * N + i]), cnt++;
        h[j * N + i] = sum / cnt + r() * amp;
        lastSquare.push(j * N + i);
      }
    }
    amp *= Math.pow(2, -H);
    step = half;
  }
  return { h, lastDiamond, lastSquare };
}

export default defineWorldDemo({
  id: 'WRD-002',
  notes: '2^n+1 格子の四隅から、正方形の中心（diamond）と辺の中点（square）を「周囲の平均＋乱数」で埋め、段階ごとに乱数幅を 2^(−H) 倍に縮める。「表示する段階」を下げると途中の粗い格子と、その段階で新しく加えた点（赤=diamond、水色=square）が見える。比較では同じシードの fBm 地形を左に並べ、格子方向の筋の有無を見比べられる。',
  params: [
    { key: 'H', label: '粗さ H（大きいほど滑らか）', type: 'number', min: 0.1, max: 1.4, step: 0.05, default: 0.8 },
    { key: 'stages', label: '表示する段階', type: 'number', min: 1, max: 8, step: 1, default: 8 },
    { key: 'height', label: '高さ', type: 'number', min: 0.5, max: 4, step: 0.05, default: 2 },
    { key: 'showPoints', label: '最後の段階で加えた点を表示（段階6以下）', type: 'bool', default: true },
  ],
  distance: 13,
  elevation: 0.75,
  compareLabels: ['fBm（比較用）', 'ダイヤモンド・スクエア'],
  build(p, env) {
    const K = env.quality === 'low' ? 7 : 8;
    const stages = Math.min(K, Number(p.stages));
    const N = (1 << K) + 1;
    const size = 10;
    const height = Number(p.height);
    const ds = diamondSquare(K, stages, Number(p.H), env.rng);
    // 段階 s までに埋まった点は間隔 2^(K−s) の格子
    const step = 1 << (K - stages);
    const m = (1 << stages) + 1;
    const sub = new Float32Array(m * m);
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) sub[j * m + i] = ds.h[j * step * N + i * step];
    normalize(sub, -0.45, 1.05);

    const toMesh = (h: Float32Array, n: number, flat: boolean) => {
      const hf = new Heightfield(n, size, { flat });
      hf.setHeights(h, height);
      hf.setColors((k, c) => terrainColor(h[k], 0, c));
      const pos = hf.geometry.attributes.position as THREE.BufferAttribute;
      for (let k = 0; k < n * n; k++) if (h[k] < 0) pos.array[k * 3 + 1] = 0;
      pos.needsUpdate = true;
      hf.geometry.computeVertexNormals();
      return hf.mesh;
    };
    const object = toMesh(sub, m, m <= 65);

    // 比較用 fBm（同じシード・同じ解像度）
    const noise = makeNoise2(env.seed);
    const fb = new Float32Array(m * m);
    for (let j = 0; j < m; j++) for (let i = 0; i < m; i++) fb[j * m + i] = fbm2(noise, (i / (m - 1)) * 2, (j / (m - 1)) * 2, Math.max(1, stages), 2, Math.pow(2, -Number(p.H)));
    normalize(fb, -0.45, 1.05);
    const before = toMesh(fb, m, m <= 65);

    let helpers: THREE.Object3D | undefined;
    if (p.showPoints && stages <= 6) {
      const group = new THREE.Group();
      const mk = (list: number[], color: number) => {
        const arr = new Float32Array(list.length * 3);
        list.forEach((idx, t) => {
          const i = (idx % N) / step, j = Math.floor(idx / N) / step;
          const k = j * m + i;
          arr[t * 3] = (i / (m - 1) - 0.5) * size;
          arr[t * 3 + 1] = Math.max(0, sub[k]) * height + 0.04;
          arr[t * 3 + 2] = (j / (m - 1) - 0.5) * size;
        });
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
        return new THREE.Points(g, new THREE.PointsMaterial({ color, size: stages <= 5 ? 0.22 : stages <= 6 ? 0.1 : 0.05, sizeAttenuation: true, depthTest: stages > 6 }));
      };
      group.add(mk(ds.lastDiamond, 0xff5a5a), mk(ds.lastSquare, 0x5ae0ff));
      helpers = group;
    }
    return {
      object,
      before,
      helpers,
      info: `段階 ${stages}/${K} · 表示格子 ${m}×${m} · 最終段で追加 diamond ${ds.lastDiamond.length} 点 / square ${ds.lastSquare.length} 点`,
    };
  },
});
