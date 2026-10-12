import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { N4, Ticker } from '../framework/worldKit';
import { ColumnField } from '../framework/caKit';

/** WRD-037 ドランカードウォーク：歩行者が通った所を掘り、目標の掘削率に達したら止まる */
export default defineWorldDemo({
  id: 'WRD-037',
  notes: '中央から出発した歩行者が、確率「方向の持続性」で同じ向きに進み、それ以外は4方向から無作為に向きを選んで1マス進み、通ったセルを掘る。床の色は掘られた順（早い=紫→遅い=黄）。掘削率が目標に達すると停止する。持続性を上げると直線的な坑道が増える。',
  params: [
    { key: 'walkers', label: '歩行者数', type: 'number', min: 1, max: 16, step: 1, default: 4 },
    { key: 'persistence', label: '方向の持続性', type: 'number', min: 0, max: 0.95, step: 0.01, default: 0.3 },
    { key: 'target', label: '目標の掘削率', type: 'number', min: 0.1, max: 0.7, step: 0.01, default: 0.4 },
    { key: 'size', label: '格子サイズ', type: 'number', min: 32, max: 96, step: 8, default: 64 },
    { key: 'speed', label: '速さ（歩/秒・1人あたり）', type: 'number', min: 20, max: 2000, step: 10, default: 400 },
  ],
  liveKeys: ['speed'],
  distance: 13,
  elevation: 0.95,
  compareLabels: ['掘削前（岩盤）', '掘削後'],
  build(p, env) {
    const N = env.quality === 'low' ? Math.min(56, Number(p.size)) : Number(p.size);
    const size = 10;
    const W = Math.round(Number(p.walkers));
    const persist = Number(p.persistence);
    const goal = Math.floor(Number(p.target) * (N - 2) * (N - 2));
    const rng = env.rng;
    const dug = new Int32Array(N * N).fill(-1); // 掘られた順番
    const field = new ColumnField(N, N, size, { gap: 0 });
    const WALL_H = 0.5;
    for (let k = 0; k < N * N; k++) field.setK(k, WALL_H, 0x5c5048);
    field.commit();
    const pre = new ColumnField(N, N, size, { gap: 0 });
    for (let k = 0; k < N * N; k++) pre.setK(k, WALL_H, 0x5c5048);
    pre.commit();

    const wx = new Int32Array(W).fill(N >> 1), wy = new Int32Array(W).fill(N >> 1), wd = new Int32Array(W);
    for (let a = 0; a < W; a++) wd[a] = Math.floor(rng() * 4);
    let count = 0, steps = 0, straight = 0;
    const tint = new THREE.Color();
    const dig = (k: number) => {
      if (dug[k] >= 0) return;
      dug[k] = count++;
    };
    const paint = (k: number) => {
      const t = dug[k] / Math.max(1, goal);
      tint.setHSL(0.78 - 0.62 * t, 0.65, 0.42 + 0.15 * t);
      field.setRGB(k, 0.04, tint.r, tint.g, tint.b);
    };
    dig((N >> 1) * N + (N >> 1));
    paint((N >> 1) * N + (N >> 1));
    field.commit();

    // 歩行者の目印
    const markers = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 12, 8), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xff7040, emissiveIntensity: 1.2 }), W);
    markers.frustumCulled = false;
    const helpers = new THREE.Group();
    helpers.add(markers);
    const m4 = new THREE.Matrix4();
    const placeMarkers = () => {
      for (let a = 0; a < W; a++) {
        m4.makeTranslation(field.x(wx[a]), 0.25, field.z(wy[a]));
        markers.setMatrixAt(a, m4);
      }
      markers.instanceMatrix.needsUpdate = true;
    };
    placeMarkers();
    const ticker = new Ticker(Number(p.speed));
    return {
      object: field.mesh,
      before: pre.mesh,
      helpers,
      info: () => `掘削 ${count}/${goal}（${Math.round((100 * count) / ((N - 2) * (N - 2)))}%）· ${steps.toLocaleString()} 歩 · 直進率 ${steps ? Math.round((100 * straight) / steps) : 0}%${count >= goal ? ' · 目標に達して停止' : ''}`,
      update(dt, _t, pp) {
        if (count >= goal) return;
        ticker.rate = Number(pp.speed);
        const k = ticker.steps(dt, 400);
        if (!k) return;
        for (let s = 0; s < k && count < goal; s++) {
          for (let a = 0; a < W && count < goal; a++) {
            if (rng() >= persist) {
              const nd = Math.floor(rng() * 4);
              if (nd === wd[a]) straight++;
              wd[a] = nd;
            } else straight++;
            const nx = wx[a] + N4[wd[a]][0], ny = wy[a] + N4[wd[a]][1];
            // 外周1マスは掘らずに向きを変える
            if (nx < 1 || ny < 1 || nx > N - 2 || ny > N - 2) { wd[a] = Math.floor(rng() * 4); steps++; continue; }
            wx[a] = nx; wy[a] = ny;
            const c = ny * N + nx;
            if (dug[c] < 0) { dig(c); paint(c); }
            steps++;
          }
        }
        field.commit();
        placeMarkers();
      },
    };
  },
});
