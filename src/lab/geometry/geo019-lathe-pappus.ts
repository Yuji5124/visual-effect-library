import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { Markers, polyline } from '../framework/splineKit';
import { signedVolume } from '../framework/deformKit';

/** GEO-019 回転体：Catmull-Rom で滑らかにした輪郭 (r,y) を y 軸まわりに回し、パップスの定理で体積・表面積を求める */

const H = 4.3;

function profile(waist: number, flare: number, samples: number): { ctrl: THREE.Vector2[]; pts: THREE.Vector2[] } {
  const ctrl = [
    new THREE.Vector2(0.9, 0),
    new THREE.Vector2(1.45, 0.75),
    new THREE.Vector2(1.65, 1.6),
    new THREE.Vector2(1.55 - waist * 1.15, 2.85),
    new THREE.Vector2(0.55 + flare * 0.3, 3.65),
    new THREE.Vector2(0.55 + flare * 1.1, H),
  ];
  const curve = new THREE.CatmullRomCurve3(ctrl.map((v) => new THREE.Vector3(v.x, v.y, 0)), false, 'centripetal');
  const pts = curve.getPoints(samples).map((v) => new THREE.Vector2(Math.max(0, v.x), v.y));
  // 軸上の点で閉じ、底と口を蓋にする（中身の詰まった回転体）
  return { ctrl, pts: [new THREE.Vector2(0, 0), ...pts, new THREE.Vector2(0, H)] };
}

/** 断面（輪郭と軸で囲まれた領域）の面積・重心、輪郭の長さ・重心 */
function pappus(pts: THREE.Vector2[]) {
  let A = 0, cx = 0, cy = 0, L = 0, lx = 0, ly = 0, disc = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    const cr = a.x * b.y - b.x * a.y;
    A += cr;
    cx += (a.x + b.x) * cr;
    cy += (a.y + b.y) * cr;
    if (i < pts.length - 1) {
      const len = a.distanceTo(b);
      L += len;
      lx += ((a.x + b.x) / 2) * len;
      ly += ((a.y + b.y) / 2) * len;
      // 円錐台の体積の和（独立な検算）
      disc += (Math.PI / 3) * (a.x * a.x + a.x * b.x + b.x * b.x) * (b.y - a.y);
    }
  }
  A /= 2;
  cx /= 6 * A;
  cy /= 6 * A;
  return { A: Math.abs(A), cx, cy, L, lx: lx / L, ly: ly / L, disc: Math.abs(disc) };
}

