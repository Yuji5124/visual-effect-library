import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { Heightfield, N4, segments, terrainColor } from '../framework/worldKit';
import { contourSegments, gridFrom, waterPlane } from '../framework/terrainKit';

/** WRD-008 島生成：h = ノイズ − 強さ × falloff(中心からの距離) */
export default defineWorldDemo({
  id: 'WRD-008',
  notes: 'fBm ノイズから、中心からの距離 d に応じた減衰 falloff(d)=d² を差し引き、外周を海面下へ押し下げる。d は円形（ユークリッド距離）・四角（チェビシェフ距離）・ドメインワープ（座標を別ノイズで歪めてから測る）から選べる。半透明の海面と海岸線（海面の等高線）を描き、陸地の連結成分を数えて島の数を表示する。比較の左はマスク前のノイズ地形。',
  params: [
    { key: 'shape', label: 'マスク形状', type: 'select', options: [{ value: 'circle', label: '円（距離）' }, { value: 'square', label: '四角（チェビシェフ距離）' }, { value: 'warp', label: 'ドメインワープした距離' }], default: 'warp' },
    { key: 'strength', label: 'マスクの強さ', type: 'number', min: 0, max: 2.5, step: 0.05, default: 1.3 },
    { key: 'sea', label: '海面', type: 'number', min: -0.4, max: 0.4, step: 0.01, default: 0 },
    { key: 'scale', label: 'ノイズのスケール', type: 'number', min: 1, max: 8, step: 0.1, default: 3 },
    { key: 'height', label: '高さ', type: 'number', min: 0.5, max: 4, step: 0.05, default: 2 },
  ],
  distance: 13,
  elevation: 0.85,
  compareLabels: ['マスク前のノイズ', '島マスク適用後'],
  build(p, env) {
    const n = env.quality === 'low' ? 112 : 160;
    const size = 10;
    const noise = makeNoise2(env.seed);
    const warpN = makeNoise2(env.seed + 101);
    const sc = Number(p.scale);
    const shape = String(p.shape);
    const strength = Number(p.strength);
    const sea = Number(p.sea);
    const height = Number(p.height);
    const raw = gridFrom(n, (u, v) => fbm2(noise, u * sc, v * sc, 6, 2, 0.5) * 0.9 + 0.35);
    const dist = (u: number, v: number) => {
      let x = u * 2 - 1, y = v * 2 - 1;
      if (shape === 'square') return Math.max(Math.abs(x), Math.abs(y));
      if (shape === 'warp') {
        x += fbm2(warpN, u * 2.5, v * 2.5, 3, 2, 0.5) * 0.55;
        y += fbm2(warpN, u * 2.5 + 9.2, v * 2.5 + 4.1, 3, 2, 0.5) * 0.55;
      }
      return Math.hypot(x, y);
    };
    const masked = gridFrom(n, (u, v, i, j) => raw[j * n + i] - strength * Math.pow(dist(u, v), 2));

    const make = (h: Float32Array) => {
      const g = new THREE.Group();
      const hf = new Heightfield(n, size);
      // 海底は浅く潰して見やすくする
      const disp = h.map((x) => (x < sea ? sea + (x - sea) * 0.35 : x));
      hf.setHeights(disp, height);
      hf.setColors((k, c) => terrainColor(h[k], sea, c));
      g.add(hf.mesh);
      g.add(waterPlane(size, sea * height + 0.005));
      const coast = contourSegments(h, n, size, sea, sea * height + 0.02);
      if (coast.length) g.add(segments(coast, 0xffffff, { opacity: 0.9 }));
      return g;
    };
    // 陸地の連結成分（島）の数と陸地率
    const label = new Int32Array(n * n).fill(-1);
    let islands = 0, land = 0, edgeLand = 0;
    for (let k = 0; k < n * n; k++) {
      if (masked[k] < sea) continue;
      land++;
      const i = k % n, j = (k / n) | 0;
      if (i === 0 || j === 0 || i === n - 1 || j === n - 1) edgeLand++;
      if (label[k] >= 0) continue;
      const stack = [k];
      label[k] = islands;
      let cells = 0;
      while (stack.length) {
        const q = stack.pop()!;
        cells++;
        const qi = q % n, qj = (q / n) | 0;
        for (const [dx, dz] of N4) {
          const x = qi + dx, z = qj + dz;
          if (x < 0 || z < 0 || x >= n || z >= n) continue;
          const r = z * n + x;
          if (label[r] < 0 && masked[r] >= sea) {
            label[r] = islands;
            stack.push(r);
          }
        }
      }
      if (cells >= 4) islands++;
    }
    return {
      object: make(masked),
      before: make(raw),
      info: `島 ${islands} 個 · 陸地 ${((land / (n * n)) * 100).toFixed(0)}% · 外周に接する陸 ${edgeLand} セル`,
    };
  },
});
