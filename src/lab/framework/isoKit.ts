import * as THREE from 'three';

/** 立方格子上のスカラー場（n×n×n の標本、[-h, h]^3 を覆う） */
export interface ScalarGrid {
  n: number;
  half: number;
  step: number;
  data: Float32Array;
}

/** 関数 f(x,y,z) を n^3 の格子点で標本化する（x が最も速く変わる順） */
export function sampleGrid(f: (x: number, y: number, z: number) => number, n: number, half: number): ScalarGrid {
  const data = new Float32Array(n * n * n);
  const step = (2 * half) / (n - 1);
  let i = 0;
  for (let z = 0; z < n; z++) {
    const pz = -half + z * step;
    for (let y = 0; y < n; y++) {
      const py = -half + y * step;
      for (let x = 0; x < n; x++) data[i++] = f(-half + x * step, py, pz);
    }
  }
  return { n, half, step, data };
}

/**
 * Naive Surface Nets：符号が変わるセルごとに辺交点の平均位置へ1頂点を置き、
 * 符号の変わる格子辺を囲む4セルの頂点を四角形（三角形2枚）で結ぶ。値 < iso を内側とみなす。
 */
export function surfaceNets(grid: ScalarGrid, iso = 0): THREE.BufferGeometry {
  const { n, half, step, data } = grid;
  const c = n - 1;
  const cellIndex = new Int32Array(c * c * c).fill(-1);
  const pos: number[] = [];
  const idx: number[] = [];
  const at = (x: number, y: number, z: number) => data[x + n * (y + n * z)] - iso;
  // 立方体の12辺（頂点番号 bit0=x, bit1=y, bit2=z）
  const edges = [
    [0, 1], [2, 3], [4, 5], [6, 7],
    [0, 2], [1, 3], [4, 6], [5, 7],
    [0, 4], [1, 5], [2, 6], [3, 7],
  ];
  const v = new Float32Array(8);
  for (let z = 0; z < c; z++) {
    for (let y = 0; y < c; y++) {
      for (let x = 0; x < c; x++) {
        let mask = 0;
        for (let k = 0; k < 8; k++) {
          v[k] = at(x + (k & 1), y + ((k >> 1) & 1), z + ((k >> 2) & 1));
          if (v[k] < 0) mask |= 1 << k;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, cnt = 0;
        for (const [a, b] of edges) {
          const va = v[a], vb = v[b];
          if (va < 0 === vb < 0) continue;
          const t = va / (va - vb);
          sx += (a & 1) + t * ((b & 1) - (a & 1));
          sy += ((a >> 1) & 1) + t * (((b >> 1) & 1) - ((a >> 1) & 1));
          sz += ((a >> 2) & 1) + t * (((b >> 2) & 1) - ((a >> 2) & 1));
          cnt++;
        }
        cellIndex[x + c * (y + c * z)] = pos.length / 3;
        pos.push(-half + (x + sx / cnt) * step, -half + (y + sy / cnt) * step, -half + (z + sz / cnt) * step);
      }
    }
  }
  const cell = (x: number, y: number, z: number) => cellIndex[x + c * (y + c * z)];
  const quad = (a: number, b: number, cc: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || cc < 0 || d < 0) return;
    // 内側（負）から外側へ向く法線になるよう巻き順を選ぶ
    if (flip) idx.push(a, b, cc, a, cc, d);
    else idx.push(a, cc, b, a, d, cc);
  };
  // 各格子辺（3軸）について、両端の符号が違えば周囲4セルで面を張る
  for (let z = 1; z < n - 1; z++) {
    for (let y = 1; y < n - 1; y++) {
      for (let x = 0; x < c; x++) {
        const a = at(x, y, z) < 0, b = at(x + 1, y, z) < 0;
        if (a === b) continue;
        quad(cell(x, y - 1, z - 1), cell(x, y, z - 1), cell(x, y, z), cell(x, y - 1, z), a);
      }
    }
  }
  for (let z = 1; z < n - 1; z++) {
    for (let y = 0; y < c; y++) {
      for (let x = 1; x < n - 1; x++) {
        const a = at(x, y, z) < 0, b = at(x, y + 1, z) < 0;
        if (a === b) continue;
        quad(cell(x - 1, y, z - 1), cell(x - 1, y, z), cell(x, y, z), cell(x, y, z - 1), a);
      }
    }
  }
  for (let z = 0; z < c; z++) {
    for (let y = 1; y < n - 1; y++) {
      for (let x = 1; x < n - 1; x++) {
        const a = at(x, y, z) < 0, b = at(x, y, z + 1) < 0;
        if (a === b) continue;
        quad(cell(x - 1, y - 1, z), cell(x, y - 1, z), cell(x, y, z), cell(x - 1, y, z), a);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  geo.computeVertexNormals();
  return geo;
}
