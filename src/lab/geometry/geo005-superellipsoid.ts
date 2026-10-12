import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';

/** GEO-005 超楕円体（Barr のスーパークアドリック）：cos/sin を符号付きべき乗に置き換える */

const spow = (c: number, e: number) => Math.sign(c) * Math.pow(Math.abs(c), e);

function superellipsoid(e1: number, e2: number, a: number, b: number, c: number, nu: number, nv: number, reuse?: THREE.BufferGeometry): THREE.BufferGeometry {
  // 経度方向は継ぎ目の頂点を共有して法線を滑らかにする
  const pos = reuse ? (reuse.attributes.position.array as Float32Array) : new Float32Array((nv + 1) * nu * 3);
  for (let j = 0; j <= nv; j++) {
    const eta = -Math.PI / 2 + (j / nv) * Math.PI;
    const ce = spow(Math.cos(eta), e1), se = spow(Math.sin(eta), e1);
    for (let i = 0; i < nu; i++) {
      const om = -Math.PI + (i / nu) * Math.PI * 2;
      const k = (j * nu + i) * 3;
      pos[k] = a * ce * spow(Math.cos(om), e2);
      pos[k + 1] = c * se;
      pos[k + 2] = b * ce * spow(Math.sin(om), e2);
    }
  }
  if (reuse) {
    reuse.attributes.position.needsUpdate = true;
    reuse.computeVertexNormals();
    reuse.computeBoundingSphere();
    return reuse;
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const i2 = (i + 1) % nu;
      const p00 = j * nu + i, p10 = j * nu + i2, p01 = (j + 1) * nu + i, p11 = (j + 1) * nu + i2;
      idx.push(p00, p01, p10, p10, p01, p11);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const PRESETS: Record<string, [number, number]> = { sphere: [1, 1], cube: [0.1, 0.1], cylinder: [0.1, 1], octa: [2, 2], star: [3.2, 3.2] };

export default defineGeometryDemo({
  id: 'GEO-005',
  notes: '緯度 η・経度 ω の格子の各点を x=a·c(η)^e1·c(ω)^e2, y=c·s(η)^e1, z=b·c(η)^e1·s(ω)^e2（c^e=sgn(cos)|cos|^e）で置き、法線は computeVertexNormals で求め直す。e1・e2=1 で球、0 に近いと箱、2 で八面体、2 を超えると星形にくぼむ。ボタンで代表形に切り替えられる。',
  params: [
    { key: 'e1', label: '指数 e1（縦・南北）', type: 'number', min: 0.05, max: 4, step: 0.01, default: 0.35 },
    { key: 'e2', label: '指数 e2（横・東西）', type: 'number', min: 0.05, max: 4, step: 0.01, default: 1 },
    { key: 'a', label: '大きさ x', type: 'number', min: 0.3, max: 2.5, step: 0.05, default: 1.4 },
    { key: 'b', label: '大きさ z', type: 'number', min: 0.3, max: 2.5, step: 0.05, default: 1.4 },
    { key: 'c', label: '大きさ y（高さ）', type: 'number', min: 0.3, max: 2.5, step: 0.05, default: 1.2 },
    { key: 'res', label: '分割数', type: 'number', min: 8, max: 160, step: 4, default: 96 },
    { key: 'animate', label: '指数を自動で変化', type: 'bool', default: false },
  ],
  liveKeys: ['animate'],
  extraActions: [
    { key: 'sphere', label: '球' },
    { key: 'cube', label: '箱' },
    { key: 'cylinder', label: '円柱' },
    { key: 'octa', label: '八面体' },
    { key: 'star', label: '星形' },
  ],
  onAction(key) {
    const pr = PRESETS[key];
    if (pr) return { e1: pr[0], e2: pr[1], animate: false };
  },
  distance: 7,
  compareLabels: ['球（e1=e2=1）', '超楕円体'],
  build(p, env) {
    const res = Math.max(8, Math.round(Number(p.res) / (env.quality === 'low' ? 2 : 1)));
    const a = Number(p.a), b = Number(p.b), c = Number(p.c);
    const make = (e1: number, e2: number, reuse?: THREE.BufferGeometry) => superellipsoid(e1, e2, a, b, c, res, Math.round(res / 2), reuse);
    const mesh = new THREE.Mesh(make(Number(p.e1), Number(p.e2)), std(0x63c7ff, { roughness: 0.3 }));
    const before = new THREE.Mesh(make(1, 1), std(0x8890b0));
    let cur: [number, number] = [Number(p.e1), Number(p.e2)];
    const set = (e1: number, e2: number) => {
      cur = [e1, e2];
      make(e1, e2, mesh.geometry);
    };
    return {
      object: mesh,
      before,
      info: () => `e1=${cur[0].toFixed(2)} e2=${cur[1].toFixed(2)} · ${cur[0] < 0.3 && cur[1] < 0.3 ? '箱に近い' : Math.abs(cur[0] - 1) < 0.05 && Math.abs(cur[1] - 1) < 0.05 ? '球' : cur[0] > 2.05 || cur[1] > 2.05 ? '星形（くぼむ）' : ''}`,
      update(_dt, time, live) {
        if (live.animate) {
          const t = time * 0.5;
          set(0.1 + 1.6 * (0.5 - 0.5 * Math.cos(t)), 0.1 + 2.6 * (0.5 - 0.5 * Math.cos(t * 0.63)));
        } else if (cur[0] !== Number(p.e1) || cur[1] !== Number(p.e2)) set(Number(p.e1), Number(p.e2));
      },
    };
  },
});
