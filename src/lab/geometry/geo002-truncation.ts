import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';
import { SOLID_OPTIONS, degreeSummary, platonic, polyEdges, polyObject, polyToGeometry, truncate, vef } from '../framework/polyhedra';

/** GEO-002 切頂：各辺を両端から割合 t で切り、元の面は2n角形、元の頂点は新しい面になる */

/** 面が正多角形になる t = 1/(2+2cos(π/n))（n は元の面の辺数） */
const regularT = (kind: string) => {
  const n = platonic(kind).faces[0].length;
  return 1 / (2 + 2 * Math.cos(Math.PI / n));
};

const NAMES: Record<string, [string, string]> = {
  T: ['切頂四面体', '正八面体'],
  C: ['切頂六面体', '立方八面体'],
  O: ['切頂八面体', '立方八面体'],
  D: ['切頂十二面体', '二十・十二面体'],
  I: ['切頂二十面体', '二十・十二面体'],
};

export default defineGeometryDemo({
  id: 'GEO-002',
  notes: '多面体の各辺上に両端から割合 t の分割点を作り、元の面を「辺の数が2倍の多角形」に、元の頂点まわりの分割点を隣接順に並べた新しい面に置き換える。t=1/(2+2cos(π/n)) で全面が正多角形のアルキメデス立体、t=0.5 で平行化（立方八面体など）。面は辺数で色分け。',
  params: [
    { key: 'solid', label: '元の立体', type: 'select', options: SOLID_OPTIONS, default: 'C' },
    { key: 't', label: '切頂率 t', type: 'number', min: 0.01, max: 0.5, step: 0.005, default: 0.29 },
    { key: 'animate', label: 't を 0→0.5 で往復させる', type: 'bool', default: false },
  ],
  liveKeys: ['animate'],
  extraActions: [
    { key: 'regular', label: '正多角形になる t', title: 't = 1/(2+2cos(π/n)) に合わせる' },
    { key: 'rectify', label: '平行化 t=0.5' },
  ],
  onAction(key, p) {
    if (key === 'regular') return { t: Math.round(regularT(String(p.solid)) * 1000) / 1000, animate: false };
    if (key === 'rectify') return { t: 0.5, animate: false };
  },
  distance: 5.5,
  compareLabels: ['元の立体', '切頂'],
  build(p) {
    const kind = String(p.solid);
    const base = platonic(kind);
    const obj = polyObject(truncate(base, Number(p.t)));
    const mesh = obj.children[0] as THREE.Mesh;
    const lines = obj.children[1] as THREE.LineSegments;
    const before = polyObject(base);
    let shownT = Number(p.t);
    let last = truncate(base, shownT);
    const set = (t: number) => {
      shownT = t;
      last = truncate(base, t);
      mesh.geometry.dispose();
      mesh.geometry = polyToGeometry(last);
      lines.geometry.dispose();
      lines.geometry = polyEdges(last);
    };
    const tr = regularT(kind);
    // 元の立体の辺を薄く重ねて、切り取られた角の位置を見せる
    const ghost = new THREE.LineSegments(polyEdges(base), new THREE.LineBasicMaterial({ color: 0x8890b0, transparent: true, opacity: 0.35 }));
    return {
      object: obj,
      before,
      helpers: ghost,
      info: () => {
        const name = Math.abs(shownT - tr) < 0.003 ? NAMES[kind][0] : shownT >= 0.4995 ? NAMES[kind][1] : '切頂の途中';
        return `t=${shownT.toFixed(3)}（正多角形 t=${tr.toFixed(4)}）· ${name} · ${vef(last)} · ${degreeSummary(last)}`;
      },
      update(_dt, time, live) {
        if (live.animate) {
          set(0.01 + 0.49 * (0.5 - 0.5 * Math.cos(time * 0.7)));
        } else if (shownT !== Number(p.t)) set(Number(p.t));
      },
    };
  },
});
