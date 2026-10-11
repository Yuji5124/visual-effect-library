import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';

/** GEO-047 3次元ヒルベルト曲線：番号 h → 格子座標を Skilling の転置形式のビット演算で求める */
function hilbertPoint(h: number, bits: number): [number, number, number] {
  const n = 3;
  const X = [0, 0, 0];
  // 番号のビットを上位から X[0],X[1],X[2] に順に配る（転置形式）
  for (let j = 0; j < bits * n; j++) {
    const bit = Math.floor(h / Math.pow(2, bits * n - 1 - j)) & 1;
    X[j % n] |= bit << (bits - 1 - Math.floor(j / n));
  }
  const N = 2 << (bits - 1);
  // グレイ符号の復号
  let t = X[n - 1] >> 1;
  for (let i = n - 1; i > 0; i--) X[i] ^= X[i - 1];
  X[0] ^= t;
  // 余分な回転・反転を戻す
  for (let Q = 2; Q !== N; Q <<= 1) {
    const P = Q - 1;
    for (let i = n - 1; i >= 0; i--) {
      if (X[i] & Q) X[0] ^= P;
      else {
        t = (X[0] ^ X[i]) & P;
        X[0] ^= t;
        X[i] ^= t;
      }
    }
  }
  return [X[0], X[1], X[2]];
}

function curve(order: number, size: number): THREE.Vector3[] {
  const side = 1 << order;
  const total = side * side * side;
  const pts: THREE.Vector3[] = [];
  const cell = size / side;
  for (let h = 0; h < total; h++) {
    const [x, y, z] = hilbertPoint(h, order);
    pts.push(new THREE.Vector3((x + 0.5) * cell - size / 2, (y + 0.5) * cell - size / 2, (z + 0.5) * cell - size / 2));
  }
  return pts;
}

/** 折れ線を「区間ごとの円柱＋節点の球」の InstancedMesh にする（番号で色のグラデーション） */
function tube(pts: THREE.Vector3[], radius: number): { group: THREE.Group; seg: THREE.InstancedMesh; joint: THREE.InstancedMesh } {
  const n = pts.length;
  const seg = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, pts.length > 2000 ? 5 : 8, 1, true), new THREE.MeshStandardMaterial({ roughness: 0.4 }), Math.max(1, n - 1));
  const joint = new THREE.InstancedMesh(pts.length > 2000 ? new THREE.IcosahedronGeometry(1, 0) : new THREE.SphereGeometry(1, 10, 6), new THREE.MeshStandardMaterial({ roughness: 0.4 }), n);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), d = new THREE.Vector3(), mid = new THREE.Vector3(), s = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  const c = new THREE.Color();
  for (let i = 0; i < n; i++) {
    c.setHSL(0.75 * (i / Math.max(1, n - 1)), 0.75, 0.55);
    joint.setMatrixAt(i, m.makeScale(radius, radius, radius).setPosition(pts[i]));
    joint.setColorAt(i, c);
    if (i < n - 1) {
      d.subVectors(pts[i + 1], pts[i]);
      const len = d.length();
      q.setFromUnitVectors(up, d.normalize());
      m.compose(mid.addVectors(pts[i], pts[i + 1]).multiplyScalar(0.5), q, s.set(radius, len, radius));
      seg.setMatrixAt(i, m);
      seg.setColorAt(i, c);
    }
  }
  const group = new THREE.Group();
  group.add(seg, joint);
  return { group, seg, joint };
}

export default defineGeometryDemo({
  id: 'GEO-047',
  notes: '次数 n の 2^n 立方格子の全点を、番号 h から Skilling の方法（転置形式＋グレイ符号の復号＋ビットの交換）で座標に変換して並べ、区間ごとの円柱でチューブ化する。色は番号のグラデーションで、近い番号が空間でも近い（局所性）ことが分かる。描画の進行を動かすと曲線が順に伸びる。比較の左は1つ低い次数。',
  params: [
    { key: 'order', label: '次数 n', type: 'number', min: 1, max: 5, step: 1, default: 3 },
    { key: 'progress', label: '描画の進行', type: 'number', min: 0, max: 1, step: 0.001, default: 1 },
    { key: 'animate', label: '描画をアニメーション', type: 'bool', default: true },
    { key: 'thickness', label: '太さ', type: 'number', min: 0.1, max: 1, step: 0.01, default: 0.35 },
  ],
  liveKeys: ['progress', 'animate'],
  distance: 7.5,
  compareLabels: ['次数 n−1', '次数 n'],
  build(p, env) {
    let order = Number(p.order);
    if (env.quality === 'low') order = Math.min(order, 4);
    const size = 3.2;
    const pts = curve(order, size);
    const r = (size / (1 << order)) * 0.5 * Number(p.thickness);
    const main = tube(pts, r);
    const prevOrder = Math.max(1, order - 1);
    const before = tube(curve(prevOrder, size), (size / (1 << prevOrder)) * 0.5 * Number(p.thickness)).group;
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(size, size, size)), new THREE.LineBasicMaterial({ color: 0x4a5080 }));
    const n = pts.length;
    let shown = n;
    let anim = 0;
    const setCount = (k: number) => {
      shown = Math.max(1, Math.min(n, k));
      main.joint.count = shown;
      main.seg.count = Math.max(0, shown - 1);
    };
    setCount(n);
    return {
      object: main.group,
      before,
      helpers: frame,
      info: () => `次数 ${order} · 格子 ${1 << order}³ = ${n.toLocaleString()} 点 · 表示 ${shown.toLocaleString()} 点`,
      update(dt, _t, live) {
        let prog = Number(live.progress);
        if (live.animate) {
          // 約8秒で描き切り、少し止まって繰り返す
          anim = (anim + dt / 9) % 1;
          prog = Math.min(1, anim / 0.85) * prog;
        }
        const k = Math.round(prog * n);
        if (k !== shown) setCount(k);
      },
    };
  },
});
