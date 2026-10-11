import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { BoxBatch, segments } from '../framework/worldKit';
import { addRoads, insetBy, lotsOfBlock, makeAPoly, outlinePoints, polyArea, polyCentroid, pointInPoly, prismMesh, rootShape, stripArgs, subdivide } from '../framework/urbanKit';

/** WRD-013 区画割り：街区の外周から奥行きの帯をとり、間口で刻んで「必ず接道する」敷地にする */

export default defineWorldDemo({
  id: 'WRD-013',
  notes: '再帰分割で作った街区（凸多角形）ごとに、各道路辺から奥行きぶんの帯をとる。帯を辺に沿って間口で等分して敷地にするので、すべての敷地が道路に接する（接道辺を黄色、角地のもう1辺を橙で強調）。帯どうしの境は長い辺を優先して角地を作る。奥行きより内側の残りは中庭（緑・木）として残し、「中庭を残す」を切ると、どの辺に一番近いか（凸多角形の直線骨格）で街区全体を分け、敷地が中心まで伸びる。',
  params: [
    { key: 'frontage', label: '間口', type: 'number', min: 0.2, max: 1.5, step: 0.01, default: 0.5 },
    { key: 'depth', label: '奥行き', type: 'number', min: 0.2, max: 1.6, step: 0.01, default: 0.62 },
    { key: 'court', label: '中庭を残す', type: 'bool', default: true },
    { key: 'blockArea', label: '街区の大きさ', type: 'number', min: 2, max: 10, step: 0.1, default: 4.5 },
    { key: 'jitter', label: '街区の乱れ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.3 },
    { key: 'showFront', label: '接道辺を強調', type: 'bool', default: true },
  ],
  liveKeys: ['showFront'],
  distance: 18,
  elevation: 1.0,
  compareLabels: ['街区（分割前）', '敷地割り'],
  build(p, env) {
    const rng = env.rng;
    const base = 0.3;
    const width = (d: number) => base * Math.max(0.3, Math.pow(0.72, d));
    const root = makeAPoly(rootShape('rect', rng), base);
    const { regions, cuts } = subdivide(root, { minArea: Number(p.blockArea) * (env.quality === 'low' ? 1.3 : 1), jitter: Number(p.jitter), angle: 0.08, width, rng });
    const depth = Boolean(p.court) ? Number(p.depth) : Infinity;

    const object = new THREE.Group();
    object.add(prismMesh([{ pts: root.pts, base: -0.04, height: 0.04, color: 0x3a3e4a, side: 0x2a2d36 }]));
    const roads = new BoxBatch();
    addRoads(roads, root, cuts, base);
    object.add(roads.build(new THREE.MeshStandardMaterial({ roughness: 0.85 })));

    const lotItems: Parameters<typeof prismMesh>[0] = [];
    const courtItems: Parameters<typeof prismMesh>[0] = [];
    const sidewalk: Parameters<typeof prismMesh>[0] = [];
    const fronts = new BoxBatch();
    const trees = new BoxBatch();
    const lotLines: number[] = [];
    const c = new THREE.Color();
    let nLots = 0, courtArea = 0, lotArea = 0;
    for (const r of regions) {
      sidewalk.push({ pts: r.block.pts, base: 0, height: 0.035, color: 0xc9c4b8, side: 0x9d978a });
      // 歩道の分だけ少し縮めた街区を敷地割りする
      const blk = insetBy(r.block, () => 0.05);
      if (blk.pts.length < 3) continue;
      const { lots, court } = lotsOfBlock(blk, Number(p.frontage), depth);
      for (const lot of lots) {
        const shown = insetBy(lot.poly, () => 0.012);
        if (shown.pts.length < 3) continue;
        nLots++;
        lotArea += polyArea(lot.poly.pts);
        c.setHSL(0.08 + rng() * 0.12, 0.35 + rng() * 0.2, 0.55 + rng() * 0.15);
        lotItems.push({ pts: shown.pts, base: 0.035, height: 0.03 + rng() * 0.015, color: c.getHex(), side: 0x7d7262 });
        lotLines.push(...outlinePoints([lot.poly.pts], 0.085));
        // 接道辺（角地は2辺）
        lot.poly.attr.forEach((v, f) => {
          if (v < 0) return;
          const s = stripArgs(lot.poly.pts[f], lot.poly.pts[(f + 1) % lot.poly.pts.length], 0, false);
          if (s.len > 0.02) fronts.add(s.x, 0.09, s.z, s.len * 0.86, 0.02, 0.05, f === lot.front ? 0xffd54a : 0xff9b3d, s.ry);
        });
      }
      if (court) {
        courtArea += polyArea(court.pts);
        const shown = insetBy(court, () => 0.015);
        if (shown.pts.length >= 3) {
          courtItems.push({ pts: shown.pts, base: 0.035, height: 0.02, color: 0x4f8a3c, side: 0x3b6a2c });
          // 中庭の木
          const [cx, cz] = polyCentroid(shown.pts);
          const area = polyArea(shown.pts);
          const nt = Math.min(6, Math.floor(area / 0.25));
          for (let t = 0, tries = 0; t < nt && tries < 40; tries++) {
            const x = cx + (rng() - 0.5) * Math.sqrt(area) * 1.2, z = cz + (rng() - 0.5) * Math.sqrt(area) * 1.2;
            if (!pointInPoly(x, z, shown.pts)) continue;
            const h = 0.18 + rng() * 0.14;
            trees.addOnGround(x, z, 0.16, h, 0.16, c.setHSL(0.3 + rng() * 0.06, 0.5, 0.3).getHex(), 0.055);
            t++;
          }
        }
      }
    }
    object.add(prismMesh(sidewalk));
    object.add(prismMesh(lotItems));
    if (courtItems.length) object.add(prismMesh(courtItems));
    object.add(segments(lotLines, 0x2b2b2b, { opacity: 0.7 }));
    if (trees.count) object.add(trees.build(new THREE.MeshStandardMaterial({ roughness: 0.8, flatShading: true }), new THREE.ConeGeometry(0.5, 1, 6)));
    const frontMesh = fronts.build(new THREE.MeshStandardMaterial({ roughness: 0.5, emissive: 0x4a3a00 }));
    const helpers = new THREE.Group();
    helpers.add(frontMesh);

    const before = new THREE.Group();
    before.add(prismMesh([{ pts: root.pts, base: -0.04, height: 0.04, color: 0x3a3e4a, side: 0x2a2d36 }]));
    const rb = new BoxBatch();
    addRoads(rb, root, cuts, base);
    before.add(rb.build(new THREE.MeshStandardMaterial({ roughness: 0.85 })));
    before.add(prismMesh(regions.map((r) => ({ pts: r.block.pts, base: 0, height: 0.06, color: 0x8f9a7a, side: 0x9d978a }))));

    const total = lotArea + courtArea;
    return {
      object,
      before,
      helpers,
      info: `街区 ${regions.length} · 敷地 ${nLots}（すべて接道） · 中庭の割合 ${total > 0 ? Math.round((courtArea / total) * 100) : 0}%`,
      update(_dt, _t, live) {
        helpers.visible = Boolean(live.showFront);
      },
    };
  },
});
