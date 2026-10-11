import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { makeNoise3 } from '../framework/random';
import { deformable, lineSegs, dots } from '../framework/deformKit';

/** GEO-024 FFD：格子点をバーンスタイン基底の三重積で重み付けする3次元ベジェ体 */

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** n 次バーンスタイン基底を全部まとめて計算 */
function bernstein(n: number, t: number, out: Float32Array, off: number): void {
  for (let i = 0; i <= n; i++) out[off + i] = binom(n, i) * t ** i * (1 - t) ** (n - i);
}

function baseGeometry(shape: string, low: boolean): THREE.BufferGeometry {
  if (shape === 'sphere') return new THREE.SphereGeometry(1.4, low ? 48 : 96, low ? 32 : 64);
  if (shape === 'box') return new THREE.BoxGeometry(2.2, 2.2, 2.2, low ? 12 : 24, low ? 12 : 24, low ? 12 : 24);
  return new THREE.TorusKnotGeometry(1, 0.32, low ? 160 : 320, low ? 16 : 32);
}

export default defineGeometryDemo({
  id: 'GEO-024',
  notes: '物体の外接箱を (s,t,u)∈[0,1]³ に対応させ、l×m×n の格子点 P_ijk をノイズで動かし、各頂点を Σ B_i(s)B_j(t)B_k(u)P_ijk（バーンスタイン基底の三重積）で写す。基底は頂点ごとに一度だけ前計算し、格子が動くたびに重み付き和だけを取り直す。',
  params: [
    { key: 'shape', label: '元の形', type: 'select', options: [{ value: 'knot', label: 'トーラス結び目' }, { value: 'sphere', label: '球' }, { value: 'box', label: '立方体' }], default: 'knot' },
    { key: 'nx', label: '格子の分割（x 方向の点数）', type: 'number', min: 2, max: 5, step: 1, default: 4 },
    { key: 'ny', label: '格子の分割（y 方向の点数）', type: 'number', min: 2, max: 5, step: 1, default: 4 },
    { key: 'nz', label: '格子の分割（z 方向の点数）', type: 'number', min: 2, max: 5, step: 1, default: 3 },
    { key: 'strength', label: '変形の強さ', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.7 },
    { key: 'seed', label: '格子を動かすノイズのシード', type: 'number', min: 1, max: 999, step: 1, default: 3 },
    { key: 'showLattice', label: '格子の表示', type: 'bool', default: true },
    { key: 'animate', label: '格子点を揺らす', type: 'bool', default: true },
  ],
  liveKeys: ['strength', 'showLattice', 'animate'],
  distance: 9,
  compareLabels: ['元の形', 'FFD'],
  build(p, env) {
    const src = baseGeometry(String(p.shape), env.quality === 'low');
    src.computeBoundingBox();
    const box = src.boundingBox!.clone().expandByScalar(0.15);
    const size = box.getSize(new THREE.Vector3());
    const d = deformable(src);
    const mesh = new THREE.Mesh(d.geo, std(0xc08bff, { side: THREE.DoubleSide }));
    const before = new THREE.Mesh(src, std(0x8890b0));
    const L = Number(p.nx), M = Number(p.ny), N = Number(p.nz);
    const count = d.orig.length / 3;
    // 頂点ごとの基底値を前計算（x: L 個, y: M 個, z: N 個）
    const bx = new Float32Array(count * L), by = new Float32Array(count * M), bz = new Float32Array(count * N);
    for (let i = 0; i < count; i++) {
      bernstein(L - 1, (d.orig[i * 3] - box.min.x) / size.x, bx, i * L);
      bernstein(M - 1, (d.orig[i * 3 + 1] - box.min.y) / size.y, by, i * M);
      bernstein(N - 1, (d.orig[i * 3 + 2] - box.min.z) / size.z, bz, i * N);
    }
    const rest = new Float32Array(L * M * N * 3);
    const ctrl = new Float32Array(L * M * N * 3);
    const at = (i: number, j: number, k: number) => ((i * M + j) * N + k) * 3;
    for (let i = 0; i < L; i++)
      for (let j = 0; j < M; j++)
        for (let k = 0; k < N; k++) {
          const o = at(i, j, k);
          rest[o] = box.min.x + (size.x * i) / (L - 1);
          rest[o + 1] = box.min.y + (size.y * j) / (M - 1);
          rest[o + 2] = box.min.z + (size.z * k) / (N - 1);
        }
    const noise = makeNoise3(env.seed);
    // 格子の補助線（各軸方向に隣接点を結ぶ）
    const edges: [number, number][] = [];
    for (let i = 0; i < L; i++)
      for (let j = 0; j < M; j++)
        for (let k = 0; k < N; k++) {
          if (i + 1 < L) edges.push([at(i, j, k), at(i + 1, j, k)]);
          if (j + 1 < M) edges.push([at(i, j, k), at(i, j + 1, k)]);
          if (k + 1 < N) edges.push([at(i, j, k), at(i, j, k + 1)]);
        }
    const lattice = lineSegs(new Array(edges.length * 6).fill(0), 0xffb84d, 0.8);
    const points = dots(Array.from(ctrl), 0xffe08a, 0.14);
    const helpers = new THREE.Group();
    helpers.add(lattice, points);

    const tmpX = new Float32Array(L * M * N), tmpY = new Float32Array(L * M * N), tmpZ = new Float32Array(L * M * N);
    let lastKey = '';
    const apply = (amp: number, phase: number) => {
      for (let c = 0; c < L * M * N; c++) {
        const o = c * 3;
        const x = rest[o] * 0.9, y = rest[o + 1] * 0.9, z = rest[o + 2] * 0.9;
        ctrl[o] = rest[o] + amp * noise(x + phase, y, z);
        ctrl[o + 1] = rest[o + 1] + amp * noise(x + 17.3, y + phase, z);
        ctrl[o + 2] = rest[o + 2] + amp * noise(x, y + 31.7, z + phase);
        tmpX[c] = ctrl[o];
        tmpY[c] = ctrl[o + 1];
        tmpZ[c] = ctrl[o + 2];
      }
      d.apply((_x, _y, _z, out, v) => {
        let X = 0, Y = 0, Z = 0;
        for (let i = 0; i < L; i++) {
          const wi = bx[v * L + i];
          for (let j = 0; j < M; j++) {
            const wij = wi * by[v * M + j];
            const base = (i * M + j) * N;
            for (let k = 0; k < N; k++) {
              const w = wij * bz[v * N + k];
              X += w * tmpX[base + k];
              Y += w * tmpY[base + k];
              Z += w * tmpZ[base + k];
            }
          }
        }
        out.set(X, Y, Z);
      });
      const lp = lattice.geometry.attributes.position.array as Float32Array;
      edges.forEach(([a, b], e) => {
        lp.set(ctrl.subarray(a, a + 3), e * 6);
        lp.set(ctrl.subarray(b, b + 3), e * 6 + 3);
      });
      lattice.geometry.attributes.position.needsUpdate = true;
      lattice.geometry.computeBoundingSphere();
      (points.geometry.attributes.position.array as Float32Array).set(ctrl);
      points.geometry.attributes.position.needsUpdate = true;
      points.geometry.computeBoundingSphere();
    };
    apply(Number(p.strength), 0);
    let acc = 0;
    let phase = 0;
    return {
      object: mesh,
      before,
      helpers,
      info: () => `格子 ${L}×${M}×${N}（${L * M * N} 点, 次数 ${L - 1}/${M - 1}/${N - 1}）`,
      update(dt, _time, live) {
        helpers.visible = Boolean(live.showLattice);
        if (live.animate) {
          phase += dt * 0.5;
          acc += dt;
        }
        // 毎フレーム全頂点を写し直すと重いので、揺らす場合は約30Hzで更新する
        const key = `${live.strength}|${phase.toFixed(3)}`;
        if (key !== lastKey && (!live.animate || acc >= 1 / 30)) {
          acc = 0;
          lastKey = key;
          apply(Number(live.strength), phase);
        }
      },
    };
  },
});
