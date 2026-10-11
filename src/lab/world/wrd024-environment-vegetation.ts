import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { Heightfield, terrainColor } from '../framework/worldKit';
import { gridFrom, normalize } from '../framework/terrainKit';
import { TreeSet, InstSet, heatColor } from '../framework/natureKit';
import { normalMap, trapezoid } from '../framework/ecoKit';

/** WRD-024 環境条件による植生配置：標高・傾斜・日照（斜面方位）の適合度で種を選ぶ */

const SPECIES = [
  { name: '針葉樹', color: 0x2f5a3a },
  { name: '広葉樹', color: 0x6fae3e },
  { name: '低木', color: 0xb59a3c },
  { name: '草', color: 0xc8dc78 },
];
const WATER = 0.07;

export default defineWorldDemo({
  id: 'WRD-024',
  notes: '地形の法線から傾斜角と、日照の方向（方位角・仰角40°）との内積で日当たりを求め、針葉樹（中〜高標高・日陰向き）・広葉樹（低標高・日向）・低木（急斜面寄り）・草の4種の台形適合度の積で各点の最適種を選ぶ。表示を「適合度の地図」や種ごとのヒートマップに切り替えると配置の根拠が見え、日照の方向を回すと南北斜面で種が入れ替わる。黄色の線と球が日照の方向。',
  params: [
    { key: 'sun', label: '日照の方向（方位角°）', type: 'number', min: 0, max: 359, step: 1, default: 200 },
    { key: 'maxSlope', label: '最大傾斜（°）', type: 'number', min: 10, max: 60, step: 1, default: 34 },
    { key: 'treeLine', label: '樹木限界の標高', type: 'number', min: 0.4, max: 1, step: 0.01, default: 0.74 },
    { key: 'density', label: '密度', type: 'number', min: 0.1, max: 1.5, step: 0.05, default: 0.8 },
    {
      key: 'view', label: '表示', type: 'select', default: 'placement',
      options: [
        { value: 'placement', label: '配置結果（地面＝最適種）' },
        { value: 'map', label: '適合度の地図（最適種×適合度）' },
        { value: 's0', label: '針葉樹の適合度' },
        { value: 's1', label: '広葉樹の適合度' },
        { value: 's2', label: '低木の適合度' },
        { value: 's3', label: '草の適合度' },
      ],
    },
  ],
  liveKeys: ['view'],
  distance: 14,
  elevation: 0.85,
  compareLabels: ['植生なしの地形', '環境で決めた植生'],
  build(p, env) {
    const n = env.quality === 'low' ? 72 : 96;
    const size = 10, H = 2.6, cell = size / (n - 1);
    const noise = makeNoise2(env.seed);
    const elev = gridFrom(n, (u, v) => {
      const ridge = 1 - Math.abs(fbm2(noise, u * 1.7 + 3, v * 1.7 + 7, 4));
      return fbm2(noise, u * 2.2, v * 2.2, 5) * 0.7 + ridge * 0.6 - 0.5 * Math.hypot(u - 0.5, v - 0.5);
    });
    normalize(elev, 0, 1);
    const nrm = normalMap(elev, n, cell, H);
    const az = (Number(p.sun) * Math.PI) / 180, alt = (40 * Math.PI) / 180;
    const sun = new THREE.Vector3(Math.sin(az) * Math.cos(alt), Math.sin(alt), Math.cos(az) * Math.cos(alt));
    const maxS = Number(p.maxSlope), tl = Number(p.treeLine);

    // 種ごとの適合度（標高・傾斜・日照の台形関数の積）
    const suit = [0, 1, 2, 3].map(() => new Float32Array(n * n));
    const best = new Int8Array(n * n).fill(-1);
    const bestV = new Float32Array(n * n);
    const slopeDeg = new Float32Array(n * n);
    const sunI = new Float32Array(n * n);
    let steep = 0, land = 0;
    for (let k = 0; k < n * n; k++) {
      const e = elev[k];
      const ny = nrm[k * 3 + 1];
      const s = (Math.acos(Math.min(1, ny)) * 180) / Math.PI;
      const I = nrm[k * 3] * sun.x + ny * sun.y + nrm[k * 3 + 2] * sun.z;
      slopeDeg[k] = s;
      sunI[k] = I;
      if (e < WATER) continue;
      land++;
      suit[0][k] = trapezoid(e, 0.3, 0.45, tl - 0.04, tl + 0.02) * trapezoid(I, -0.4, -0.2, 0.55, 0.8) * trapezoid(s, -1, 0, maxS * 0.8, maxS);
      suit[1][k] = trapezoid(e, WATER, 0.12, 0.4, 0.56) * trapezoid(I, 0.35, 0.62, 1.2, 1.3) * trapezoid(s, -1, 0, maxS * 0.55, maxS * 0.85);
      suit[2][k] = 0.8 * trapezoid(e, WATER, 0.25, tl + 0.03, tl + 0.14) * trapezoid(I, 0.05, 0.3, 1.2, 1.3) * trapezoid(s, -1, 0, maxS * 0.95, maxS * 1.3);
      suit[3][k] = 0.5 * trapezoid(e, WATER, WATER + 0.02, 0.96, 1.05) * trapezoid(I, -0.1, 0.2, 1.2, 1.3) * trapezoid(s, -1, 0, maxS * 1.15, maxS * 1.6);
      let b = -1, bv = 0.05;
      for (let q = 0; q < 4; q++) if (suit[q][k] > bv) { bv = suit[q][k]; b = q; }
      best[k] = b;
      bestV[k] = b >= 0 ? bv : 0;
      if (s > maxS) steep++;
    }

    const disp = elev.map((x) => Math.max(x, WATER));
    const hf = new Heightfield(n, size);
    hf.setHeights(disp, H);
    const rock = new THREE.Color(0x7a7268), snow = new THREE.Color(0xe8eef4), water = new THREE.Color(0x2a5a96);
    const sc = new THREE.Color();
    const paint = (view: string) => {
      hf.setColors((k, c) => {
        if (elev[k] < WATER) return c.copy(water);
        if (view === 'placement' || view === 'map') {
          const b = best[k];
          if (b < 0) return c.copy(elev[k] > tl + 0.1 ? snow : rock);
          sc.setHex(SPECIES[b].color, THREE.SRGBColorSpace);
          if (view === 'placement') return c.copy(rock).lerp(sc, 0.55).multiplyScalar(0.85);
          return c.copy(rock).multiplyScalar(0.35).lerp(sc, 0.25 + 0.75 * bestV[k]);
        }
        return heatColor(suit[Number(view[1])][k], c);
      });
    };
    let view = String(p.view);
    paint(view);

    // 配置：ジッター格子の候補点で、最適種を適合度×密度の確率で採用する
    const g = env.quality === 'low' ? 56 : 76;
    const dens = Number(p.density);
    const cones = new TreeSet(g * g, 'cone');
    const balls = new TreeSet(g * g, 'ball');
    const tuftGeo = new THREE.ConeGeometry(0.5, 1, 5);
    tuftGeo.translate(0, 0.5, 0);
    const tufts = new InstSet(tuftGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), g * g);
    const counts = [0, 0, 0, 0];
    const col = new THREE.Color();
    for (let j = 0; j < g; j++) {
      for (let i = 0; i < g; i++) {
        const x = ((i + env.rng()) / g - 0.5) * size;
        const z = ((j + env.rng()) / g - 0.5) * size;
        const ci = Math.round((x / size + 0.5) * (n - 1)), cj = Math.round((z / size + 0.5) * (n - 1));
        const k = cj * n + ci;
        const b = best[k];
        const r = env.rng();
        if (b < 0 || r > dens * suit[b][k] * (b === 3 ? 0.45 : 1)) continue;
        const y = hf.sample(disp, x, z) * H - 0.02;
        const s = 0.8 + env.rng() * 0.4;
        col.setHex(SPECIES[b].color, THREE.SRGBColorSpace).offsetHSL((env.rng() - 0.5) * 0.04, 0, (env.rng() - 0.5) * 0.08);
        if (b === 0) cones.put(x, y, z, 0.55 * s, 0.13 * s, col);
        else if (b === 1) balls.put(x, y, z, 0.45 * s, 0.16 * s, col);
        else if (b === 2) balls.put(x, y, z, 0.16 * s, 0.1 * s, col, 0x5a4a30);
        else tufts.put(x, y, z, 0.07 * s, 0.09 * s, 0.07 * s, env.rng() * 6, col);
        counts[b]++;
      }
    }
    cones.commit();
    balls.commit();
    tufts.commit();
    const object = new THREE.Group();
    const plants = new THREE.Group();
    plants.add(cones.group, balls.group, tufts.mesh);
    object.add(hf.mesh, plants);
    plants.visible = view === 'placement';

    // 補助：日照の方向
    const helpers = new THREE.Group();
    const sunPos = sun.clone().multiplyScalar(6.5);
    const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 1.2, 0), sunPos]);
    helpers.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffd34d })));
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd34d }));
    ball.position.copy(sunPos);
    helpers.add(ball);
    const foot = sun.clone().setY(0).normalize().multiplyScalar(size * 0.62);
    const ag = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0.05, 0), new THREE.Vector3(foot.x, 0.05, foot.z)]);
    helpers.add(new THREE.Line(ag, new THREE.LineBasicMaterial({ color: 0xffd34d, transparent: true, opacity: 0.5 })));

    const bare = new Heightfield(n, size);
    bare.setHeights(disp, H);
    bare.setColors((k, c) => (elev[k] < WATER ? c.copy(water) : terrainColor(elev[k] * 0.9, 0, c)));

    const pct = (v: number) => Math.round((100 * v) / Math.max(1, land));
    return {
      object,
      before: bare.mesh,
      helpers,
      info: () =>
        `${SPECIES.map((s, q) => `${s.name} ${counts[q]}`).join(' / ')} · 最大傾斜を超える急斜面 ${pct(steep)}% · 表示: ${view === 'placement' ? '配置' : view === 'map' ? '適合度の地図' : SPECIES[Number(view[1])].name + 'の適合度'}`,
      update(_dt, _t, live) {
        const v = String(live.view);
        if (v === view) return;
        view = v;
        paint(view);
        plants.visible = view === 'placement';
      },
    };
  },
});
