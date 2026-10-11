import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { Heightfield, Ticker, segments } from '../framework/worldKit';
import { TimeChart } from '../framework/caKit';
import { AgentDots, chartSlot } from '../framework/dynKit';

/** WRD-048 踏み分け道の自己組織化（Helbing の active walker）：快適さ場 G を踏んで強め、草の回復で弱める */
export default defineWorldDemo({
  id: 'WRD-048',
  notes: '歩行者は目的地方向の単位ベクトルと、快適さ場 G をぼかした道ポテンシャル V の勾配×誘引の強さを足した方向へ進み、通ったセルの G を I·(1−G) だけ踏み固める。G は毎ステップ回復速度の割合で草地へ戻る。地面の色（緑→土色）とへこみが G。比較の左は目的地間の直線。回復が速いと直線的な道、遅いと幹線に束ねられた網になる。グラフは道の面積×4（茶）と平均の迂回率−1（青）。',
  params: [
    { key: 'dests', label: '目的地の数', type: 'number', min: 3, max: 8, step: 1, default: 5 },
    { key: 'walkers', label: '歩行者数', type: 'number', min: 10, max: 200, step: 5, default: 60 },
    { key: 'recovery', label: '道の回復速度（×10⁻³/ステップ）', type: 'number', min: 0.5, max: 20, step: 0.5, default: 3 },
    { key: 'attract', label: '道への誘引の強さ', type: 'number', min: 0, max: 40, step: 1, default: 14 },
    { key: 'speed', label: '速さ', type: 'number', min: 0.25, max: 4, step: 0.25, default: 1.5 },
  ],
  liveKeys: ['speed'],
  distance: 14,
  elevation: 0.85,
  compareLabels: ['目的地と直線の経路', '形成された踏み分け道'],
  build(p, env) {
    const M = env.quality === 'low' ? 64 : 80;
    const size = 10;
    const rng = env.rng;
    const G = new Float32Array(M * M);
    const V = new Float32Array(M * M);
    const tmp = new Float32Array(M * M);
    // 目的地：互いに離れた位置（格子座標）
    const D: [number, number][] = [];
    for (let tries = 0; D.length < Number(p.dests) && tries < 2000; tries++) {
      const x = M * (0.1 + 0.8 * rng()), z = M * (0.1 + 0.8 * rng());
      if (D.every(([a, b]) => Math.hypot(a - x, b - z) > M * 0.28)) D.push([x, z]);
    }
    const nw = Number(p.walkers);
    const wx = new Float32Array(nw), wz = new Float32Array(nw), wd = new Int32Array(nw), wl = new Float32Array(nw), ws = new Float32Array(nw);
    const pickDest = (cur: number) => {
      let d = (rng() * D.length) | 0;
      if (d === cur) d = (d + 1 + ((rng() * (D.length - 1)) | 0)) % D.length;
      return d;
    };
    for (let w = 0; w < nw; w++) {
      const s = (rng() * D.length) | 0;
      wx[w] = D[s][0] + (rng() - 0.5) * 2;
      wz[w] = D[s][1] + (rng() - 0.5) * 2;
      wd[w] = pickDest(s);
      ws[w] = Math.hypot(D[wd[w]][0] - wx[w], D[wd[w]][1] - wz[w]);
      wl[w] = 0;
      // 出発時刻をずらす（最初の数歩は止まっている）
      wl[w] = -rng() * 30;
    }
    const I = 0.06, rec = Number(p.recovery) * 1e-3, attract = Number(p.attract), STEP = 0.5;
    // 道ポテンシャル V：G の箱型ぼかし（半径 3）を2回
    const blur = () => {
      const r = 3;
      const pass = (src: Float32Array, dst: Float32Array, dx: number, dz: number) => {
        for (let j = 0; j < M; j++) {
          for (let i = 0; i < M; i++) {
            let s = 0, c = 0;
            for (let t = -r; t <= r; t++) {
              const x = i + dx * t, z = j + dz * t;
              if (x < 0 || z < 0 || x >= M || z >= M) continue;
              s += src[z * M + x];
              c++;
            }
            dst[j * M + i] = s / c;
          }
        }
      };
      pass(G, tmp, 1, 0);
      pass(tmp, V, 0, 1);
      pass(V, tmp, 1, 0);
      pass(tmp, V, 0, 1);
    };
    const sampleV = (x: number, z: number) => {
      const i = Math.min(M - 1, Math.max(0, Math.round(x))), j = Math.min(M - 1, Math.max(0, Math.round(z)));
      return V[j * M + i];
    };
    let steps = 0, trips = 0;
    const detours: number[] = [];
    const step = () => {
      for (let k = 0; k < M * M; k++) G[k] -= G[k] * rec;
      for (let w = 0; w < nw; w++) {
        if (wl[w] < 0) {
          wl[w] += 1;
          if (wl[w] >= 0) wl[w] = 0;
          continue;
        }
        const tx = D[wd[w]][0] - wx[w], tz = D[wd[w]][1] - wz[w];
        const dist = Math.hypot(tx, tz);
        if (dist < 1.2) {
          // 到着：迂回率を記録して次の目的地へ
          if (ws[w] > 4) {
            detours.push(wl[w] / ws[w]);
            if (detours.length > 60) detours.shift();
          }
          trips++;
          const cur = wd[w];
          wd[w] = pickDest(cur);
          ws[w] = Math.hypot(D[wd[w]][0] - wx[w], D[wd[w]][1] - wz[w]);
          wl[w] = 0;
          continue;
        }
        const gx = (sampleV(wx[w] + 1, wz[w]) - sampleV(wx[w] - 1, wz[w])) * 0.5;
        const gz = (sampleV(wx[w], wz[w] + 1) - sampleV(wx[w], wz[w] - 1)) * 0.5;
        let ex = tx / dist + attract * gx, ez = tz / dist + attract * gz;
        const el = Math.hypot(ex, ez) || 1;
        ex /= el;
        ez /= el;
        // 少しのゆらぎ
        ex += (rng() - 0.5) * 0.15;
        ez += (rng() - 0.5) * 0.15;
        const l2 = Math.hypot(ex, ez) || 1;
        wx[w] = Math.min(M - 1, Math.max(0, wx[w] + (ex / l2) * STEP));
        wz[w] = Math.min(M - 1, Math.max(0, wz[w] + (ez / l2) * STEP));
        wl[w] += STEP;
        const k = Math.round(wz[w]) * M + Math.round(wx[w]);
        G[k] += I * (1 - G[k]);
      }
      if (steps % 4 === 0) blur();
      steps++;
    };
    const hf = new Heightfield(M, size);
    const hts = new Float32Array(M * M);
    const grass = new THREE.Color(0x3f7a34), dirt = new THREE.Color(0xc9a46a);
    const draw = (f: Heightfield, src: Float32Array) => {
      for (let k = 0; k < M * M; k++) hts[k] = -0.1 * Math.min(1, src[k] * 1.5);
      f.setHeights(hts);
      f.setColors((k, out) => out.copy(grass).lerp(dirt, Math.min(1, Math.pow(src[k] * 1.8, 0.8))));
    };
    draw(hf, G);
    const toW = (g: number) => (g / (M - 1) - 0.5) * size;
    const pillars = (): THREE.Group => {
      const grp = new THREE.Group();
      const geo = new THREE.CylinderGeometry(0.16, 0.2, 0.9, 12);
      geo.translate(0, 0.45, 0);
      const mat = new THREE.MeshStandardMaterial({ color: 0xf0e0b0, roughness: 0.5 });
      D.forEach(([x, z], i) => {
        const m = new THREE.Mesh(i === 0 ? geo : geo.clone(), i === 0 ? mat : mat.clone());
        m.position.set(toW(x), 0, toW(z));
        grp.add(m);
      });
      return grp;
    };
    const dots = new AgentDots(nw);
    const drawWalkers = () => {
      dots.begin();
      for (let w = 0; w < nw; w++) dots.push(toW(wx[w]), 0.12, toW(wz[w]), 0.09, 0.24, 0.09, 0xff5a8a);
      dots.end();
    };
    drawWalkers();
    const object = new THREE.Group();
    object.add(hf.mesh, pillars(), dots.mesh);
    // 比較用：初期の草地と目的地を結ぶ直線
    const before = new THREE.Group();
    const pre = new Heightfield(M, size);
    draw(pre, new Float32Array(M * M));
    const lines: number[] = [];
    for (let a = 0; a < D.length; a++) for (let b = a + 1; b < D.length; b++) lines.push(toW(D[a][0]), 0.03, toW(D[a][1]), toW(D[b][0]), 0.03, toW(D[b][1]));
    before.add(pre.mesh, pillars(), segments(lines, 0xffe080));
    const chart = new TimeChart([0xc9a46a, 0x60a0ff], { ...chartSlot(size, 'full', 2), cap: 300, yMax: 1 });
    const coverage = () => {
      let c = 0;
      for (let k = 0; k < M * M; k++) if (G[k] > 0.25) c++;
      return c / (M * M);
    };
    const meanDetour = () => (detours.length ? detours.reduce((s, v) => s + v, 0) / detours.length : 1);
    const helpers = new THREE.Group();
    helpers.add(chart.group);
    const ticker = new Ticker(60);
    return {
      object,
      before,
      helpers,
      info: () => `ステップ ${steps} · 目的地 ${D.length} · 歩行者 ${nw} · 往復 ${trips} 回 · 道の面積 ${(coverage() * 100).toFixed(1)}% · 平均迂回率 ${meanDetour().toFixed(2)}（直線=1）`,
      update(dt, _t, pp) {
        ticker.rate = 60 * Number(pp.speed);
        let n = ticker.steps(dt, 8);
        if (n === 0) return;
        while (n-- > 0) {
          step();
          if (steps % 30 === 0) chart.push([Math.min(1, coverage() * 4), Math.min(1, meanDetour() - 1)]);
        }
        draw(hf, G);
        drawWalkers();
      },
    };
  },
});
