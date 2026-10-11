import { defineWorldDemo } from '../framework/sceneLab';
import { makeNoise2 } from '../framework/random';
import { N4, Ticker } from '../framework/worldKit';
import { ColumnField, TimeChart } from '../framework/caKit';
import { chartSlot, lerpHex } from '../framework/dynKit';
import * as THREE from 'three';

/** WRD-041 人口に応じた都市成長：ロジスティック人口の増分ぶんの床を、魅力度の高い区画から順に新築・増築する */
export default defineWorldDemo({
  id: 'WRD-041',
  notes: '人口はロジスティック式で毎年増え、増えた人口に必要な床（20人/階）を、魅力度＝道路の重み×道路への近さ＋中心の重み×中心への近さ＋隣接市街地−既存の階数 の高い区画から1階ずつ供給する。道路の重みを上げると幹線沿いの帯状、中心の重みを上げると同心円状の成長になる。奥のグラフは人口（橙）と床の収容人数（青）。',
  params: [
    { key: 'growth', label: '人口成長率（/年）', type: 'number', min: 0.01, max: 0.12, step: 0.005, default: 0.05 },
    { key: 'roadW', label: '道路の重み', type: 'number', min: 0, max: 3, step: 0.05, default: 1.2 },
    { key: 'centerW', label: '中心の重み', type: 'number', min: 0, max: 3, step: 0.05, default: 1 },
    { key: 'speed', label: '時間の速さ（年/秒）', type: 'number', min: 1, max: 30, step: 1, default: 8 },
  ],
  liveKeys: ['speed'],
  distance: 15,
  elevation: 0.75,
  compareLabels: ['初期状態（道路と小さな核）', '成長後'],
  build(p, env) {
    const N = env.quality === 'low' ? 40 : 48;
    const size = 10;
    const rng = env.rng;
    const noise = makeNoise2(env.seed + 41);
    // 道路網：区画幅 4〜6 の格子。中心に最も近い縦横の道路を幹線にする
    const lines = (): number[] => {
      const out: number[] = [];
      let x = 1 + Math.floor(rng() * 3);
      while (x < N - 1) {
        out.push(x);
        x += 5 + Math.floor(rng() * 3);
      }
      return out;
    };
    const xs = lines(), zs = lines();
    const near = (arr: number[]) => arr.reduce((b, v) => (Math.abs(v - N / 2) < Math.abs(b - N / 2) ? v : b), arr[0]);
    const mx = near(xs), mz = near(zs);
    const ROAD = 1, MAJOR = 2;
    const road = new Uint8Array(N * N);
    for (let j = 0; j < N; j++) {
      for (let i = 0; i < N; i++) {
        const k = j * N + i;
        if (i === mx || j === mz) road[k] = MAJOR;
        else if (xs.includes(i) || zs.includes(j)) road[k] = ROAD;
      }
    }
    const bfs = (src: (k: number) => boolean): Int32Array => {
      const d = new Int32Array(N * N).fill(1 << 20);
      const q = new Int32Array(N * N);
      let h = 0, t = 0;
      for (let k = 0; k < N * N; k++) if (src(k)) { d[k] = 0; q[t++] = k; }
      while (h < t) {
        const k = q[h++];
        const i = k % N, j = (k / N) | 0;
        for (const [di, dj] of N4) {
          const x = i + di, z = j + dj;
          if (x < 0 || z < 0 || x >= N || z >= N) continue;
          const q2 = z * N + x;
          if (d[q2] > d[k] + 1) { d[q2] = d[k] + 1; q[t++] = q2; }
        }
      }
      return d;
    };
    const dRoad = bfs((k) => road[k] > 0);
    const dMajor = bfs((k) => road[k] === MAJOR);
    const roadW = Number(p.roadW), centerW = Number(p.centerW);
    const lots: number[] = [];
    const base = new Float32Array(N * N);
    const maxF = new Uint8Array(N * N);
    for (let k = 0; k < N * N; k++) {
      if (road[k]) continue;
      lots.push(k);
      const i = k % N, j = (k / N) | 0;
      const dc = Math.hypot(i - mx, j - mz) / (N / 2);
      const centerProx = Math.exp(-dc * 2.2);
      const roadProx = 0.4 * Math.exp(-(dRoad[k] - 1)) + 0.6 * Math.exp(-dMajor[k] / 2.5);
      base[k] = roadW * roadProx + centerW * centerProx + 0.12 * noise(i * 0.25, j * 0.25);
      maxF[k] = Math.max(2, Math.round(2 + 16 * centerProx * centerProx + 5 * Math.exp(-dMajor[k] / 2)));
    }
    const floors = new Uint8Array(N * N);
    const PER_FLOOR = 20;
    const capacity = 60000;
    let pop = 1500;
    let total = 0;
    let year = 0;
    let lastAdded = 0;
    const score = new Float32Array(N * N);
    const order = Int32Array.from(lots);
    // 必要な床を魅力度順に1階ずつ供給する（1年あたり上限あり）
    const allocate = () => {
      const need = Math.min(120, Math.ceil(pop / PER_FLOOR) - total);
      lastAdded = 0;
      if (need <= 0) return;
      for (const k of lots) {
        if (floors[k] >= maxF[k]) { score[k] = -1e9; continue; }
        const i = k % N, j = (k / N) | 0;
        let nb = 0;
        for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
          const x = i + di, z = j + dj;
          if ((di || dj) && x >= 0 && z >= 0 && x < N && z < N && floors[z * N + x] > 0) nb++;
        }
        score[k] = base[k] + 0.6 * (nb / 8) - 0.07 * floors[k] - (dRoad[k] > 2 ? 0.5 : 0);
      }
      order.sort((a, b) => score[b] - score[a]);
      for (let n = 0; n < order.length && lastAdded < need; n++) {
        const k = order[n];
        if (score[k] < -1e8) break;
        floors[k]++;
        total++;
        lastAdded++;
      }
    };
    allocate();
    const FH = 0.085;
    const draw = (f: ColumnField) => {
      for (let k = 0; k < N * N; k++) {
        if (road[k]) f.setK(k, 0.012, road[k] === MAJOR ? 0x6a6a80 : 0x3c3c48);
        else if (floors[k] === 0) f.setK(k, 0.03, dRoad[k] <= 2 ? 0x46663a : 0x3a5532);
        else f.setK(k, 0.03 + floors[k] * FH, lerpHex(0xe0cfa0, 0x5f8ad8, floors[k] / 14));
      }
      f.commit();
    };
    const field = new ColumnField(N, N, size, { gap: 0.04 });
    const pre = new ColumnField(N, N, size, { gap: 0.04 });
    draw(field);
    draw(pre);
    const chart = new TimeChart([0xff9a40, 0x60a0ff], { ...chartSlot(size, 'full'), cap: 300, yMax: capacity * 1.05 });
    chart.push([pop, total * PER_FLOOR]);
    const helpers = new THREE.Group();
    helpers.add(chart.group);
    const r = Number(p.growth);
    const ticker = new Ticker(Number(p.speed));
    const built = () => lots.reduce((s, k) => s + (floors[k] > 0 ? 1 : 0), 0);
    let maxBuilt = 0;
    return {
      object: field.mesh,
      before: pre.mesh,
      helpers,
      info: () => {
        let mf = 0;
        for (const k of lots) if (floors[k] > mf) mf = floors[k];
        const b = built();
        maxBuilt = b;
        return `${year} 年目 · 人口 ${Math.round(pop).toLocaleString()} · 建物 ${b} 棟 · 延べ ${total} 階（最高 ${mf} 階） · 市街地 ${Math.round((100 * maxBuilt) / lots.length)}% · 今年の増築 ${lastAdded} 階`;
      },
      update(dt, _t, pp) {
        ticker.rate = Number(pp.speed);
        let n = ticker.steps(dt, 3);
        if (n === 0 || year >= 300) return;
        while (n-- > 0 && year < 300) {
          pop += r * pop * (1 - pop / capacity);
          year++;
          allocate();
          chart.push([pop, total * PER_FLOOR]);
        }
        draw(field);
      },
    };
  },
});
