import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { lineSegs, starPoints, polyline } from '../framework/deformKit';

/** GEO-031 押出とベベル：穴あき星形の Shape を ExtrudeGeometry で厚みのある立体にする */

function makeShape(k: number, holeR: number): THREE.Shape {
  const shape = new THREE.Shape(starPoints(k, 1.6, 0.85));
  if (holeR > 0) {
    const hole = new THREE.Path();
    hole.absarc(0, 0, holeR, 0, Math.PI * 2, true);
    shape.holes.push(hole);
  }
  return shape;
}

export default defineGeometryDemo({
  id: 'GEO-031',
  notes: '星形＋円の穴の Shape を ExtrudeGeometry で押し出す。前後の蓋は輪郭を耳刈り法で三角形分割したもの（右の水色の線がその結果）、側面は輪郭に沿った帯、ベベルは輪郭を内側へオフセットしながら段数ぶん押し出して角を丸める。ワイヤーフレームで分割の様子を確認できる。',
  params: [
    { key: 'depth', label: '深さ', type: 'number', min: 0.05, max: 2, step: 0.01, default: 0.6 },
    { key: 'bevelThickness', label: 'ベベル厚', type: 'number', min: 0, max: 0.4, step: 0.01, default: 0.18 },
    { key: 'bevelSize', label: 'ベベル幅（輪郭のオフセット）', type: 'number', min: 0, max: 0.3, step: 0.01, default: 0.12 },
    { key: 'bevelSegments', label: 'ベベル段数', type: 'number', min: 1, max: 12, step: 1, default: 5 },
    { key: 'points', label: '星の角数', type: 'number', min: 3, max: 12, step: 1, default: 5 },
    { key: 'hole', label: '穴の半径', type: 'number', min: 0, max: 0.7, step: 0.01, default: 0.45 },
  ],
  distance: 8,
  elevation: 0.35,
  compareLabels: ['2Dの輪郭（蓋の三角形分割）', '押出＋ベベル'],
  build(p) {
    const k = Number(p.points);
    const shape = makeShape(k, Number(p.hole));
    const bt = Number(p.bevelThickness), bs = Number(p.bevelSize);
    const geo = new THREE.ExtrudeGeometry(shape, {
      depth: Number(p.depth),
      bevelEnabled: bt > 0 || bs > 0,
      bevelThickness: bt,
      bevelSize: bs,
      bevelSegments: Number(p.bevelSegments),
      curveSegments: 24,
      steps: 1,
    });
    geo.translate(0, 0, -Number(p.depth) / 2);
    // 2つの材質：0=蓋、1=側面（ExtrudeGeometry のグループ）
    const mesh = new THREE.Mesh(geo, [std(0xffc46b), std(0x6b8cff)]);
    mesh.position.y = 1.8;

    // 処理前：平面の Shape（蓋と同じ三角形分割）
    const flat = new THREE.ShapeGeometry(shape, 24);
    const before = new THREE.Mesh(flat, std(0x8890b0, { side: THREE.DoubleSide }));
    before.position.y = 1.8;

    // 三角形分割の結果を線で表示（右に並べる）
    const extracted = shape.extractPoints(24);
    const contour = extracted.shape, holes = extracted.holes;
    // triangulateShape は末尾の重複点を取り除く（配列を書き換える）ので、連結はその後に行う
    const tris = THREE.ShapeUtils.triangulateShape(contour, holes);
    const all = [...contour, ...holes.flat()];
    const seg: number[] = [];
    const ox = 4;
    for (const [a, b, c] of tris) {
      for (const [i, j] of [[a, b], [b, c], [c, a]]) seg.push(all[i].x + ox, all[i].y + 1.8, 0, all[j].x + ox, all[j].y + 1.8, 0);
    }
    const helpers = new THREE.Group();
    helpers.add(lineSegs(seg, 0x6bd3ff, 0.8));
    helpers.add(polyline(contour.map((v) => new THREE.Vector3(v.x + ox, v.y + 1.8, 0.01)), 0xffd27a, { closed: true }));
    for (const h of holes) helpers.add(polyline(h.map((v) => new THREE.Vector3(v.x + ox, v.y + 1.8, 0.01)), 0xff7a7a, { closed: true }));
    return {
      object: mesh,
      before,
      helpers,
      info: `輪郭 ${contour.length} 点 + 穴 ${holes.reduce((s, h) => s + h.length, 0)} 点 → 蓋の三角形 ${tris.length}（n+h−2+2×穴 = ${contour.length + holes.reduce((s, h) => s + h.length, 0) - 2 + 2 * holes.length}）`,
    };
  },
});
