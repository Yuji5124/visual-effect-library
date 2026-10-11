import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { N8, Ticker } from '../framework/worldKit';
import { ColumnField, TimeChart, XYTrace } from '../framework/caKit';
import { AgentDots, chartSlot } from '../framework/dynKit';

const SHEEP_CAP = 4000, WOLF_CAP = 1500;
const SHEEP_GAIN = 4, WOLF_GAIN = 20;

/** 個体群（位置とエネルギー）を詰めた配列で持つ */
class Herd {
  x: Int32Array;
  z: Int32Array;
  e: Float32Array;
  n = 0;
  constructor(readonly cap: number) {
    this.x = new Int32Array(cap);
    this.z = new Int32Array(cap);
    this.e = new Float32Array(cap);
  }
  add(x: number, z: number, e: number): void {
    if (this.n >= this.cap) return;
    this.x[this.n] = x;
    this.z[this.n] = z;
    this.e[this.n] = e;
    this.n++;
  }
  /** 死んだ個体（e<0）を詰めて取り除く */
  compact(): void {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      if (this.e[i] < 0) continue;
      this.x[w] = this.x[i];
      this.z[w] = this.z[i];
      this.e[w] = this.e[i];
      w++;
    }
    this.n = w;
  }
}

/** WRD-050 空間的な捕食者・被食者：草（再生カウンタ）＋草食・肉食エージェント（エネルギー・繁殖・死亡） */
export default defineWorldDemo({
  id: 'WRD-050',
  notes: '草はセルごとに「生えている／再生待ち」で、食べられると再生速度に応じた時間で戻る。羊（白）と狼（赤）は毎ステップ8近傍へ動いて1のエネルギーを使い、羊は草を食べて +4、狼は同じセルの羊を食べて +20、確率（繁殖率）で分裂してエネルギーを分け、0未満で死ぬ。周期境界の格子上で、局所的な絶滅と再侵入の波が広がる。左のグラフは草/4（緑）・羊（白）・狼×4（赤）の個体数、右は羊–狼の位相平面。',
  params: [
    { key: 'regrow', label: '草の再生速度（1/再生時間）', type: 'number', min: 0.01, max: 0.2, step: 0.005, default: 0.035 },
    { key: 'sheepRep', label: '草食の繁殖率', type: 'number', min: 0.01, max: 0.15, step: 0.005, default: 0.04 },
    { key: 'wolfRep', label: '肉食の繁殖率', type: 'number', min: 0.01, max: 0.15, step: 0.005, default: 0.05 },
    { key: 'speed', label: '速さ（ステップ/秒）', type: 'number', min: 1, max: 40, step: 1, default: 12 },
  ],
  liveKeys: ['speed'],
  distance: 14,
  elevation: 0.8,
  compareLabels: ['初期配置', '時間発展'],
  build(p, env) {
    const N = env.quality === 'low' ? 40 : 50;
    const size = 10;
    const rng = env.rng;
    const regrowT = Math.max(1, Math.round(1 / Number(p.regrow)));
    const sRep = Number(p.sheepRep), wRep = Number(p.wolfRep);
    // grass[k] = 0 なら生えている、正なら再生までの残りステップ
    const grass = new Int32Array(N * N);
    for (let k = 0; k < N * N; k++) grass[k] = rng() < 0.5 ? 0 : 1 + ((rng() * regrowT) | 0);
    const sheep = new Herd(SHEEP_CAP), wolves = new Herd(WOLF_CAP);
    for (let i = 0; i < 200; i++) sheep.add((rng() * N) | 0, (rng() * N) | 0, rng() * 2 * SHEEP_GAIN);
    for (let i = 0; i < 50; i++) wolves.add((rng() * N) | 0, (rng() * N) | 0, rng() * 2 * WOLF_GAIN);
    const head = new Int32Array(N * N);
    const next = new Int32Array(SHEEP_CAP);
    let steps = 0;
    const move = (h: Herd, i: number) => {
      const [dx, dz] = N8[(rng() * 8) | 0];
      h.x[i] = (h.x[i] + dx + N) % N;
      h.z[i] = (h.z[i] + dz + N) % N;
      h.e[i] -= 1;
    };
    const step = () => {
      // 羊：移動・採食・繁殖
      const sn = sheep.n;
      for (let i = 0; i < sn; i++) {
        move(sheep, i);
        const k = sheep.z[i] * N + sheep.x[i];
        if (grass[k] === 0) {
          grass[k] = regrowT;
          sheep.e[i] += SHEEP_GAIN;
        }
        if (sheep.e[i] >= 0 && rng() < sRep) {
          sheep.e[i] /= 2;
          sheep.add(sheep.x[i], sheep.z[i], sheep.e[i]);
        }
      }
      // セルごとの羊のリスト（狼の捕食用）
      head.fill(-1);
      for (let i = 0; i < sheep.n; i++) {
        if (sheep.e[i] < 0) continue;
        const k = sheep.z[i] * N + sheep.x[i];
        next[i] = head[k];
        head[k] = i;
      }
      const wn = wolves.n;
      for (let i = 0; i < wn; i++) {
        move(wolves, i);
        const k = wolves.z[i] * N + wolves.x[i];
        const prey = head[k];
        if (prey >= 0) {
          sheep.e[prey] = -1;
          head[k] = next[prey];
          wolves.e[i] += WOLF_GAIN;
        }
        if (wolves.e[i] >= 0 && rng() < wRep) {
          wolves.e[i] /= 2;
          wolves.add(wolves.x[i], wolves.z[i], wolves.e[i]);
        }
      }
      sheep.compact();
      wolves.compact();
      for (let k = 0; k < N * N; k++) if (grass[k] > 0) grass[k]--;
      steps++;
    };
    const grassCount = () => {
      let c = 0;
      for (let k = 0; k < N * N; k++) if (grass[k] === 0) c++;
      return c;
    };
    const drawGrass = (f: ColumnField) => {
      for (let k = 0; k < N * N; k++) {
        if (grass[k] === 0) f.setRGB(k, 0.1, 0.3, 0.62, 0.22);
        else {
          const t = 1 - grass[k] / regrowT;
          f.setRGB(k, 0.015 + 0.05 * t, 0.42 - 0.12 * t, 0.3 + 0.2 * t, 0.18);
        }
      }
      f.commit();
    };
    const cell = size / N;
    const jitter = (i: number, s: number) => (((Math.imul(i + 1, 2654435761) >>> s) & 255) / 255 - 0.5) * cell * 0.6;
    const drawAgents = (d: AgentDots) => {
      d.begin();
      for (let i = 0; i < sheep.n; i++) {
        d.push((sheep.x[i] + 0.5) * cell - size / 2 + jitter(i, 3), 0.18, (sheep.z[i] + 0.5) * cell - size / 2 + jitter(i, 11), cell * 0.38, cell * 0.3, cell * 0.38, 0xf4f4f0);
      }
      for (let i = 0; i < wolves.n; i++) {
        d.push((wolves.x[i] + 0.5) * cell - size / 2 + jitter(i + 7, 5), 0.28, (wolves.z[i] + 0.5) * cell - size / 2 + jitter(i + 7, 13), cell * 0.45, cell * 0.5, cell * 0.45, 0xe03a3a);
      }
      d.end();
    };
    const mk = () => {
      const g = new THREE.Group();
      const f = new ColumnField(N, N, size, { gap: 0.02 });
      const d = new AgentDots(SHEEP_CAP + WOLF_CAP);
      drawGrass(f);
      drawAgents(d);
      g.add(f.mesh, d.mesh);
      return { g, f, d };
    };
    const pre = mk();
    const cur = mk();
    const tChart = new TimeChart([0x50c060, 0xf0f0f0, 0xe04040], { ...chartSlot(size, 0), cap: 300 });
    const phase = new XYTrace(0xffc060, { ...chartSlot(size, 1), cap: 400 });
    const push = () => {
      tChart.push([grassCount() / 4, sheep.n, wolves.n * 4]);
      phase.push(sheep.n, wolves.n);
    };
    push();
    const helpers = new THREE.Group();
    helpers.add(tChart.group, phase.group);
    const ticker = new Ticker(Number(p.speed));
    return {
      object: cur.g,
      before: pre.g,
      helpers,
      info: () => `ステップ ${steps} · 草 ${grassCount()} セル · 羊 ${sheep.n} · 狼 ${wolves.n}${wolves.n === 0 ? '（狼は絶滅）' : ''}${sheep.n === 0 ? '（羊は絶滅）' : ''}${sheep.n >= SHEEP_CAP ? '（羊が上限）' : ''}`,
      update(dt, _t, pp) {
        ticker.rate = Number(pp.speed);
        let n = ticker.steps(dt, 3);
        if (n === 0) return;
        while (n-- > 0) {
          step();
          push();
        }
        drawGrass(cur.f);
        drawAgents(cur.d);
      },
    };
  },
});
