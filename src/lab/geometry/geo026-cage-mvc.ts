import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { deformable, lineSegs, dots } from '../framework/deformKit';

/** GEO-026 ケージ変形：xz 平面の多角形ケージに対する平均値座標（Floater 2003） */

const H0 = -0.9, H1 = 0.9;

function baseGeometry(low: boolean): THREE.BufferGeometry {
  // 上から見て形の分かる物体：寝かせたトーラス結び目と中央の柱
  const knot = new THREE.TorusKnotGeometry(1.1, 0.28, low ? 160 : 300, low ? 12 : 20, 2, 5);
  knot.rotateX(Math.PI / 2);
  knot.scale(1, 0.8, 1);
  const col = new THREE.CylinderGeometry(0.35, 0.35, 1.6, 32, 12);
  return mergeGeometries([knot.toNonIndexed(), col.toNonIndexed()])!;
}

/** 点 (x,z) の平均値座標。凸・凹どちらのケージでも内部で定義される */
function meanValue(x: number, z: number, cx: number[], cz: number[], out: Float32Array, off: number): void {
  const n = cx.length;
  const dx: number[] = [], dz: number[] = [], r: number[] = [];
  for (let i = 0; i < n; i++) {
    dx.push(cx[i] - x);
    dz.push(cz[i] - z);
    r.push(Math.hypot(dx[i], dz[i]));
    if (r[i] < 1e-9) {
      for (let j = 0; j < n; j++) out[off + j] = j === i ? 1 : 0;
      return;
    }
  }
  // tan(α_i/2) = sinα / (1+cosα) = cross / (r_i r_{i+1} + dot)
  const tanHalf: number[] = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = dx[i] * dz[j] - dz[i] * dx[j];
    const dot = dx[i] * dx[j] + dz[i] * dz[j];
    tanHalf.push(cross / (r[i] * r[j] + dot + 1e-12));
  }
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const w = (tanHalf[(i - 1 + n) % n] + tanHalf[i]) / r[i];
    out[off + i] = w;
    sum += w;
  }
  for (let i = 0; i < n; i++) out[off + i] /= sum;
}

/** ケージ頂点の移動量（パターンごと） */
function cageOffset(pattern: string, i: number, n: number, t: number, amt: number): [number, number] {
  const a = (i / n) * Math.PI * 2;
  if (pattern === 'pull') {
    // 片側の頂点だけ外へ引き出す
    const w = Math.max(0, Math.cos(a)) ** 2;
    return [Math.cos(a) * w * amt * 1.6, Math.sin(a) * w * amt * 0.4];
  }
  if (pattern === 'twist') {
    const s = amt * 0.9;
    return [-Math.sin(a) * s, Math.cos(a) * s];
  }
  // 波：半径方向に交互に出し入れ（時間で位相が回る）
  const r = amt * 0.8 * Math.sin(a * 2 + t);
  return [Math.cos(a) * r, Math.sin(a) * r];
}

