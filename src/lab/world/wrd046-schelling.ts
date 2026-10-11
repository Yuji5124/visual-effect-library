import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { N8, Ticker } from '../framework/worldKit';
import { ColumnField, TimeChart } from '../framework/caKit';
import { chartSlot } from '../framework/dynKit';

const KIND_COLORS = [0x3a8ee6, 0xf08a3c, 0x58c46a];

/** WRD-046 シェリングの分居モデル：近傍の同種率が許容値未満の住民が空き家へ移る */
export default defineWorldDemo({
  id: 'WRD-046',
  notes: '各住民は8近傍の住民のうち同じ種類の割合が許容値を下回ると「不満」になり、毎ステップ不満な住民が（シード順に）ランダムな空き家へ引っ越す。柱の高さは各住民の同種率、低く暗い柱が不満な住民。グラフは分離度（同種隣接率の平均、緑）と不満な住民の割合（赤）。許容値30%程度でも大きな住み分けの模様に収束する。',
  params: [
    { key: 'tolerance', label: '許容値（同種の最低割合）', type: 'number', min: 0.1, max: 0.8, step: 0.01, default: 0.35 },
    { key: 'vacancy', label: '空き家率', type: 'number', min: 0.02, max: 0.4, step: 0.01, default: 0.1 },
    { key: 'kinds', label: '種類数', type: 'number', min: 2, max: 3, step: 1, default: 2 },
    { key: 'size', label: '格子サイズ', type: 'number', min: 30, max: 80, step: 2, default: 56 },
    { key: 'speed', label: '速さ（ステップ/秒）', type: 'number', min: 0.5, max: 20, step: 0.5, default: 4 },
  ],
  liveKeys: ['speed'],
  distance: 14,
  elevation: 0.8,
  compareLabels: ['初期のランダム配置', '移動後'],
  build(p, env) {
    const N = env.quality === 'low' ? Math.min(44, Number(p.size)) : Number(p.size);
    const size = 10;
    const rng = env.rng;
    const kinds = Number(p.kinds), tol = Number(p.tolerance);
    // 0 = 空き家、1..kinds = 住民の種類
    const g = new Uint8Array(N * N);
    for (let k = 0; k < N * N; k++) g[k] = rng() < Number(p.vacancy) ? 0 : 1 + ((rng() * kinds) | 0);
    const sim = new Float32Array(N * N);
    let unhappy = 0, segregation = 0, steps = 0, moved = 0, residents = 0;
    const evaluate = () => {
      unhappy = 0;
      segregation = 0;
      residents = 0;
      let counted = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = j * N + i;
          if (!g[k]) continue;
          residents++;
          let same = 0, other = 0;
          for (const [di, dj] of N8) {
            const x = i + di, z = j + dj;
            if (x < 0 || z < 0 || x >= N || z >= N) continue;
            const v = g[z * N + x];
            if (v === g[k]) same++;
            else if (v) other++;
          }
          const s = same + other > 0 ? same / (same + other) : 1;
          sim[k] = s;
          if (same + other > 0) {
            segregation += s;
            counted++;
          }
          if (s < tol) unhappy++;
        }
      }
      segregation = counted ? segregation / counted : 0;
    };
    const step = () => {
      const movers: number[] = [];
      const empty: number[] = [];
      for (let k = 0; k < N * N; k++) {
        if (!g[k]) empty.push(k);
        else if (sim[k] < tol) movers.push(k);
      }
      // 移動順と移動先はシード付き乱数で決める
      for (let i = movers.length - 1; i > 0; i--) {
        const j = (rng() * (i + 1)) | 0;
        [movers[i], movers[j]] = [movers[j], movers[i]];
      }
      moved = 0;
      for (const k of movers) {
        if (!empty.length) break;
        const e = (rng() * empty.length) | 0;
        const dest = empty[e];
        g[dest] = g[k];
        g[k] = 0;
        empty[e] = k;
        moved++;
      }
      steps++;
      evaluate();
    };
    evaluate();
    const draw = (f: ColumnField) => {
      const c = new THREE.Color();
      for (let k = 0; k < N * N; k++) {
        if (!g[k]) {
          f.setK(k, 0.02, 0x22253a);
          continue;
        }
        c.setHex(KIND_COLORS[g[k] - 1]);
        const happy = sim[k] >= tol;
        const m = happy ? 1 : 0.45;
        f.setRGB(k, 0.08 + sim[k] * 0.7, Math.pow(c.r, 1 / 2.2) * m, Math.pow(c.g, 1 / 2.2) * m, Math.pow(c.b, 1 / 2.2) * m);
      }
      f.commit();
    };
    const field = new ColumnField(N, N, size, { gap: 0.08 });
    const pre = new ColumnField(N, N, size, { gap: 0.08 });
    draw(field);
    draw(pre);
    const initialSeg = segregation;
    const chart = new TimeChart([0x60e080, 0xff5050], { ...chartSlot(size, 'full'), cap: 200, yMax: 1 });
    chart.push([segregation, residents ? unhappy / residents : 0]);
    const helpers = new THREE.Group();
    helpers.add(chart.group);
    const ticker = new Ticker(Number(p.speed));
    return {
      object: field.mesh,
      before: pre.mesh,
      helpers,
      info: () => `${N}×${N} · ステップ ${steps} · 分離度 ${(segregation * 100).toFixed(1)}%（初期 ${(initialSeg * 100).toFixed(1)}%） · 不満 ${unhappy}/${residents} · 今回の引っ越し ${moved}${unhappy === 0 ? ' · 収束' : ''}`,
      update(dt, _t, pp) {
        ticker.rate = Number(pp.speed);
        if (ticker.steps(dt, 1) === 0 || unhappy === 0 || steps >= 400) return;
        step();
        chart.push([segregation, residents ? unhappy / residents : 0]);
        draw(field);
      },
    };
  },
});
