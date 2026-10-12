import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';

/** GEO-046 再帰幾何：残す小立方体（小四面体）の位置を再帰で求め、InstancedMesh で一度に描く */
type Kind = 'menger' | 'cantor' | 'jerusalem' | 'sierpinski';
interface Item { x: number; y: number; z: number; s: number; depth: number }

const RULES: Record<string, { keep: number; split: number; dim: number; name: string }> = {
  menger: { keep: 20, split: 27, dim: Math.log(20) / Math.log(3), name: 'メンガーのスポンジ' },
  cantor: { keep: 8, split: 27, dim: Math.log(8) / Math.log(3), name: 'カントールの塵' },
  inverse: { keep: 7, split: 27, dim: Math.log(7) / Math.log(3), name: '十字（スポンジの抜いた部分）' },
  sierpinski: { keep: 4, split: 8, dim: 2, name: 'シェルピンスキー四面体' },
};

function subdivide(kind: string, level: number, explode: number): Item[] {
  let items: Item[] = [{ x: 0, y: 0, z: 0, s: 1, depth: 0 }];
  const tet = [
    [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1],
  ];
  for (let l = 0; l < level; l++) {
    const next: Item[] = [];
    for (const it of items) {
      if (kind === 'sierpinski') {
        // 4隅の半分の大きさの四面体を残す
        const s = it.s / 2;
        for (const [a, b, c] of tet) next.push({ x: it.x + a * s * 0.5 * (1 + explode), y: it.y + b * s * 0.5 * (1 + explode), z: it.z + c * s * 0.5 * (1 + explode), s, depth: l + 1 });
        continue;
      }
      const s = it.s / 3;
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          for (let k = -1; k <= 1; k++) {
            // 中央の軸方向の数（0=隅, 1=辺の中点, 2=面の中心, 3=中心）
            const zeros = (i === 0 ? 1 : 0) + (j === 0 ? 1 : 0) + (k === 0 ? 1 : 0);
            const keep = kind === 'menger' ? zeros < 2 : kind === 'cantor' ? zeros === 0 : zeros >= 2;
            if (!keep) continue;
            const o = s * (1 + explode);
            next.push({ x: it.x + i * o, y: it.y + j * o, z: it.z + k * o, s, depth: l + 1 });
          }
    }
    items = next;
  }
  return items;
}

function tetraGeometry(): THREE.BufferGeometry {
  // 一辺の外接立方体 [-0.5,0.5]^3 に内接する正四面体
  const v = [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]].map(([a, b, c]) => new THREE.Vector3(a, b, c).multiplyScalar(0.5));
  const f = [[0, 2, 1], [0, 1, 3], [0, 3, 2], [1, 2, 3]];
  const pos: number[] = [];
  for (const [a, b, c] of f) for (const i of [a, b, c]) pos.push(v[i].x, v[i].y, v[i].z);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

export default defineGeometryDemo({
  id: 'GEO-046',
  notes: '立方体を 3×3×3 に分け、規則で選んだ小立方体だけを残す処理を再帰する（メンガー：面中心と中心を抜いて 20/27 を残す）。シェルピンスキーは四面体の4隅の半分を残す。残った位置を InstancedMesh で描き、体積比・個数・フラクタル次元を表示する。分解で各段の隙間を広げられる。',
  params: [
    { key: 'level', label: '再帰レベル', type: 'number', min: 0, max: 5, step: 1, default: 3 },
    { key: 'kind', label: '種類', type: 'select', options: [{ value: 'menger', label: 'メンガーのスポンジ' }, { value: 'sierpinski', label: 'シェルピンスキー四面体' }, { value: 'cantor', label: 'カントールの塵（隅だけ残す）' }, { value: 'inverse', label: '十字（スポンジで抜いた側）' }], default: 'menger' },
    { key: 'explode', label: '分解（隙間）', type: 'number', min: 0, max: 0.6, step: 0.01, default: 0 },
  ],
  distance: 7,
  compareLabels: ['レベル 0', '再帰後'],
  build(p, env) {
    const kind = String(p.kind) as Kind | 'inverse';
    const rule = RULES[kind] ?? RULES.menger;
    // 個数の上限（モバイルはさらに抑える）
    const cap = env.quality === 'low' ? 10000 : 170000;
    let level = Number(p.level);
    while (level > 0 && Math.pow(rule.keep, level) > cap) level--;
    const items = subdivide(kind, level, Number(p.explode));
    const size = 3.2;
    const geo = kind === 'sierpinski' ? tetraGeometry() : new THREE.BoxGeometry(1, 1, 1);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.1, flatShading: true }), Math.max(1, items.length));
    const m = new THREE.Matrix4();
    const c = new THREE.Color();
    items.forEach((it, i) => {
      m.makeScale(it.s * size, it.s * size, it.s * size).setPosition(it.x * size, it.y * size, it.z * size);
      mesh.setMatrixAt(i, m);
      // 位置で色を変えて自己相似の区画を見やすくする
      c.setHSL(0.58 + 0.12 * Math.sin(it.x * 5 + it.y * 3) , 0.5, 0.5 + 0.15 * it.z);
      mesh.setColorAt(i, c);
    });
    mesh.count = items.length;
    const before = new THREE.Mesh(geo.clone().scale(size, size, size), std(0x8890b0, { flatShading: true }));
    const ratio = Math.pow(rule.keep / rule.split, level);
    const clipped = level !== Number(p.level) ? `（上限のためレベル ${level} に制限）` : '';
    return {
      object: mesh,
      before,
      info: `${rule.name} · 個数 ${rule.keep}^${level} = ${items.length.toLocaleString()} · 体積比 (${rule.keep}/${rule.split})^${level} = ${(ratio * 100).toFixed(2)}% · 次元 ${rule.dim.toFixed(3)}${clipped}`,
    };
  },
});
