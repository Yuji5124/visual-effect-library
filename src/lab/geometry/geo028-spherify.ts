import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { deformable } from '../framework/deformKit';

/** GEO-028 球面化：p と r·p/|p| の間を補間する */
const R = 1.5;

function baseGeometry(shape: string, seg: number): THREE.BufferGeometry {
  if (shape === 'cylinder') return new THREE.CylinderGeometry(1.2, 1.2, 2.4, seg * 4, seg, false);
  if (shape === 'tall') return new THREE.BoxGeometry(1.4, 3, 1.4, seg, seg * 2, seg);
  if (shape === 'octa') return new THREE.OctahedronGeometry(1.8, seg);
  return new THREE.BoxGeometry(2.2, 2.2, 2.2, seg, seg, seg);
}

export default defineGeometryDemo({
  id: 'GEO-028',
  notes: '各頂点 p を p と R·p/|p| の間で補間率 t だけ動かす。立方体の面の格子は球面上で中央が大きく角が小さいキューブ球になる。色は三角形の面積（青=小さい、赤=大きい）で、ステータスに面積の最大/最小比を出す。',
  params: [
    { key: 't', label: '球面化率', type: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'segments', label: '分割数', type: 'number', min: 1, max: 32, step: 1, default: 12 },
    { key: 'shape', label: '元の形', type: 'select', options: [{ value: 'cube', label: '立方体' }, { value: 'tall', label: '縦長の箱' }, { value: 'cylinder', label: '円柱' }, { value: 'octa', label: '正八面体（細分割）' }], default: 'cube' },
    { key: 'areaColor', label: '面積で色分け', type: 'bool', default: true },
    { key: 'animate', label: '球面化率を往復させる', type: 'bool', default: false },
  ],
  liveKeys: ['t', 'animate'],
  distance: 8,
  compareLabels: ['元の形', '球面化'],
  build(p) {
    const src = baseGeometry(String(p.shape), Number(p.segments)).toNonIndexed();
    const d = deformable(src);
    const useColor = Boolean(p.areaColor);
    const colors = new Float32Array(d.orig.length);
    d.geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(d.geo, std(useColor ? 0xffffff : 0x9fc7ff, { vertexColors: useColor, flatShading: useColor }));
    const before = new THREE.Mesh(src, std(0x8890b0));
    // 目標の球の目安（細い経緯線）
    const guide = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(R, 24, 12)), new THREE.LineBasicMaterial({ color: 0x3a4a7a, transparent: true, opacity: 0.35 }));
    let ratio = 1, shown = NaN;
    const a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
    const col = new THREE.Color();
    const apply = (t: number) => {
      shown = t;
      d.apply((x, y, z, out) => {
        const l = Math.hypot(x, y, z) || 1;
        out.set(x + (x * R / l - x) * t, y + (y * R / l - y) * t, z + (z * R / l - z) * t);
      });
      const pa = d.geo.attributes.position.array as Float32Array;
      const tris = pa.length / 9;
      const areas = new Float32Array(tris);
      let mn = Infinity, mx = 0;
      for (let i = 0; i < tris; i++) {
        a.fromArray(pa, i * 9);
        b.fromArray(pa, i * 9 + 3).sub(a);
        cc.fromArray(pa, i * 9 + 6).sub(a);
        const ar = b.cross(cc).length() * 0.5;
        areas[i] = ar;
        if (ar > 1e-9) mn = Math.min(mn, ar);
        mx = Math.max(mx, ar);
      }
      ratio = mx / mn;
      if (useColor) {
        // 面積を対数で 0..1 に正規化して青→赤に
        const lmn = Math.log(mn), span = Math.max(1e-6, Math.log(mx) - lmn);
        for (let i = 0; i < tris; i++) {
          const s = Math.max(0, Math.log(Math.max(areas[i], mn)) - lmn) / span;
          col.setHSL(0.66 - 0.66 * s, 0.75, 0.55);
          for (let k = 0; k < 3; k++) colors.set([col.r, col.g, col.b], (i * 3 + k) * 3);
        }
        d.geo.attributes.color.needsUpdate = true;
      }
    };
    apply(Number(p.t));
    return {
      object: mesh,
      before,
      helpers: guide,
      info: () => `球面化率 ${shown.toFixed(2)} · 三角形面積 最大/最小 ${ratio.toFixed(2)}`,
      update(_dt, time, live) {
        const t = live.animate ? 0.5 - 0.5 * Math.cos(time * 0.9) : Number(live.t);
        if (t !== shown) apply(t);
      },
    };
  },
});
