import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { N4, Ticker } from '../framework/worldKit';
import { ColumnField, TimeChart } from '../framework/caKit';
import { chartSlot } from '../framework/dynKit';

// 0 裸地 1 白 2 黒
const ALBEDO = [0.5, 0.75, 0.25];
const S = 917, SIGMA = 5.67e-8;
const L0 = 0.65, L1 = 1.7;

/** WRD-043 空間版デイジーワールド：局所温度＝放射平衡温度の拡散平滑、成長率＝温度の放物線、光度を時間とともに上げる */
export default defineWorldDemo({
  id: 'WRD-043',
  notes: '各セルの放射平衡温度 T⁴=S·L·(1−アルベド)/σ を熱の拡散で平滑化して局所温度とし、空き地は隣のヒナギクから成長率 β(T)=1−0.003265(295.5−T)² で種を受け、ヒナギクは死亡率 γ で枯れる。光度 L を 0.65→1.7 へ上げると、黒→白の順に優勢が移り、温度が広い範囲で保たれる。柱の高さは局所温度、左のグラフは平均温度（橙）とヒナギクなしの温度（灰）、右は白（白）・黒（灰青）の被覆率。',
  params: [
    { key: 'lumRate', label: '光度の上昇速度（/1000ステップ）', type: 'number', min: 0.5, max: 6, step: 0.1, default: 1.8 },
    { key: 'death', label: '死亡率 γ', type: 'number', min: 0.05, max: 0.6, step: 0.01, default: 0.3 },
    { key: 'diffusion', label: '熱の拡散', type: 'number', min: 0, max: 0.95, step: 0.01, default: 0.35 },
    { key: 'speed', label: '速さ（ステップ/秒）', type: 'number', min: 2, max: 60, step: 1, default: 25 },
  ],
  liveKeys: ['speed'],
  distance: 15,
  elevation: 0.7,
  compareLabels: ['初期（L=0.65・まばらな種）', '時間発展'],
  build(p, env) {
    const N = env.quality === 'low' ? 48 : 64;
    const size = 10;
    const rng = env.rng;
    const g = new Uint8Array(N * N);
    for (let k = 0; k < N * N; k++) {
      const r = rng();
      g[k] = r < 0.05 ? 1 : r < 0.1 ? 2 : 0;
    }
    const T = new Float32Array(N * N);
    const Tn = new Float32Array(N * N);
    const D = Number(p.diffusion), gamma = Number(p.death), rate = Number(p.lumRate) / 1000;
    let L = L0;
    let steps = 0;
    const teq = (a: number) => Math.pow((S * L * (1 - a)) / SIGMA, 0.25);
    const tq = [0, 0, 0];
    const temps = () => {
      for (let a = 0; a < 3; a++) tq[a] = teq(ALBEDO[a]);
      for (let k = 0; k < N * N; k++) T[k] = tq[g[k]];
      // 熱の拡散：近傍平均との緩和を数回（周期境界＝惑星表面の代わり）
      for (let it = 0; it < 4; it++) {
        for (let j = 0; j < N; j++) {
          for (let i = 0; i < N; i++) {
            const k = j * N + i;
            const avg = (T[j * N + ((i + 1) % N)] + T[j * N + ((i + N - 1) % N)] + T[((j + 1) % N) * N + i] + T[((j + N - 1) % N) * N + i]) / 4;
            Tn[k] = tq[g[k]] * (1 - D) + avg * D;
          }
        }
        T.set(Tn);
      }
    };
    const beta = (t: number) => Math.max(0, 1 - 0.003265 * (295.5 - t) * (295.5 - t));
    let meanT = 0, white = 0, black = 0;
    const stats = () => {
      let s = 0, w = 0, b = 0;
      for (let k = 0; k < N * N; k++) {
        s += T[k];
        if (g[k] === 1) w++;
        else if (g[k] === 2) b++;
      }
      meanT = s / (N * N);
      white = w / (N * N);
      black = b / (N * N);
    };
    const step = () => {
      const ng = g.slice();
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = j * N + i;
          if (g[k] !== 0) {
            if (rng() < gamma) ng[k] = 0;
            continue;
          }
          const [di, dj] = N4[(rng() * 4) | 0];
          const src = g[((j + dj + N) % N) * N + ((i + di + N) % N)];
          // 隣のヒナギクが種を落とす。ごく稀に外から種が飛来する（絶滅後の再侵入）
          const kind = src || (rng() < 0.0005 ? 1 + ((rng() * 2) | 0) : 0);
          // 成長率はそのセルにヒナギクが生えた場合の局所温度で評価する
          if (kind && rng() < beta(T[k] + (1 - D) * (tq[kind] - tq[0]))) ng[k] = kind;
        }
      }
      g.set(ng);
      L = Math.min(L1, L + rate);
      steps++;
      temps();
      stats();
    };
    temps();
    stats();
    const TH = (t: number) => Math.max(0.03, (t - 230) / 70) * 1.3;
    const draw = (f: ColumnField) => {
      for (let k = 0; k < N * N; k++) {
        const t = T[k];
        if (g[k] === 1) f.setRGB(k, TH(t), 0.95, 0.95, 0.92);
        else if (g[k] === 2) f.setRGB(k, TH(t), 0.12, 0.13, 0.18);
        else {
          // 裸地は温度で色を変える（寒い=青灰、暑い=赤茶）
          const u = Math.min(1, Math.max(0, (t - 260) / 80));
          f.setRGB(k, TH(t), 0.45 + 0.4 * u, 0.42 - 0.1 * u, 0.5 - 0.35 * u);
        }
      }
      f.commit();
    };
    const field = new ColumnField(N, N, size, { gap: 0.04 });
    const pre = new ColumnField(N, N, size, { gap: 0.04 });
    draw(field);
    draw(pre);
    const tChart = new TimeChart([0xffa040, 0x9090a0], { ...chartSlot(size, 0), cap: 300, yMax: 120 });
    const cChart = new TimeChart([0xf0f0f0, 0x6080b0], { ...chartSlot(size, 1), cap: 300, yMax: 1 });
    const bareT = () => teq(ALBEDO[0]);
    const push = () => {
      tChart.push([meanT - 233, bareT() - 233]);
      cChart.push([white, black]);
    };
    push();
    const helpers = new THREE.Group();
    helpers.add(tChart.group, cChart.group);
    const ticker = new Ticker(Number(p.speed));
    const C = (t: number) => (t - 273.15).toFixed(1);
    return {
      object: field.mesh,
      before: pre.mesh,
      helpers,
      info: () => `ステップ ${steps} · 光度 L=${L.toFixed(3)} · 平均温度 ${C(meanT)}℃（ヒナギクなし ${C(bareT())}℃） · 白 ${(white * 100).toFixed(1)}% · 黒 ${(black * 100).toFixed(1)}%${L >= L1 ? ' · 光度上限に到達' : ''}`,
      update(dt, _t, pp) {
        ticker.rate = Number(pp.speed);
        let n = ticker.steps(dt, 3);
        if (n === 0) return;
        while (n-- > 0) {
          step();
          if (steps % 3 === 0) push();
        }
        draw(field);
      },
    };
  },
});
