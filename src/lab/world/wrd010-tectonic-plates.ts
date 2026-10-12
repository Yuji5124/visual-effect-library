import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { Heightfield, N4, segments, terrainColor } from '../framework/worldKit';
import { waterPlane } from '../framework/terrainKit';

/** WRD-010 プレート境界：ボロノイでプレートを作り、境界の収束度で隆起・沈降させる */

interface Plate {
  x: number;
  y: number;
  vx: number;
  vy: number;
  continental: boolean;
  hue: number;
}

export default defineWorldDemo({
  id: 'WRD-010',
  notes: 'ジッター格子の種点でボロノイ分割（少し歪めた距離）してプレートを作り、各プレートに速度と大陸/海洋の種類を与える。境界セルで相対速度の境界法線成分（収束度）を求め、境界からの距離で減衰させて、大陸どうしの衝突は山脈、海洋→大陸は海溝と火山帯、離れる海洋境界は海嶺、離れる大陸は地溝にする。表示を「プレート」にすると色分けと境界（赤=収束、青=発散）、矢印で速度を示す。',
  params: [
    { key: 'plates', label: 'プレート数', type: 'number', min: 3, max: 30, step: 1, default: 12 },
    { key: 'continent', label: '大陸の割合', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'mountain', label: '山脈の高さ', type: 'number', min: 0, max: 2, step: 0.05, default: 1 },
    { key: 'width', label: '山脈の幅（セル）', type: 'number', min: 2, max: 16, step: 1, default: 6 },
    { key: 'view', label: '表示', type: 'select', options: [{ value: 'terrain', label: '地形' }, { value: 'plates', label: 'プレート' }], default: 'terrain' },
  ],
  distance: 13,
  elevation: 0.85,
  compareLabels: ['境界効果なし（基準高さ）', 'プレート境界で変形'],
  build(p, env) {
    const n = env.quality === 'low' ? 96 : 128;
    const size = 10;
    const rng = env.rng;
    const P = Number(p.plates);
    const g = Math.ceil(Math.sqrt(P));
    const cand: [number, number][] = [];
    for (let j = 0; j < g; j++) for (let i = 0; i < g; i++) cand.push([(i + 0.15 + rng() * 0.7) / g, (j + 0.15 + rng() * 0.7) / g]);
    for (let i = cand.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cand[i], cand[j]] = [cand[j], cand[i]];
    }
    const plates: Plate[] = cand.slice(0, P).map(([x, y], i) => {
      const a = rng() * Math.PI * 2, s = 0.4 + rng() * 0.6;
      return { x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, continental: rng() < Number(p.continent), hue: (i * 0.618) % 1 };
    });
    // ボロノイ（座標をノイズで歪めて境界を自然に）
    const warp = makeNoise2(env.seed + 5);
    const owner = new Int16Array(n * n);
    for (let j = 0; j < n; j++) {
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), v = j / (n - 1);
        const wu = u + fbm2(warp, u * 4, v * 4, 3, 2, 0.5) * 0.06, wv = v + fbm2(warp, u * 4 + 7, v * 4 + 3, 3, 2, 0.5) * 0.06;
        let best = Infinity, bi = 0;
        for (let q = 0; q < P; q++) {
          const d = (plates[q].x - wu) ** 2 + (plates[q].y - wv) ** 2;
          if (d < best) (best = d), (bi = q);
        }
        owner[j * n + i] = bi;
      }
    }
    // 境界セルの収束度 = (v_a − v_b)·n̂（n̂ は a の種点から b の種点へ）
    const stress = new Float32Array(n * n);
    const other = new Int16Array(n * n).fill(-1);
    const dist = new Int32Array(n * n).fill(-1);
    const queue: number[] = [];
    for (let k = 0; k < n * n; k++) {
      const i = k % n, j = (k / n) | 0, a = owner[k];
      let sum = 0, cnt = 0, ob = -1;
      for (const [dx, dz] of N4) {
        const x = i + dx, z = j + dz;
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        const b = owner[z * n + x];
        if (b === a) continue;
        const A = plates[a], B = plates[b];
        let nx = B.x - A.x, ny = B.y - A.y;
        const L = Math.hypot(nx, ny) || 1;
        nx /= L;
        ny /= L;
        sum += (A.vx - B.vx) * nx + (A.vy - B.vy) * ny;
        cnt++;
        ob = b;
      }
      if (cnt) {
        stress[k] = sum / cnt;
        other[k] = ob;
        dist[k] = 0;
        queue.push(k);
      }
    }
    // 境界からの距離（幅優先）と、最寄り境界の収束度・相手プレートを伝える
    for (let h = 0; h < queue.length; h++) {
      const k = queue[h];
      const i = k % n, j = (k / n) | 0;
      for (const [dx, dz] of N4) {
        const x = i + dx, z = j + dz;
        if (x < 0 || z < 0 || x >= n || z >= n) continue;
        const q = z * n + x;
        if (dist[q] >= 0 || owner[q] !== owner[k]) continue;
        dist[q] = dist[k] + 1;
        stress[q] = stress[k];
        other[q] = other[k];
        queue.push(q);
      }
    }
    const mh = Number(p.mountain), w = Number(p.width);
    const detail = makeNoise2(env.seed + 9);
    const base = new Float32Array(n * n), hgt = new Float32Array(n * n);
    let conv = 0, div = 0;
    for (let k = 0; k < n * n; k++) {
      const i = k % n, j = (k / n) | 0;
      const A = plates[owner[k]];
      const nz = fbm2(detail, (i / n) * 6, (j / n) * 6, 4, 2, 0.5) * 0.12;
      base[k] = (A.continental ? 0.22 : -0.42) + nz;
      let e = 0;
      if (other[k] >= 0 && dist[k] >= 0) {
        const B = plates[other[k]];
        const s = stress[k];
        const d = dist[k];
        const fall = Math.exp(-d / w);
        if (d === 0) s > 0 ? conv++ : div++;
        if (s > 0) {
          if (A.continental && B.continental) e = mh * s * fall;
          else if (A.continental) e = mh * 0.8 * s * Math.exp(-Math.abs(d - w * 0.4) / w);
          else if (B.continental) e = -0.5 * s * Math.exp(-d / (w * 0.4));
          else e = 0.55 * mh * s * fall;
        } else {
          const a = -s;
          e = A.continental ? -0.35 * a * Math.exp(-d / (w * 0.5)) : 0.3 * a * fall;
        }
      }
      hgt[k] = base[k] + e;
    }

    const mode = String(p.view);
    const plateColor = (k: number, c: THREE.Color) => {
      const A = plates[owner[k]];
      c.setHSL(A.hue, A.continental ? 0.45 : 0.55, A.continental ? 0.55 : 0.32);
      if (dist[k] === 0) c.set(stress[k] > 0 ? 0xff4a3a : 0x3aa0ff);
      return c;
    };
    const make = (h: Float32Array) => {
      const grp = new THREE.Group();
      const hf = new Heightfield(n, size);
      const scale = 1.6;
      hf.setHeights(mode === 'terrain' ? h.map((x) => (x < 0 ? x * 0.4 : x)) : h, scale);
      hf.setColors((k, c) => (mode === 'terrain' ? terrainColor(h[k] * 1.2, 0, c) : plateColor(k, c)));
      grp.add(hf.mesh);
      if (mode === 'terrain') grp.add(waterPlane(size, 0.005));
      return grp;
    };
    // 速度ベクトル（種点から）
    const arrows: number[] = [];
    for (const A of plates) {
      const x = (A.x - 0.5) * size, z = (A.y - 0.5) * size, y = 1.6;
      const ex = x + A.vx * 1.2, ez = z + A.vy * 1.2;
      const hx = -A.vx * 0.3, hz = -A.vy * 0.3;
      arrows.push(x, y, z, ex, y, ez, ex, y, ez, ex + hx - hz * 0.6, y, ez + hz + hx * 0.6, ex, y, ez, ex + hx + hz * 0.6, y, ez + hz - hx * 0.6);
    }
    const helpers = new THREE.Group();
    helpers.add(segments(arrows, 0xffffff));
    const ncont = plates.filter((a) => a.continental).length;
    return {
      object: make(hgt),
      before: make(base),
      helpers,
      info: `プレート ${P}（大陸 ${ncont} / 海洋 ${P - ncont}） · 境界セル 収束 ${conv} / 発散 ${div}`,
    };
  },
});
