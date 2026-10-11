import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';

/** GEO-044 スーパーシェイプ：経度・緯度に別々のスーパーフォーミュラ r(φ) を掛け合わせた球面座標の形 */
const sf = (phi: number, m: number, n1: number, n2: number, n3: number) => {
  const t1 = Math.pow(Math.abs(Math.cos((m * phi) / 4)), n2);
  const t2 = Math.pow(Math.abs(Math.sin((m * phi) / 4)), n3);
  const r = Math.pow(t1 + t2, -1 / n1);
  return Number.isFinite(r) ? Math.min(r, 50) : 0;
};

type SF = [number, number, number, number];
const PRESETS: Record<string, { lon: SF; lat: SF }> = {
  star: { lon: [5, 0.3, 0.3, 0.3], lat: [5, 1, 1, 1] }, // 以下 [m, n1, n2, n3]
  flower: { lon: [7, 0.2, 1.7, 1.7], lat: [7, 0.2, 1.7, 1.7] },
  shell: { lon: [6, 1, 1, 1], lat: [3, 0.5, 1.7, 1.7] },
  cube: { lon: [4, 100, 100, 100], lat: [4, 100, 100, 100] },
  sphere: { lon: [0, 1, 1, 1], lat: [0, 1, 1, 1] },
};

function build(lon: SF, lat: SF, res: number): THREE.BufferGeometry {
  const nu = res * 2, nv = res;
  const pos = new Float32Array((nu + 1) * (nv + 1) * 3);
  const col = new Float32Array((nu + 1) * (nv + 1) * 3);
  const idx: number[] = [];
  const c = new THREE.Color();
  let maxR = 0;
  const rs = new Float32Array((nu + 1) * (nv + 1));
  for (let j = 0, k = 0; j <= nv; j++) {
    const theta = -Math.PI / 2 + (j / nv) * Math.PI;
    const r2 = sf(theta, ...lat);
    for (let i = 0; i <= nu; i++, k++) {
      const phi = -Math.PI + (i / nu) * Math.PI * 2;
      const r1 = sf(phi, ...lon);
      const x = r1 * Math.cos(phi) * r2 * Math.cos(theta);
      const z = r1 * Math.sin(phi) * r2 * Math.cos(theta);
      const y = r2 * Math.sin(theta);
      pos.set([x, y, z], k * 3);
      rs[k] = Math.hypot(x, y, z);
      maxR = Math.max(maxR, rs[k]);
    }
  }
  // 大きさを揃える（最大半径 1.8）
  const s = maxR > 0 ? 1.8 / maxR : 1;
  for (let k = 0; k < pos.length / 3; k++) {
    pos[k * 3] *= s; pos[k * 3 + 1] *= s; pos[k * 3 + 2] *= s;
    c.setHSL(0.6 - 0.5 * (rs[k] / (maxR || 1)), 0.6, 0.55);
    col.set([c.r, c.g, c.b], k * 3);
  }
  for (let j = 0; j < nv; j++)
    for (let i = 0; i < nu; i++) {
      const a = j * (nu + 1) + i, b = a + 1, cc = a + nu + 1, d = cc + 1;
      idx.push(a, cc, b, b, cc, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export default defineGeometryDemo({
  id: 'GEO-044',
  notes: '経度 φ と緯度 θ それぞれに Gielis のスーパーフォーミュラ r(φ)=(|cos(mφ/4)|^n2+|sin(mφ/4)|^n3)^(−1/n1) を評価し、x=r1cosφ·r2cosθ, z=r1sinφ·r2cosθ, y=r2sinθ で面を作る（a=b=1）。m が回転対称の数、n1 が膨らみ、n2・n3 が尖り具合。色は中心からの距離。プリセットボタンで代表的な形に切り替わる。',
  params: [
    { key: 'm', label: 'm（経度方向の対称数）', type: 'number', min: 0, max: 20, step: 1, default: 6 },
    { key: 'n1', label: 'n1', type: 'number', min: 0.1, max: 20, step: 0.05, default: 0.6 },
    { key: 'n2', label: 'n2', type: 'number', min: 0.1, max: 20, step: 0.05, default: 1.2 },
    { key: 'n3', label: 'n3', type: 'number', min: 0.1, max: 20, step: 0.05, default: 1.2 },
    { key: 'm2', label: 'm（緯度方向の対称数）', type: 'number', min: 0, max: 20, step: 1, default: 3 },
    { key: 'n1b', label: 'n1（緯度方向）', type: 'number', min: 0.1, max: 20, step: 0.05, default: 1 },
    { key: 'res', label: '分割数', type: 'number', min: 24, max: 160, step: 4, default: 96 },
    { key: 'animate', label: 'n1 を往復させる', type: 'bool', default: false },
  ],
  liveKeys: ['animate'],
  extraActions: [
    { key: 'preset-star', label: '★ ヒトデ' },
    { key: 'preset-flower', label: '✿ 花' },
    { key: 'preset-shell', label: '◎ 貝' },
    { key: 'preset-cube', label: '■ 角丸立方体' },
  ],
  onAction(key) {
    const pr = PRESETS[key.replace('preset-', '')];
    if (!pr) return;
    return { m: pr.lon[0], n1: pr.lon[1], n2: pr.lon[2], n3: pr.lon[3], m2: pr.lat[0], n1b: pr.lat[1] };
  },
  distance: 7,
  compareLabels: ['球（m=0, n=1）', 'スーパーシェイプ'],
  build(p, env) {
    let res = Number(p.res);
    if (env.quality === 'low') res = Math.min(res, 64);
    const n2 = Number(p.n2), n3 = Number(p.n3);
    const lon = (n1: number): SF => [Number(p.m), n1, n2, n3];
    const lat: SF = [Number(p.m2), Number(p.n1b), n2, n3];
    const geo = build(lon(Number(p.n1)), lat, res);
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, side: THREE.DoubleSide }));
    const before = new THREE.Mesh(build(PRESETS.sphere.lon, PRESETS.sphere.lat, 32), std(0x8890b0));
    let shownN1 = Number(p.n1);
    return {
      object: mesh,
      before,
      info: () => `r1: m=${p.m} n1=${shownN1.toFixed(2)} n2=${n2} n3=${n3} · r2: m=${p.m2} n1=${p.n1b}`,
      update(_dt, time, live) {
        const target = live.animate ? Number(p.n1) * (0.55 + 0.45 * Math.sin(time * 0.9)) + 0.05 : Number(p.n1);
        if (Math.abs(target - shownN1) < 1e-6) return;
        shownN1 = target;
        const g = build(lon(shownN1), lat, res);
        geo.attributes.position.array.set(g.attributes.position.array);
        geo.attributes.color.array.set(g.attributes.color.array);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
        geo.computeVertexNormals();
        geo.computeBoundingSphere();
        g.dispose();
      },
    };
  },
});
