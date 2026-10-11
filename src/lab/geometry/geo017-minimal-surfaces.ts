import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { GridSurface } from '../framework/surfaceKit';

/** GEO-017 極小曲面の随伴族：x(θ)=cosθ·ヘリコイド+sinθ·カテノイド（等長変形）、エネパー曲面 */

const LIFT = 2.9;

type Param = (s: number, t: number, th: number, out: THREE.Vector3) => THREE.Vector3;

interface Kind {
  /** パラメーター域：s∈[s0,s1], t∈[t0,t1] */
  range(size: number): [number, number, number, number];
  f: Param;
  scale: number;
}

const KINDS: Record<string, Kind> = {
  cathel: {
    range: (size) => [-Math.PI, Math.PI, -size, size],
    // (u,v) → 標準形の (x,y,z)。three.js では z を上（y）に
    f(u, v, th, out) {
      const c = Math.cos(th), s = Math.sin(th);
      const x = c * Math.sinh(v) * Math.sin(u) + s * Math.cosh(v) * Math.cos(u);
      const y = -c * Math.sinh(v) * Math.cos(u) + s * Math.cosh(v) * Math.sin(u);
      const z = u * c + v * s;
      return out.set(x, z, y);
    },
    scale: 0.85,
  },
  enneper: {
    range: (size) => [0, size * 1.25, 0, Math.PI * 2],
    // ワイエルシュトラス表示 f=1, g=w：X_k = Re(e^{iθ} F_k(w))
    f(r, phi, th, out) {
      const wr = r * Math.cos(phi), wi = r * Math.sin(phi);
      // w², w³
      const w2r = wr * wr - wi * wi, w2i = 2 * wr * wi;
      const w3r = w2r * wr - w2i * wi, w3i = w2r * wi + w2i * wr;
      const er = Math.cos(th), ei = Math.sin(th);
      const re = (ar: number, ai: number) => er * ar - ei * ai;
      const x = re(wr - w3r / 3, wi - w3i / 3);
      // i(w + w³/3)
      const y = re(-(wi + w3i / 3), wr + w3r / 3);
      const z = re(w2r, w2i);
      return out.set(x, z, y);
    },
    scale: 1.1,
  },
};

/** 数値微分で平均曲率 H と第一基本量 E を求める */
function curvatureCheck(k: Kind, th: number, rg: [number, number, number, number], n = 14) {
  const h = 1e-3;
  const P = (s: number, t: number) => k.f(s, t, th, new THREE.Vector3());
  let maxH = 0, maxK = 0;
  for (let a = 1; a < n; a++) for (let b = 1; b < n; b++) {
    const s = rg[0] + ((rg[1] - rg[0]) * a) / n, t = rg[2] + ((rg[3] - rg[2]) * b) / n;
    const c = P(s, t);
    const ps = P(s + h, t), ms = P(s - h, t), pt = P(s, t + h), mt = P(s, t - h);
    const Xs = ps.clone().sub(ms).divideScalar(2 * h), Xt = pt.clone().sub(mt).divideScalar(2 * h);
    const Xss = ps.clone().add(ms).addScaledVector(c, -2).divideScalar(h * h);
    const Xtt = pt.clone().add(mt).addScaledVector(c, -2).divideScalar(h * h);
    const Xst = P(s + h, t + h).sub(P(s + h, t - h)).sub(P(s - h, t + h)).add(P(s - h, t - h)).divideScalar(4 * h * h);
    const nrm = Xs.clone().cross(Xt);
    const len = nrm.length();
    if (len < 1e-6) continue;
    nrm.divideScalar(len);
    const E = Xs.dot(Xs), F = Xs.dot(Xt), G = Xt.dot(Xt);
    const e = nrm.dot(Xss), f = nrm.dot(Xst), g = nrm.dot(Xtt);
    const det = E * G - F * F;
    const H = (e * G - 2 * f * F + g * E) / (2 * det);
    const K = (e * g - f * f) / det;
    maxH = Math.max(maxH, Math.abs(H));
    maxK = Math.max(maxK, Math.sqrt(Math.abs(K)));
  }
  // 計量の不変性：固定した (s,t) での E
  const s0 = rg[0] + (rg[1] - rg[0]) * 0.6, t0 = rg[2] + (rg[3] - rg[2]) * 0.7;
  const Xs = P(s0 + h, t0).sub(P(s0 - h, t0)).divideScalar(2 * h);
  return { maxH, maxK, E: Xs.dot(Xs) };
}

