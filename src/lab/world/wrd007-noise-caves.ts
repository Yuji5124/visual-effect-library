import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2, makeNoise3 } from '../framework/random';
import { segments } from '../framework/worldKit';
import { fbm3 } from '../framework/terrainKit';

/** WRD-007 3Dノイズ洞窟：密度場 f>0 を岩とし、Naive Surface Nets で f=0 の等値面を作る */

type Field = (x: number, y: number, z: number) => number;

/**
 * Naive Surface Nets：符号が変わるセルごとに1頂点（辺の交点の平均）を置き、
 * 符号が変わる格子辺ごとに周囲4セルの頂点で四角形を張る。
 */
function surfaceNets(f: Float32Array, nx: number, ny: number, nz: number, origin: THREE.Vector3, h: number) {
  const idx = (i: number, j: number, k: number) => (k * ny + j) * nx + i;
  const cellVert = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const cidx = (i: number, j: number, k: number) => (k * (ny - 1) + j) * (nx - 1) + i;
  const pos: number[] = [];
  const corner = new Float32Array(8);
  const EDGES = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const v = f[idx(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))];
          corner[c] = v;
          if (v > 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [a, b] of EDGES) {
          const va = corner[a], vb = corner[b];
          if (va > 0 === vb > 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + ((b & 1) - (a & 1)) * t;
          sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
          sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
          cnt++;
        }
        cellVert[cidx(i, j, k)] = pos.length / 3;
        pos.push(origin.x + (i + sx / cnt) * h, origin.y + (j + sy / cnt) * h, origin.z + (k + sz / cnt) * h);
      }
    }
  }
  const index: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) index.push(a, c, b, a, d, c);
    else index.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz - 1; k++) {
    for (let j = 1; j < ny - 1; j++) {
      for (let i = 1; i < nx - 1; i++) {
        const s = f[idx(i, j, k)] > 0;
        // x 方向の辺（y→z の順で +x 向き）
        if (s !== f[idx(i + 1, j, k)] > 0) quad(cellVert[cidx(i, j - 1, k - 1)], cellVert[cidx(i, j, k - 1)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j - 1, k)], !s);
        if (s !== f[idx(i, j + 1, k)] > 0) quad(cellVert[cidx(i - 1, j, k - 1)], cellVert[cidx(i - 1, j, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i, j, k - 1)], !s);
        if (s !== f[idx(i, j, k + 1)] > 0) quad(cellVert[cidx(i - 1, j - 1, k)], cellVert[cidx(i, j - 1, k)], cellVert[cidx(i, j, k)], cellVert[cidx(i - 1, j, k)], !s);
      }
    }
  }
  return { pos, index };
}

