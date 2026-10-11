import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { Markers, basisAll, makeKnots } from '../framework/splineKit';
import { GridSurface, NetLines } from '../framework/surfaceKit';

/** GEO-016 NURBS曲面：u・v 方向の Cox–de Boor 基底のテンソル積で有理和をとる */

const N = 7;
const SIZE = 5;
const C = 3; // 中央の制御点

function restNet(seedWave: number): THREE.Vector3[][] {
  return Array.from({ length: N }, (_, i) => Array.from({ length: N }, (_, j) => {
    const x = (i / (N - 1) - 0.5) * SIZE, z = (j / (N - 1) - 0.5) * SIZE;
    return new THREE.Vector3(x, 0.9 + Math.sin(i * 0.9 + seedWave) * 0.25 + Math.cos(j * 1.1) * 0.2, z);
  }));
}

export default defineGeometryDemo({
  id: 'GEO-016',
  notes: 'クランプしたノットで u・v 方向それぞれに Cox–de Boor 基底を前計算し、S=ΣΣN_i N_j w_ij P_ij / ΣΣN_i N_j w_ij を独自に評価する。中央の制御点（黄色）の重みと高さを変えると、その点の有理基底が非零の (p+1)×(p+1) 区間だけが変形し、面の色はその有理基底の値（影響の強さ）を表す。比較表示では同じ網の非有理版（重みすべて1）を左に並べる。',
  params: [
    { key: 'degree', label: '次数 p（u・v 共通）', type: 'number', min: 1, max: 4, step: 1, default: 3 },
    { key: 'weight', label: '中央の重み', type: 'number', min: 0.05, max: 12, step: 0.05, default: 4 },
    { key: 'height', label: '中央の高さ', type: 'number', min: -2, max: 3.5, step: 0.05, default: 2.4 },
    { key: 'div', label: '分割数', type: 'number', min: 8, max: 96, step: 1, default: 48 },
    { key: 'animate', label: '重みを自動で往復', type: 'bool', default: false },
    { key: 'showNet', label: '制御網の表示', type: 'bool', default: true },
  ],
  liveKeys: ['weight', 'height', 'animate', 'showNet'],
  distance: 10,
  elevation: 0.6,
  target: [0, 1, 0],
  compareLabels: ['非有理（重み1）', 'NURBS（中央の重み）'],
  build(p, env) {
    const deg = Math.round(Number(p.degree));
    const div = Math.max(8, Math.round(Number(p.div)) >> (env.quality === 'low' ? 1 : 0));
    const knots = makeKnots(N, deg, 'clamped');
    const table: number[][] = [];
    for (let a = 0; a <= div; a++) table.push(basisAll(N, deg, a / div, knots, []));
    const P = restNet(0.4);
    const W = Array.from({ length: N }, () => new Array(N).fill(1));
    const evalAt = (a: number, b: number, w: number[][], out: THREE.Vector3): number => {
      out.set(0, 0, 0);
      let s = 0, rc = 0;
      const nu = table[a], nv = table[b];
      for (let i = 0; i < N; i++) {
        if (nu[i] === 0) continue;
        for (let j = 0; j < N; j++) {
          const f = nu[i] * nv[j] * w[i][j];
          if (f === 0) continue;
          out.addScaledVector(P[i][j], f);
          s += f;
          if (i === C && j === C) rc = f;
        }
      }
      out.multiplyScalar(1 / s);
      return rc / s;
    };
    const surf = new GridSurface(div, div);
    const influence = new Float32Array((div + 1) * (div + 1));
    const low = new THREE.Color(0x2f5fb8), high = new THREE.Color(0xffd23d);
    const mesh = new THREE.Mesh(surf.geo, std(0xffffff, { side: THREE.DoubleSide, vertexColors: true, roughness: 0.4 }));
    const apply = () => {
      surf.update((u, v, out) => {
        const a = Math.round(u * div), b = Math.round(v * div);
        influence[b * (div + 1) + a] = evalAt(a, b, W, out);
        return out;
      });
      surf.colorize((_u, _v, c, k) => c.copy(low).lerp(high, Math.min(1, influence[k] * 1.6)));
    };

    const helpers = new THREE.Group();
    const net = new NetLines(N, N, 0x9aa4d0, 0.7);
    const marks = new Markers(N * N, 0.07);
    helpers.add(net.lines, marks.mesh);

    // 比較：非有理（重み1）
    const ones = Array.from({ length: N }, () => new Array(N).fill(1));
    const plain = new GridSurface(div, div);
    const before = new THREE.Mesh(plain.geo, std(0x8890b0, { side: THREE.DoubleSide }));

    let wNow = NaN, hNow = NaN;
    const set = (w: number, h: number, showNet: boolean) => {
      net.lines.visible = marks.mesh.visible = showNet;
      if (w === wNow && h === hNow) return;
      wNow = w;
      hNow = h;
      W[C][C] = w;
      P[C][C].y = h;
      apply();
      plain.update((u, v, out) => {
        evalAt(Math.round(u * div), Math.round(v * div), ones, out);
        return out;
      });
      net.set(P);
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
        const c = i === C && j === C;
        marks.set(i * N + j, P[i][j], c ? 0xffd23d : 0xb0b8d8, c ? 0.8 + Math.sqrt(w) * 0.5 : 1);
      }
      marks.commit(N * N);
    };
    set(Number(p.weight), Number(p.height), Boolean(p.showNet));
    const lo = knots[C], hi = knots[C + deg + 1];
    return {
      object: mesh,
      before,
      helpers,
      info: () => `次数 ${deg} · 制御点 ${N}×${N} · 中央の重み ${wNow.toFixed(2)} 高さ ${hNow.toFixed(2)} · 影響範囲 u,v∈[${lo.toFixed(2)}, ${hi.toFixed(2)}] · 分割 ${div}×${div}`,
      update(_dt, time, live) {
        const w = live.animate ? Math.exp(Math.sin(time * 0.9) * 2.3) : Number(live.weight);
        set(w, Number(live.height), Boolean(live.showNet));
      },
    };
  },
});