export default defineGeometryDemo({
  id: 'GEO-017',
  notes: 'カテノイドとヘリコイドの随伴族 x(θ)=cosθ·(ヘリコイド)+sinθ·(カテノイド) を直接評価する（θ=0 でヘリコイド、90° でカテノイド）。縞模様は (u,v) の格子で、変形しても縞の長さが変わらない（等長）。数値微分で求めた平均曲率の最大値 |H| と、θ によらず一定の第一基本量 E をステータスに表示する。エネパー曲面はワイエルシュトラス表示 Re(e^{iθ}F(w)) で、随伴族は自分自身の回転になる。',
  params: [
    { key: 'kind', label: '曲面の種類', type: 'select', options: [{ value: 'cathel', label: 'カテノイド⇄ヘリコイド' }, { value: 'enneper', label: 'エネパー曲面' }], default: 'cathel' },
    { key: 'theta', label: '位相角 θ（度）', type: 'number', min: 0, max: 180, step: 1, default: 45 },
    { key: 'auto', label: '自動変形', type: 'bool', default: true },
    { key: 'speed', label: '変形の速さ', type: 'number', min: 0.05, max: 1.5, step: 0.05, default: 0.35 },
    { key: 'size', label: '範囲（v または半径）', type: 'number', min: 0.4, max: 1.6, step: 0.05, default: 1.2 },
    { key: 'div', label: '分割数', type: 'number', min: 16, max: 160, step: 4, default: 96 },
  ],
  liveKeys: ['theta', 'auto', 'speed'],
  distance: 9,
  elevation: 0.35,
  target: [0, LIFT, 0],
  compareLabels: ['θ=0（ヘリコイド／基準）', '現在の θ'],
  build(p, env) {
    const k = KINDS[String(p.kind)] ?? KINDS.cathel;
    const rg = k.range(Number(p.size));
    const div = Math.max(16, Math.round(Number(p.div)) >> (env.quality === 'low' ? 1 : 0));
    const nu = div, nv = Math.max(8, Math.round(div / 2));
    const fnAt = (th: number) => (u: number, v: number, out: THREE.Vector3) =>
      k.f(rg[0] + (rg[1] - rg[0]) * u, rg[2] + (rg[3] - rg[2]) * v, th, out).multiplyScalar(k.scale).setY(out.y + LIFT);
    const surf = new GridSurface(nu, nv);
    const a = new THREE.Color(0xff9a3d), b = new THREE.Color(0x5ab8ff), w = new THREE.Color(0xf2f4ff);
    surf.colorize((u, v, c) => {
      const su = Math.floor(u * 16) % 2, sv = Math.floor(v * 8) % 2;
      c.copy(su ? a : b).lerp(w, sv ? 0.35 : 0);
    });
    const mesh = new THREE.Mesh(surf.geo, std(0xffffff, { side: THREE.DoubleSide, vertexColors: true, roughness: 0.5 }));
    const bsurf = new GridSurface(nu, nv, fnAt(0));
    const before = new THREE.Mesh(bsurf.geo, std(0x8890b0, { side: THREE.DoubleSide }));
    let thNow = NaN;
    let check = { maxH: 0, maxK: 0, E: 0 };
    let phase = (Number(p.theta) * Math.PI) / 180;
    const set = (th: number) => {
      if (th === thNow) return;
      thNow = th;
      surf.update(fnAt(th));
      check = curvatureCheck(k, th, rg);
    };
    set(phase);
    return {
      object: mesh,
      before,
      info: () =>
        `θ=${((thNow * 180) / Math.PI).toFixed(1)}° · 平均曲率 |H|max=${check.maxH.toExponential(1)}（主曲率の大きさ ~${check.maxK.toFixed(2)}） · 第一基本量 E=${check.E.toFixed(4)}（θ によらず一定）`,
      update(dt, _time, live) {
        if (live.auto) {
          phase += dt * Number(live.speed);
          // 0→180° を往復
          set((Math.PI / 2) * (1 - Math.cos(phase)));
        } else set((Number(live.theta) * Math.PI) / 180);
      },
    };
  },
});
