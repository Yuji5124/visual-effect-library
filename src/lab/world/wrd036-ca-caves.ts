import { defineWorldDemo } from '../framework/sceneLab';
import { Ticker } from '../framework/worldKit';
import { ColumnField, components, distinctColor } from '../framework/caKit';

/** WRD-036 セルオートマトン洞窟：4-5則を1反復ずつ適用し、最後に連結成分を色分けする */
export default defineWorldDemo({
  id: 'WRD-036',
  notes: '初期の壁率で埋めた格子に「8近傍の壁が閾値以上なら壁、壁のセルは閾値−1以上で壁のまま」（既定は4-5則）を1反復ずつ適用する。直前の反復で壁になったセルは橙、空洞になったセルは水色で示す。反復後に4近傍の連結成分を色分けし、「小さい空洞を埋める」がオンなら最大の空洞以外を壁にする。',
  params: [
    { key: 'fill', label: '初期の壁率', type: 'number', min: 0.3, max: 0.65, step: 0.01, default: 0.45 },
    { key: 'threshold', label: '閾値（8近傍の壁の数）', type: 'number', min: 3, max: 7, step: 1, default: 5 },
    { key: 'iterations', label: '反復回数', type: 'number', min: 0, max: 12, step: 1, default: 5 },
    { key: 'fillSmall', label: '小さい空洞を埋める', type: 'bool', default: true },
    { key: 'size', label: '格子サイズ', type: 'number', min: 32, max: 96, step: 8, default: 64 },
    { key: 'speed', label: '表示の速さ（反復/秒）', type: 'number', min: 0.5, max: 10, step: 0.5, default: 2 },
  ],
  liveKeys: ['speed'],
  distance: 13,
  elevation: 0.95,
  compareLabels: ['初期のランダム格子', 'CA後'],
  build(p, env) {
    const N = env.quality === 'low' ? Math.min(56, Number(p.size)) : Number(p.size);
    const size = 10;
    const T = Number(p.threshold);
    const iters = Number(p.iterations);
    let g = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const edge = i === 0 || j === 0 || i === N - 1 || j === N - 1;
        g[j * N + i] = edge || env.rng() < Number(p.fill) ? 1 : 0;
      }
    }
    const WALL_H = 0.55;
    const field = new ColumnField(N, N, size, { gap: 0 });
    const pre = new ColumnField(N, N, size, { gap: 0 });
    for (let k = 0; k < N * N; k++) pre.setK(k, g[k] ? WALL_H : 0.03, g[k] ? 0x6b5a4a : 0x2a3550);
    pre.commit();

    const changed = new Int8Array(N * N); // 1:壁化 -1:空洞化
    let label: Int32Array | null = null;
    let sizes: number[] = [];
    let largest = -1;
    let filled = 0;
    const step = () => {
      const ng = new Uint8Array(N * N);
      changed.fill(0);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = j * N + i;
          if (i === 0 || j === 0 || i === N - 1 || j === N - 1) { ng[k] = 1; continue; }
          let c = 0;
          for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if ((di || dj) && g[k + dj * N + di]) c++;
          ng[k] = c >= T || (g[k] && c >= T - 1) ? 1 : 0;
          if (ng[k] !== g[k]) changed[k] = ng[k] ? 1 : -1;
        }
      }
      g = ng;
    };
    const label4 = () => {
      const r = components(N, N, (k) => g[k] === 0);
      label = r.label;
      sizes = r.sizes;
      largest = sizes.indexOf(Math.max(0, ...sizes));
    };
    const draw = () => {
      for (let k = 0; k < N * N; k++) {
        if (g[k]) field.setK(k, WALL_H, changed[k] === 1 ? 0xd08050 : 0x6b5a4a);
        else if (label) field.setK(k, 0.04, label[k] === largest ? 0x5fd0a0 : distinctColor(label[k] + 3, 0.7, 0.55));
        else field.setK(k, 0.03, changed[k] === -1 ? 0x80d0ff : 0x2a3550);
      }
      field.commit();
    };
    draw();
    let it = 0;
    let phase: 'iter' | 'label' | 'fill' | 'done' = iters > 0 ? 'iter' : 'label';
    const ticker = new Ticker(Number(p.speed));
    const openPct = () => Math.round((100 * g.reduce((s, v) => s + (v ? 0 : 1), 0)) / (N * N));
    return {
      object: field.mesh,
      before: pre.mesh,
      info: () => {
        const base = `${N}×${N} · 反復 ${it}/${iters} · 空洞 ${openPct()}%`;
        if (!label) return base;
        return `${base} · 連結成分 ${sizes.length}${largest >= 0 ? `（最大 ${sizes[largest]} セル）` : ''}${filled ? ` · 埋めたセル ${filled}` : ''}`;
      },
      update(dt, _t, pp) {
        ticker.rate = Number(pp.speed);
        let k = ticker.steps(dt, 2);
        while (k-- > 0 && phase !== 'done') {
          if (phase === 'iter') {
            step();
            it++;
            if (it >= iters) phase = 'label';
          } else if (phase === 'label') {
            changed.fill(0);
            label4();
            phase = p.fillSmall ? 'fill' : 'done';
          } else if (phase === 'fill') {
            for (let q = 0; q < N * N; q++) {
              if (!g[q] && label![q] !== largest) { g[q] = 1; changed[q] = 1; filled++; }
            }
            label4();
            phase = 'done';
          }
          draw();
        }
      },
    };
  },
});
