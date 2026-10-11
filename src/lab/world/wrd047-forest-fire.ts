import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { N4, Ticker } from '../framework/worldKit';
import { BarChart, ColumnField, TimeChart } from '../framework/caKit';
import { chartSlot } from '../framework/dynKit';

const EMPTY = 0, TREE = 1, FIRE = 2;
const BINS = 14;

/** WRD-047 ドロッセル・シュワーブルの森林火災：成長 p・落雷 f・延焼の3規則と、火災規模の両対数ヒストグラム */
export default defineWorldDemo({
  id: 'WRD-047',
  notes: '毎ステップ、燃えているセル→空地、木→隣が燃えていれば火（4近傍）・確率 f で落雷、空地→確率 p で木、を同時に適用する。落雷した木の連結クラスタの大きさをその火災の規模として記録し、右のグラフに 2 倍刻みのビンで両対数（棒の高さ = log 件数）のヒストグラムを描く。左のグラフは森林密度。p/f が大きいほど大火災が起き、ヒストグラムが直線（べき分布）に近づく。',
  params: [
    { key: 'p', label: '成長確率 p', type: 'number', min: 0.001, max: 0.05, step: 0.001, default: 0.01 },
    { key: 'f', label: '落雷確率 f（×10⁻⁵）', type: 'number', min: 0.1, max: 50, step: 0.1, default: 1 },
    { key: 'size', label: '格子サイズ', type: 'number', min: 48, max: 128, step: 8, default: 96 },
    { key: 'speed', label: '速さ（ステップ/秒）', type: 'number', min: 2, max: 60, step: 1, default: 30 },
  ],
  liveKeys: ['speed'],
  distance: 14,
  elevation: 0.8,
  compareLabels: ['初期（まばらな森）', '時間発展'],
  build(p, env) {
    const N = env.quality === 'low' ? Math.min(72, Number(p.size)) : Number(p.size);
    const size = 10;
    const rng = env.rng;
    const pg = Number(p.p), pf = Number(p.f) * 1e-5;
    const g = new Uint8Array(N * N);
    const age = new Uint16Array(N * N);
    const burnt = new Uint8Array(N * N); // 焼け跡の表示用（減衰するカウンタ）
    for (let k = 0; k < N * N; k++) g[k] = rng() < 0.3 ? TREE : EMPTY;
    const hist = new Float64Array(BINS);
    let fires = 0, largest = 0, steps = 0;
    const stack = new Int32Array(N * N);
    const mark = new Uint32Array(N * N);
    let stamp = 0;
    // 落雷した木の連結クラスタの大きさ（＝この火災で燃える木の数）
    const clusterSize = (s: number) => {
      stamp++;
      let top = 0, size = 0;
      stack[top++] = s;
      mark[s] = stamp;
      while (top) {
        const k = stack[--top];
        size++;
        const i = k % N, j = (k / N) | 0;
        for (const [di, dj] of N4) {
          const x = i + di, z = j + dj;
          if (x < 0 || z < 0 || x >= N || z >= N) continue;
          const q = z * N + x;
          if (mark[q] !== stamp && g[q] === TREE) {
            mark[q] = stamp;
            stack[top++] = q;
          }
        }
      }
      return size;
    };
    const ng = new Uint8Array(N * N);
    const step = () => {
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = j * N + i;
          const s = g[k];
          if (burnt[k]) burnt[k]--;
          if (s === FIRE) {
            ng[k] = EMPTY;
            burnt[k] = 12;
          } else if (s === TREE) {
            const nb = (i > 0 && g[k - 1] === FIRE) || (i < N - 1 && g[k + 1] === FIRE) || (j > 0 && g[k - N] === FIRE) || (j < N - 1 && g[k + N] === FIRE);
            if (nb) ng[k] = FIRE;
            else if (rng() < pf) {
              ng[k] = FIRE;
              const sz = clusterSize(k);
              fires++;
              largest = Math.max(largest, sz);
              hist[Math.min(BINS - 1, Math.floor(Math.log2(sz)))]++;
            } else {
              ng[k] = TREE;
              age[k]++;
            }
          } else {
            if (rng() < pg) {
              ng[k] = TREE;
              age[k] = 0;
            } else ng[k] = EMPTY;
          }
        }
      }
      g.set(ng);
      steps++;
    };
    const draw = (f: ColumnField) => {
      for (let k = 0; k < N * N; k++) {
        const s = g[k];
        if (s === TREE) {
          const a = Math.min(1, age[k] / 200);
          f.setRGB(k, 0.12 + 0.3 * a, 0.18 - 0.08 * a, 0.5 - 0.18 * a, 0.16);
        } else if (s === FIRE) f.setRGB(k, 0.55, 1, 0.55, 0.1);
        else if (burnt[k]) f.setRGB(k, 0.02, 0.22 + burnt[k] * 0.03, 0.12, 0.08);
        else f.setRGB(k, 0.02, 0.36, 0.3, 0.22);
      }
      f.commit();
    };
    const field = new ColumnField(N, N, size, { gap: 0.05 });
    const pre = new ColumnField(N, N, size, { gap: 0.05 });
    draw(field);
    draw(pre);
    const density = () => {
      let t = 0;
      for (let k = 0; k < N * N; k++) if (g[k] === TREE) t++;
      return t / (N * N);
    };
    const chart = new TimeChart([0x50c060], { ...chartSlot(size, 0), cap: 300, yMax: 1 });
    const slot = chartSlot(size, 1);
    const bars = new BarChart(BINS, { ...slot, color: 0xff8a40 });
    chart.push([density()]);
    const helpers = new THREE.Group();
    helpers.add(chart.group, bars.mesh);
    // ヒストグラムの枠
    const frame = new THREE.LineSegments(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(slot.x0, slot.y0, slot.z0), new THREE.Vector3(slot.x0 + slot.width, slot.y0, slot.z0),
        new THREE.Vector3(slot.x0, slot.y0, slot.z0), new THREE.Vector3(slot.x0, slot.y0 + slot.height, slot.z0),
      ]),
      new THREE.LineBasicMaterial({ color: 0x5a6090 }),
    );
    helpers.add(frame);
    // 両対数の傾き（log 件数 vs log 規模の最小二乗）≒ −(τ−1)
    const slope = () => {
      let sx = 0, sy = 0, sxx = 0, sxy = 0, c = 0;
      for (let b = 0; b < BINS; b++) {
        if (hist[b] < 1) continue;
        // ビン幅 2^b で割って密度にする
        const x = b * Math.LN2, y = Math.log(hist[b] / Math.pow(2, b));
        sx += x; sy += y; sxx += x * x; sxy += x * y; c++;
      }
      if (c < 3) return NaN;
      return (c * sxy - sx * sy) / (c * sxx - sx * sx);
    };
    const ticker = new Ticker(Number(p.speed));
    return {
      object: field.mesh,
      before: pre.mesh,
      helpers,
      info: () => {
        const s = slope();
        return `${N}×${N} · ステップ ${steps} · 森林密度 ${(density() * 100).toFixed(1)}% · 火災 ${fires} 件（最大 ${largest} 本） · p/f=${Math.round(pg / pf).toLocaleString()}${Number.isFinite(s) ? ` · 規模分布の傾き ${s.toFixed(2)}` : ''}`;
      },
      update(dt, _t, pp) {
        ticker.rate = Number(pp.speed);
        let n = ticker.steps(dt, 3);
        if (n === 0) return;
        while (n-- > 0) step();
        chart.push([density()]);
        let hmax = 0;
        for (let b = 0; b < BINS; b++) hmax = Math.max(hmax, Math.log10(1 + hist[b]));
        bars.set(Array.from(hist, (v) => (hmax > 0 ? Math.log10(1 + v) / hmax : 0)));
        draw(field);
      },
    };
  },
});
