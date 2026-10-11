import { defineWorldDemo } from '../framework/sceneLab';
import { Ticker } from '../framework/worldKit';
import { BacktrackerGen, MazeGrid, MazeView } from '../framework/mazeKit';

/** WRD-033 穴掘り法迷路：深さ優先＋スタックで全域木を掘り、生成過程をそのまま3Dブロックで見せる */
export default defineWorldDemo({
  id: 'WRD-033',
  notes: 'スタックの先頭（赤）から未訪問の隣へ壁を壊して進み、行き止まりで戻る。オレンジがスタックに積まれた経路で、戻ると確定した通路（床色）になる。完成すると全セルが1本道でつながる完全迷路の3D壁が残る。',
  params: [
    { key: 'size', label: 'サイズ（セル数）', type: 'number', min: 5, max: 40, step: 1, default: 18 },
    { key: 'speed', label: '生成速度（手/秒）', type: 'number', min: 5, max: 2000, step: 5, default: 120 },
    { key: 'show3d', label: '3D表示（壁を立てる）', type: 'bool', default: true },
  ],
  liveKeys: ['speed', 'show3d'],
  distance: 13,
  elevation: 0.85,
  compareLabels: ['掘る前', '迷路'],
  build(p, env) {
    const n = env.quality === 'low' ? Math.min(28, Number(p.size)) : Number(p.size);
    const grid = new MazeGrid(n, n);
    const gen = new BacktrackerGen(grid, env.rng);
    const view = new MazeView(grid, 9);
    const before = new MazeView(new MazeGrid(n, n), 9);
    before.wallHeight = 0.6;
    before.sync(true);
    const ticker = new Ticker(Number(p.speed));
    let h3 = true;
    let stats = '';
    return {
      object: view.mesh,
      before: before.mesh,
      info: () =>
        gen.done
          ? (stats ||= `完成 ${n}×${n} · 手数 ${gen.steps} · 行き止まり ${grid.deadEnds()} · 最長経路 ${grid.diameter()} · 最大スタック ${gen.maxStack}`)
          : `生成中 ${gen.steps} 手 · スタック ${gen.stackSize}`,
      update(dt, _t, live) {
        ticker.rate = Number(live.speed);
        const k = ticker.steps(dt, Math.max(8, Math.ceil(Number(live.speed) / 10)));
        for (let i = 0; i < k && !gen.done; i++) gen.step();
        const want = Boolean(live.show3d);
        if (want !== h3) {
          h3 = want;
          view.wallHeight = want ? 1 : 0.08;
          view.sync(true);
        } else view.sync();
      },
    };
  },
});
