import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2, makeRng } from '../framework/random';
import { Heightfield } from '../framework/worldKit';
import { gridFrom, normalize } from '../framework/terrainKit';
import { LineChart3D, TreeSet, poissonDisk } from '../framework/natureKit';

/** WRD-030 季節変化（積算温度）：標高別の気温から芽吹き・紅葉・落葉・積雪を決める */

const BINS = 48;
const DAYS = 365;
const PEAK_M = 2200; // 最高点の標高（m）
const BASE_T = 5; // 積算温度の基準温度
const BUD_GDD = 110; // 芽吹きの積算温度
const MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const dateLabel = (d: number) => {
  let m = 0;
  while (m < 11 && d >= MONTH[m]) d -= MONTH[m++];
  return `${m + 1}月${d + 1}日`;
};

export default defineWorldDemo({
  id: 'WRD-030',
  notes: '気温＝年平均＋年較差の正弦波−気温減率×標高＋日ごとの揺らぎ（シード固定）を標高48段で1年分（前年で助走）計算する。基準5°Cを超えた分の積算温度が閾値を超えると芽吹き、秋は7日平均気温が12°Cを下回った分の積算（寒さ）で紅葉→落葉、0°C前後の降水は積雪になり気温で融ける。日付スライダーで任意の日へ、再生で1年を早送りでき、春は低地から、秋は高地から季節が進む。右のグラフは低地（橙）と山頂（水色）の気温と現在日。',
  params: [
    { key: 'date', label: '日付（1月1日からの日数）', type: 'number', min: 1, max: 365, step: 1, default: 110 },
    { key: 'play', label: '再生', type: 'bool', default: true },
    { key: 'speed', label: '再生速度（日/秒）', type: 'number', min: 2, max: 60, step: 1, default: 16 },
    { key: 'lapse', label: '気温減率（°C/1000m）', type: 'number', min: 0, max: 10, step: 0.1, default: 6.5 },
  ],
  liveKeys: ['date', 'play', 'speed'],
  distance: 16,
  elevation: 0.75,
  target: [2, 0.8, 0],
  build(p, env) {
    const n = env.quality === 'low' ? 72 : 96;
    const size = 10, H = 3;
    const noise = makeNoise2(env.seed);
    const elev = gridFrom(n, (u, v) => {
      const d = Math.hypot(u - 0.55, v - 0.45);
      return Math.max(0, 1 - d * 1.6) ** 1.4 * 0.8 + fbm2(noise, u * 3, v * 3, 5) * 0.25;
    });
    normalize(elev, 0, 1);
    for (let k = 0; k < elev.length; k++) elev[k] = elev[k] ** 1.5;
    const lapse = Number(p.lapse);

    // 日ごとの気温の揺らぎと降水（全標高で共通、シード固定）
    const wr = makeRng(env.seed * 7 + 3);
    const anom = new Float32Array(DAYS), rain = new Float32Array(DAYS);
    let a = 0;
    for (let d = 0; d < DAYS; d++) {
      a = a * 0.7 + (wr() - 0.5) * 3;
      anom[d] = a;
      rain[d] = wr() < 0.3 ? 2 + wr() * 8 : 0;
    }
    const temp = (d: number, alt: number) => 11 + 13 * Math.sin((2 * Math.PI * (d - 110)) / DAYS) - (lapse * alt) / 1000 + anom[d];

    // 標高段ごとに1年分の状態表：葉の量・紅葉の度合い・積雪
    const leaf = new Float32Array(BINS * DAYS), autumn = new Float32Array(BINS * DAYS), snow = new Float32Array(BINS * DAYS);
    const tLow = new Float32Array(DAYS), tHigh = new Float32Array(DAYS);
    const t7 = new Float32Array(7);
    for (let b = 0; b < BINS; b++) {
      const alt = (b / (BINS - 1)) * PEAK_M;
      let pack = 0;
      // 前年で積雪を助走させる
      for (let pass = 0; pass < 2; pass++) {
        let gdd = 0, chill = 0;
        for (let d = 0; d < DAYS; d++) {
          const T = temp(d, alt);
          if (T < 0.5) pack += rain[d] * 0.5;
          else pack = Math.max(0, pack - 1.5 * T);
          t7[d % 7] = T;
          if (pass === 0) continue;
          gdd += Math.max(0, T - BASE_T);
          const mean7 = t7.reduce((s, v) => s + v, 0) / 7;
          if (d > 200) chill += Math.max(0, 12 - mean7);
          const spring = Math.min(1, Math.max(0, (gdd - BUD_GDD) / 160));
          const fall = Math.min(1, Math.max(0, (chill - 70) / 60));
          const k = b * DAYS + d;
          leaf[k] = Math.min(spring, 1 - fall);
          autumn[k] = Math.min(1, chill / 70);
          snow[k] = Math.min(1, pack / 8);
          if (b === 0) tLow[d] = T;
          if (b === BINS - 1) tHigh[d] = T;
        }
      }
    }
    const binOf = (e: number) => Math.min(BINS - 1, Math.max(0, Math.round(e * (BINS - 1))));

    const hf = new Heightfield(n, size);
    hf.setHeights(elev, H);
    // 木：ポアソンディスク配置。高い所ほど常緑の針葉樹、山頂付近は木なし
    const pts = poissonDisk(env.rng, size, size, env.quality === 'low' ? 0.42 : 0.34, 20, 1200);
    interface Tree { x: number; y: number; z: number; e: number; b: number; h: number; ever: boolean; ry: number }
    const trees: Tree[] = [];
    for (const q of pts) {
      const x = q.x - size / 2, z = q.y - size / 2;
      const e = hf.sample(elev, x, z);
      if (e > 0.88) continue;
      const ever = env.rng() < Math.min(1, Math.max(0, (e - 0.4) / 0.35));
      // 個体差：同じ標高でも閾値が少しずれる
      const b = binOf(e + (env.rng() - 0.5) * 0.06);
      trees.push({ x, y: e * H - 0.02, z, e, b, h: 0.4 + env.rng() * 0.25, ever, ry: env.rng() * 6 });
    }
    const dec = new TreeSet(trees.length, 'ball');
    const con = new TreeSet(trees.length, 'cone');
    const object = new THREE.Group();
    object.add(hf.mesh, dec.group, con.group);

    // 気温グラフ
    const chart = new LineChart3D(4.4, 2.6, [0xffa040, 0x6fd0ff, 0xffffff, 0x445080], DAYS);
    chart.group.position.set(size / 2 + 0.6, 0.2, -1.5);
    const u = Array.from({ length: DAYS }, (_, d) => d / (DAYS - 1));
    const tv = (T: number) => (T + 25) / 60;
    chart.set(0, u, Array.from(tLow, tv));
    chart.set(1, u, Array.from(tHigh, tv));
    chart.set(3, [0, 1], [tv(BASE_T), tv(BASE_T)]);
    const helpers = chart.group;

    const cBare = new THREE.Color(0x7a6650), cBud = new THREE.Color(0xc8e070), cGreen = new THREE.Color(0x3f8a3a);
    const cRed = new THREE.Color(0xd0502a), cYel = new THREE.Color(0xe0b030), cSnow = new THREE.Color(0xf2f6fa);
    const cCon = new THREE.Color(0x24502e), cGround = new THREE.Color(0x6e5e44), cGrass = new THREE.Color(0x5a8a3a), cRock = new THREE.Color(0x7a746c);
    const tmp = new THREE.Color(), tmp2 = new THREE.Color();
    const counts = { bud: 0, green: 0, red: 0, bare: 0 };
    let snowPct = 0;
    let shownDay = -1;
    const show = (day: number) => {
      if (day === shownDay) return;
      shownDay = day;
      counts.bud = counts.green = counts.red = counts.bare = 0;
      dec.reset();
      con.reset();
      for (const t of trees) {
        const k = t.b * DAYS + day;
        const s = snow[k];
        if (t.ever) {
          tmp.copy(cCon).lerp(cSnow, s * 0.55);
          con.put(t.x, t.y, t.z, t.h * 1.25, t.h * 0.32, tmp, 0x5a4030, t.ry);
          continue;
        }
        const L = leaf[k], au = autumn[k];
        if (L < 0.02) counts.bare++;
        else if (au > 0.3) counts.red++;
        else if (L < 0.7) counts.bud++;
        else counts.green++;
        // 芽吹き（黄緑）→緑→（寒さで）黄・赤
        tmp.copy(cBud).lerp(cGreen, Math.min(1, L * 1.4));
        tmp2.copy(cYel).lerp(cRed, Math.max(0, au * 2 - 1));
        tmp.lerp(tmp2, Math.min(1, au * 1.6));
        if (L < 0.02) tmp.copy(cBare).lerp(cSnow, s * 0.5);
        dec.put(t.x, t.y, t.z, t.h, t.h * (0.12 + 0.24 * L), tmp, 0x5a4030, t.ry);
      }
      dec.commit();
      con.commit();
      let sn = 0;
      hf.setColors((k, c) => {
        const b = binOf(elev[k]);
        const s = snow[b * DAYS + day];
        if (s > 0.05) sn++;
        c.copy(elev[k] > 0.8 ? cRock : cGround).lerp(cGrass, elev[k] > 0.8 ? 0 : leaf[b * DAYS + day] * 0.9);
        return c.lerp(cSnow, Math.min(1, s * 1.5));
      });
      snowPct = Math.round((100 * sn) / (n * n));
      chart.set(2, [day / (DAYS - 1), day / (DAYS - 1)], [0, 1]);
    };
    let day = Number(p.date) - 1;
    let lastDate = Number(p.date);
    show(Math.floor(day));
    const nd = Math.max(1, trees.filter((t) => !t.ever).length);
    return {
      object,
      helpers,
      info: () => {
        const d = Math.floor(day);
        const pc = (v: number) => Math.round((100 * v) / nd);
        return `${dateLabel(d)} · 低地 ${tLow[d].toFixed(1)}°C / 山頂 ${tHigh[d].toFixed(1)}°C · 落葉樹: 芽吹き ${pc(counts.bud)}% 緑 ${pc(counts.green)}% 紅葉 ${pc(counts.red)}% 裸 ${pc(counts.bare)}% · 積雪 ${snowPct}%`;
      },
      update(dt, _t, live) {
        if (Number(live.date) !== lastDate) {
          lastDate = Number(live.date);
          day = lastDate - 1;
        } else if (live.play) day = (day + Number(live.speed) * dt) % DAYS;
        show(Math.floor(day));
      },
    };
  },
});
