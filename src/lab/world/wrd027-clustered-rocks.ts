import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { InstSet, nearestDistances, poissonDisk, ringLines, uniformPoints, type P2 } from '../framework/natureKit';
import { BarChart } from '../framework/caKit';
import { gaussian, poissonCount } from '../framework/ecoKit';

/** WRD-027 岩のクラスター散布：トーマス過程・ポアソン過程・ポアソンディスクを同じ個数で比べる */

const S = 6;
const BINS = 14;
const METHODS = [
  { key: 'poisson', name: 'ポアソン（一様ランダム）', ground: 0x5a5244, bar: 0x8fb4ff },
  { key: 'pd', name: 'ポアソンディスク（均等）', ground: 0x4c5a44, bar: 0x8fe0a0 },
  { key: 'thomas', name: 'トーマス過程（クラスター）', ground: 0x5e4c40, bar: 0xffb070 },
] as const;

export default defineWorldDemo({
  id: 'WRD-027',
  notes: 'トーマス過程：親をポアソン過程（期待値＝親の数）で置き、各親の周りにポアソン個（平均 μ）の子を標準偏差 σ の正規分布で散らし、子の岩は親から遠いほど小さくする（赤い円＝親と半径2σ）。同じ個数の一様ランダムとポアソンディスク（Bridson）を並べ、奥の棒グラフに最近傍距離のヒストグラムを描く。Clark–Evans 比 R（平均最近傍距離÷ランダムの期待値）は R<1 がクラスター、R≈1 がランダム、R>1 が均等。',
  params: [
    { key: 'parents', label: '親の数', type: 'number', min: 2, max: 40, step: 1, default: 10 },
    { key: 'mu', label: '子の平均数 μ', type: 'number', min: 2, max: 40, step: 1, default: 14 },
    { key: 'sigma', label: '散らばり σ', type: 'number', min: 0.08, max: 1.2, step: 0.01, default: 0.3 },
    {
      key: 'method', label: '配置方式', type: 'select', default: 'all',
      options: [
        { value: 'all', label: '3方式を並べて比較' },
        { value: 'thomas', label: 'トーマス過程（クラスター）' },
        { value: 'poisson', label: 'ポアソン（一様ランダム）' },
        { value: 'pd', label: 'ポアソンディスク（均等）' },
      ],
    },
    { key: 'rings', label: '親と 2σ の円を表示', type: 'bool', default: true },
  ],
  liveKeys: ['rings'],
  distance: 15,
  elevation: 0.85,
  target: [0, 0.8, 0],
  build(p, env) {
    const rng = env.rng;
    const sigma = Number(p.sigma);
    // トーマス過程
    const nPar = Math.max(1, poissonCount(rng, Number(p.parents)));
    const parents: P2[] = [];
    const thomas: (P2 & { d: number })[] = [];
    for (let a = 0; a < nPar; a++) {
      const par = { x: rng() * S, y: rng() * S };
      parents.push(par);
      const kids = poissonCount(rng, Number(p.mu));
      for (let c = 0; c < kids; c++) {
        const dx = gaussian(rng) * sigma, dy = gaussian(rng) * sigma;
        const x = par.x + dx, y = par.y + dy;
        if (x < 0 || y < 0 || x >= S || y >= S) continue;
        thomas.push({ x, y, d: Math.hypot(dx, dy) });
      }
    }
    const N = Math.max(2, thomas.length);
    const A = S * S;
    const poisson = uniformPoints(rng, S, S, N);
    // ポアソンディスク：個数が N 前後になる r を数回で合わせ、多すぎた分はランダムに間引く
    let r = Math.sqrt(A / (N * 1.5));
    let pd = poissonDisk(rng, S, S, r, 30, 20000);
    for (let t = 0; t < 3 && pd.length > N * 1.05; t++) {
      r *= Math.sqrt(pd.length / N) * 0.98;
      pd = poissonDisk(rng, S, S, r, 30, 20000);
    }
    for (let i = pd.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pd[i], pd[j]] = [pd[j], pd[i]];
    }
    pd = pd.slice(0, N);
    const sets: Record<string, P2[]> = { poisson, pd, thomas };

    const cell = Math.sqrt(A / N);
    const expected = 0.5 / Math.sqrt(N / A);
    const maxD = expected * 2.6;
    const shown = p.method === 'all' ? METHODS : METHODS.filter((m) => m.key === p.method);
    const gap = 1.6;
    const object = new THREE.Group();
    const helpers = new THREE.Group();
    const ringGroup = new THREE.Group();
    helpers.add(ringGroup);
    const stats: string[] = [];
    const rockGeo = new THREE.IcosahedronGeometry(0.5, 0);
    const col = new THREE.Color();
    shown.forEach((m, si) => {
      const cx = (si - (shown.length - 1) / 2) * (S + gap);
      const pts = sets[m.key];
      const plate = new THREE.Mesh(new THREE.BoxGeometry(S, 0.1, S), new THREE.MeshStandardMaterial({ color: m.ground, roughness: 0.95 }));
      plate.position.set(cx, -0.05, 0);
      object.add(plate);
      const rocks = new InstSet(si === 0 ? rockGeo : rockGeo.clone(), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), pts.length);
      pts.forEach((q, i) => {
        let s = 0.09 + rng() * 0.06;
        if (m.key === 'thomas') s = 0.07 + 0.22 * Math.exp(-((thomas[i].d / sigma) ** 2) / 2) + rng() * 0.03;
        col.setHSL(0.08, 0.08 + rng() * 0.08, 0.42 + rng() * 0.18);
        rocks.put(cx + q.x - S / 2, s * 0.15, q.y - S / 2, s * (0.9 + rng() * 0.5), s * (0.55 + rng() * 0.3), s * (0.9 + rng() * 0.5), rng() * 6, col);
      });
      rocks.commit();
      object.add(rocks.mesh);
      // 最近傍距離のヒストグラム
      const nn = nearestDistances(pts, cell);
      const hist = new Array(BINS).fill(0);
      let sum = 0;
      for (const d of nn) {
        sum += d;
        hist[Math.min(BINS - 1, Math.floor((d / maxD) * BINS))]++;
      }
      const mx = Math.max(1, ...hist);
      const bars = new BarChart(BINS, { width: S * 0.9, height: 2.4, x0: cx - S * 0.45, y0: 0, z0: -S / 2 - 0.5, color: m.bar });
      bars.set(hist.map((v) => v / mx));
      helpers.add(bars.mesh);
      // ランダムの期待値の位置に縦線
      const ex = cx - S * 0.45 + (expected / maxD) * S * 0.9;
      const lg = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ex, 0, -S / 2 - 0.45), new THREE.Vector3(ex, 2.6, -S / 2 - 0.45)]);
      helpers.add(new THREE.Line(lg, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.6 })));
      const R = sum / nn.length / expected;
      stats.push(`${m.name} R=${R.toFixed(2)}`);
      if (m.key === 'thomas') ringGroup.add(ringLines(parents.map((q) => ({ x: cx + q.x - S / 2, z: q.y - S / 2, r: 2 * sigma })), 0.04, 0xff5a5a, 28));
      if (m.key === 'pd') ringGroup.add(ringLines(pd.map((q) => ({ x: cx + q.x - S / 2, z: q.y - S / 2, r: r / 2 })), 0.04, 0xfff2b0, 14, 0.5));
    });
    return {
      object,
      helpers,
      info: () => `岩 ${N} 個（各方式同数）· 親 ${nPar} · ${stats.join(' / ')} · 白線＝ランダムの期待最近傍距離 ${expected.toFixed(2)}`,
      update(_dt, _t, live) {
        ringGroup.visible = Boolean(live.rings);
      },
    };
  },
});
