import { defineGeometryDemo } from '../framework/sceneLab';
import { SOLID_OPTIONS, conway, degreeSummary, platonic, polyObject, vef } from '../framework/polyhedra';

/** GEO-007 コンウェイ多面体演算：記法を右から順に種へ適用する */

const OPS = [
  { value: 't', label: 't 切頂（tI=サッカーボール）' },
  { value: 'a', label: 'a アンボ（aC=立方八面体）' },
  { value: 'd', label: 'd 双対' },
  { value: 'k', label: 'k キス（kD=五方十二面体）' },
  { value: 'dt', label: 'dt 五角化（dtI）' },
  { value: 'j', label: 'j=da ジョイン（菱形）' },
  { value: 'e', label: 'e=aa 拡張（斜方）' },
  { value: 'b', label: 'b=ta 面取り（斜方切頂）' },
  { value: 'o', label: 'o=jj オルト' },
  { value: 'g', label: 'g ジャイロ' },
  { value: 's', label: 's=dgd スナブ' },
  { value: 'tk', label: 'tk' },
  { value: 'dak', label: 'dak' },
  { value: 'kt', label: 'kt' },
  { value: 'at', label: 'at' },
  { value: 'tdk', label: 'tdk' },
];

export default defineGeometryDemo({
  id: 'GEO-007',
  notes: '面リスト多面体に d（双対：面の重心と頂点まわりの面の並び）・a（辺の中点）・k（面に角錐）・t（辺の1/3点で切頂）・g（面を五角形に分割）を実装し、j/e/b/o/s はその合成として、記法を右から順に種へ適用する。各演算の後に Hart 流の簡易正準化（辺を単位球に接させ、面を平面化する反復）で形を整える。面は辺数で色分け。',
  params: [
    { key: 'ops', label: '記法プリセット（演算子）', type: 'select', options: OPS, default: 't' },
    { key: 'seed', label: '種の多面体', type: 'select', options: SOLID_OPTIONS, default: 'I' },
    { key: 'color', label: '面の色分け', type: 'select', options: [{ value: 'degree', label: '辺数で色分け' }, { value: 'mono', label: '単色' }], default: 'degree' },
    { key: 'canonical', label: '正準化（面を平面・辺を球に接させる）', type: 'bool', default: true },
  ],
  distance: 5.5,
  compareLabels: ['種', '演算後'],
  build(p) {
    const seed = String(p.seed);
    const ops = String(p.ops);
    const t0 = performance.now();
    const poly = conway(ops, seed, { canonical: Boolean(p.canonical) });
    const ms = performance.now() - t0;
    const obj = polyObject(poly, { color: p.color === 'mono' ? 0x9fb4ff : 'degree' });
    return {
      object: obj,
      before: polyObject(platonic(seed)),
      info: `${ops}${seed} · ${vef(poly)} · ${degreeSummary(poly)} · 計算 ${ms.toFixed(0)}ms`,
    };
  },
});
