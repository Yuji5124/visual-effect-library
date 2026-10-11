import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { N4, Ticker } from '../framework/worldKit';
import { ColumnField, TimeChart } from '../framework/caKit';
import { chartSlot } from '../framework/dynKit';

// 用途：0 農地 1 森林 2 住宅 3 商業 4 工業 5 道路 6 水面（5,6 は固定）
const FARM = 0, FOREST = 1, RES = 2, COM = 3, IND = 4, ROAD = 5, WATER = 6;
const COLORS = [0xc8c070, 0x2f6a34, 0xe89a5a, 0xe04a5a, 0x8a7ab8, 0x50505c, 0x3a78c0];
const HEIGHTS = [0.04, 0.32, 0.22, 0.55, 0.36, 0.015, 0.005];
const R = 3;

/** WRD-042 土地利用変化CA（White & Engelen 型）：近傍の引力/斥力の表×アクセス性×ランダム項で需要ぶんを割り当てる */
export default defineWorldDemo({
  id: 'WRD-042',
  notes: '各セルの用途 k へのポテンシャル＝(1+Σ 近傍用途ごとの引力/斥力の重み(距離1〜3)＋慣性)×道路へのアクセス性×(1+ランダム項)。毎年、住宅・商業・工業の需要（セル数）を増やし、全セル×用途の組をポテンシャルの高い順に需要が満たされるまで割り当てる。商業の集積度と工業↔住宅の斥力で分布が変わる。グラフは住宅（橙）・商業（赤）・工業（紫）・森林（緑）の面積。',
  params: [
    { key: 'comCluster', label: '商業の集積度', type: 'number', min: 0, max: 3, step: 0.05, default: 1.4 },
    { key: 'repel', label: '工業と住宅の斥力', type: 'number', min: 0, max: 3, step: 0.05, default: 1.2 },
    { key: 'noise', label: 'ランダム性', type: 'number', min: 0, max: 1.5, step: 0.05, default: 0.4 },
    { key: 'speed', label: '速さ（年/秒）', type: 'number', min: 0.5, max: 12, step: 0.5, default: 4 },
  ],
  liveKeys: ['speed'],
  distance: 15,
  elevation: 0.8,
  compareLabels: ['初期の土地利用', '変化後'],
  build(p, env) {
    const N = env.quality === 'low' ? 48 : 64;
    const size = 10;
    const rng = env.rng;
    const noise = makeNoise2(env.seed + 42);
    const g = new Uint8Array(N * N);
    // 地形の条件：川（ノイズの等値線）・森林・道路
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        const u = i / N, v = j / N;
        const river = Math.abs(fbm2(noise, u * 1.3 + 7, v * 1.3, 3) + (u - 0.5) * 0.4);
        if (river < 0.035) g[k] = WATER;
        else g[k] = fbm2(noise, u * 3 + 20, v * 3 + 20, 4) > 0.12 ? FOREST : FARM;
      }
    }
    const cx = Math.floor(N * (0.4 + rng() * 0.2)), cz = Math.floor(N * (0.4 + rng() * 0.2));
    const drawLine = (x0: number, z0: number, x1: number, z1: number) => {
      const n = Math.max(Math.abs(x1 - x0), Math.abs(z1 - z0));
      for (let s = 0; s <= n; s++) {
        const x = Math.round(x0 + ((x1 - x0) * s) / n), z = Math.round(z0 + ((z1 - z0) * s) / n);
        if (x >= 0 && z >= 0 && x < N && z < N) g[z * N + x] = ROAD;
        if (x + 1 < N && z >= 0 && z < N && s < n) g[z * N + x + 1] = g[z * N + x + 1] === WATER ? ROAD : g[z * N + x + 1];
      }
    };
    drawLine(0, cz, N - 1, cz);
    drawLine(cx, 0, cx, N - 1);
    for (let r = 0; r < 3; r++) {
      const a = rng() * Math.PI * 2;
      drawLine(cx, cz, Math.round(cx + Math.cos(a) * N), Math.round(cz + Math.sin(a) * N));
    }
    // 初期の市街地：中心の商業、その周りの住宅、道路沿いの工業
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (g[k] === ROAD || g[k] === WATER) continue;
        const d = Math.hypot(i - cx, j - cz);
        if (d < 2) g[k] = COM;
        else if (d < 5 && rng() < 0.7) g[k] = RES;
      }
    }
    const ix = Math.floor(N * (rng() < 0.5 ? 0.18 : 0.78)), iz = cz + (rng() < 0.5 ? 2 : -3);
    for (let j = iz; j < iz + 2; j++) for (let i = ix; i < ix + 3; i++) if (g[j * N + i] !== ROAD && g[j * N + i] !== WATER) g[j * N + i] = IND;
    // 道路までの距離 → アクセス性
    const dRoad = new Int32Array(N * N).fill(1 << 20);
    {
      const q = new Int32Array(N * N);
      let h = 0, t = 0;
      for (let k = 0; k < N * N; k++) if (g[k] === ROAD) { dRoad[k] = 0; q[t++] = k; }
      while (h < t) {
        const k = q[h++];
        const i = k % N, j = (k / N) | 0;
        for (const [di, dj] of N4) {
          const x = i + di, z = j + dj;
          if (x < 0 || z < 0 || x >= N || z >= N) continue;
          const q2 = z * N + x;
          if (dRoad[q2] > dRoad[k] + 1) { dRoad[q2] = dRoad[k] + 1; q[t++] = q2; }
        }
      }
    }
    const access = (k: number, a: number) => 1 / (1 + dRoad[k] / a);
    const ACC = [0, 0, 6, 1.5, 3];
    // 引力/斥力の表 W[対象用途][近傍の用途][距離帯 0..3]（距離帯0 は自セル＝慣性）
    const cc = Number(p.comCluster), rep = Number(p.repel);
    const W: number[][][] = [];
    for (let k = 0; k < 5; k++) W.push(Array.from({ length: 7 }, () => [0, 0, 0, 0]));
    W[RES][RES] = [1.2, 0.5, 0.25, 0.1];
    W[RES][COM] = [0, 0.1, 0.35, 0.2];
    W[RES][IND] = [0, -rep, -rep * 0.6, -rep * 0.25];
    W[RES][FOREST] = [0, 0.15, 0.1, 0.05];
    W[RES][WATER] = [0, 0.2, 0.1, 0];
    W[COM][COM] = [1.5, cc, cc * 0.6, cc * 0.3];
    W[COM][RES] = [0.3, 0.4, 0.3, 0.2];
    W[COM][IND] = [0, -0.3, -0.1, 0];
    W[IND][IND] = [1.3, 0.8, 0.4, 0.1];
    W[IND][RES] = [0, -rep, -rep * 0.5, -rep * 0.2];
    W[IND][COM] = [0, -0.2, 0, 0];
    W[IND][ROAD] = [0, 0.3, 0.1, 0];
    W[RES][FARM] = W[COM][FARM] = W[IND][FARM] = [0, 0, 0, 0];
    // 近傍の距離帯（ユークリッド距離を 1..3 に丸める）
    const offs: [number, number, number][] = [];
    for (let dj = -R; dj <= R; dj++) for (let di = -R; di <= R; di++) {
      const d = Math.hypot(di, dj);
      if (d > 0 && d <= R + 0.01) offs.push([di, dj, Math.min(3, Math.max(1, Math.round(d)))]);
    }
    const count = () => {
      const c = [0, 0, 0, 0, 0, 0, 0];
      for (let k = 0; k < N * N; k++) c[g[k]]++;
      return c;
    };
    const c0 = count();
    const demand = [0, 0, c0[RES], c0[COM], c0[IND]];
    const pot = new Float32Array(N * N * 3);
    const pairs = new Int32Array(N * N * 3);
    const nz = Number(p.noise);
    const hist = new Float32Array(28);
    let year = 0;
    let changed = 0;
    const step = () => {
      demand[RES] += 14;
      demand[COM] += 3;
      demand[IND] += 4;
      let np = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = j * N + i;
          const s = g[k];
          if (s === ROAD || s === WATER) continue;
          // 近傍の用途×距離帯ごとの個数を数えてから、表との積和をとる
          hist.fill(0);
          for (const [di, dj, b] of offs) {
            const x = i + di, z = j + dj;
            if (x < 0 || z < 0 || x >= N || z >= N) continue;
            hist[g[z * N + x] * 4 + b]++;
          }
          for (let a = 0; a < 3; a++) {
            const kk = a + 2;
            const w = W[kk];
            let sum = w[s][0];
            for (let t = 0; t < 7; t++) {
              const wt = w[t];
              sum += (wt[1] * hist[t * 4 + 1]) / 4 + (wt[2] * hist[t * 4 + 2]) / 8 + (wt[3] * hist[t * 4 + 3]) / 12;
            }
            const v = 1 + nz * Math.pow(-Math.log(Math.max(1e-6, rng())), 2) * 0.5;
            pot[k * 3 + a] = (1 + sum) * access(k, ACC[kk]) * v;
            pairs[np++] = k * 3 + a;
          }
        }
      }
      const arr = pairs.subarray(0, np);
      arr.sort((x, y) => pot[y] - pot[x]);
      const ng = new Uint8Array(N * N).fill(255);
      const cnt = [0, 0, 0, 0, 0];
      for (let n = 0; n < np; n++) {
        const id = arr[n];
        if (pot[id] <= 0) break;
        const k = (id / 3) | 0, kk = (id % 3) + 2;
        if (ng[k] !== 255 || cnt[kk] >= demand[kk]) continue;
        ng[k] = kk;
        cnt[kk]++;
      }
      changed = 0;
      for (let k = 0; k < N * N; k++) {
        let s = g[k];
        if (ng[k] !== 255) s = ng[k];
        else if (s === RES || s === COM || s === IND) s = FARM; // 割り当てから外れた市街地は農地に戻る
        if (s !== g[k]) changed++;
        g[k] = s;
      }
      year++;
    };
    const draw = (f: ColumnField) => {
      for (let k = 0; k < N * N; k++) f.setK(k, HEIGHTS[g[k]] * (g[k] === COM ? 1 + Math.min(1, dRoad[k] === 1 ? 0.3 : 0) : 1), COLORS[g[k]]);
      f.commit();
    };
    const field = new ColumnField(N, N, size, { gap: 0.03 });
    const pre = new ColumnField(N, N, size, { gap: 0.03 });
    draw(field);
    draw(pre);
    const chart = new TimeChart([COLORS[RES], COLORS[COM], COLORS[IND], 0x50c060], { ...chartSlot(size, 'full'), cap: 200 });
    const pushChart = () => {
      const c = count();
      chart.push([c[RES], c[COM], c[IND], c[FOREST]]);
    };
    pushChart();
    const helpers = new THREE.Group();
    helpers.add(chart.group);
    const ticker = new Ticker(Number(p.speed));
    const MAX_YEAR = 160;
    return {
      object: field.mesh,
      before: pre.mesh,
      helpers,
      info: () => {
        const c = count();
        return `${year} 年目 · 住宅 ${c[RES]} · 商業 ${c[COM]} · 工業 ${c[IND]} · 森林 ${c[FOREST]} · 農地 ${c[FARM]} · 今年の転換 ${changed} セル`;
      },
      update(dt, _t, pp) {
        ticker.rate = Number(pp.speed);
        if (ticker.steps(dt, 1) === 0 || year >= MAX_YEAR) return;
        const free = count();
        if (free[FARM] + free[FOREST] < 40) { year = MAX_YEAR; return; }
        step();
        pushChart();
        draw(field);
      },
    };
  },
});
