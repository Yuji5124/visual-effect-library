import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2, makeRng } from '../framework/random';
import { Heightfield, Ticker, terrainColor } from '../framework/worldKit';
import { TimeChart } from '../framework/caKit';
import { chartSlot } from '../framework/dynKit';

// 「局所的な豪雨」ボタンの押下回数（表示中のデモが update で読み取る）
let stormRequests = 0;

/** WRD-049 水循環：仮想パイプ法の浅水シミュレーションで、雨が窪地に溜まって湖になり、あふれて川になる */
export default defineWorldDemo({
  id: 'WRD-049',
  notes: '各セルの4辺に仮想の管を置き、水面高の差×g×Δt で流量を加速し、流出量が水深を超えないよう係数で縮めてから水深を更新する（Mei ら 2007 の仮想パイプ法）。外周からは水が流れ出る。一様な雨と一定速度の蒸発を加えると、窪地が埋まって湖になり、出口の高さで水位が釣り合う。「局所的な豪雨」で一点に強い雨を降らせる。グラフは総水量（青）と水域の面積率（水色）。',
  params: [
    { key: 'rain', label: '雨量', type: 'number', min: 0, max: 0.15, step: 0.005, default: 0.03 },
    { key: 'evap', label: '蒸発率', type: 'number', min: 0, max: 0.15, step: 0.005, default: 0.03 },
    { key: 'flow', label: '流れの速さ（ステップ/フレーム）', type: 'number', min: 1, max: 8, step: 1, default: 4 },
    { key: 'relief', label: '地形の起伏', type: 'number', min: 4, max: 16, step: 0.5, default: 9 },
  ],
  liveKeys: ['rain', 'evap', 'flow'],
  extraActions: [{ key: 'storm', label: '🌧 局所的な豪雨', title: 'シードから決まる場所に強い雨を降らせる' }],
  onAction(key) {
    if (key === 'storm') stormRequests++;
  },
  distance: 14,
  elevation: 0.7,
  compareLabels: ['雨が降る前の地形', '水の流れと湖'],
  build(p, env) {
    const n = env.quality === 'low' ? 48 : 64;
    const size = 10;
    const cell = size / (n - 1);
    const noise = makeNoise2(env.seed + 49);
    const relief = Number(p.relief);
    // 地形（格子単位の高さ）：fBm＋一方向への傾き。窪地ができやすいよう谷を強調する
    const b = new Float32Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), v = j / (n - 1);
        const f = fbm2(noise, u * 2.4, v * 2.4, 5);
        const ridge = Math.abs(fbm2(noise, u * 1.5 + 9, v * 1.5 + 4, 3));
        b[j * n + i] = relief * (0.55 + 0.6 * f + 0.35 * ridge + 0.35 * v);
      }
    }
    const d = new Float32Array(n * n);
    const fL = new Float32Array(n * n), fR = new Float32Array(n * n), fT = new Float32Array(n * n), fB = new Float32Array(n * n);
    const DT = 0.05, GR = 9.81;
    let simT = 0, outflow = 0, outflowRate = 0;
    let seen = stormRequests;
    let storms = 0;
    let stormLeft = 0, stormX = 0, stormZ = 0;
    const step = (rain: number, evap: number) => {
      // 1. 流量の更新（外周の外は「河床の高さで水深0」とみなし、水が流れ出る）
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const k = j * n + i;
          const hk = b[k] + d[k];
          const hL = i > 0 ? b[k - 1] + d[k - 1] : b[k];
          const hR = i < n - 1 ? b[k + 1] + d[k + 1] : b[k];
          const hT = j > 0 ? b[k - n] + d[k - n] : b[k];
          const hB = j < n - 1 ? b[k + n] + d[k + n] : b[k];
          let l = Math.max(0, fL[k] * 0.995 + DT * GR * (hk - hL));
          let r = Math.max(0, fR[k] * 0.995 + DT * GR * (hk - hR));
          let t = Math.max(0, fT[k] * 0.995 + DT * GR * (hk - hT));
          let bb = Math.max(0, fB[k] * 0.995 + DT * GR * (hk - hB));
          const sum = (l + r + t + bb) * DT;
          if (sum > d[k]) {
            const s = sum > 0 ? d[k] / sum : 0;
            l *= s; r *= s; t *= s; bb *= s;
          }
          fL[k] = l; fR[k] = r; fT[k] = t; fB[k] = bb;
        }
      }
      // 2. 水深の更新
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const k = j * n + i;
          let inflow = 0;
          if (i > 0) inflow += fR[k - 1];
          if (i < n - 1) inflow += fL[k + 1];
          if (j > 0) inflow += fB[k - n];
          if (j < n - 1) inflow += fT[k + n];
          const out = fL[k] + fR[k] + fT[k] + fB[k];
          if (i === 0) outflow += fL[k] * DT;
          if (i === n - 1) outflow += fR[k] * DT;
          if (j === 0) outflow += fT[k] * DT;
          if (j === n - 1) outflow += fB[k] * DT;
          let nd = d[k] + DT * (inflow - out) + rain * DT;
          nd -= Math.min(nd, evap * DT);
          d[k] = Math.max(0, nd);
        }
      }
      if (stormLeft > 0) {
        stormLeft--;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
          const r2 = ((i - stormX) ** 2 + (j - stormZ) ** 2) / 16;
          if (r2 < 4) d[j * n + i] += 1.2 * Math.exp(-r2) * DT;
        }
      }
      simT += DT;
    };
    const terrain = new Heightfield(n, size);
    terrain.setHeights(b, cell);
    let lo = Infinity, hi = -Infinity;
    for (let k = 0; k < n * n; k++) { lo = Math.min(lo, b[k]); hi = Math.max(hi, b[k]); }
    terrain.setColors((k, out) => terrainColor(0.02 + ((b[k] - lo) / (hi - lo)) * 0.95, 0, out));
    const waterMat = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.82, roughness: 0.12, metalness: 0.05 });
    const water = new Heightfield(n, size, { material: waterMat });
    const wh = new Float32Array(n * n);
    const drawWater = () => {
      for (let k = 0; k < n * n; k++) wh[k] = d[k] > 0.02 ? b[k] + d[k] : b[k] - 0.6;
      water.setHeights(wh, cell);
      water.setColors((k, out) => {
        const t = Math.min(1, d[k] / 2.5);
        return out.setRGB(0.35 - 0.3 * t, 0.65 - 0.4 * t, 0.95 - 0.35 * t);
      });
    };
    drawWater();
    const object = new THREE.Group();
    object.add(terrain.mesh, water.mesh);
    const pre = new Heightfield(n, size);
    pre.setHeights(b, cell);
    pre.setColors((k, out) => terrainColor(0.02 + ((b[k] - lo) / (hi - lo)) * 0.95, 0, out));
    const stats = () => {
      let vol = 0, wet = 0, lake = 0;
      for (let k = 0; k < n * n; k++) {
        vol += d[k];
        if (d[k] > 0.05) wet++;
        if (d[k] > 0.5) lake++;
      }
      return { vol, wet: wet / (n * n), lake };
    };
    const yTop = hi * cell + 0.2;
    const vChart = new TimeChart([0x4a8cff], { ...chartSlot(size, 0), y0: yTop, cap: 300 });
    const aChart = new TimeChart([0x70e0ff], { ...chartSlot(size, 1), y0: yTop, cap: 300, yMax: 1 });
    const helpers = new THREE.Group();
    helpers.add(vChart.group, aChart.group);
    const ticker = new Ticker(60);
    let steps = 0;
    return {
      object,
      before: pre.mesh,
      helpers,
      info: () => {
        const s = stats();
        return `t=${simT.toFixed(1)} · 総水量 ${s.vol.toFixed(0)} · 水域 ${(s.wet * 100).toFixed(1)}% · 湖（水深0.5以上） ${s.lake} セル · 外への流出 ${outflowRate.toFixed(1)}/秒${storms ? ` · 豪雨 ${storms} 回` : ''}`;
      },
      update(dt, _t, pp) {
        if (stormRequests !== seen) {
          seen = stormRequests;
          storms++;
          const r = makeRng(env.seed * 31 + storms);
          stormX = 6 + r() * (n - 12);
          stormZ = 6 + r() * (n - 12);
          stormLeft = 160;
        }
        const frames = ticker.steps(dt, 2);
        if (frames === 0) return;
        const sub = Number(pp.flow);
        for (let f = 0; f < frames; f++) {
          const o0 = outflow, t0 = simT;
          for (let s = 0; s < sub; s++) step(Number(pp.rain), Number(pp.evap));
          outflowRate = (outflow - o0) / Math.max(1e-6, simT - t0);
          if (++steps % 8 === 0) {
            const s = stats();
            vChart.push([s.vol]);
            aChart.push([s.wet]);
          }
        }
        drawWater();
      },
    };
  },
});
