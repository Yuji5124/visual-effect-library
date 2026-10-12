import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { Ticker, segments } from '../framework/worldKit';
import { InstSet } from '../framework/natureKit';

/** WRD-031 波動関数崩壊（単純タイルモデル）：各辺のソケットが一致するタイルだけを隣に置ける */

type Sock = 'G' | 'R' | 'W';
type Kind = 'grass' | 'house' | 'road' | 'river' | 'bridge';
interface Tile { kind: Kind; s: [Sock, Sock, Sock, Sock]; w: number }
/** 辺の向き：0=北(-z) 1=東(+x) 2=南(+z) 3=西(-x) */
const DI = [0, 1, 0, -1], DJ = [-1, 0, 1, 0];

function makeTiles(wRoad: number, wRiver: number, wHouse: number): Tile[] {
  const tiles: Tile[] = [];
  const add = (kind: Kind, base: Sock[], w: number, rots: number) => {
    for (let r = 0; r < rots; r++) {
      const s = [0, 1, 2, 3].map((d) => base[(d - r + 4) % 4]) as [Sock, Sock, Sock, Sock];
      tiles.push({ kind, s, w: w / rots });
    }
  };
  add('grass', ['G', 'G', 'G', 'G'], 1.2, 1);
  add('house', ['G', 'G', 'G', 'G'], wHouse, 1);
  add('road', ['R', 'G', 'R', 'G'], wRoad * 1.2, 2);
  add('road', ['R', 'R', 'G', 'G'], wRoad, 4);
  add('road', ['R', 'R', 'G', 'R'], wRoad * 0.5, 4);
  add('road', ['R', 'R', 'R', 'R'], wRoad * 0.15, 1);
  add('road', ['R', 'G', 'G', 'G'], wRoad * 0.08, 4);
  add('river', ['W', 'G', 'W', 'G'], wRiver * 1.2, 2);
  add('river', ['W', 'W', 'G', 'G'], wRiver, 4);
  add('river', ['W', 'G', 'G', 'G'], wRiver * 0.06, 4);
  add('bridge', ['R', 'W', 'R', 'W'], (wRoad + wRiver) * 0.25, 2);
  return tiles.filter((t) => t.w > 0);
}

const popcount = (x: number) => {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
};

