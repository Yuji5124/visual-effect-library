import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { GridPlane, Heightfield, segments, terrainColor } from '../framework/worldKit';
import { gridFrom, normalize } from '../framework/terrainKit';

/** WRD-009 バイオーム分類：気温（標高から）× 湿度 の2D表引き */

/** 行＝気温（暑い→寒い）、列＝湿度（乾燥→湿潤） */
const TABLE: { name: string; color: number }[][] = [
  [{ name: '砂漠', color: 0xdcc58c }, { name: 'サバンナ', color: 0xb8b25a }, { name: '熱帯季節林', color: 0x5f9c3a }, { name: '熱帯雨林', color: 0x22703a }],
  [{ name: '乾燥草原', color: 0xc8b47c }, { name: '草原', color: 0x93bd5c }, { name: '温帯落葉樹林', color: 0x4c8a3c }, { name: '温帯雨林', color: 0x2c6a50 }],
  [{ name: '寒冷荒原', color: 0xa39a84 }, { name: '低木地', color: 0x88996a }, { name: 'タイガ', color: 0x4a6e56 }, { name: '湿潤タイガ', color: 0x3c6460 }],
  [{ name: 'ツンドラ', color: 0x9c9a8c }, { name: '湿潤ツンドラ', color: 0xb2bbab }, { name: '雪原', color: 0xe6ecf2 }, { name: '氷河', color: 0xf6f9fd }],
];

export default defineWorldDemo({
  id: 'WRD-009',
  notes: '標高と湿度に独立した fBm を使い、気温＝1−勾配×（海面からの高さ）−湿度による冷却 とする。気温4段×湿度4段の表（地形の右に置いた4×4のタイルが凡例：左右=乾燥→湿潤、手前→奥=暑い→寒い）で各点のバイオームを決めて塗る。湿度の偏りや気温の勾配を変えると帯が移動する。比較の左は標高だけで塗った地形。',
  params: [
    { key: 'moisture', label: '湿度の偏り', type: 'number', min: -0.5, max: 0.5, step: 0.01, default: 0 },
    { key: 'gradient', label: '気温の勾配（標高による低下）', type: 'number', min: 0, max: 2, step: 0.05, default: 1 },
    { key: 'warmth', label: '海面付近の気温', type: 'number', min: 0.3, max: 1.2, step: 0.01, default: 0.9 },
    { key: 'sea', label: '海面', type: 'number', min: 0, max: 0.6, step: 0.01, default: 0.3 },
    { key: 'height', label: '高さ', type: 'number', min: 0.5, max: 4, step: 0.05, default: 2.2 },
  ],
  distance: 15,
  elevation: 0.9,
  target: [1.2, 0, 0],
  compareLabels: ['標高だけで着色', 'バイオーム分類'],
  build(p, env) {
    const n = env.quality === 'low' ? 112 : 160;
    const size = 10;
    const ne = makeNoise2(env.seed);
    const nm = makeNoise2(env.seed + 777);
    const sea = Number(p.sea);
    const height = Number(p.height);
    const elev = gridFrom(n, (u, v) => fbm2(ne, u * 2.6, v * 2.6, 6, 2, 0.5) + 0.45 * (1 - Math.hypot(u - 0.5, v - 0.5) * 2.2));
    normalize(elev, 0, 1);
    const moist = gridFrom(n, (u, v) => fbm2(nm, u * 2 + 5, v * 2 + 5, 4, 2, 0.5));
    normalize(moist, 0, 1);
    const bias = Number(p.moisture), grad = Number(p.gradient), warm = Number(p.warmth);
    const counts = new Map<string, number>();
    const cls = new Int16Array(n * n).fill(-1);
    for (let k = 0; k < n * n; k++) {
      if (elev[k] < sea) continue;
      const above = (elev[k] - sea) / Math.max(0.05, 1 - sea);
      const m = Math.min(1, Math.max(0, moist[k] + bias));
      const t = warm - grad * above - 0.1 * m;
      const row = t > 0.7 ? 0 : t > 0.45 ? 1 : t > 0.2 ? 2 : 3;
      const col = Math.min(3, Math.floor(m * 4));
      cls[k] = row * 4 + col;
      const name = TABLE[row][col].name;
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    const disp = elev.map((x) => Math.max(x, sea));
    const make = (biome: boolean) => {
      const hf = new Heightfield(n, size);
      hf.setHeights(disp, height);
      hf.setColors((k, c) => {
        if (elev[k] < sea) return elev[k] < sea - 0.12 ? c.setRGB(0.07, 0.16, 0.38) : c.setRGB(0.12, 0.3, 0.55);
        if (!biome) return terrainColor((elev[k] - sea) / (1 - sea), 0, c);
        if (elev[k] - sea < 0.015) return c.setRGB(0.82, 0.76, 0.55);
        const b = TABLE[cls[k] >> 2][cls[k] & 3];
        return c.setHex(b.color, THREE.SRGBColorSpace);
      });
      return hf.mesh;
    };
    // 凡例：4×4 のタイル（x=湿度、z=気温）
    const legend = new THREE.Group();
    const gp = new GridPlane(4, 4, 3);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) gp.setHex(c, 3 - r, TABLE[r][c].color);
    gp.commit();
    gp.mesh.position.set(size / 2 + 2.3, 0.02, 0);
    legend.add(gp.mesh);
    const lx = size / 2 + 0.8, rx = size / 2 + 3.8;
    legend.add(segments([lx, 0.03, 1.8, rx, 0.03, 1.8, rx, 0.03, 1.8, rx - 0.25, 0.03, 1.65, rx, 0.03, 1.8, rx - 0.25, 0.03, 1.95], 0x6ab8ff));
    legend.add(segments([rx + 0.2, 0.03, 1.5, rx + 0.2, 0.03, -1.5, rx + 0.2, 0.03, -1.5, rx + 0.05, 0.03, -1.25, rx + 0.2, 0.03, -1.5, rx + 0.35, 0.03, -1.25], 0xd0e8ff));
    const total = [...counts.values()].reduce((a, b) => a + b, 0) || 1;
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, v]) => `${k} ${Math.round((v / total) * 100)}%`).join(' / ');
    return {
      object: make(true),
      before: make(false),
      helpers: legend,
      info: `陸地の内訳: ${top} · 凡例: 青矢印=湿潤へ、白矢印=寒冷へ`,
    };
  },
});
