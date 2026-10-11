import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { BoxBatch, segments } from '../framework/worldKit';
import { addRoads, insetBy, lotsOfBlock, makeAPoly, outlinePoints, polyArea, prismMesh, rootShape, subdivide, type PrismItem } from '../framework/urbanKit';

/** WRD-014 建物の自動配置：道路→街区→敷地→（前面・隣地後退）→容積率と高さ制限で階数を決めて押し出す */
const FLOOR = 0.11;

export default defineWorldDemo({
  id: 'WRD-014',
  notes: '再帰分割で道路と街区を作り、街区を接道する敷地に割る。各敷地を道路側は前面後退、それ以外は隣地後退だけ縮めた範囲を建築面積とし、階数＝min(容積率×敷地面積÷建築面積, 最高高さ, 道路斜線＝前面道路の幅＋前面後退に比例する高さ) で決めて押し出す（幹線沿いは容積率1.6倍の商業地扱い）。道路（灰・黄）・敷地の境界（緑の線）・建物の3層を同時に表示し、比較の左は建物を建てる前の敷地割り。',
  params: [
    { key: 'front', label: '前面後退', type: 'number', min: 0, max: 0.25, step: 0.005, default: 0.1 },
    { key: 'side', label: '隣地後退', type: 'number', min: 0, max: 0.15, step: 0.005, default: 0.05 },
    { key: 'far', label: '容積率（%）', type: 'number', min: 50, max: 1000, step: 10, default: 400 },
    { key: 'maxH', label: '最高高さ', type: 'number', min: 0.2, max: 3, step: 0.05, default: 1.8 },
    { key: 'slope', label: '道路斜線（道路幅で高さを制限）', type: 'bool', default: true },
    { key: 'frontage', label: '間口', type: 'number', min: 0.3, max: 1.2, step: 0.01, default: 0.55 },
    { key: 'depth', label: '敷地の奥行き', type: 'number', min: 0.3, max: 1.2, step: 0.01, default: 0.6 },
  ],
  distance: 17,
  elevation: 0.8,
  compareLabels: ['敷地割り', '建物配置'],
  build(p, env) {
    const rng = env.rng;
    const base = 0.32;
    const width = (d: number) => base * Math.max(0.3, Math.pow(0.72, d));
    const root = makeAPoly(rootShape('rect', rng), base);
    const { regions, cuts } = subdivide(root, { minArea: env.quality === 'low' ? 6 : 4.5, jitter: 0.3, angle: 0.06, width, rng });
    const front = Number(p.front), side = Number(p.side), far = Number(p.far) / 100, maxH = Number(p.maxH);

    const ground: PrismItem[] = [{ pts: root.pts, base: -0.04, height: 0.04, color: 0x3a3e4a, side: 0x2a2d36 }];
    const walks: PrismItem[] = [];
    const lotsFill: PrismItem[] = [];
    const bldg: PrismItem[] = [];
    const roofs: PrismItem[] = [];
    const lotLines: number[] = [];
    const c = new THREE.Color();
    let nB = 0, floorSum = 0, lotSum = 0, floorArea = 0, byFar = 0, byH = 0, byRoad = 0;
    for (const r of regions) {
      walks.push({ pts: r.block.pts, base: 0, height: 0.03, color: 0xc4beb2, side: 0x9d978a });
      const blk = insetBy(r.block, () => 0.05);
      if (blk.pts.length < 3) continue;
      const { lots, court } = lotsOfBlock(blk, Number(p.frontage), Number(p.depth));
      if (court) lotsFill.push({ pts: court.pts, base: 0.03, height: 0.012, color: 0x4f8a3c });
      for (const lot of lots) {
        const la = polyArea(lot.poly.pts);
        lotSum += la;
        lotsFill.push({ pts: lot.poly.pts, base: 0.03, height: 0.01, color: 0x9fb48a });
        lotLines.push(...outlinePoints([lot.poly.pts], 0.05));
        // 壁面後退：道路に面する辺は前面後退、それ以外は隣地後退
        const fp = insetBy(lot.poly, (a) => (a >= 0 ? front : side));
        if (fp.pts.length < 3) continue;
        const fa = polyArea(fp.pts);
        // 細すぎる（角地の三角形など）建築面積には建てない
        let per = 0;
        for (let i = 0; i < fp.pts.length; i++) per += Math.hypot(fp.pts[(i + 1) % fp.pts.length][0] - fp.pts[i][0], fp.pts[(i + 1) % fp.pts.length][1] - fp.pts[i][1]);
        if (fa < 0.015 || fa < la * 0.25 || (2 * fa) / per < 0.08) continue;
        const lotFar = far * (lot.road >= width(1) * 0.99 ? 1.6 : 1) * (0.6 + rng() * 0.8);
        const nFar = Math.max(1, Math.floor((lotFar * la) / fa));
        const nH = Math.max(1, Math.floor(maxH / FLOOR));
        const nRoad = Boolean(p.slope) ? Math.max(1, Math.floor((4 * (lot.road + front)) / FLOOR)) : Infinity;
        const floors = Math.min(nFar, nH, nRoad);
        if (floors === nFar) byFar++;
        else if (floors === nH) byH++;
        else byRoad++;
        const h = floors * FLOOR;
        const t = Math.min(1, floors / 16);
        c.setHSL(0.58 - 0.5 * t + rng() * 0.03, 0.35 + 0.25 * t, 0.62 - 0.22 * t);
        bldg.push({ pts: fp.pts, base: 0.03, height: h, color: c.getHex(), side: c.getHex() });
        // 屋上：少し縮めた塔屋
        const top = insetBy(fp, () => 0.07);
        if (top.pts.length >= 3 && floors >= 3) roofs.push({ pts: top.pts, base: 0.03 + h, height: 0.03, color: 0x9aa0ac });
        nB++;
        floorSum += floors;
        floorArea += fa * floors;
      }
    }
    const object = new THREE.Group();
    object.add(prismMesh(ground));
    const roads = new BoxBatch();
    addRoads(roads, root, cuts, base);
    object.add(roads.build(new THREE.MeshStandardMaterial({ roughness: 0.85 })));
    object.add(prismMesh(walks));
    object.add(prismMesh(lotsFill));
    object.add(segments(lotLines, 0x1fd65c));
    object.add(prismMesh(bldg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.1, flatShading: true })));
    if (roofs.length) object.add(prismMesh(roofs));

    const before = new THREE.Group();
    before.add(prismMesh(ground));
    const rb = new BoxBatch();
    addRoads(rb, root, cuts, base);
    before.add(rb.build(new THREE.MeshStandardMaterial({ roughness: 0.85 })));
    before.add(prismMesh(walks));
    before.add(prismMesh(lotsFill));
    before.add(segments(lotLines, 0x1fd65c));

    return {
      object,
      before,
      info: `敷地 ${nB} 棟 · 平均 ${nB ? (floorSum / nB).toFixed(1) : 0} 階 · 実現容積率 ${lotSum ? Math.round((floorArea / lotSum) * 100) : 0}% · 階数を決めた規則: 容積率 ${byFar} / 最高高さ ${byH} / 道路斜線 ${byRoad}`,
    };
  },
});