export default defineWorldDemo({
  id: 'WRD-031',
  notes: '草地・家・道（直線/角/T字/十字/行き止まり）・川（直線/角/源流）・橋のタイルを回転込みで定義し、各辺のソケット（草/道/水）が一致する組だけを隣接可とする。全セルが全タイルを候補に持つ状態から、重み付きシャノンエントロピー最小のセルを重み付き乱数で確定し、隣接規則で候補を削る伝播を繰り返す。未確定セルは候補が多いほど明るく高い柱で示し、黄色の枠が直前に確定したセル。矛盾（候補0）が出たら最初からやり直す。',
  params: [
    { key: 'size', label: 'グリッドサイズ', type: 'number', min: 6, max: 32, step: 1, default: 18 },
    { key: 'speed', label: '速度（確定/秒）', type: 'number', min: 2, max: 400, step: 1, default: 40 },
    { key: 'wRoad', label: 'タイルの重み：道', type: 'number', min: 0, max: 3, step: 0.05, default: 1 },
    { key: 'wRiver', label: 'タイルの重み：川', type: 'number', min: 0, max: 3, step: 0.05, default: 0.7 },
    { key: 'wHouse', label: 'タイルの重み：家', type: 'number', min: 0, max: 3, step: 0.05, default: 0.6 },
  ],
  liveKeys: ['speed'],
  distance: 13,
  elevation: 1.0,
  build(p, env) {
    const N = env.quality === 'low' ? Math.min(24, Number(p.size)) : Number(p.size);
    const tiles = makeTiles(Number(p.wRoad), Number(p.wRiver), Number(p.wHouse));
    const T = tiles.length;
    const ALL = T >= 32 ? 0xffffffff : (1 << T) - 1;
    // compat[t*4+d]：タイル t の d 側に置けるタイルの集合
    const compat = new Uint32Array(T * 4);
    for (let t = 0; t < T; t++) {
      for (let d = 0; d < 4; d++) {
        let m = 0;
        for (let u = 0; u < T; u++) if (tiles[t].s[d] === tiles[u].s[(d + 2) % 4]) m |= 1 << u;
        compat[t * 4 + d] = m >>> 0;
      }
    }
    const rng = env.rng;
    const wave = new Uint32Array(N * N);
    const fixed = new Int16Array(N * N);
    let collapsed = 0, restarts = 0, done = false, last = -1;
    const ent = new Float32Array(N * N);
    let entAll = 0;
    const reset = () => {
      wave.fill(ALL);
      ent.fill(entAll);
      fixed.fill(-1);
      collapsed = 0;
      last = -1;
    };
    const entropy = (m: number) => {
      let sw = 0, swl = 0;
      for (let t = 0; t < T; t++) if (m & (1 << t)) { sw += tiles[t].w; swl += tiles[t].w * Math.log(tiles[t].w); }
      return Math.log(sw) - swl / sw;
    };
    entAll = entropy(ALL);
    reset();
    const stack: number[] = [];
    /** 制約伝播。矛盾したら false */
    const propagate = (): boolean => {
      while (stack.length) {
        const k = stack.pop()!;
        const i = k % N, j = (k / N) | 0, m = wave[k];
        for (let d = 0; d < 4; d++) {
          const x = i + DI[d], y = j + DJ[d];
          if (x < 0 || y < 0 || x >= N || y >= N) continue;
          let allowed = 0;
          for (let t = 0; t < T; t++) if (m & (1 << t)) allowed |= compat[t * 4 + d];
          const q = y * N + x;
          const nm = (wave[q] & allowed) >>> 0;
          if (nm === wave[q]) continue;
          if (!nm) return false;
          wave[q] = nm;
          ent[q] = entropy(nm);
          if (popcount(nm) === 1 && fixed[q] < 0) { fixed[q] = 31 - Math.clz32(nm); collapsed++; }
          stack.push(q);
        }
      }
      return true;
    };
    const step = () => {
      // エントロピー最小（同値は乱数で崩す）の未確定セル
      let best = -1, be = Infinity;
      for (let k = 0; k < N * N; k++) {
        if (fixed[k] >= 0) continue;
        const e = ent[k] + rng() * 1e-3;
        if (e < be) { be = e; best = k; }
      }
      if (best < 0) { done = true; return; }
      const m = wave[best];
      let sw = 0;
      for (let t = 0; t < T; t++) if (m & (1 << t)) sw += tiles[t].w;
      let r = rng() * sw, pick = -1;
      for (let t = 0; t < T; t++) {
        if (!(m & (1 << t))) continue;
        pick = t;
        r -= tiles[t].w;
        if (r <= 0) break;
      }
      wave[best] = (1 << pick) >>> 0;
      fixed[best] = pick;
      collapsed++;
      last = best;
      stack.length = 0;
      stack.push(best);
      if (!propagate()) {
        restarts++;
        stack.length = 0;
        reset();
      }
      if (collapsed >= N * N) done = true;
    };

    // 表示
    const size = 10, c = size / N;
    const box = () => {
      const g = new THREE.BoxGeometry(1, 1, 1);
      g.translate(0, 0.5, 0);
      return g;
    };
    const mat = () => new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.02 });
    const slabs = new InstSet(box(), mat(), N * N);
    const arms = new InstSet(box(), mat(), N * N * 6);
    const houses = new InstSet(box(), mat(), N * N);
    const roofGeo = new THREE.ConeGeometry(0.72, 1, 4);
    roofGeo.rotateY(Math.PI / 4);
    roofGeo.translate(0, 0.5, 0);
    const roofs = new InstSet(roofGeo, new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), N * N);
    const object = new THREE.Group();
    object.add(slabs.mesh, arms.mesh, houses.mesh, roofs.mesh);
    const cell = new THREE.Color();
    const X = (i: number) => (i + 0.5) * c - size / 2;
    const BASE = 0.1;
    const draw = () => {
      slabs.reset(); arms.reset(); houses.reset(); roofs.reset();
      const lnT = Math.log(T);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const k = j * N + i, x = X(i), z = X(j);
          const t = fixed[k];
          if (t < 0) {
            const v = Math.log(popcount(wave[k])) / lnT;
            cell.setRGB(0.12 + 0.8 * v, 0.14 + 0.78 * v, 0.24 + 0.7 * v);
            slabs.put(x, 0, z, c * 0.94, 0.06 + v * c * 1.2, c * 0.94, 0, cell);
            continue;
          }
          const tile = tiles[t];
          slabs.put(x, 0, z, c * 0.98, BASE, c * 0.98, 0, tile.kind === 'house' ? 0x6a9a48 : 0x5e9a42);
          if (tile.kind === 'house') {
            const hs = c * 0.5;
            houses.put(x, BASE, z, hs, hs * 0.75, hs, 0, 0xe8dcc0);
            roofs.put(x, BASE + hs * 0.75, z, hs, hs * 0.55, hs, 0, 0xb84a3a);
          }
          let hasR = false, hasW = false;
          for (let d = 0; d < 4; d++) {
            const s = tile.s[d];
            if (s === 'G') continue;
            const w = s === 'R' ? 0.32 : 0.42;
            const len = c * 0.5 + c * w * 0.5;
            const cx = x + DI[d] * c * 0.25 - DI[d] * c * w * 0.25, cz = z + DJ[d] * c * 0.25 - DJ[d] * c * w * 0.25;
            const sx = DI[d] ? len : c * w, sz = DJ[d] ? len : c * w;
            const lift = s === 'R' && tile.kind === 'bridge' ? 0.05 : 0;
            arms.put(cx, BASE + lift, cz, sx, s === 'R' ? 0.02 : 0.012, sz, 0, s === 'R' ? (tile.kind === 'bridge' ? 0x9a6a3a : 0x4a4a52) : 0x3a7ad0);
            if (s === 'R') hasR = true; else hasW = true;
          }
          // 行き止まり・源流は中心に印
          if (hasR && tile.s.filter((s) => s === 'R').length === 1) arms.put(x, BASE, z, c * 0.36, 0.022, c * 0.36, 0, 0x6a6a72);
          if (hasW && tile.s.filter((s) => s === 'W').length === 1) arms.put(x, BASE, z, c * 0.5, 0.014, c * 0.5, 0, 0x5aa0f0);
        }
      }
      slabs.commit(); arms.commit(); houses.commit(); roofs.commit();
      if (last >= 0) {
        marker.visible = true;
        marker.position.set(X(last % N), BASE + 0.05, X((last / N) | 0));
      } else marker.visible = false;
    };
    const h = c * 0.5;
    const marker = segments([-h, 0, -h, h, 0, -h, h, 0, -h, h, 0, h, h, 0, h, -h, 0, h, -h, 0, h, -h, 0, -h], 0xffe14d);
    const helpers = new THREE.Group();
    helpers.add(marker);
    draw();
    const ticker = new Ticker(Number(p.speed));
    return {
      object,
      helpers,
      info: () => {
        let sum = 0;
        for (let k = 0; k < N * N; k++) sum += popcount(wave[k]);
        return `${N}×${N} · タイル ${T} 種（回転込み）· 確定 ${collapsed}/${N * N} · 平均候補数 ${(sum / (N * N)).toFixed(1)} · 矛盾でやり直し ${restarts} 回${done ? ' · 完成' : ''}`;
      },
      update(dt, _t, live) {
        if (done) return;
        ticker.rate = Number(live.speed);
        let k = ticker.steps(dt, 24);
        if (!k) return;
        while (k-- > 0 && !done) step();
        draw();
      },
    };
  },
});
