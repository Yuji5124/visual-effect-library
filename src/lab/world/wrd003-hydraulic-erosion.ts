import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { Heightfield, Ticker } from '../framework/worldKit';
import { gridFrom, normalize, slopeMap } from '../framework/terrainKit';

/** WRD-003 水力侵食：水滴が勾配に沿って流れ、運搬容量との差で削る・積もらせる */

interface ErosionParams {
  erode: number;
  deposit: number;
  evaporate: number;
  radius: number;
}

const INERTIA = 0.08;
const CAPACITY = 4;
const MIN_CAPACITY = 0.01;
const GRAVITY = 4;
const LIFETIME = 32;

/** 双線形補間の高さと勾配 */
function sampleHG(h: Float32Array, n: number, x: number, y: number, out: number[]): void {
  const i = Math.floor(x), j = Math.floor(y);
  const u = x - i, v = y - j;
  const k = j * n + i;
  const a = h[k], b = h[k + 1], c = h[k + n], d = h[k + n + 1];
  out[0] = a * (1 - u) * (1 - v) + b * u * (1 - v) + c * (1 - u) * v + d * u * v;
  out[1] = (b - a) * (1 - v) + (d - c) * v;
  out[2] = (c - a) * (1 - u) + (d - b) * u;
}

/** 水滴を1つ流す。削った総量を返す */
function droplet(h: Float32Array, n: number, rng: () => number, ep: ErosionParams, hg: number[]): number {
  let x = rng() * (n - 2), y = rng() * (n - 2);
  let dx = 0, dy = 0, speed = 1, water = 1, sediment = 0, eroded = 0;
  const r = ep.radius;
  for (let life = 0; life < LIFETIME; life++) {
    const i = Math.floor(x), j = Math.floor(y);
    const u = x - i, v = y - j;
    sampleHG(h, n, x, y, hg);
    const height = hg[0];
    dx = dx * INERTIA - hg[1] * (1 - INERTIA);
    dy = dy * INERTIA - hg[2] * (1 - INERTIA);
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) break;
    dx /= len;
    dy /= len;
    x += dx;
    y += dy;
    if (x < 0 || y < 0 || x >= n - 1 || y >= n - 1) break;
    sampleHG(h, n, x, y, hg);
    const dh = hg[0] - height;
    const capacity = Math.max(-dh * speed * water * CAPACITY, MIN_CAPACITY);
    const k = j * n + i;
    if (sediment > capacity || dh > 0) {
      // 上り坂なら窪みを埋めるだけ、そうでなければ超過分の一部を堆積（元のセルの4隅へ双線形に配分）
      const amount = dh > 0 ? Math.min(dh, sediment) : (sediment - capacity) * ep.deposit;
      sediment -= amount;
      h[k] += amount * (1 - u) * (1 - v);
      h[k + 1] += amount * u * (1 - v);
      h[k + n] += amount * (1 - u) * v;
      h[k + n + 1] += amount * u * v;
    } else {
      // 容量の余裕分を、ブラシ半径内のセルから距離で重み付けして削る
      const amount = Math.min((capacity - sediment) * ep.erode, -dh);
      const cx = i + u, cy = j + v;
      let wsum = 0;
      const i0 = Math.max(0, i - r + 1), i1 = Math.min(n - 1, i + r);
      const j0 = Math.max(0, j - r + 1), j1 = Math.min(n - 1, j + r);
      for (let jj = j0; jj <= j1; jj++) for (let ii = i0; ii <= i1; ii++) wsum += Math.max(0, r - Math.hypot(ii - cx, jj - cy));
      if (wsum > 0) {
        for (let jj = j0; jj <= j1; jj++) {
          for (let ii = i0; ii <= i1; ii++) {
            const w = Math.max(0, r - Math.hypot(ii - cx, jj - cy)) / wsum;
            if (w <= 0) continue;
            const q = jj * n + ii;
            const take = Math.min(h[q], amount * w);
            h[q] -= take;
            sediment += take;
            eroded += take;
          }
        }
      }
    }
    speed = Math.sqrt(Math.max(0, speed * speed - dh * GRAVITY));
    water *= 1 - ep.evaporate;
  }
  return eroded;
}

