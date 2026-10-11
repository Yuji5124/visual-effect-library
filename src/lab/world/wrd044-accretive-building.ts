import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { Ticker } from '../framework/worldKit';
import { AgentDots } from '../framework/dynKit';

/** WRD-044 建物の増殖（3D DLA）：上から落ちるウォーカーが支持条件を満たす位置にだけ付着する */
export default defineWorldDemo({
  id: 'WRD-044',
  notes: 'ボクセル格子の上空から下向きに偏ったランダムウォーカーを放ち、既存ブロックに6近傍で接したら付着確率で定着させる。ただし真下にブロック（または地面）があるか、横の支えからの片持ちが許容段数以内のときだけ定着できる。色は定着の順番（青→黄→赤）。支持条件を「片持ち禁止」にすると塔と壁、「2段まで」にすると庇やブリッジが増える。',
  params: [
    { key: 'stick', label: '付着確率', type: 'number', min: 0.05, max: 1, step: 0.05, default: 0.6 },
    { key: 'support', label: '支持条件', type: 'select', options: [{ value: '0', label: '片持ち禁止（真下に支え）' }, { value: '1', label: '片持ち1段まで' }, { value: '2', label: '片持ち2段まで' }, { value: '9', label: '制約なし（純粋なDLA）' }], default: '1' },
    { key: 'seeds', label: '基礎の数', type: 'number', min: 1, max: 8, step: 1, default: 4 },
    { key: 'perFrame', label: '粒子数/フレーム', type: 'number', min: 2, max: 80, step: 2, default: 10 },
    { key: 'maxBlocks', label: 'ブロック数の上限', type: 'number', min: 500, max: 6000, step: 100, default: 3000 },
  ],
  liveKeys: ['perFrame'],
  distance: 15,
  elevation: 0.45,
  target: [0, 1.6, 0],
  compareLabels: ['基礎（初期の種）', '増殖後'],
  build(p, env) {
    const X = env.quality === 'low' ? 28 : 36, Y = 26, Z = X;
    const cell = 10 / X;
    const rng = env.rng;
    const occ = new Uint8Array(X * Y * Z);
    // 片持ちの段数（真下に支えがあれば 0）
    const over = new Uint8Array(X * Y * Z);
    const idx = (x: number, y: number, z: number) => (y * Z + z) * X + x;
    const maxOver = Number(p.support);
    const stick = Number(p.stick);
    const cap = env.quality === 'low' ? Math.min(2500, Number(p.maxBlocks)) : Number(p.maxBlocks);
    const dots = new AgentDots(cap);
    const ox = (x: number) => (x + 0.5) * cell - 5, oz = (z: number) => (z + 0.5) * cell - 5;
    let n = 0;
    let top = 0;
    let walkers = 0;
    let rejected = 0;
    const order: number[] = [];
    const colorOf = (t: number): [number, number, number] => {
      const c = new THREE.Color().setHSL(0.62 - 0.62 * t, 0.65, 0.55);
      return [c.r, c.g, c.b];
    };
    const place = (x: number, y: number, z: number, ov: number) => {
      const k = idx(x, y, z);
      occ[k] = 1;
      over[k] = ov;
      order.push(x, y, z);
      n++;
      if (y > top) top = y;
    };
    // 基礎：地面に 2×2〜3×3 の区画を置く
    const nSeeds = Number(p.seeds);
    for (let s = 0; s < nSeeds; s++) {
      const w = 2 + ((rng() * 2) | 0);
      const x0 = 3 + ((rng() * (X - 6 - w)) | 0), z0 = 3 + ((rng() * (Z - 6 - w)) | 0);
      for (let z = z0; z < z0 + w; z++) for (let x = x0; x < x0 + w; x++) if (!occ[idx(x, 0, z)]) place(x, 0, z, 0);
    }
    const seedCount = n;
    const redraw = () => {
      dots.begin();
      for (let i = 0; i < n && i < cap; i++) {
        const x = order[i * 3], y = order[i * 3 + 1], z = order[i * 3 + 2];
        const [r, g, b] = i < seedCount ? [0.35, 0.35, 0.4] : colorOf((i - seedCount) / Math.max(1, n - seedCount));
        dots.pushLinear(ox(x), (y + 0.5) * cell, oz(z), cell * 0.94, cell * 0.94, cell * 0.94, r, g, b);
      }
      dots.end();
    };
    // 定着の判定：6近傍に既存ブロック＋支持条件
    const canStick = (x: number, y: number, z: number): number => {
      let touch = false;
      if (y > 0 && occ[idx(x, y - 1, z)]) return 0;
      if (y + 1 < Y && occ[idx(x, y + 1, z)]) touch = true;
      let best = 99;
      const hn = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx, dz] of hn) {
        const a = x + dx, b = z + dz;
        if (a < 0 || b < 0 || a >= X || b >= Z) continue;
        const q = idx(a, y, b);
        if (occ[q]) {
          touch = true;
          best = Math.min(best, over[q] + 1);
        }
      }
      if (!touch) return -1;
      if (y === 0) return 0; // 地面に接している
      return best <= maxOver ? best : -2;
    };
    const walk = () => {
      let x = (rng() * X) | 0, z = (rng() * Z) | 0, y = Math.min(Y - 1, top + 3);
      walkers++;
      for (let s = 0; s < 600; s++) {
        const r = rng();
        if (r < 0.34) y--;
        else if (r < 0.42) y++;
        else if (r < 0.565) x++;
        else if (r < 0.71) x--;
        else if (r < 0.855) z++;
        else z--;
        if (x < 0) x = 0;
        if (x >= X) x = X - 1;
        if (z < 0) z = 0;
        if (z >= Z) z = Z - 1;
        if (y < 0) y = 0;
        if (y > Math.min(Y - 1, top + 4)) return;
        if (occ[idx(x, y, z)]) return;
        const ov = canStick(x, y, z);
        if (ov === -1) continue;
        if (ov === -2) {
          rejected++;
          continue;
        }
        // 地面での横への広がりは控えめにし、上への成長を優先する
        if (rng() < stick * (y === 0 ? 0.2 : 1)) {
          place(x, y, z, ov);
          return;
        }
      }
    };
    redraw();
    const object = new THREE.Group();
    const ground = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.08, 10.2), new THREE.MeshStandardMaterial({ color: 0x3a3a46, roughness: 0.95 }));
    ground.position.y = -0.04;
    object.add(ground, dots.mesh);
    const before = new THREE.Group();
    const preDots = new AgentDots(Math.max(1, seedCount));
    preDots.begin();
    for (let i = 0; i < seedCount; i++) preDots.pushLinear(ox(order[i * 3]), (order[i * 3 + 1] + 0.5) * cell, oz(order[i * 3 + 2]), cell * 0.94, cell * 0.94, cell * 0.94, 0.35, 0.35, 0.4);
    preDots.end();
    const ground2 = ground.clone();
    ground2.geometry = ground.geometry.clone();
    ground2.material = ground.material.clone();
    before.add(ground2, preDots.mesh);
    const ticker = new Ticker(30);
    let drawn = n;
    return {
      object,
      before,
      info: () => {
        let cant = 0;
        for (let i = 0; i < n; i++) if (over[idx(order[i * 3], order[i * 3 + 1], order[i * 3 + 2])] > 0) cant++;
        return `ブロック ${n}/${cap} · 最高 ${top + 1} 段 · 片持ちブロック ${cant} · 放ったウォーカー ${walkers.toLocaleString()} · 支持不足で拒否 ${rejected.toLocaleString()}${n >= cap || top >= Y - 1 ? ' · 完了' : ''}`;
      },
      update(dt, _t, pp) {
        let s = ticker.steps(dt, 2);
        if (s === 0) return;
        const per = Number(pp.perFrame);
        while (s-- > 0) for (let i = 0; i < per && n < cap && top < Y - 1; i++) walk();
        if (n !== drawn) {
          drawn = n;
          redraw();
        }
      },
    };
  },
});
