import * as THREE from 'three';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { signedVolume } from '../framework/deformKit';

/** GEO-029 ラプラシアン平滑化と Taubin の λ|μ 法 */

function baseGeometry(shape: string, low: boolean): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  if (shape === 'torus') g = new THREE.TorusGeometry(1.2, 0.5, low ? 24 : 40, low ? 64 : 100);
  else if (shape === 'box') g = new THREE.BoxGeometry(2.2, 2.2, 2.2, low ? 14 : 22, low ? 14 : 22, low ? 14 : 22);
  else g = new THREE.IcosahedronGeometry(1.6, low ? 14 : 24);
  // 隣接関係を作るため、継ぎ目の重複頂点を位置だけで統合する
  g.deleteAttribute('normal');
  g.deleteAttribute('uv');
  const m = mergeVertices(g, 1e-5);
  g.dispose();
  return m;
}

function neighbors(geo: THREE.BufferGeometry): { start: Int32Array; list: Int32Array } {
  const n = geo.attributes.position.count;
  const idx = geo.index!.array;
  const sets: Set<number>[] = Array.from({ length: n }, () => new Set());
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t], b = idx[t + 1], c = idx[t + 2];
    sets[a].add(b).add(c);
    sets[b].add(a).add(c);
    sets[c].add(a).add(b);
  }
  const start = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + sets[i].size;
  const list = new Int32Array(start[n]);
  for (let i = 0; i < n; i++) list.set([...sets[i]], start[i]);
  return { start, list };
}

/** 一様重みの1ステップ：p ← p + f·(近傍平均 − p) */
function step(p: Float32Array, tmp: Float32Array, nb: { start: Int32Array; list: Int32Array }, f: number): void {
  const n = p.length / 3;
  for (let i = 0; i < n; i++) {
    const s = nb.start[i], e = nb.start[i + 1];
    let x = 0, y = 0, z = 0;
    for (let k = s; k < e; k++) {
      const j = nb.list[k] * 3;
      x += p[j];
      y += p[j + 1];
      z += p[j + 2];
    }
    const c = 1 / Math.max(1, e - s);
    tmp[i * 3] = p[i * 3] + f * (x * c - p[i * 3]);
    tmp[i * 3 + 1] = p[i * 3 + 1] + f * (y * c - p[i * 3 + 1]);
    tmp[i * 3 + 2] = p[i * 3 + 2] + f * (z * c - p[i * 3 + 2]);
  }
  p.set(tmp);
}

export default defineGeometryDemo({
  id: 'GEO-029',
  notes: '形を統合した頂点の隣接リストを作り、法線方向のランダムノイズを加えた入力を平滑化する。ラプラシアンは λ だけ近傍平均へ寄せる操作の繰り返しで縮む。Taubin 法は λ の後に負の μ=1/(k_PB−1/λ)（k_PB=0.1）で押し戻し、縮まずにノイズだけ消える。ステータスに両方式の体積変化を並べる。',
  params: [
    { key: 'iterations', label: '反復回数', type: 'number', min: 0, max: 200, step: 1, default: 40 },
    { key: 'lambda', label: 'λ（寄せる強さ）', type: 'number', min: 0.05, max: 0.9, step: 0.01, default: 0.5 },
    { key: 'taubin', label: 'Taubin法（λ|μ）', type: 'bool', default: true },
    { key: 'noise', label: 'ノイズ量', type: 'number', min: 0, max: 0.2, step: 0.005, default: 0.06 },
    { key: 'shape', label: '元の形', type: 'select', options: [{ value: 'sphere', label: '球' }, { value: 'torus', label: 'トーラス' }, { value: 'box', label: '立方体（角あり）' }], default: 'torus' },
    { key: 'seed', label: 'ノイズのシード', type: 'number', min: 1, max: 999, step: 1, default: 1 },
  ],
  distance: 7,
  compareLabels: ['ノイズ入りの入力', '平滑化'],
  build(p, env) {
    const clean = baseGeometry(String(p.shape), env.quality === 'low');
    clean.computeVertexNormals();
    const n = clean.attributes.position.count;
    const nb = neighbors(clean);
    // 入力：法線方向にランダムな量だけずらす
    const noisy = clean.clone();
    const np = noisy.attributes.position.array as Float32Array;
    const nn = clean.attributes.normal.array as Float32Array;
    const amp = Number(p.noise);
    for (let i = 0; i < n; i++) {
      const r = (env.rng() * 2 - 1) * amp;
      np[i * 3] += nn[i * 3] * r;
      np[i * 3 + 1] += nn[i * 3 + 1] * r;
      np[i * 3 + 2] += nn[i * 3 + 2] * r;
    }
    noisy.computeVertexNormals();
    const v0 = signedVolume(clean);
    const vIn = signedVolume(noisy);
    const lambda = Number(p.lambda);
    const mu = 1 / (0.1 - 1 / lambda);
    const iters = Number(p.iterations);
    const tmp = new Float32Array(n * 3);
    // 両方式を計算して体積を比べる（表示するのは選択した方）
    const lap = np.slice();
    const tau = np.slice();
    for (let it = 0; it < iters; it++) {
      step(lap, tmp, nb, lambda);
      step(tau, tmp, nb, lambda);
      step(tau, tmp, nb, mu);
    }
    const useTaubin = Boolean(p.taubin);
    const geo = clean.clone();
    (geo.attributes.position.array as Float32Array).set(useTaubin ? tau : lap);
    geo.computeVertexNormals();
    const volOf = (arr: Float32Array) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      g.setIndex(clean.index);
      return signedVolume(g);
    };
    const vLap = volOf(lap), vTau = volOf(tau);
    // 元のノイズなしの形を薄い線で重ねる（縮みの比較用）
    const ghost = new THREE.LineSegments(new THREE.WireframeGeometry(clean), new THREE.LineBasicMaterial({ color: 0x6bd3ff, transparent: true, opacity: 0.08 }));
    clean.dispose();
    const pct = (v: number) => `${((v / v0 - 1) * 100).toFixed(1)}%`;
    return {
      object: new THREE.Mesh(geo, std(useTaubin ? 0x8fe388 : 0xffa94d)),
      before: new THREE.Mesh(noisy, std(0x8890b0)),
      helpers: ghost,
      info: `${useTaubin ? 'Taubin' : 'ラプラシアン'} · μ=${mu.toFixed(3)} · 体積変化（ノイズなし基準）入力 ${pct(vIn)} / ラプラシアン ${pct(vLap)} / Taubin ${pct(vTau)}`,
    };
  },
});