export default defineGeometryDemo({
  id: 'GEO-026',
  notes: '物体の全頂点を水平面（xz）へ投影し、n 角形ケージに対する平均値座標 w_i=(tan(α_{i−1}/2)+tan(α_i/2))/r_i（正規化）を一度だけ計算する。以後はケージ頂点（黄色）を動かすたびに Σw_i·c_i で位置を更新し、高さ y はそのまま残す。灰色の線が元のケージ。',
  params: [
    { key: 'amount', label: 'ケージの変形量', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.8 },
    { key: 'cageN', label: 'ケージの頂点数', type: 'number', min: 3, max: 16, step: 1, default: 8 },
    { key: 'pattern', label: '動かし方', type: 'select', options: [{ value: 'wave', label: '半径方向の波' }, { value: 'pull', label: '片側を引き出す' }, { value: 'twist', label: '回転方向にずらす' }], default: 'wave' },
    { key: 'animate', label: 'アニメーション', type: 'bool', default: true },
  ],
  liveKeys: ['amount', 'pattern', 'animate'],
  distance: 9,
  elevation: 0.75,
  compareLabels: ['元の形', 'ケージ変形'],
  build(p, env) {
    const src = baseGeometry(env.quality === 'low');
    const d = deformable(src);
    const mesh = new THREE.Mesh(d.geo, std(0x5ad1c8, { side: THREE.DoubleSide }));
    const before = new THREE.Mesh(src, std(0x8890b0));
    const n = Number(p.cageN);
    // 物体（半径約2）が必ず内側に入るよう、内接円半径を一定にする
    const CAGE_R = 2.15 / Math.cos(Math.PI / n);
    const restX: number[] = [], restZ: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / n;
      restX.push(Math.cos(a) * CAGE_R);
      restZ.push(Math.sin(a) * CAGE_R);
    }
    const count = d.orig.length / 3;
    const W = new Float32Array(count * n);
    for (let v = 0; v < count; v++) meanValue(d.orig[v * 3], d.orig[v * 3 + 2], restX, restZ, W, v * n);
    // 再現性チェック：元のケージで写すと元の位置に戻る（線形精度）
    let err = 0;
    for (let v = 0; v < count; v += 7) {
      let x = 0, z = 0;
      for (let i = 0; i < n; i++) {
        x += W[v * n + i] * restX[i];
        z += W[v * n + i] * restZ[i];
      }
      err = Math.max(err, Math.hypot(x - d.orig[v * 3], z - d.orig[v * 3 + 2]));
    }
    const cagePos = (xs: number[], zs: number[]) => {
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        for (const y of [H0, H1]) out.push(xs[i], y, zs[i], xs[j], y, zs[j]);
        out.push(xs[i], H0, zs[i], xs[i], H1, zs[i]);
      }
      return out;
    };
    const restCage = lineSegs(cagePos(restX, restZ), 0x666a90, 0.6);
    const cage = lineSegs(cagePos(restX, restZ), 0xffd166);
    const handles = dots(new Array(n * 3).fill(0), 0xffe08a, 0.22);
    const helpers = new THREE.Group();
    helpers.add(restCage, cage, handles);
    const cx = restX.slice(), cz = restZ.slice();
    let last = '';
    let t = 0;
    const apply = (amt: number, pattern: string, time: number) => {
      for (let i = 0; i < n; i++) {
        const [ox, oz] = cageOffset(pattern, i, n, time, amt);
        cx[i] = restX[i] + ox;
        cz[i] = restZ[i] + oz;
      }
      d.apply((_x, y, _z, out, v) => {
        let x = 0, z = 0;
        for (let i = 0; i < n; i++) {
          x += W[v * n + i] * cx[i];
          z += W[v * n + i] * cz[i];
        }
        out.set(x, y, z);
      });
      (cage.geometry.attributes.position.array as Float32Array).set(cagePos(cx, cz));
      cage.geometry.attributes.position.needsUpdate = true;
      cage.geometry.computeBoundingSphere();
      const hp = handles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < n; i++) hp.setXYZ(i, cx[i], H1, cz[i]);
      hp.needsUpdate = true;
      handles.geometry.computeBoundingSphere();
    };
    apply(Number(p.amount), String(p.pattern), 0);
    return {
      object: mesh,
      before,
      helpers,
      info: () => `ケージ ${n} 角形 · 重み ${count.toLocaleString()}×${n} · 元ケージでの再現誤差 ${err.toExponential(1)}`,
      update(dt, _time, live) {
        if (live.animate) t += dt * 1.2;
        const amt = live.animate && live.pattern !== 'wave' ? Number(live.amount) * (0.5 - 0.5 * Math.cos(t)) : Number(live.amount);
        const key = `${amt.toFixed(4)}|${live.pattern}|${t.toFixed(4)}`;
        if (key !== last) {
          last = key;
          apply(amt, String(live.pattern), t);
        }
      },
    };
  },
});
