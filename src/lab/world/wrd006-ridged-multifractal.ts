import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2, type Noise2 } from '../framework/random';
import { Heightfield } from '../framework/worldKit';
import { gridFrom, normalize, slopeMap } from '../framework/terrainKit';

/** WRD-006 尾根型マルチフラクタル（Musgrave）：前のオクターブの値で次の重みを決める */
function ridged(noise: Noise2, x: number, y: number, octaves: number, offset: number, gain: number, H = 1, lac = 2.1): number {
  let signal = offset - Math.abs(noise(x, y));
  signal *= signal;
  let result = signal;
  let freq = 1;
  for (let o = 1; o < octaves; o++) {
    x *= lac;
    y *= lac;
    freq *= lac;
    // 尾根（signal が大きい所）ほど次のオクターブを強く足す
    const weight = Math.min(1, Math.max(0, signal * gain));
    signal = offset - Math.abs(noise(x + o * 31.7, y - o * 17.1));
    signal *= signal * weight;
    result += signal * Math.pow(freq, -H);
  }
  return result;
}

export default defineWorldDemo({
  id: 'WRD-006',
  notes: '各オクターブで (offset−|noise|)² をとって0付近を鋭い尾根にし、次のオクターブの重みを「前の信号×gain」で決める Musgrave の ridged multifractal。尾根ほど細部が増え、谷は滑らかに残る。比較では同じシード・オクターブ数の通常の fBm を左に並べる。色は標高と傾きで草・岩・雪に塗り分ける。',
  params: [
    { key: 'octaves', label: 'オクターブ', type: 'number', min: 1, max: 8, step: 1, default: 7 },
    { key: 'offset', label: 'offset（尾根の鋭さ）', type: 'number', min: 0.6, max: 1.4, step: 0.01, default: 1 },
    { key: 'gain', label: 'gain（細部の集中度）', type: 'number', min: 0.5, max: 4, step: 0.05, default: 2 },
    { key: 'height', label: '高さ', type: 'number', min: 0.5, max: 4, step: 0.05, default: 2.6 },
    { key: 'scale', label: '山脈の広がり（周波数）', type: 'number', min: 0.5, max: 4, step: 0.05, default: 1.5 },
  ],
  distance: 13,
  elevation: 0.7,
  compareLabels: ['通常の fBm', 'ridged multifractal'],
  build(p, env) {
    const n = env.quality === 'low' ? 112 : 160;
    const size = 10;
    const height = Number(p.height);
    const sc = Number(p.scale);
    const oct = Number(p.octaves);
    const noise = makeNoise2(env.seed);
    const cell = size / (n - 1);
    const grass = new THREE.Color(0x4a7a34), rock = new THREE.Color(0x6d655e), snow = new THREE.Color(0xeef1f6), valley = new THREE.Color(0x3a5e2c);
    const make = (h: Float32Array) => {
      normalize(h, 0, 1);
      const s = slopeMap(h, n, cell, height);
      const hf = new Heightfield(n, size);
      hf.setHeights(h, height);
      hf.setColors((k, c) => {
        const t = h[k];
        c.copy(valley).lerp(grass, Math.min(1, t * 3));
        c.lerp(rock, Math.min(1, Math.max(0, (t - 0.35) * 3) + Math.max(0, s[k] - 0.9)));
        if (t > 0.68 && s[k] < 1.6) c.lerp(snow, Math.min(1, (t - 0.68) * 6));
        return c;
      });
      return hf.mesh;
    };
    const object = make(gridFrom(n, (u, v) => ridged(noise, u * sc, v * sc, oct, Number(p.offset), Number(p.gain))));
    const before = make(gridFrom(n, (u, v) => fbm2(noise, u * sc, v * sc, oct, 2.1, 0.5)));
    return { object, before, info: `${n}×${n} 格子 · ${oct} オクターブ · offset ${Number(p.offset).toFixed(2)} · gain ${Number(p.gain).toFixed(2)}` };
  },
});
