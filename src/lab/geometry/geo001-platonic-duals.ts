import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';
import { SOLID_OPTIONS, dual, faceCentroid, platonic, polyObject, vef } from '../framework/polyhedra';

/** GEO-001 プラトン立体と双対：面の重心を外接球へ射影して双対の頂点にする */

/** 内接球・中接球半径（外接球半径1のとき） */
function radii(kind: string): { inR: number; midR: number } {
  const p = platonic(kind);
  const inR = faceCentroid(p, p.faces[0]).length();
  const f = p.faces[0];
  const midR = p.verts[f[0]].clone().add(p.verts[f[1]]).multiplyScalar(0.5).length();
  return { inR, midR };
}

const NAMES: Record<string, string> = { T: '正四面体', C: '立方体', O: '正八面体', D: '正十二面体', I: '正二十面体' };
const DUALS: Record<string, string> = { T: '正四面体（自己双対）', C: '正八面体', O: '立方体', D: '正二十面体', I: '正十二面体' };

export default defineGeometryDemo({
  id: 'GEO-001',
  notes: '独自の面リスト多面体で正多面体を作り、各面の重心を外接球（×大きさ）へ射影した点を頂点に、元の頂点まわりの面の並びから双対の面を組む。「辺が直交する大きさ」ボタンで中接球に関する極双対（元の辺と双対の辺が直交して交わる配置）になる。V・E・F とオイラー標数を表示。',
  params: [
    { key: 'solid', label: '立体の種類', type: 'select', options: SOLID_OPTIONS, default: 'C' },
    { key: 'dualScale', label: '双対の大きさ（外接球比）', type: 'number', min: 0.3, max: 1.8, step: 0.01, default: 1 },
    { key: 'showDual', label: '双対の表示', type: 'bool', default: true },
    { key: 'solidPrimal', label: '元の立体を不透明に', type: 'bool', default: false },
  ],
  extraActions: [{ key: 'polar', label: '辺が直交する大きさ', title: '中接球に関する極双対（辺の中点で直交）に合わせる' }],
  onAction(key, p) {
    if (key === 'polar') {
      const { inR, midR } = radii(String(p.solid));
      return { dualScale: Math.round(((midR * midR) / inR) * 100) / 100 };
    }
  },
  distance: 6,
  compareLabels: ['元の立体', '双対を重ねる'],
  build(p) {
    const kind = String(p.solid);
    const base = platonic(kind);
    const s = Number(p.dualScale);
    const d = dual(base, s);
    const group = new THREE.Group();
    group.add(polyObject(base, { color: 0x6c8cff, opacity: p.solidPrimal ? 1 : 0.55, edgeColor: 0xcfe0ff }));
    if (p.showDual) group.add(polyObject(d, { color: 0xffa04c, opacity: 0.9, edgeColor: 0x3a1a00 }));
    const before = polyObject(base, { color: 0x6c8cff, edgeColor: 0xcfe0ff });
    const { inR, midR } = radii(kind);
    return {
      object: group,
      before,
      info: `${NAMES[kind]}: ${vef(base)} · 双対=${DUALS[kind]}: ${vef(d)} · 直交する大きさ=${((midR * midR) / inR).toFixed(3)}`,
    };
  },
});
