import { defineWorldDemo } from '../framework/sceneLab';
import { Ticker } from '../framework/worldKit';
import { ColumnField, TimeChart } from '../framework/caKit';

/** WRD-025 生態遷移と火災：裸地→草地→低木→陽樹林→陰樹林の確率的セルオートマトン */

const STAGES = [
  { name: '裸地', color: 0x8a6e4e, h: 0.03 },
  { name: '草地', color: 0xa8cf5a, h: 0.1 },
  { name: '低木', color: 0x6f9a3a, h: 0.25 },
  { name: '陽樹林', color: 0x3f8a4a, h: 0.5 },
  { name: '陰樹林', color: 0x1f5a3a, h: 0.75 },
];
const BURN = 5;
/** 段階ごとの基本遷移確率と燃えやすさ */
const ADV = [0.05, 0.03, 0.02, 0.012];
const FLAM = [0, 0.25, 0.45, 0.65, 0.9];

export default defineWorldDemo({
  id: 'WRD-025',
  notes: '各セルは5段階の遷移状態をもち、1ステップごとに「基本確率×遷移の速さ×（0.25＋0.75×上位段階の8近傍の割合）」で次の段階へ進む（種子散布）。落雷はランダムなセルに火を付け、燃えているセル（赤）は次のステップで裸地に戻り、隣接セルへ「延焼の強さ×その段階の燃えやすさ」の確率で燃え広がる。奥のグラフは各段階の面積割合（色は段階と同じ、赤は燃焼中）の推移。',
  params: [
    { key: 'rate', label: '遷移の速さ', type: 'number', min: 0.2, max: 3, step: 0.05, default: 1 },
    { key: 'fire', label: '火災頻度（落雷/ステップ）', type: 'number', min: 0, max: 0.5, step: 0.01, default: 0.06 },
    { key: 'spread', label: '延焼の強さ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.62 },
    { key: 'size', label: '格子サイズ', type: 'number', min: 32, max: 96, step: 8, default: 72 },
    { key: 'speed', label: '速さ（ステップ/秒）', type: 'number', min: 1, max: 40, step: 1, default: 14 },
  ],
  liveKeys: ['rate', 'fire', 'spread', 'speed'],
  distance: 14,
  elevation: 0.75,
  target: [0, 1, 0],
  compareLabels: ['初期状態（ほぼ裸地）', '遷移中'],
  build(p, env) {
    const N = env.quality === 'low' ? Math.min(56, Number(p.size)) : Number(p.size);
    const size = 9;
    const rng = env.rng;
    let g = new Uint8Array(N * N);
    // 初期：裸地に草地の点がまばら、少しだけ低木
    for (let k = 0; k < N * N; k++) {
      const r = rng();
      g[k] = r < 0.06 ? 1 : r < 0.075 ? 2 : 0;
    }
    const field = new ColumnField(N, N, size, { gap: 0.04 });
    const pre = new ColumnField(N, N, size, { gap: 0.04 });
    const draw = (cf: ColumnField, arr: Uint8Array) => {
      for (let k = 0; k < N * N; k++) {
        const s = arr[k];
        if (s === BURN) cf.setK(k, 0.18, 0xff5020);
        else cf.setK(k, STAGES[s].h, STAGES[s].color);
      }
      cf.commit();
    };
    draw(pre, g);
    draw(field, g);
    const chart = new TimeChart([...STAGES.map((s) => s.color), 0xff4020], { width: size, height: 3, x0: -size / 2, y0: 0.05, z0: -size / 2 - 0.4, yMax: 1, cap: 300 });
    const fractions = () => {
      const c = [0, 0, 0, 0, 0, 0];
      for (let k = 0; k < N * N; k++) c[g[k]]++;
      return c.map((v) => v / (N * N));
    };
    chart.push(fractions());
    let steps = 0, fires = 0, burnedTotal = 0;
    const step = (rate: number, fireF: number, spread: number) => {
      const ng = new Uint8Array(N * N);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = j * N + i;
          const s = g[k];
          if (s === BURN) { ng[k] = 0; continue; }
          let higher = 0, burning = 0, cnt = 0;
          for (let dj = -1; dj <= 1; dj++) {
            const y = j + dj;
            if (y < 0 || y >= N) continue;
            for (let di = -1; di <= 1; di++) {
              const x = i + di;
              if ((!di && !dj) || x < 0 || x >= N) continue;
              const q = g[y * N + x];
              cnt++;
              if (q === BURN) burning++;
              else if (q > s) higher++;
            }
          }
          // 延焼：燃えている隣が多いほど燃えやすい
          if (burning && s > 0 && rng() < 1 - Math.pow(1 - spread * FLAM[s], burning)) { ng[k] = BURN; burnedTotal++; continue; }
          if (s < 4 && rng() < ADV[s] * rate * (0.25 + 0.75 * (higher / cnt))) ng[k] = s + 1;
          else ng[k] = s;
        }
      }
      // 落雷：期待値 fireF 回/ステップ。燃えやすさに応じて着火
      let strikes = Math.floor(fireF);
      if (rng() < fireF - strikes) strikes++;
      for (let t = 0; t < strikes; t++) {
        const k = Math.floor(rng() * N * N);
        if (ng[k] !== BURN && rng() < FLAM[ng[k]]) { ng[k] = BURN; fires++; }
      }
      g = ng;
      steps++;
    };
    const ticker = new Ticker(Number(p.speed));
    let last = fractions();
    return {
      object: field.mesh,
      before: pre.mesh,
      helpers: chart.group,
      info: () => `ステップ ${steps} · ${STAGES.map((s, q) => `${s.name} ${Math.round(last[q] * 100)}%`).join(' / ')} · 燃焼中 ${Math.round(last[BURN] * 1000) / 10}% · 発火 ${fires} 回 · 焼失 ${burnedTotal} セル`,
      update(dt, _t, live) {
        ticker.rate = Number(live.speed);
        let n = ticker.steps(dt, 4);
        if (!n) return;
        while (n-- > 0) {
          step(Number(live.rate), Number(live.fire), Number(live.spread));
          last = fractions();
          chart.push(last);
        }
        draw(field, g);
      },
    };
  },
});