export default defineGeometryDemo({
  id: 'GEO-019',
  notes: '6つの制御点を Catmull-Rom（求心）で滑らかにした輪郭 (r,y) を LatheGeometry で y 軸まわりに回転させる。回転角を360°未満にすると断面の蓋を付けて中を見せる。黄色い点が断面の重心で、その描く円（点線）の長さ×断面積＝体積（パップス・ギュルダン）をステータスに表示し、円錐台の和・メッシュの体積と照合する。',
  params: [
    { key: 'waist', label: 'くびれ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'flare', label: '口の広がり', type: 'number', min: 0, max: 1, step: 0.01, default: 0.55 },
    { key: 'angle', label: '回転角（度）', type: 'number', min: 10, max: 360, step: 1, default: 270 },
    { key: 'segments', label: '回転方向の分割数', type: 'number', min: 3, max: 128, step: 1, default: 64 },
    { key: 'samples', label: '輪郭の分割数', type: 'number', min: 4, max: 120, step: 1, default: 48 },
    { key: 'animate', label: '回転角を自動で往復', type: 'bool', default: false },
  ],
  liveKeys: ['animate'],
  distance: 10,
  elevation: 0.45,
  target: [0, 2.1, 0],
  compareLabels: ['回転前の断面', '回転体'],
  build(p, env) {
    const seg = Math.max(3, Math.round(Number(p.segments)) >> (env.quality === 'low' ? 1 : 0));
    const { ctrl, pts } = profile(Number(p.waist), Number(p.flare), Math.round(Number(p.samples)));
    const pp = pappus(pts);
    const object = new THREE.Group();
    const mat = std(0xe8d6b8, { side: THREE.DoubleSide, roughness: 0.6 });
    const capMat = std(0xc0603a, { side: THREE.DoubleSide, roughness: 0.7 });
    const lathe = new THREE.Mesh(new THREE.BufferGeometry(), mat);
    const shape = new THREE.Shape(pts);
    const capA = new THREE.Mesh(new THREE.BufferGeometry(), capMat);
    const capB = new THREE.Mesh(new THREE.BufferGeometry(), capMat);
    object.add(lathe, capA, capB);
    let angNow = NaN;
    const setAngle = (deg: number) => {
      if (deg === angNow) return;
      angNow = deg;
      const len = THREE.MathUtils.degToRad(deg);
      const full = deg >= 359.999;
      const segs = Math.max(2, Math.round((seg * deg) / 360));
      lathe.geometry.dispose();
      lathe.geometry = new THREE.LatheGeometry(pts, full ? seg : segs, 0, full ? Math.PI * 2 : len);
      capA.visible = capB.visible = !full;
      // Lathe の点は (r sinφ, y, r cosφ)。xy 平面の断面を rotateY(φ−π/2) で φ の位置へ
      capA.geometry.dispose();
      capA.geometry = new THREE.ShapeGeometry(shape).rotateY(-Math.PI / 2);
      capB.geometry.dispose();
      capB.geometry = new THREE.ShapeGeometry(shape).rotateY(len - Math.PI / 2);
    };
    setAngle(Number(p.angle));
    // 360° で回したメッシュの体積（多角形近似なので θ 方向の分割が粗いと小さめになる）
    const tmp = new THREE.LatheGeometry(pts, seg);
    const meshVol = Math.abs(signedVolume(tmp));
    tmp.dispose();

    const helpers = new THREE.Group();
    const prof3 = pts.map((v) => new THREE.Vector3(v.x, v.y, 0));
    helpers.add(polyline(prof3, 0xffffff, { opacity: 0.9 }));
    helpers.add(polyline([new THREE.Vector3(0, -0.4, 0), new THREE.Vector3(0, H + 0.6, 0)], 0x8fb8ff, { dashed: true }));
    const marks = new Markers(ctrl.length + 2, 0.08);
    ctrl.forEach((c, i) => marks.set(i, new THREE.Vector3(c.x, c.y, 0), 0x63e6a3, 1));
    marks.set(ctrl.length, new THREE.Vector3(pp.cx, pp.cy, 0), 0xffd23d, 1.6);
    marks.set(ctrl.length + 1, new THREE.Vector3(pp.lx, pp.ly, 0), 0xff5c8a, 1.2);
    marks.commit();
    helpers.add(marks.mesh);
    // 重心が描く円（パップス）
    const ring = Array.from({ length: 97 }, (_, k) => {
      const a = (k / 96) * Math.PI * 2;
      return new THREE.Vector3(pp.cx * Math.sin(a), pp.cy, pp.cx * Math.cos(a));
    });
    helpers.add(polyline(ring, 0xffd23d, { dashed: true }));

    const before = new THREE.Mesh(new THREE.ShapeGeometry(shape), std(0x8890b0, { side: THREE.DoubleSide }));
    return {
      object,
      before,
      helpers,
      info: () => {
        const f = THREE.MathUtils.degToRad(angNow);
        const V = f * pp.cx * pp.A;
        const S = f * pp.lx * pp.L;
        return `回転角 ${angNow.toFixed(0)}° · 断面積 A=${pp.A.toFixed(3)} 重心 r̄=${pp.cx.toFixed(3)} → 体積 V=θ·r̄·A=${V.toFixed(3)}（360°: パップス ${(2 * Math.PI * pp.cx * pp.A).toFixed(3)} / 円錐台の和 ${pp.disc.toFixed(3)} / メッシュ ${meshVol.toFixed(3)}） · 表面積 θ·r̄_L·L=${S.toFixed(3)}`;
      },
      update(_dt, time, live) {
        if (live.animate) setAngle(Math.round(190 - 170 * Math.cos(time * 0.6)));
        else setAngle(Number(p.angle));
      },
    };
  },
});
