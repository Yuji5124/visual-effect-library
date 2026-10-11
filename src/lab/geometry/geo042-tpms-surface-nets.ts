import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { sampleGrid, surfaceNets } from '../framework/isoKit';

/** GEO-042 三重周期極小曲面：陰関数を格子で標本化し、自前の Naive Surface Nets でメッシュ化 */
const SURFACES: Record<string, (x: number, y: number, z: number) => number> = {
  gyroid: (x, y, z) => Math.sin(x) * Math.cos(y) + Math.sin(y) * Math.cos(z) + Math.sin(z) * Math.cos(x),
  schwarzP: (x, y, z) => Math.cos(x) + Math.cos(y) + Math.cos(z),
  schwarzD: (x, y, z) =>
    Math.sin(x) * Math.sin(y) * Math.sin(z) + Math.sin(x) * Math.cos(y) * Math.cos(z) + Math.cos(x) * Math.sin(y) * Math.cos(z) + Math.cos(x) * Math.cos(y) * Math.sin(z),
  neovius: (x, y, z) => 3 * (Math.cos(x) + Math.cos(y) + Math.cos(z)) + 4 * Math.cos(x) * Math.cos(y) * Math.cos(z),
};
// 関数ごとの値のおおよその振幅（厚みを周期に依らず揃えるため）
const SCALE: Record<string, number> = { gyroid: 1.5, schwarzP: 3, schwarzD: 1.4, neovius: 13 };
const H = 1.8;

export default defineGeometryDemo({
  id: 'GEO-042',
  notes: '立方体内の格子で TPMS の陰関数 f を標本化し、自前の Naive Surface Nets（符号の変わるセルに1頂点、符号の変わる格子辺ごとに四角形）でメッシュ化する。厚みを付けると |f|−t の殻、0 なら f の片側を立体化し、外枠の箱と max を取って閉じる。比較では厚みなしの曲面 f=0 を並べる。',
  params: [
    { key: 'surface', label: '曲面の種類', type: 'select', options: [{ value: 'gyroid', label: 'ジャイロイド' }, { value: 'schwarzP', label: 'シュワルツ P' }, { value: 'schwarzD', label: 'シュワルツ D（ダイヤモンド）' }, { value: 'neovius', label: 'ネオヴィウス' }], default: 'gyroid' },
    { key: 'periods', label: '周期数', type: 'number', min: 1, max: 4, step: 0.5, default: 2 },
    { key: 'thickness', label: '壁の厚み（0=片側を充填）', type: 'number', min: 0, max: 0.6, step: 0.01, default: 0.18 },
    { key: 'res', label: '解像度（格子の分割数）', type: 'number', min: 16, max: 96, step: 4, default: 56 },
  ],
  distance: 8.5,
  compareLabels: ['曲面 f=0（厚みなし）', '厚み付きの立体'],
  build(p, env) {
    const kind = String(p.surface);
    const f = SURFACES[kind] ?? SURFACES.gyroid;
    const k = (Number(p.periods) * Math.PI * 2) / (2 * H);
    const t = Number(p.thickness);
    const s = SCALE[kind] ?? 1.5;
    let n = Number(p.res);
    if (env.quality === 'low') n = Math.min(n, 48);
    const box = (x: number, y: number, z: number) => Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) - (H - 0.08);
    const field = sampleGrid((x, y, z) => {
      const v = f(x * k, y * k, z * k) / s;
      const solid = t > 0 ? Math.abs(v) - t : v;
      return Math.max(solid, box(x, y, z));
    }, n, H);
    const geo = surfaceNets(field);
    const mesh = new THREE.Mesh(geo, std(0x6fd3c1, { roughness: 0.35, side: THREE.DoubleSide }));
    // 比較用：箱の中の f=0 だけ（開いた曲面）
    const raw = sampleGrid((x, y, z) => f(x * k, y * k, z * k), Math.min(n, 48), H - 0.08);
    const before = new THREE.Mesh(surfaceNets(raw), std(0x9aa0c0, { side: THREE.DoubleSide }));
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(2 * H, 2 * H, 2 * H)), new THREE.LineBasicMaterial({ color: 0x4a5080 }));
    const cells = Math.pow(n - 1, 3);
    return {
      object: mesh,
      before,
      helpers: frame,
      info: `格子 ${n}³（${cells.toLocaleString()} セル）`,
    };
  },
});
