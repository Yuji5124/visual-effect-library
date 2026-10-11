import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { Ticker, segments } from '../framework/worldKit';
import { ColumnField, heatRGB } from '../framework/caKit';
import { bfsGrid, carveMaze, tracePath, wallMesh } from '../framework/dungeonKit';

/** WRD-039 迷路の距離場と最短経路：穴掘り法の迷路で BFS の前線を1段ずつ広げる */
export default defineWorldDemo({
  id: 'WRD-039',
  notes: '穴掘り法（再帰的バックトラッカー）で作った迷路で、スタート（緑の球）から幅優先探索の前線を1段ずつ広げ、距離を色（青→赤）と床の高さで表す。探索が終わると最も遠いセル（赤い球）を出口とし、距離が1ずつ減る隣をたどった最短経路を白線で示す。スタートは「スタート位置」で変えられる。',
  params: [
    { key: 'size', label: 'サイズ（セル数）', type: 'number', min: 6, max: 32, step: 1, default: 18 },
    { key: 'startX', label: 'スタート位置 X', type: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'startY', label: 'スタート位置 Y', type: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'speed', label: '探索速度（段/秒）', type: 'number', min: 1, max: 120, step: 1, default: 25 },
    { key: 'heightMode', label: '距離を高さでも表示', type: 'bool', default: true },
  ],
  liveKeys: ['speed', 'heightMode'],
  distance: 13,
  elevation: 1.05,
  compareLabels: ['迷路のみ', '距離場と最短経路'],
  build(p, env) {
    const c = Math.round(Number(p.size));
    const { grid, w, h } = carveMaze(c, c, env.rng);
    const size = 10;
    const cell = size / w;
    const WALL_H = 0.5;
    const walls = wallMesh(grid, w, h, cell, WALL_H, 0x8a90b0);
    const floor = new ColumnField(w, h, size, { gap: 0 });
    for (let k = 0; k < w * h; k++) floor.setK(k, 0.02, grid[k] ? 0x202436 : 0x3a405a);
    floor.commit();
    const object = new THREE.Group();
    object.add(walls, floor.mesh);

    const before = new THREE.Group();
    const pf = new ColumnField(w, h, size, { gap: 0 });
    for (let k = 0; k < w * h; k++) pf.setK(k, 0.02, grid[k] ? 0x202436 : 0x3a405a);
    pf.commit();
    before.add(wallMesh(grid, w, h, cell, WALL_H, 0x8a90b0), pf.mesh);

    const sx = Math.round(Number(p.startX) * (c - 1)), sy = Math.round(Number(p.startY) * (c - 1));
    const start = (sy * 2 + 1) * w + sx * 2 + 1;
    const { dist, layers } = bfsGrid(w, h, (k) => grid[k] === 0, start);
    const maxD = layers.length - 1;
    const goal = layers[maxD][0];
    const path = tracePath(w, h, dist, goal);

    const helpers = new THREE.Group();
    const ball = (k: number, color: number) => {
      const m = new THREE.Mesh(new THREE.SphereGeometry(cell * 0.45, 16, 10), new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6 }));
      m.position.set(floor.x(k % w), WALL_H + cell * 0.5, floor.z((k / w) | 0));
      return m;
    };
    helpers.add(ball(start, 0x40e070));
    const goalBall = ball(goal, 0xff4050);
    goalBall.visible = false;
    helpers.add(goalBall);
    const pts: number[] = [];
    for (let i = 0; i + 1 < path.length; i++) {
      const a = path[i], b = path[i + 1];
      pts.push(floor.x(a % w), WALL_H + 0.05, floor.z((a / w) | 0), floor.x(b % w), WALL_H + 0.05, floor.z((b / w) | 0));
    }
    const pathLine = segments(pts.length ? pts : [0, 0, 0, 0, 0, 0], 0xffffff);
    pathLine.visible = false;
    helpers.add(pathLine);
    // 経路のセルを強調するための集合
    const onPath = new Uint8Array(w * h);

    let shown = 0; // 表示済みの層の数
    let lastHeight: boolean | null = null;
    const paint = (k: number, hm: boolean) => {
      const t = dist[k] / Math.max(1, maxD);
      const [r, g, b] = onPath[k] ? [1, 1, 1] : heatRGB(t);
      floor.setRGB(k, hm ? 0.03 + t * (WALL_H - 0.08) : 0.03, r, g, b);
    };
    const ticker = new Ticker(Number(p.speed));
    return {
      object,
      before,
      helpers,
      info: () => `迷路 ${c}×${c} · BFS 前線 ${Math.max(0, shown - 1)}/${maxD} 段 · 到達 ${layers.slice(0, shown).reduce((s, l) => s + l.length, 0)} セル${shown > maxD ? ` · 最遠点までの距離 ${maxD} · 最短経路 ${path.length} マス` : ''}`,
      update(dt, _t, pp) {
        const hm = Boolean(pp.heightMode);
        if (lastHeight !== null && hm !== lastHeight) {
          for (let L = 0; L < shown; L++) for (const k of layers[L]) paint(k, hm);
          floor.commit();
        }
        lastHeight = hm;
        if (shown > maxD) return;
        ticker.rate = Number(pp.speed);
        let n = ticker.steps(dt, 30);
        if (!n) return;
        while (n-- > 0 && shown <= maxD) {
          for (const k of layers[shown]) paint(k, hm);
          shown++;
        }
        if (shown > maxD) {
          for (const k of path) { onPath[k] = 1; paint(k, hm); }
          pathLine.visible = true;
          goalBall.visible = true;
        }
        floor.commit();
      },
    };
  },
});
