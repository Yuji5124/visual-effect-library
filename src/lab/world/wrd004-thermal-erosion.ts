import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { Heightfield, N8, Ticker } from '../framework/worldKit';
import { gridFrom, normalize } from '../framework/terrainKit';

/** WRD-004 熱侵食：安息角を超える高低差の超過分を低い近傍へ崩す */

/** 各セルの最急の下り勾配（度） */
function steepest(h: Float32Array, n: number, cell: number, scale: number, out: Float32Array): void {
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const k = j * n + i;
      let m = 0;
      for (const [dx, dz] of N8) {
        const x = i + dx, z = j + dz;
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        const g = ((h[k] - h[z * n + x]) * scale) / (cell * (dx && dz ? Math.SQRT2 : 1));
        if (g > m) m = g;
      }
      out[k] = (Math.atan(m) * 180) / Math.PI;
    }
  }
}

export default defineWorldDemo({
  id: 'WRD-004',
  notes: '段丘状の崖を持つ地形に、8近傍の熱侵食を反復する。隣との高低差が安息角に相当する閾値を超えた分を求め、超過量に比例して低い近傍へ移動率ぶん配る。色は各点の最急勾配（緑=安息角未満、黄=付近、赤=超過）で、反復が進むと崖が崩れて崖錐ができ、赤が消えて安息角付近に揃う。',
  params: [
    { key: 'talus', label: '安息角（度）', type: 'number', min: 15, max: 60, step: 1, default: 33 },
    { key: 'iterations', label: '反復回数', type: 'number', min: 0, max: 3000, step: 50, default: 1200 },
    { key: 'rate', label: '移動率', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.6 },
    { key: 'terraces', label: '初期地形の段丘数', type: 'number', min: 0, max: 10, step: 1, default: 5 },
    { key: 'speed', label: '速度（1/30秒あたりの反復）', type: 'number', min: 1, max: 20, step: 1, default: 10 },
  ],
  liveKeys: ['speed'],
  distance: 13,
  elevation: 0.7,
  compareLabels: ['侵食前', '熱侵食後'],
  build(p, env) {
    const n = env.quality === 'low' ? 80 : 112;
    const size = 10;
    const scale = 3.2;
    const cell = size / (n - 1);
    const noise = makeNoise2(env.seed);
    const levels = Number(p.terraces);
    const h = gridFrom(n, (u, v) => fbm2(noise, u * 1.8, v * 1.8, 5, 2, 0.5));
    normalize(h, 0, 1);
    if (levels > 0) {
      // 段丘化：各段の終わりで急に立ち上がる崖を作る
      for (let k = 0; k < h.length; k++) {
        const t = h[k] * levels;
        const f = t - Math.floor(t);
        const rise = THREE.MathUtils.smoothstep(f, 0.88, 1);
        h[k] = (Math.floor(t) + rise) / levels;
      }
    }
    const h0 = Float32Array.from(h);
    const talusDeg = Number(p.talus);
    const tanT = Math.tan((talusDeg * Math.PI) / 180);
    // 正規化高さでの閾値（隣接・斜め）
    const T1 = (tanT * cell) / scale, T2 = T1 * Math.SQRT2;
    const rate = Number(p.rate);
    const target = Number(p.iterations);
    const delta = new Float32Array(n * n);
    const ex = new Float32Array(8);

    const iterate = () => {
      delta.fill(0);
      for (let j = 0; j < n; j++) {
        for (let i = 0; i < n; i++) {
          const k = j * n + i;
          let total = 0, maxEx = 0;
          for (let d = 0; d < 8; d++) {
            const [dx, dz] = N8[d];
            const x = i + dx, z = j + dz;
            ex[d] = 0;
            if (x < 0 || z < 0 || x >= n || z >= n) continue;
            const e = h[k] - h[z * n + x] - (d < 4 ? T1 : T2);
            if (e > 0) {
              ex[d] = e;
              total += e;
              if (e > maxEx) maxEx = e;
            }
          }
          if (total <= 0) continue;
          // 最大超過量の一部を、超過量に比例して低い近傍へ配る（行き過ぎ防止に 1/2）
          const move = rate * maxEx * 0.5;
          delta[k] -= move;
          for (let d = 0; d < 8; d++) {
            if (ex[d] <= 0) continue;
            const [dx, dz] = N8[d];
            delta[(j + dz) * n + i + dx] += (move * ex[d]) / total;
          }
        }
      }
      for (let k = 0; k < n * n; k++) h[k] += delta[k];
    };

    const slope = new Float32Array(n * n);
    const green = new THREE.Color(0x4f8a3a), yellow = new THREE.Color(0xe0c040), red = new THREE.Color(0xd8402e), scree = new THREE.Color(0x9a8a78);
    let over = 0, maxSlope = 0;
    const paint = (hf: Heightfield, hh: Float32Array, base: Float32Array | null) => {
      steepest(hh, n, cell, scale, slope);
      over = 0;
      maxSlope = 0;
      hf.setColors((k, c) => {
        const a = slope[k];
        if (a > maxSlope) maxSlope = a;
        if (a > talusDeg + 1) over++;
        const t = (a - (talusDeg - 8)) / 8;
        if (t < 0) c.copy(green);
        else if (t < 1) c.copy(green).lerp(yellow, t);
        else c.copy(yellow).lerp(red, Math.min(1, (t - 1) * 1.5));
        // 堆積した崖錐はくすんだ灰色を混ぜる
        if (base && hh[k] - base[k] > 0.004) c.lerp(scree, Math.min(0.6, (hh[k] - base[k]) * 40));
        return c;
      });
    };
    const hf = new Heightfield(n, size, { flat: true });
    const bf = new Heightfield(n, size, { flat: true });
    bf.setHeights(h0, scale);
    paint(bf, h0, null);
    const over0 = over;
    hf.setHeights(h, scale);
    paint(hf, h, h0);
    let done = 0;
    const ticker = new Ticker(30);
    return {
      object: hf.mesh,
      before: bf.mesh,
      info: () => `反復 ${done}/${target} · 最大勾配 ${maxSlope.toFixed(1)}° · 安息角超過セル ${over} （初期 ${over0}）`,
      update(dt, _t, live) {
        const steps = ticker.steps(dt, 2);
        if (done >= target || steps === 0) return;
        const k = Math.min(Number(live.speed) * steps, target - done);
        for (let s = 0; s < k; s++) iterate();
        done += k;
        hf.setHeights(h, scale);
        paint(hf, h, h0);
      },
    };
  },
});
