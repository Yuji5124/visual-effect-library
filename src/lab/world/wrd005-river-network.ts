import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { Heightfield } from '../framework/worldKit';
import { d8Receivers, flowAccumulation, gridFrom, normalize, priorityFlood, ribbonMesh } from '../framework/terrainKit';

/** WRD-005 河川網：priority-flood で窪地を埋め、D8 流向と流量累積で川を描く */
export default defineWorldDemo({
  id: 'WRD-005',
  notes: 'priority-flood で外周から低い順に浸水させて窪地を埋め（青い湖）、各セルの流出先を8近傍の最急降下方向（D8）に決める。高い順に流量を下流へ足し込み、閾値を超えたセルを流量の対数に比例した太さの帯で描く。比較の左は窪地埋めなしの D8 で、川が窪みで途切れる。',
  params: [
    { key: 'threshold', label: '川になる流量の閾値（セル数）', type: 'number', min: 10, max: 600, step: 5, default: 60 },
    { key: 'relief', label: '地形の起伏', type: 'number', min: 0.5, max: 4, step: 0.05, default: 2 },
    { key: 'res', label: '解像度', type: 'number', min: 64, max: 192, step: 32, default: 128 },
    { key: 'roughness', label: '地形の細かさ', type: 'number', min: 1, max: 5, step: 0.1, default: 2.5 },
  ],
  distance: 13,
  elevation: 0.8,
  compareLabels: ['窪地埋めなし', 'priority-flood + D8'],
  build(p, env) {
    const n = env.quality === 'low' ? Math.min(96, Number(p.res)) : Number(p.res);
    const size = 10;
    const relief = Number(p.relief);
    const cell = size / (n - 1);
    const noise = makeNoise2(env.seed);
    const fr = Number(p.roughness);
    const h = gridFrom(n, (u, v) => {
      const f = fbm2(noise, u * fr, v * fr, 6, 2, 0.5);
      const ridge = 1 - Math.abs(fbm2(noise, u * fr * 0.6 + 7.1, v * fr * 0.6 + 3.3, 3, 2, 0.5));
      return f * 0.7 + ridge * 0.5 + 0.35 * (1 - Math.hypot(u - 0.5, v - 0.5) * 1.6);
    });
    normalize(h, 0, 1);
    // 解像度が変わっても川の密度が大きく変わらないよう、閾値をセル面積で補正する
    const thr = Number(p.threshold) * (n / 128) * (n / 128);

    const make = (fill: boolean) => {
      const filled = fill ? priorityFlood(h, n, 1e-6) : h;
      const recv = d8Receivers(filled, n);
      const acc = flowAccumulation(filled, recv, n);
      const disp = new Float32Array(n * n);
      const lake = new Uint8Array(n * n);
      for (let k = 0; k < n * n; k++) {
        lake[k] = filled[k] - h[k] > 0.002 ? 1 : 0;
        disp[k] = Math.max(h[k], filled[k]);
      }
      const hf = new Heightfield(n, size);
      hf.setHeights(disp, relief);
      hf.setColors((k, c) => {
        if (lake[k]) return c.setRGB(0.16, 0.38, 0.68);
        const t = h[k];
        if (t < 0.35) return c.setRGB(0.36, 0.55, 0.28);
        if (t < 0.6) return c.setRGB(0.28, 0.45, 0.22).lerp(new THREE.Color(0.5, 0.45, 0.36), (t - 0.35) * 4);
        if (t < 0.85) return c.setRGB(0.5, 0.45, 0.38);
        return c.setRGB(0.88, 0.9, 0.93);
      });
      const segs: number[] = [];
      let riverCells = 0, maxAcc = 0, sinks = 0;
      const lt = Math.log(thr);
      for (let k = 0; k < n * n; k++) {
        if (acc[k] > maxAcc) maxAcc = acc[k];
        if (acc[k] < thr) continue;
        riverCells++;
        const q = recv[k];
        const i = k % n, j = (k / n) | 0;
        if (q < 0) {
          // 外周以外で流出先がない＝窪地で行き止まり
          if (i > 0 && j > 0 && i < n - 1 && j < n - 1) sinks++;
          continue;
        }
        if (lake[k] && lake[q]) continue;
        const qi = q % n, qj = (q / n) | 0;
        const t = Math.min(1, (Math.log(acc[k]) - lt) / 5);
        const w = cell * (0.35 + 1.6 * t);
        segs.push(hf.worldX(i), disp[k] * relief + 0.02, hf.worldX(j), hf.worldX(qi), disp[q] * relief + 0.02, hf.worldX(qj), w, 0.55 - 0.45 * t, 0.85 - 0.35 * t, 1);
      }
      const g = new THREE.Group();
      g.add(hf.mesh);
      if (segs.length) g.add(ribbonMesh(segs));
      return { g, riverCells, maxAcc, sinks };
    };
    const after = make(true);
    const before = make(false);
    return {
      object: after.g,
      before: before.g,
      info: `${n}×${n} · 川セル ${after.riverCells} · 最大流量 ${after.maxAcc.toFixed(0)} セル · 窪地で途切れる川 ${after.sinks}（埋めない場合 ${before.sinks}）`,
    };
  },
});