export default defineWorldDemo({
  id: 'WRD-007',
  notes: '密度 f = min(地表の高さ−y, (3D値ノイズの fBm − 閾値)×k, 断面までの距離) を格子に評価し、f>0 を岩とする。Naive Surface Nets（符号が変わるセルに辺の交点の平均で頂点を置き、符号が変わる辺ごとに四角形を張る）で等値面を作る。断面位置を動かすと岩塊が切り落とされ、橙色の断面に内部の通路が現れる。',
  params: [
    { key: 'cavity', label: '空洞率', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'scale', label: 'ノイズのスケール', type: 'number', min: 0.5, max: 4, step: 0.05, default: 1.6 },
    { key: 'cut', label: '断面位置（1=切らない）', type: 'number', min: 0.15, max: 1, step: 0.01, default: 0.55 },
    { key: 'res', label: '解像度', type: 'number', min: 24, max: 64, step: 4, default: 48 },
  ],
  distance: 14,
  elevation: 0.55,
  target: [0, 0.6, 0],
  compareLabels: ['洞窟なし（地面のみ）', '3Dノイズ洞窟'],
  build(p, env) {
    const R = env.quality === 'low' ? Math.min(36, Number(p.res)) : Number(p.res);
    const W = 8, Hh = 4.4;
    const h = W / R;
    const nx = R + 3, nz = R + 3, ny = Math.round(Hh / h) + 3;
    // 外周に1セル余白をとり、外側を必ず空気にして閉じた面にする
    const origin = new THREE.Vector3(-W / 2 - h, -1 - h, -W / 2 - h);
    const n2 = makeNoise2(env.seed);
    const n3 = makeNoise3(env.seed);
    const sc = Number(p.scale) / 4;
    const thr = 0.36 + 0.22 * Number(p.cavity);
    const cutX = -W / 2 + Number(p.cut) * W;
    const ground = (x: number, z: number) => -1 + Hh * 0.78 + fbm2(n2, x * 0.18 + 3, z * 0.18 + 5, 4, 2, 0.5) * 1.1;
    // 地表近くと底は岩を足して天井と岩盤を残す
    const cave = (x: number, y: number, z: number) => (fbm3(n3, x * sc + 10, y * sc * 1.4 + 10, z * sc + 10, 3, 2, 0.5) - thr) * 8 + Math.max(0, 0.9 - (ground(x, z) - y)) * 2.5 + Math.max(0, 0.5 - (y + 1)) * 4;
    const box = (x: number, y: number, z: number) => Math.min(x + W / 2, W / 2 - x, z + W / 2, W / 2 - z, y + 1, Hh - 1 - y) / h;

    const sample = (field: Field) => {
      const f = new Float32Array(nx * ny * nz);
      let rock = 0, solid = 0;
      for (let k = 0; k < nz; k++) {
        for (let j = 0; j < ny; j++) {
          for (let i = 0; i < nx; i++) {
            const x = origin.x + i * h, y = origin.y + j * h, z = origin.z + k * h;
            const v = Math.min(field(x, y, z), box(x, y, z) * h);
            f[(k * ny + j) * nx + i] = v;
            if (v > 0) rock++;
          }
        }
      }
      solid = rock;
      return { f, solid };
    };
    const colorize = (pos: number[], useCave: boolean) => {
      const col = new Float32Array(pos.length);
      const c = new THREE.Color();
      const deep = new THREE.Color(0x5a4636), shallow = new THREE.Color(0x8a7458), grass = new THREE.Color(0x4f7d35), cutCol = new THREE.Color(0xe08a3c), caveCol = new THREE.Color(0x8fa0b8);
      for (let v = 0; v < pos.length; v += 3) {
        const x = pos[v], y = pos[v + 1], z = pos[v + 2];
        const g = ground(x, z) - y;
        const cv = useCave ? cave(x, y, z) : Infinity;
        const ct = cutX - x;
        const bx = box(x, y, z) * h;
        const m = Math.min(g, cv, ct, bx);
        if (m === bx && bx < h * 0.8) c.copy(shallow).lerp(deep, Math.min(1, (2.6 - y) * 0.3)).multiplyScalar(0.85 + 0.15 * Math.sin(y * 9));
        else if (m === ct && ct < h * 0.8) c.copy(cutCol).lerp(deep, Math.min(0.5, (Hh - y) * 0.06));
        else if (m === g && g < h) c.copy(grass);
        else if (m === cv) c.copy(caveCol).lerp(deep, Math.min(0.7, (2 - y) * 0.2));
        else c.copy(shallow).lerp(deep, Math.min(1, (2 - y) * 0.3));
        col[v] = c.r;
        col[v + 1] = c.g;
        col[v + 2] = c.b;
      }
      return col;
    };
    const mesh = (field: Field, useCave: boolean) => {
      const { f, solid } = sample(field);
      const { pos, index } = surfaceNets(f, nx, ny, nz, origin, h);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(colorize(pos, useCave), 3));
      geo.setIndex(index);
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }));
      return { m, solid };
    };
    const after = mesh((x, y, z) => Math.min(ground(x, z) - y, cave(x, y, z), cutX - x), true);
    const before = mesh((x, y, z) => Math.min(ground(x, z) - y, cutX - x), false);
    const air = 1 - after.solid / Math.max(1, before.solid);
    // 断面の枠（補助線）
    const y0 = -1, y1 = Hh - 0.6;
    const helpers = Number(p.cut) < 1 ? segments([cutX, y0, -W / 2, cutX, y1, -W / 2, cutX, y1, -W / 2, cutX, y1, W / 2, cutX, y1, W / 2, cutX, y0, W / 2, cutX, y0, W / 2, cutX, y0, -W / 2], 0xffb070, { opacity: 0.8 }) : undefined;
    return {
      object: after.m,
      before: before.m,
      helpers,
      info: `格子 ${nx}×${ny}×${nz} · 地中の空洞率 ${(air * 100).toFixed(0)}% · 等値面の三角形 ${(after.m.geometry.index!.count / 3).toLocaleString()}`,
    };
  },
});
