import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { Ticker } from '../framework/worldKit';
import { LineChart3D, TreeSet } from '../framework/natureKit';
import { DynamicRings } from '../framework/ecoKit';

/** WRD-028 樹冠競争による自己間引き：重なる大きい隣に負けた木が枯れ、間隔がそろっていく */

const S = 9;
const RMAX = 0.75;
const HIST = 800;

export default defineWorldDemo({
  id: 'WRD-028',
  notes: '一様ランダムに置いた苗木の樹冠半径を1ステップずつ成長させ（上限に近いほど遅い）、空間ハッシュで近傍を調べて「自分より大きい木と樹冠が重なる」木は成長を止める（黄→茶）。被圧が枯死までの期間続くと枯れて消える。円は樹冠の範囲（赤＝被圧中）。右のグラフは横軸 log 本数・縦軸 log 平均サイズ（半径³）で、時間とともに右から左へ進み、白い参照線（傾き −3/2）に沿うのが自己間引き則。',
  params: [
    { key: 'count', label: '初期本数', type: 'number', min: 100, max: 1000, step: 10, default: 600 },
    { key: 'growth', label: '成長速度', type: 'number', min: 0.2, max: 3, step: 0.05, default: 1 },
    { key: 'period', label: '枯死までの期間（ステップ）', type: 'number', min: 2, max: 60, step: 1, default: 14 },
    { key: 'speed', label: '速さ（ステップ/秒）', type: 'number', min: 2, max: 60, step: 1, default: 18 },
    { key: 'rings', label: '樹冠の円を表示', type: 'bool', default: true },
  ],
  liveKeys: ['speed', 'rings'],
  distance: 15,
  elevation: 0.8,
  target: [1.8, 0.8, 0],
  compareLabels: ['初期の苗木（一様ランダム）', '自己間引き'],
  build(p, env) {
    const rng = env.rng;
    const N0 = env.quality === 'low' ? Math.min(500, Number(p.count)) : Number(p.count);
    const growth = Number(p.growth), period = Number(p.period);
    const xs = new Float32Array(N0), zs = new Float32Array(N0), rs = new Float32Array(N0), vig = new Float32Array(N0);
    const sup = new Int16Array(N0);
    const alive = new Uint8Array(N0).fill(1);
    for (let i = 0; i < N0; i++) {
      xs[i] = (rng() - 0.5) * S;
      zs[i] = (rng() - 0.5) * S;
      rs[i] = 0.03 + rng() * 0.05;
      vig[i] = 0.7 + rng() * 0.6;
    }
    const ground = (color: number) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(S + 0.4, 0.08, S + 0.4), new THREE.MeshStandardMaterial({ color, roughness: 0.95 }));
      m.position.y = -0.04;
      return m;
    };
    const height = (r: number) => 0.25 + r * 2.4;
    // 処理前：苗木
    const seed = new TreeSet(N0, 'ball');
    for (let i = 0; i < N0; i++) seed.put(xs[i], 0, zs[i], height(rs[i]), rs[i], 0x7fbf4a);
    seed.commit();
    const before = new THREE.Group();
    before.add(ground(0x4a3f2e), seed.group);

    const trees = new TreeSet(N0, 'ball');
    const object = new THREE.Group();
    object.add(ground(0x4a3f2e), trees.group);
    const rings = new DynamicRings(N0, 16);
    const helpers = new THREE.Group();
    helpers.add(rings.lines);
    // 両対数グラフ（地面の右に立てる）
    const chart = new LineChart3D(4.2, 3.2, [0xffd060, 0xffffff], HIST);
    chart.group.position.set(S / 2 + 0.9, 0.2, -1.6);
    chart.group.rotation.y = -0.35;
    helpers.add(chart.group);

    const gw = Math.ceil(S / (2 * RMAX));
    const buckets: number[][] = Array.from({ length: gw * gw }, () => []);
    const bucketOf = (x: number, z: number) => Math.min(gw - 1, Math.max(0, Math.floor((x / S + 0.5) * gw))) + Math.min(gw - 1, Math.max(0, Math.floor((z / S + 0.5) * gw))) * gw;
    const suppressed = new Uint8Array(N0);
    let n = N0, steps = 0, stable = 0;
    const logN: number[] = [], logW: number[] = [];
    const meanW = () => {
      let s = 0;
      for (let i = 0; i < N0; i++) if (alive[i]) s += rs[i] ** 3;
      return s / Math.max(1, n);
    };
    const w0 = meanW();
    const lnMin = Math.log10(Math.max(4, N0 / 60)), lnMax = Math.log10(N0);
    const lwMin = Math.log10(w0), lwMax = Math.log10(RMAX ** 3);
    const record = () => {
      logN.push(Math.log10(n));
      logW.push(Math.log10(meanW()));
      if (logN.length > HIST) { logN.shift(); logW.shift(); }
      const u = logN.map((v) => (v - lnMin) / (lnMax - lnMin));
      const v = logW.map((w) => (w - lwMin) / (lwMax - lwMin));
      chart.set(0, u, v);
      // 傾き −3/2 の参照線を最新の点に通す
      const a = logW[logW.length - 1] + 1.5 * logN[logN.length - 1];
      const ref = [lnMin + (lnMax - lnMin) * 0.05, lnMax];
      chart.set(1, ref.map((x) => (x - lnMin) / (lnMax - lnMin)), ref.map((x) => (a - 1.5 * x - lwMin) / (lwMax - lwMin)));
    };
    const draw = () => {
      trees.reset();
      const c = new THREE.Color();
      let q = 0;
      for (let i = 0; i < N0; i++) {
        if (!alive[i]) continue;
        const t = Math.min(1, sup[i] / period);
        if (suppressed[i]) c.setRGB(0.55 + 0.25 * t, 0.62 - 0.3 * t, 0.2 - 0.1 * t);
        else c.setRGB(0.22, 0.5 + 0.1 * vig[i], 0.22);
        trees.put(xs[i], 0, zs[i], height(rs[i]), rs[i], c);
        rings.setAt(q++, xs[i], 0.03, zs[i], rs[i], suppressed[i] ? c.setRGB(1, 0.3, 0.3) : c.setRGB(1, 0.95, 0.7));
      }
      trees.commit();
      rings.commit(q);
    };
    const step = () => {
      for (const b of buckets) b.length = 0;
      for (let i = 0; i < N0; i++) if (alive[i]) buckets[bucketOf(xs[i], zs[i])].push(i);
      let changed = 0;
      for (let i = 0; i < N0; i++) {
        if (!alive[i]) continue;
        const bi = Math.min(gw - 1, Math.max(0, Math.floor((xs[i] / S + 0.5) * gw)));
        const bj = Math.min(gw - 1, Math.max(0, Math.floor((zs[i] / S + 0.5) * gw)));
        let hit = 0;
        for (let dj = -1; dj <= 1 && !hit; dj++) {
          for (let di = -1; di <= 1 && !hit; di++) {
            const x = bi + di, z = bj + dj;
            if (x < 0 || z < 0 || x >= gw || z >= gw) continue;
            for (const j of buckets[z * gw + x]) {
              if (j === i || rs[j] <= rs[i]) continue;
              const d = Math.hypot(xs[j] - xs[i], zs[j] - zs[i]);
              // 樹冠が（少しの重なりを許して）重なれば被圧
              if (d < (rs[i] + rs[j]) * 0.85) { hit = 1; break; }
            }
          }
        }
        suppressed[i] = hit;
        if (hit) {
          sup[i]++;
          if (sup[i] > period) { alive[i] = 0; n--; changed++; }
        } else {
          sup[i] = Math.max(0, sup[i] - 1);
          const dr = 0.012 * growth * vig[i] * (1 - rs[i] / RMAX);
          if (dr > 1e-4) changed++;
          rs[i] = Math.min(RMAX, rs[i] + dr);
        }
      }
      steps++;
      stable = changed ? 0 : stable + 1;
    };
    draw();
    record();
    const ticker = new Ticker(Number(p.speed));
    // 間引き期のみで両対数の傾きを最小二乗で推定
    const slope = () => {
      const first = logN.findIndex((v) => v < lnMax - 0.02);
      if (first < 0 || logN.length - first < 4) return null;
      let sx = 0, sy = 0, sxx = 0, sxy = 0, m = 0;
      for (let k = first; k < logN.length; k++) {
        sx += logN[k]; sy += logW[k]; sxx += logN[k] ** 2; sxy += logN[k] * logW[k]; m++;
      }
      const den = m * sxx - sx * sx;
      return den > 1e-9 ? (m * sxy - sx * sy) / den : null;
    };
    return {
      object,
      before,
      helpers,
      info: () => {
        const s = slope();
        return `ステップ ${steps} · 生存 ${n}/${N0} 本 · 平均半径 ${Math.cbrt(meanW()).toFixed(2)} · 両対数の傾き ${s === null ? '—（間引き前）' : s.toFixed(2)}（自己間引き則 −1.5）${stable > 20 ? ' · 安定' : ''}`;
      },
      update(dt, _t, live) {
        rings.lines.visible = Boolean(live.rings);
        ticker.rate = Number(live.speed);
        let k = ticker.steps(dt, 4);
        if (!k || stable > 20) return;
        while (k-- > 0) {
          step();
          record();
        }
        draw();
      },
    };
  },
});