export default defineWorldDemo({
  id: 'WRD-003',
  notes: '水滴を1つずつ落とし、双線形補間の勾配に慣性を混ぜて進ませる。運搬容量＝下り量×速度×水量×係数 を超えた土砂は堆積、余裕があればブラシ半径内から削る。毎フレーム指定数の水滴を流して谷が刻まれる様子を見せ、色は茶=削れた所・黄土=堆積した所。比較では侵食前の地形を左に並べる。',
  params: [
    { key: 'drops', label: '水滴数/フレーム', type: 'number', min: 0, max: 600, step: 10, default: 120 },
    { key: 'erode', label: '侵食率', type: 'number', min: 0.05, max: 0.9, step: 0.01, default: 0.3 },
    { key: 'deposit', label: '堆積率', type: 'number', min: 0.05, max: 0.9, step: 0.01, default: 0.3 },
    { key: 'evaporate', label: '蒸発率', type: 'number', min: 0.005, max: 0.1, step: 0.005, default: 0.02 },
    { key: 'radius', label: 'ブラシ半径（セル）', type: 'number', min: 1, max: 6, step: 1, default: 3 },
    { key: 'maxDrops', label: '水滴の総数の上限（千）', type: 'number', min: 5, max: 120, step: 5, default: 30 },
  ],
  liveKeys: ['drops', 'maxDrops'],
  distance: 13,
  elevation: 0.7,
  compareLabels: ['侵食前', '侵食後'],
  build(p, env) {
    const n = env.quality === 'low' ? 96 : 128;
    const size = 10;
    const scale = 3;
    const noise = makeNoise2(env.seed);
    const h = gridFrom(n, (u, v) => {
      const f = fbm2(noise, u * 2.2, v * 2.2, 6, 2, 0.5);
      // 中央を盛り上げた山地
      const d = Math.hypot(u - 0.5, v - 0.5);
      return f + 0.5 * (1 - d * 1.6);
    });
    normalize(h, 0, 1);
    const h0 = Float32Array.from(h);
    const ep: ErosionParams = { erode: Number(p.erode), deposit: Number(p.deposit), evaporate: Number(p.evaporate), radius: Number(p.radius) };
    const cell = size / (n - 1);

    const hf = new Heightfield(n, size);
    const rock = new THREE.Color(0x6e6258), grass = new THREE.Color(0x4f7d35), dug = new THREE.Color(0x6b3f22), silt = new THREE.Color(0xc8a868);
    const paint = (target: Heightfield, hh: Float32Array, base: Float32Array | null) => {
      const s = slopeMap(hh, n, cell, scale);
      const tmp = new THREE.Color();
      target.setColors((k, c) => {
        c.copy(grass).lerp(rock, Math.min(1, Math.max(0, (s[k] - 0.35) * 2.5)));
        if (hh[k] > 0.82) c.lerp(tmp.setRGB(0.9, 0.92, 0.95), Math.min(1, (hh[k] - 0.82) * 8));
        if (base) {
          const d = (hh[k] - base[k]) * 45;
          if (d > 0) c.lerp(silt, Math.min(0.9, d));
          else c.lerp(dug, Math.min(0.8, -d));
        }
        return c;
      });
    };
    hf.setHeights(h, scale);
    paint(hf, h, h0);
    const bf = new Heightfield(n, size);
    bf.setHeights(h0, scale);
    paint(bf, h0, null);

    const rng = env.rng;
    const ticker = new Ticker(30);
    const hg = [0, 0, 0];
    let total = 0;
    let volume = 0;
    let dirty = 0;
    return {
      object: hf.mesh,
      before: bf.mesh,
      info: () => `${n}×${n} 格子 · 水滴 ${total.toLocaleString()} 個 · 削った土量 ${volume.toFixed(2)}${total >= Number(p.maxDrops) * 1000 ? ' · 上限に到達' : ''}`,
      update(dt, _t, live) {
        const steps = ticker.steps(dt, 2);
        const limit = Number(live.maxDrops) * 1000;
        for (let s = 0; s < steps; s++) {
          const count = Math.min(Math.round(Number(live.drops) / 2), limit - total);
          for (let d = 0; d < count; d++) volume += droplet(h, n, rng, ep, hg);
          if (count > 0) {
            total += count;
            dirty++;
          }
        }
        if (dirty) {
          dirty = 0;
          hf.setHeights(h, scale);
          paint(hf, h, h0);
        }
      },
    };
  },
});
