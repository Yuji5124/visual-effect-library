import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';

/** GEO-009 角柱→反角柱：段ごとの正 n 角形を回しながら積み、隣の段を三角形の帯で結ぶ */

function twistedColumn(n: number, twistDeg: number, stacks: number, h: number, r: number): THREE.BufferGeometry {
  const tw = THREE.MathUtils.degToRad(twistDeg);
  const ring = (k: number) => {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + k * tw;
      out.push(new THREE.Vector3(Math.cos(a) * r, k * h - (stacks * h) / 2, Math.sin(a) * r));
    }
    return out;
  };
  const rings = Array.from({ length: stacks + 1 }, (_, k) => ring(k));
  const pos: number[] = [];
  const col: number[] = [];
  const cA = new THREE.Color(0x5ab8ff), cB = new THREE.Color(0xff9a4c), cCap = new THREE.Color(0x63e6a3);
  const tri = (a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, color: THREE.Color) => {
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
    for (let i = 0; i < 3; i++) col.push(color.r, color.g, color.b);
  };
  for (let k = 0; k < stacks; k++) {
    const A = rings[k], B = rings[k + 1];
    for (let i = 0; i < n; i++) {
      const i2 = (i + 1) % n;
      // 上向き三角形（下の辺＋上の1点）と下向き三角形（上の辺＋下の1点）を色分け
      tri(A[i], B[i], A[i2], cA);
      tri(A[i2], B[i], B[i2], cB);
    }
  }
  const bottom = rings[0], top = rings[stacks];
  const cb = new THREE.Vector3(0, bottom[0].y, 0), ct = new THREE.Vector3(0, top[0].y, 0);
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    tri(cb, bottom[i], bottom[i2], cCap);
    tri(ct, top[i2], top[i], cCap);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export default defineGeometryDemo({
  id: 'GEO-009',
  notes: '段ごとに正 n 角形の頂点を「段番号×ねじれ角」だけ回して積み、隣接段を三角形帯（青＝下辺から立つ三角形、橙＝上辺から下りる三角形）で結ぶ独自ジオメトリ。ねじれ角 0 で角柱（帯が長方形に並ぶ）、180°/n で反角柱（三角形が交互に並ぶ）。段を重ねるとねじれ柱になる。',
  params: [
    { key: 'n', label: '辺の数 n', type: 'number', min: 3, max: 16, step: 1, default: 6 },
    { key: 'twist', label: 'ねじれ角（1段あたり・度）', type: 'number', min: -90, max: 90, step: 0.5, default: 30 },
    { key: 'stacks', label: '段数', type: 'number', min: 1, max: 40, step: 1, default: 1 },
    { key: 'height', label: '高さ（1段）', type: 'number', min: 0.1, max: 3, step: 0.01, default: 1.2 },
    { key: 'animate', label: 'ねじれ角を往復', type: 'bool', default: false },
  ],
  liveKeys: ['animate'],
  extraActions: [
    { key: 'anti', label: '反角柱の角度 180°/n', title: '上面を π/n 回すと反角柱になる' },
    { key: 'uniform', label: '辺の長さをそろえる', title: '側面が正三角形になる高さ（反角柱）／正方形になる高さ（角柱）' },
  ],
  onAction(key, p) {
    const n = Number(p.n);
    if (key === 'anti') return { twist: Math.round((180 / n) * 100) / 100, animate: false };
    if (key === 'uniform') {
      // 半径 r=1.3 の正 n 角形の辺長 a
      const a = 2 * 1.3 * Math.sin(Math.PI / n);
      const anti = Math.abs(Math.abs(Number(p.twist)) - 180 / n) < 0.6;
      const h = anti ? a * Math.sqrt(1 - 1 / (4 * Math.cos(Math.PI / (2 * n)) ** 2)) : a;
      return { height: Math.round(h * 100) / 100 };
    }
  },
  distance: 8,
  compareLabels: ['角柱（ねじれ0）', 'ねじれ柱'],
  build(p, env) {
    const n = Math.round(Number(p.n));
    const stacks = Math.min(Math.round(Number(p.stacks)), env.quality === 'low' ? 24 : 40);
    const h = Math.min(Number(p.height), 5 / stacks + 0.1);
    const r = 1.3;
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.5, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(twistedColumn(n, Number(p.twist), stacks, h, r), mat);
    const before = new THREE.Mesh(twistedColumn(n, 0, stacks, h, r), mat.clone());
    let shown = Number(p.twist);
    const set = (deg: number) => {
      shown = deg;
      mesh.geometry.dispose();
      mesh.geometry = twistedColumn(n, deg, stacks, h, r);
    };
    return {
      object: mesh,
      before,
      info: () => {
        const anti = 180 / n;
        const tag = Math.abs(shown) < 0.01 ? '角柱' : Math.abs(Math.abs(shown) - anti) < 0.3 ? '反角柱' : 'ねじれの途中';
        return `ねじれ ${shown.toFixed(1)}°/段（反角柱=${anti.toFixed(2)}°）· ${tag} · 総回転 ${(shown * stacks).toFixed(0)}° · 段の高さ ${h.toFixed(2)}`;
      },
      update(_dt, time, live) {
        if (live.animate) set((180 / n) * 1.5 * Math.sin(time * 0.6));
        else if (shown !== Number(p.twist)) set(Number(p.twist));
      },
    };
  },
});
