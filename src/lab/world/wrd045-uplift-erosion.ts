import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { Heightfield, Ticker } from '../framework/worldKit';
import { d8Receivers, priorityFlood } from '../framework/terrainKit';
import { TimeChart } from '../framework/caKit';
import { chartSlot } from '../framework/dynKit';

/** WRD-045 隆起と侵食の平衡：ストリームパワー則 dh/dt = U − K·A^m·S を Braun & Willett の陰的解法で解く */
export default defineWorldDemo({
  id: 'WRD-045',
  notes: '毎ステップ、窪地を埋めて D8 流向を求め、受け手の木を外周（基準面 0）から辿る順序で流域面積 A を累積し、h ← (h + U·Δt + F·h_受け手)/(1+F)、F = K·Δt·A^m/距離 で陰的に更新する（n=1）。一様隆起と河川侵食が釣り合うと平均標高が一定になる。左のグラフは平均標高、右は平均侵食速度（橙）と隆起速度 U（灰）。',
  params: [
    { key: 'U', label: '隆起速度 U', type: 'number', min: 0.002, max: 0.03, step: 0.001, default: 0.01 },
    { key: 'K', label: '侵食係数 K', type: 'number', min: 0.003, max: 0.05, step: 0.001, default: 0.012 },
    { key: 'm', label: 'm/n（n=1）', type: 'number', min: 0.3, max: 0.7, step: 0.01, default: 0.5 },
    { key: 'speed', label: '速さ（ステップ/秒）', type: 'number', min: 2, max: 40, step: 1, default: 20 },
    { key: 'vscale', label: '高さの表示倍率', type: 'number', min: 0.3, max: 3, step: 0.05, default: 1 },
  ],
  liveKeys: ['speed', 'vscale'],
  distance: 14,
  elevation: 0.75,
  compareLabels: ['初期（ほぼ平らな面）', '侵食と隆起の後'],
  build(p, env) {
    const n = env.quality === 'low' ? 48 : 64;
    const size = 10;
    const cell = size / (n - 1);
    const noise = makeNoise2(env.seed + 45);
    let h: Float32Array = new Float32Array(n * n);
    for (let j = 1; j < n - 1; j++) for (let i = 1; i < n - 1; i++) h[j * n + i] = 0.3 + 0.25 * fbm2(noise, i * 0.12, j * 0.12, 4) + env.rng() * 0.05;
    const U = Number(p.U), K = Number(p.K), m = Number(p.m);
    const DT = 5;
    const area = new Float32Array(n * n);
    const stack = new Int32Array(n * n);
    const donorStart = new Int32Array(n * n + 1);
    const donors = new Int32Array(n * n);
    let recv: Int32Array = new Int32Array(n * n);
    let steps = 0;
    let erosionRate = 0;
    const step = () => {
      h = priorityFlood(h, n, 1e-4);
      recv = d8Receivers(h, n);
      // 受け手→供給元の隣接リスト
      donorStart.fill(0);
      for (let k = 0; k < n * n; k++) if (recv[k] >= 0) donorStart[recv[k] + 1]++;
      for (let k = 0; k < n * n; k++) donorStart[k + 1] += donorStart[k];
      const fillPos = donorStart.slice(0, n * n);
      for (let k = 0; k < n * n; k++) if (recv[k] >= 0) donors[fillPos[recv[k]]++] = k;
      // 外周の基準面から深さ優先で並べた順序（Braun & Willett のスタック）
      let top = 0, sp = 0;
      const dfs = new Int32Array(n * n);
      for (let k = 0; k < n * n; k++) {
        if (recv[k] >= 0) continue;
        dfs[sp++] = k;
        while (sp > 0) {
          const c = dfs[--sp];
          stack[top++] = c;
          for (let d = donorStart[c]; d < donorStart[c + 1]; d++) dfs[sp++] = donors[d];
        }
      }
      area.fill(1);
      for (let s = top - 1; s >= 0; s--) {
        const k = stack[s];
        if (recv[k] >= 0) area[recv[k]] += area[k];
      }
      let before = 0, after = 0;
      for (let s = 0; s < top; s++) {
        const k = stack[s];
        const r = recv[k];
        if (r < 0) continue; // 外周は基準面に固定
        before += h[k];
        const di = Math.abs((k % n) - (r % n)), dj = Math.abs(((k / n) | 0) - ((r / n) | 0));
        const dist = di && dj ? Math.SQRT2 : 1;
        const F = (K * DT * Math.pow(area[k], m)) / dist;
        h[k] = (h[k] + U * DT + F * h[r]) / (1 + F);
        after += h[k];
      }
      const interior = (n - 2) * (n - 2);
      // 隆起を差し引いた正味の低下量＝侵食速度
      erosionRate = (U * DT - (after - before) / interior) / DT;
      steps++;
    };
    const mean = () => {
      let s = 0;
      for (let k = 0; k < n * n; k++) s += h[k];
      return s / ((n - 2) * (n - 2));
    };
    const hf = new Heightfield(n, size);
    const color = (hh: Float32Array, rv: Int32Array | null) => {
      let hi = 1e-6;
      for (let k = 0; k < n * n; k++) hi = Math.max(hi, hh[k]);
      const c = new THREE.Color();
      return (k: number, out: THREE.Color) => {
        const t = hh[k] / hi;
        out.setRGB(0.25 + 0.5 * t, 0.42 + 0.25 * t - 0.15 * t * t, 0.22 + 0.55 * t * t);
        if (rv && area[k] > 25) {
          const w = Math.min(1, Math.log(area[k] / 25) / 3);
          out.lerp(c.setRGB(0.15, 0.4, 0.85), 0.35 + 0.6 * w);
        }
        return out;
      };
    };
    let vs = Number(p.vscale);
    const draw = () => {
      hf.setHeights(h, cell * vs);
      hf.setColors(color(h, recv));
    };
    const pre = new Heightfield(n, size);
    pre.setHeights(h, cell * vs);
    pre.setColors(color(h, null));
    draw();
    const mChart = new TimeChart([0xffa040], { ...chartSlot(size, 0), cap: 300 });
    const eChart = new TimeChart([0xff7040, 0x9090a0], { ...chartSlot(size, 1), cap: 300, yMax: U * 2 });
    mChart.push([mean()]);
    const helpers = new THREE.Group();
    helpers.add(mChart.group, eChart.group);
    const ticker = new Ticker(Number(p.speed));
    let lastMean = mean(), trend = 0;
    return {
      object: hf.mesh,
      before: pre.mesh,
      helpers,
      info: () => {
        let hi = 0;
        for (let k = 0; k < n * n; k++) hi = Math.max(hi, h[k]);
        return `ステップ ${steps}（t=${steps * DT}） · 平均標高 ${lastMean.toFixed(3)} · 最高 ${hi.toFixed(2)} · 平均標高の変化 ${trend >= 0 ? '+' : ''}${(trend * 1000).toFixed(2)}×10⁻³/ステップ · 侵食速度/隆起 ${((erosionRate / U) * 100).toFixed(0)}%`;
      },
      update(dt, _t, pp) {
        ticker.rate = Number(pp.speed);
        let s = ticker.steps(dt, 2);
        const nv = Number(pp.vscale);
        if (s === 0 && nv === vs) return;
        vs = nv;
        while (s-- > 0) {
          step();
          const mm = mean();
          trend = mm - lastMean;
          lastMean = mm;
          mChart.push([mm]);
          eChart.push([Math.max(0, erosionRate), U]);
        }
        draw();
      },
    };
  },
});
