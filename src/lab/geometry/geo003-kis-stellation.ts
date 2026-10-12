import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';
import { SOLID_OPTIONS, faceCentroid, faceNormal, kis, platonic, polyEdges, polyObject, vef, type Poly } from '../framework/polyhedra';

/** GEO-003 kis による星型化：面の重心から法線方向に高さ h の頂点を立てて三角形の扇に置き換える */

/**
 * 隣の面の平面を延長して、面 0 の中心軸と交わる高さ（面延長による第1星型化の頂点）。
 * 平行で交わらない場合（立方体など）は null。
 */
function stellationHeight(p: Poly): number | null {
  const f = p.faces[0];
  const c = faceCentroid(p, f), n = faceNormal(p, f);
  // f と辺を共有する面
  const a = f[0], b = f[1];
  const g = p.faces.find((h, i) => i !== 0 && h.includes(a) && h.includes(b))!;
  const ng = faceNormal(p, g), cg = faceCentroid(p, g);
  const den = ng.dot(n);
  if (Math.abs(den) < 1e-6) return null;
  const h = (ng.dot(cg) - ng.dot(c)) / den;
  return h > 0 ? h : null;
}

const EDGE_COLORS = [0xff7a59, 0xffc14d, 0x7ad1ff, 0xb38bff, 0x63e6a3];

export default defineGeometryDemo({
  id: 'GEO-003',
  notes: '各面の重心から外向き法線方向に高さ h の頂点を作り、面をその頂点への三角形の扇に置き換える kis 操作。隣の面の平面を延長して中心軸と交わる高さを数値的に求め、正十二面体ではそれが小星型十二面体の棘の高さになる（棘の三角形が隣の面の平面と一致する）。h を負にすると凹んだ形になる。',
  params: [
    { key: 'solid', label: '元の立体', type: 'select', options: SOLID_OPTIONS, default: 'D' },
    { key: 'h', label: '棘の高さ（外接球半径=1）', type: 'number', min: -0.6, max: 2.5, step: 0.01, default: 0.6 },
    { key: 'showPlanes', label: '延長面の交点を表示', type: 'bool', default: true },
  ],
  extraActions: [{ key: 'stellate', label: '面の延長の交点に合わせる', title: '正十二面体なら小星型十二面体の高さ' }],
  onAction(key, p) {
    if (key === 'stellate') {
      const h = stellationHeight(platonic(String(p.solid)));
      if (h !== null) return { h: Math.round(h * 1000) / 1000 };
    }
  },
  distance: 7,
  compareLabels: ['元の立体', 'kis（棘付き）'],
  build(p) {
    const base = platonic(String(p.solid));
    const h = Number(p.h);
    const k = kis(base, h);
    // 元の面ごとに扇を同じ色で塗り、どの面から立てた角錐かを見せる
    const nf = base.faces[0].length;
    const obj = polyObject(k, { color: (_f, fi) => EDGE_COLORS[Math.floor(fi / nf) % EDGE_COLORS.length], edgeColor: 0x10121c });
    const before = polyObject(base);
    const helpers = new THREE.Group();
    helpers.add(new THREE.LineSegments(polyEdges(base), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 })));
    const hs = stellationHeight(base);
    if (p.showPlanes && hs !== null) {
      // 延長面の交点（理論上の棘の先）を小球で示す
      const pts = base.faces.map((f) => faceCentroid(base, f).add(faceNormal(base, f).multiplyScalar(hs)));
      const m = new THREE.InstancedMesh(new THREE.SphereGeometry(0.04, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }), pts.length);
      pts.forEach((q, i) => m.setMatrixAt(i, new THREE.Matrix4().makeTranslation(q.x, q.y, q.z)));
      helpers.add(m);
    }
    const isSSD = String(p.solid) === 'D' && hs !== null && Math.abs(h - hs) < 0.005;
    return {
      object: obj,
      before,
      helpers,
      info: `h=${h.toFixed(3)} · 延長面の交点の高さ=${hs === null ? '交わらない' : hs.toFixed(4)}${isSSD ? ' · 小星型十二面体と一致' : ''} · ${vef(k)}`,
    };
  },
});
