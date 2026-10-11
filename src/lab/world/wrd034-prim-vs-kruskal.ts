import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { makeRng } from '../framework/random';
import { Ticker } from '../framework/worldKit';
import { BacktrackerGen, KruskalGen, MazeGrid, MazeView, PrimGen, type MazeGenerator } from '../framework/mazeKit';

/** WRD-034 Prim法・Kruskal法（＋穴掘り法）の迷路を同じサイズで並べて生成し、形の違いを数値で比べる */
export default defineWorldDemo({
  id: 'WRD-034',
  notes: '左=ランダム化Prim法（オレンジ=フロンティア）、中=ランダム化Kruskal法（オレンジ=まだ孤立したセル、Union-Findで閉路を避ける）、右=穴掘り法。同じ速度で並行に生成し、完成後に最長経路を線で示して、行き止まり数と最長経路長をステータスで比較する。',
  params: [
    { key: 'size', label: 'サイズ（セル数）', type: 'number', min: 5, max: 32, step: 1, default: 16 },
    { key: 'speed', label: '生成速度（手/秒）', type: 'number', min: 5, max: 2000, step: 5, default: 90 },
  ],
  liveKeys: ['speed'],
  distance: 21,
  elevation: 0.9,
  build(p, env) {
    const n = env.quality === 'low' ? Math.min(24, Number(p.size)) : Number(p.size);
    const group = new THREE.Group();
    const helpers = new THREE.Group();
    const size = 6;
    const gap = 7.2;
    const names = ['Prim', 'Kruskal', '穴掘り'];
    const pathColors = [0x3ad1ff, 0x5dff8a, 0xd77bff];
    const plateColors = [0x1d3c5c, 0x1f4a2c, 0x3e2a52];
    const gens: MazeGenerator[] = [];
    const views: MazeView[] = [];
    const paths: THREE.Line[] = [];
    for (let k = 0; k < 3; k++) {
      const grid = new MazeGrid(n, n);
      // 方式ごとに独立した乱数列（並行に進めても同じシードで同じ迷路）
      const rng = makeRng(env.seed * 7 + k * 101);
      const gen = k === 0 ? new PrimGen(grid, rng) : k === 1 ? new KruskalGen(grid, rng) : new BacktrackerGen(grid, rng);
      const view = new MazeView(grid, size);
      view.wallHeight = 0.6;
      view.sync(true);
      view.mesh.position.x = (k - 1) * gap;
      const plate = new THREE.Mesh(new THREE.BoxGeometry(view.size + 0.4, 0.06, view.size + 0.4), new THREE.MeshStandardMaterial({ color: plateColors[k], roughness: 0.9 }));
      plate.position.set((k - 1) * gap, -0.04, 0);
      group.add(plate, view.mesh);
      const line = new THREE.Line(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * n * 3), 3)), new THREE.LineBasicMaterial({ color: pathColors[k] }));
      line.geometry.setDrawRange(0, 0);
      line.frustumCulled = false;
      line.position.x = (k - 1) * gap;
      helpers.add(line);
      gens.push(gen);
      views.push(view);
      paths.push(line);
    }
    const stats: string[] = ['', '', ''];
    const ticker = new Ticker(Number(p.speed));
    const finish = (k: number) => {
      const g = views[k].grid;
      const path = g.longestPath();
      const attr = paths[k].geometry.attributes.position as THREE.BufferAttribute;
      path.forEach((c, i) => {
        const ci = c % n, cj = Math.floor(c / n);
        attr.setXYZ(i, views[k].xs[2 * ci + 1], 0.12, views[k].zs[2 * cj + 1]);
      });
      attr.needsUpdate = true;
      paths[k].geometry.setDrawRange(0, path.length);
      stats[k] = `${names[k]}: 行き止まり ${g.deadEnds()} · 最長 ${path.length - 1}`;
    };
    return {
      object: group,
      helpers,
      info: () => gens.map((g, k) => stats[k] || `${names[k]}: ${g.steps}手`).join(' / '),
      update(dt, _t, live) {
        ticker.rate = Number(live.speed);
        const s = ticker.steps(dt, Math.max(8, Math.ceil(Number(live.speed) / 10)));
        for (let k = 0; k < 3; k++) {
          for (let i = 0; i < s && !gens[k].done; i++) gens[k].step();
          if (gens[k].done && !stats[k]) finish(k);
          views[k].sync();
        }
      },
    };
  },
});
