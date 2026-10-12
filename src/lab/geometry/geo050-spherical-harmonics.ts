import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';

/** GEO-050 球面調和関数：随伴ルジャンドル多項式の漸化式で実数 Y_l^m を評価し、|Y| を半径にする */
function legendre(l: number, m: number, x: number): number {
  // P_m^m = (−1)^m (2m−1)!! (1−x²)^(m/2)
  let pmm = 1;
  const s = Math.sqrt(Math.max(0, 1 - x * x));
  for (let i = 1; i <= m; i++) pmm *= -(2 * i - 1) * s;
  if (l === m) return pmm;
  let pm1 = x * (2 * m + 1) * pmm;
  if (l === m + 1) return pm1;
  let pll = 0;
  for (let ll = m + 2; ll <= l; ll++) {
    pll = ((2 * ll - 1) * x * pm1 - (ll + m - 1) * pmm) / (ll - m);
    pmm = pm1;
    pm1 = pll;
  }
  return pll;
}

function factorialRatio(l: number, m: number): number {
  // (l−m)!/(l+m)!
  let r = 1;
  for (let i = l - m + 1; i <= l + m; i++) r /= i;
  return r;
}

function realSH(l: number, m: number, theta: number, phi: number): number {
  const am = Math.abs(m);
  const k = Math.sqrt(((2 * l + 1) / (4 * Math.PI)) * factorialRatio(l, am));
  const p = legendre(l, am, Math.cos(theta));
  if (m === 0) return k * p;
  return Math.SQRT2 * k * p * (m > 0 ? Math.cos(m * phi) : Math.sin(am * phi));
}

function buildGeo(l: number, m: number, emph: number, res: number): { geo: THREE.BufferGeometry; maxAbs: number } {
  const nu = res * 2, nv = res;
  const count = (nu + 1) * (nv + 1);
  const vals = new Float32Array(count);
  let maxAbs = 0;
  for (let j = 0, k = 0; j <= nv; j++)
    for (let i = 0; i <= nu; i++, k++) {
      vals[k] = realSH(l, m, (j / nv) * Math.PI, (i / nu) * Math.PI * 2);
      maxAbs = Math.max(maxAbs, Math.abs(vals[k]));
    }
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const pc = new THREE.Color(0xff7a3d), nc = new THREE.Color(0x3d8bff), zc = new THREE.Color(0xe8e8f0), c = new THREE.Color();
  for (let j = 0, k = 0; j <= nv; j++) {
    const th = (j / nv) * Math.PI;
    for (let i = 0; i <= nu; i++, k++) {
      const ph = (i / nu) * Math.PI * 2;
      const a = maxAbs > 0 ? vals[k] / maxAbs : 0;
      // 形の強調 0=単位球に色だけ、1=|Y| そのもの
      const r = 1.9 * ((1 - emph) + emph * Math.abs(a));
      pos.set([r * Math.sin(th) * Math.cos(ph), r * Math.cos(th), r * Math.sin(th) * Math.sin(ph)], k * 3);
      c.copy(zc).lerp(a >= 0 ? pc : nc, Math.min(1, Math.abs(a) * 1.6 + 0.25));
      col.set([c.r, c.g, c.b], k * 3);
    }
  }
  const idx: number[] = [];
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, cc = a + nu + 1, d = cc + 1;
      idx.push(a, b, cc, b, d, cc);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return { geo, maxAbs };
}

export default defineGeometryDemo({
  id: 'GEO-050',
  notes: '随伴ルジャンドル多項式 P_l^|m| の漸化式と正規化係数で実数球面調和関数 Y_l^m(θ,φ)（m>0 は cos mφ、m<0 は sin|m|φ）を評価し、|Y| を半径にした極座標の面を作る。橙が正、青が負で、色の境目が節線（l−|m| 本の緯線と |m| 本の経線）。比較の左は単位球上に同じ符号を塗ったもの。',
  params: [
    { key: 'l', label: '次数 l', type: 'number', min: 0, max: 10, step: 1, default: 4 },
    { key: 'm', label: '位数 m（−l〜l に丸める）', type: 'number', min: -10, max: 10, step: 1, default: 2 },
    { key: 'emph', label: '形の強調（0=球に色だけ）', type: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'res', label: '分割数', type: 'number', min: 24, max: 160, step: 4, default: 96 },
  ],
  distance: 7,
  compareLabels: ['球面上の符号', '|Y_l^m| を半径に'],
  build(p, env) {
    const l = Number(p.l);
    const m = Math.max(-l, Math.min(l, Number(p.m)));
    let res = Number(p.res);
    if (env.quality === 'low') res = Math.min(res, 64);
    const { geo } = buildGeo(l, m, Number(p.emph), res);
    const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat());
    const before = new THREE.Mesh(buildGeo(l, m, 0, Math.min(res, 64)).geo, mat());
    const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -2.4, 0), new THREE.Vector3(0, 2.4, 0)]), new THREE.LineBasicMaterial({ color: 0xffb84d }));
    return {
      object: mesh,
      before,
      helpers: axis,
      info: `Y_${l}^${m} · 節線: 緯線 ${l - Math.abs(m)} 本 · 経線 ${Math.abs(m)} 本（大円）`,
    };
  },
});
