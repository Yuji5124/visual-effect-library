import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { Heightfield, segments } from '../framework/worldKit';
import { contourSegments, gridFrom, normalize, waterPlane } from '../framework/terrainKit';
import { InstSet, TreeSet, heatColor } from '../framework/natureKit';
import { chamferDistance } from '../framework/ecoKit';

/** WRD-029 水辺からの距離による植生帯：チャンファー距離変換で帯を割り当てる */

const ZONES = [
  { name: '水草', color: 0x3f8f6a },
  { name: '葦', color: 0xb8c25a },
  { name: '湿地林', color: 0x2f6a3a },
  { name: '乾燥地の草', color: 0xc2b07a },
];

export default defineWorldDemo({
  id: 'WRD-029',
  notes: '蛇行する谷と川・池を持つ地形で、水位より低いセルを水とし、3-4 チャンファーマスクの2パス（前向き・後ろ向き）距離変換で水辺からの距離場を求める。実効距離＝距離＋水面からの高さ×係数（地下水の届きにくさ）＋ノイズ×揺らぎで、浅い水→水草、帯の幅以内→葦、2.5倍以内→湿地林、その先→乾燥地の草に割り当てる。白線は帯の境界、薄い線は距離の等値線。',
  params: [
    { key: 'band', label: '帯の幅', type: 'number', min: 0.15, max: 1.2, step: 0.01, default: 0.45 },
    { key: 'wobble', label: '境界の揺らぎ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'water', label: '水位', type: 'number', min: 0.12, max: 0.4, step: 0.005, default: 0.22 },
    { key: 'groundwater', label: '高さの効き（地下水）', type: 'number', min: 0, max: 6, step: 0.1, default: 2.5 },
    {
      key: 'view', label: '表示', type: 'select', default: 'zones',
      options: [
        { value: 'zones', label: '植生帯と植物' },
        { value: 'distance', label: '距離場（ヒートマップ）' },
      ],
    },
    { key: 'contours', label: '等値線を表示', type: 'bool', default: true },
  ],
  liveKeys: ['view', 'contours'],
  distance: 14,
  elevation: 0.9,
  compareLabels: ['植生なし（水位のみ）', '距離で決めた植生帯'],
  build(p, env) {
    const n = env.quality === 'low' ? 96 : 128;
    const size = 10, H = 2.2, cell = size / (n - 1);
    const noise = makeNoise2(env.seed);
    const rng = env.rng;
    const lake = { u: 0.2 + rng() * 0.6, v: rng() < 0.5 ? 0.22 : 0.78, r: 0.07 + rng() * 0.04 };
    const h = gridFrom(n, (u, v) => {
      const base = fbm2(noise, u * 2.4 + 11, v * 2.4 + 5, 5) * 0.5 + 0.5;
      const zc = 0.5 + 0.22 * fbm2(noise, u * 1.3 + 40, 3.3, 3) * 1.6;
      const dz = v - zc;
      const valley = 1 - Math.exp(-((dz / 0.2) ** 2));
      const channel = Math.exp(-((dz / 0.025) ** 2));
      const dl = Math.hypot(u - lake.u, v - lake.v) / lake.r;
      const pond = Math.exp(-dl * dl);
      return 0.18 + base * 0.35 + valley * 0.45 - channel * 0.16 - pond * 0.3;
    });
    normalize(h, 0, 1);
    const level = Number(p.water), band = Number(p.band), wob = Number(p.wobble), gwK = Number(p.groundwater);
    const isWater = (k: number) => h[k] < level;
    const dist = chamferDistance(n, n, isWater);
    const de = new Float32Array(n * n);
    const zone = new Int8Array(n * n);
    let maxDe = 0;
    const zc = [0, 0, 0, 0];
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const k = j * n + i;
        const jit = fbm2(noise, i * 0.07 + 70, j * 0.07 + 70, 3) * wob * band * 1.6;
        if (isWater(k)) {
          de[k] = 0;
          zone[k] = level - h[k] < 0.035 ? 0 : -1;
        } else {
          de[k] = Math.max(0.001, dist[k] * cell + gwK * (h[k] - level) * H * 0.35 + jit);
          zone[k] = de[k] < band ? 1 : de[k] < band * 2.5 ? 2 : 3;
          maxDe = Math.max(maxDe, de[k]);
        }
        if (zone[k] >= 0) zc[zone[k]]++;
      }
    }

    const hf = new Heightfield(n, size);
    hf.setHeights(h, H);
    const sc = new THREE.Color(), bareC = new THREE.Color(0x8a7a5a), deep = new THREE.Color(0x24405a);
    let view = String(p.view);
    const paint = () =>
      hf.setColors((k, c) => {
        if (view === 'distance') return isWater(k) ? c.copy(deep) : heatColor(1 - Math.min(1, de[k] / (band * 4)), c);
        if (zone[k] < 0) return c.copy(deep);
        sc.setHex(ZONES[zone[k]].color, THREE.SRGBColorSpace);
        return c.copy(bareC).lerp(sc, 0.6);
      });
    paint();

    // 植物：ジッター格子の候補を帯ごとの密度で採用
    const g = env.quality === 'low' ? 64 : 84;
    const pads = new InstSet(new THREE.CylinderGeometry(0.5, 0.5, 1, 8), new THREE.MeshStandardMaterial({ roughness: 0.6 }), g * g);
    const reedGeo = new THREE.BoxGeometry(1, 1, 1);
    reedGeo.translate(0, 0.5, 0);
    const reeds = new InstSet(reedGeo, new THREE.MeshStandardMaterial({ roughness: 0.8 }), g * g * 3);
    const trees = new TreeSet(g * g, 'ball');
    const tuftGeo = new THREE.ConeGeometry(0.5, 1, 5);
    tuftGeo.translate(0, 0.5, 0);
    const tufts = new InstSet(tuftGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), g * g);
    const DENS = [0.55, 0.85, 0.32, 0.45];
    const col = new THREE.Color();
    for (let j = 0; j < g; j++) {
      for (let i = 0; i < g; i++) {
        const x = ((i + rng()) / g - 0.5) * size, z = ((j + rng()) / g - 0.5) * size;
        const k = Math.round((z / size + 0.5) * (n - 1)) * n + Math.round((x / size + 0.5) * (n - 1));
        const zn = zone[k];
        if (zn < 0 || rng() > DENS[zn]) continue;
        const y = hf.sample(h, x, z) * H;
        col.setHex(ZONES[zn].color, THREE.SRGBColorSpace).offsetHSL((rng() - 0.5) * 0.04, 0, (rng() - 0.5) * 0.08);
        if (zn === 0) pads.put(x, level * H + 0.01, z, 0.09, 0.01, 0.09, 0, col);
        else if (zn === 1) for (let t = 0; t < 3; t++) reeds.put(x + (rng() - 0.5) * 0.08, y - 0.02, z + (rng() - 0.5) * 0.08, 0.018, 0.28 + rng() * 0.18, 0.018, rng() * 3, col);
        else if (zn === 2) trees.put(x, y - 0.02, z, 0.45 + rng() * 0.25, 0.15 + rng() * 0.05, col);
        else tufts.put(x, y - 0.01, z, 0.06, 0.08 + rng() * 0.04, 0.06, rng() * 6, col);
      }
    }
    pads.commit();
    reeds.commit();
    trees.commit();
    tufts.commit();
    const plants = new THREE.Group();
    plants.add(pads.mesh, reeds.mesh, trees.group, tufts.mesh);
    const object = new THREE.Group();
    object.add(hf.mesh, waterPlane(size, level * H, 0x2a6fb8, 0.6), plants);
    plants.visible = view === 'zones';

    // 等値線：地形の高さに沿わせて少し浮かせる
    const drape = (segs: number[]) => {
      for (let o = 0; o < segs.length; o += 3) segs[o + 1] = hf.sample(h, segs[o], segs[o + 2]) * H + 0.03;
      return segs;
    };
    const helpers = new THREE.Group();
    const iso: number[] = [];
    for (let lv = band * 0.5; lv < Math.min(maxDe, band * 6); lv += band * 0.5) {
      if (Math.abs(lv - band) < 1e-6 || Math.abs(lv - band * 2.5) < 1e-6) continue;
      iso.push(...contourSegments(de, n, size, lv, 0));
    }
    helpers.add(segments(drape(iso), 0x9fd0ff, { opacity: 0.35 }));
    const bounds = [...contourSegments(de, n, size, band, 0), ...contourSegments(de, n, size, band * 2.5, 0)];
    helpers.add(segments(drape(bounds), 0xffffff, { opacity: 0.9 }));
    helpers.visible = Boolean(p.contours);

    const bare = new THREE.Group();
    const hb = new Heightfield(n, size);
    hb.setHeights(h, H);
    hb.setColors((k, c) => c.setRGB(0.45 + h[k] * 0.25, 0.42 + h[k] * 0.2, 0.32));
    bare.add(hb.mesh, waterPlane(size, level * H, 0x2a6fb8, 0.6));
    const land = zc[1] + zc[2] + zc[3] || 1;
    return {
      object,
      before: bare,
      helpers,
      info: () => `距離変換 ${n}×${n} · ${ZONES.map((z, q) => `${z.name} ${q === 0 ? zc[0] + ' セル' : Math.round((zc[q] / land) * 100) + '%'}`).join(' / ')} · 最遠 ${maxDe.toFixed(1)}`,
      update(_dt, _t, live) {
        helpers.visible = Boolean(live.contours);
        const v = String(live.view);
        if (v === view) return;
        view = v;
        paint();
        plants.visible = view === 'zones';
      },
    };
  },
});
