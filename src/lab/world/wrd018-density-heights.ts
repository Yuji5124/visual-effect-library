import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { BoxBatch, GridPlane } from '../framework/worldKit';
import { heatColor } from '../framework/natureKit';

/** WRD-018 建築密度の制御：中心からの指数減衰＋ノイズの密度場で、高さ・建ぺい率・空き地率を連続的に変える */
export default defineWorldDemo({
  id: 'WRD-018',
  notes: '密度場 ρ = max(各中心の重み×exp(−距離/減衰距離)) をノイズで揺らし、地面にヒートマップ（青=低密度→赤=高密度）で表示する。格子道路の各敷地で、ρ に比例して建物の高さと建ぺい率を上げ、ρ が低いほど空き地にする。比較の左は平均密度で一様にした同じ街。',
  params: [
    { key: 'centers', label: '中心の数', type: 'number', min: 1, max: 5, step: 1, default: 2 },
    { key: 'decay', label: '減衰距離', type: 'number', min: 0.8, max: 8, step: 0.1, default: 2.6 },
    { key: 'noise', label: 'ノイズ量', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'maxH', label: '最高高さ', type: 'number', min: 1, max: 8, step: 0.1, default: 4.5 },
    { key: 'blocks', label: '街区の数（1辺）', type: 'number', min: 4, max: 14, step: 1, default: 9 },
  ],
  distance: 15,
  elevation: 0.7,
  compareLabels: ['一様密度', '密度場'],
  build(p, env) {
    const rng = env.rng;
    const size = 10;
    const nb = Number(p.blocks);
    const rw = 0.24;
    const bs = (size - (nb + 1) * rw) / nb;
    const noise = makeNoise2(env.seed + 17);
    const decay = Number(p.decay), nAmt = Number(p.noise), maxH = Number(p.maxH);
    const centers = Array.from({ length: Number(p.centers) }, (_, i) => ({
      x: i === 0 ? (rng() - 0.5) * 2 : (rng() - 0.5) * size * 0.75,
      z: i === 0 ? (rng() - 0.5) * 2 : (rng() - 0.5) * size * 0.75,
      w: i === 0 ? 1 : 0.55 + rng() * 0.4,
    }));
    const density = (x: number, z: number) => {
      let r = 0;
      for (const c of centers) r = Math.max(r, c.w * Math.exp(-Math.hypot(x - c.x, z - c.z) / decay));
      r *= 1 + nAmt * fbm2(noise, x * 0.35 + 7, z * 0.35 + 3, 4) * 1.6;
      return THREE.MathUtils.clamp(r, 0, 1);
    };
    // 道路の格子と敷地（区画の乱数は両方の街で共有し、違いが密度だけになるようにする）
    const lots: { x: number; z: number; w: number; d: number; r1: number; r2: number; r3: number }[] = [];
    const blockOrigin = (k: number) => -size / 2 + rw + k * (bs + rw);
    for (let bj = 0; bj < nb; bj++) {
      for (let bi = 0; bi < nb; bi++) {
        const x0 = blockOrigin(bi), z0 = blockOrigin(bj);
        const nx = rng() < 0.5 ? 2 : 3, nz = 2;
        const cutsX = [0, ...Array.from({ length: nx - 1 }, (_, k) => ((k + 1) / nx + (rng() - 0.5) * 0.15) * bs), bs];
        const cutsZ = [0, (0.5 + (rng() - 0.5) * 0.2) * bs, bs];
        for (let j = 0; j < nz; j++) {
          for (let i = 0; i < nx; i++) {
            const w = cutsX[i + 1] - cutsX[i], d = cutsZ[j + 1] - cutsZ[j];
            lots.push({ x: x0 + (cutsX[i] + cutsX[i + 1]) / 2, z: z0 + (cutsZ[j] + cutsZ[j + 1]) / 2, w, d, r1: rng(), r2: rng(), r3: rng() });
          }
        }
      }
    }
    let sumRho = 0;
    for (const l of lots) sumRho += density(l.x, l.z);
    const meanRho = sumRho / lots.length;
    const isRoad = (x: number, z: number) => {
      const fx = (x + size / 2) % (bs + rw), fz = (z + size / 2) % (bs + rw);
      return fx < rw || fz < rw || x > size / 2 - rw || z > size / 2 - rw;
    };
    const res = env.quality === 'low' ? 96 : 160;
    const makeCity = (rho: (x: number, z: number) => number) => {
      const group = new THREE.Group();
      const gp = new GridPlane(res, res, size);
      const c = new THREE.Color();
      for (let j = 0; j < res; j++) {
        for (let i = 0; i < res; i++) {
          const x = ((i + 0.5) / res - 0.5) * size, z = ((j + 0.5) / res - 0.5) * size;
          if (isRoad(x, z)) gp.set(i, j, 52, 54, 64);
          else {
            heatColor(rho(x, z), c);
            gp.set(i, j, c.r * 200, c.g * 200, c.b * 200);
          }
        }
      }
      gp.commit();
      gp.mesh.position.y = 0.004;
      group.add(gp.mesh);
      const bb = new BoxBatch();
      let built = 0, vacant = 0, floor = 0;
      const low = new THREE.Color(0xe8dcc0), high = new THREE.Color(0x7fa6d8);
      for (const l of lots) {
        const r = rho(l.x, l.z);
        // 空き地の確率は低密度ほど高い
        if (l.r1 < 0.45 * Math.pow(1 - r, 2)) {
          vacant++;
          continue;
        }
        const cover = 0.3 + 0.6 * r;
        const s = Math.sqrt(cover) * 0.9;
        const h = 0.12 + maxH * Math.pow(r, 1.6) * (0.75 + 0.5 * l.r2);
        const col = c.copy(low).lerp(high, Math.min(1, h / maxH)).offsetHSL(0, 0, (l.r3 - 0.5) * 0.08);
        bb.addOnGround(l.x, l.z, l.w * s, h, l.d * s, col, 0.005);
        built++;
        floor += l.w * s * l.d * s * h;
      }
      group.add(bb.build());
      return { group, built, vacant, floor };
    };
    const after = makeCity(density);
    const before = makeCity(() => meanRho);
    return {
      object: after.group,
      before: before.group,
      info: `敷地 ${lots.length} · 建物 ${after.built} · 空き地 ${after.vacant}（一様: ${before.vacant}）· 平均密度 ${meanRho.toFixed(2)} · 中心 ${centers.length}`,
    };
  },
});
