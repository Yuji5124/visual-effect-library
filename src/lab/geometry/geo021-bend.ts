import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { deformable, polyline, lineSegs } from '../framework/deformKit';

/** GEO-021 ベンド：Barr の曲げ変形。x 軸方向の位置に比例した角度で円弧に沿わせる */
const LEN = 6;

/** Barr の曲げ：u=軸方向, v=曲げの内外方向。範囲外は接線方向へ直進 */
function bendPoint(u: number, v: number, k: number, u0: number, uMin: number, uMax: number, out: THREE.Vector2): THREE.Vector2 {
  if (Math.abs(k) < 1e-6) return out.set(u, v);
  const uc = Math.min(uMax, Math.max(uMin, u));
  const th = k * (uc - u0);
  const R = 1 / k;
  const s = Math.sin(th), c = Math.cos(th);
  const x = u0 + (R - v) * s;
  const y = R - (R - v) * c;
  const d = u - uc;
  return out.set(x + c * d, y + s * d);
}

export default defineGeometryDemo({
  id: 'GEO-021',
  notes: '細分割した棒の各頂点を Barr の式で写す：曲げ範囲内の x を角度 θ=k(x−中心) に変え、半径 R=1/k の円弧上に置き、断面は円弧の法線方向へずらす。範囲外は端の接線方向へまっすぐ伸ばすので折れ目ができない。橙の線は中心軸の行き先、縦線が曲げ範囲。',
  params: [
    { key: 'angle', label: '曲げ角（度）', type: 'number', min: -360, max: 360, step: 5, default: 180 },
    { key: 'rangeLo', label: '曲げ範囲の下端（−1〜1）', type: 'number', min: -1, max: 1, step: 0.05, default: -0.6 },
    { key: 'rangeHi', label: '曲げ範囲の上端（−1〜1）', type: 'number', min: -1, max: 1, step: 0.05, default: 0.6 },
    { key: 'center', label: '曲げの中心（−1〜1）', type: 'number', min: -1, max: 1, step: 0.05, default: 0 },
    { key: 'segments', label: '長さ方向の分割数', type: 'number', min: 2, max: 160, step: 1, default: 80 },
    { key: 'animate', label: '曲げ角を往復させる（自動アニメーション）', type: 'bool', default: false },
  ],
  liveKeys: ['animate', 'angle'],
  distance: 10,
  compareLabels: ['元の棒', 'ベンド'],
  build(p) {
    const seg = Number(p.segments);
    const src = new THREE.BoxGeometry(LEN, 0.6, 1.2, seg, 3, 4);
    const d = deformable(src);
    const mesh = new THREE.Mesh(d.geo, std(0xffa94d, { side: THREE.DoubleSide }));
    const before = new THREE.Mesh(src, std(0x8890b0));
    let lo = Number(p.rangeLo) * LEN / 2, hi = Number(p.rangeHi) * LEN / 2;
    if (lo > hi) [lo, hi] = [hi, lo];
    if (hi - lo < 0.05) hi = lo + 0.05;
    const u0 = THREE.MathUtils.clamp(Number(p.center) * LEN / 2, lo, hi);
    const helpers = new THREE.Group();
    const axisPts = Array.from({ length: 121 }, () => new THREE.Vector3());
    const axis = polyline(axisPts, 0xffd27a);
    const marks = lineSegs(new Array(12).fill(0), 0x6bd3ff);
    helpers.add(axis, marks);
    const v2 = new THREE.Vector2();
    let radius = Infinity;
    let shown = Number(p.angle);
    const apply = (deg: number) => {
      // 曲げ範囲の長さで全体の角度を割り、曲率 k を決める
      const k = THREE.MathUtils.degToRad(deg) / (hi - lo);
      d.apply((x, y, z, out) => {
        bendPoint(x, y, k, u0, lo, hi, v2);
        out.set(v2.x, v2.y, z);
      });
      const ap = axis.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < ap.count; i++) {
        bendPoint(-LEN / 2 - 0.4 + (i / (ap.count - 1)) * (LEN + 0.8), 0, k, u0, lo, hi, v2);
        ap.setXYZ(i, v2.x, v2.y, 0);
      }
      ap.needsUpdate = true;
      axis.geometry.computeBoundingSphere();
      // 曲げ範囲の両端と中心に、断面方向の短い線を立てる
      const mp = marks.geometry.attributes.position as THREE.BufferAttribute;
      [lo, hi].forEach((u, j) => {
        bendPoint(u, -0.7, k, u0, lo, hi, v2);
        mp.setXYZ(j * 2, v2.x, v2.y, 0.7);
        bendPoint(u, 0.7, k, u0, lo, hi, v2);
        mp.setXYZ(j * 2 + 1, v2.x, v2.y, 0.7);
      });
      bendPoint(u0, -0.5, k, u0, lo, hi, v2);
      mp.setXYZ(4, v2.x, v2.y, 0.7);
      bendPoint(u0, 0.5, k, u0, lo, hi, v2);
      mp.setXYZ(5, v2.x, v2.y, 0.7);
      mp.needsUpdate = true;
      marks.geometry.computeBoundingSphere();
      radius = Math.abs(k) > 1e-6 ? 1 / Math.abs(k) : Infinity;
    };
    apply(shown);
    return {
      object: mesh,
      before,
      helpers,
      info: () => `曲げ角 ${shown.toFixed(0)}° · 半径 R=${Number.isFinite(radius) ? radius.toFixed(2) : '∞'} · 範囲 ${(hi - lo).toFixed(2)}`,
      update(_dt, time, live) {
        const target = live.animate ? Number(live.angle) * (0.5 + 0.5 * Math.sin(time * 0.9)) : Number(live.angle);
        if (target !== shown) apply((shown = target));
      },
    };
  },
});
