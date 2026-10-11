import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { BoxBatch, segments } from '../framework/worldKit';
import { ROAD_COLORS, makeAPoly, outlinePoints, prismMesh, roadClass, rootShape, stripArgs, subdivide } from '../framework/urbanKit';

/** WRD-012 再帰的な街区分割：最長辺のほぼ中点で垂直に切り、深さで道路の格と幅を決める */
export default defineWorldDemo({
  id: 'WRD-012',
  notes: '多角形を「最長辺のほぼ中点で、その辺にほぼ垂直な直線」で2分する処理を、面積が閾値を下回るまで再帰的に繰り返す。切り口が道路になり、分割の深さが浅いほど太い幹線（黄）・中位が街路（灰）・深いと路地（暗灰）になる。各街区は周囲の道路幅の半分だけ辺ごとに後退させた多角形で、分割位置・角度の乱れを上げると整然とした格子が旧市街風に崩れる。',
  params: [
    { key: 'minArea', label: '最小街区面積', type: 'number', min: 0.4, max: 8, step: 0.1, default: 1.6 },
    { key: 'jitter', label: '分割位置の乱れ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'angle', label: '角度の乱れ（度）', type: 'number', min: 0, max: 35, step: 1, default: 6 },
    { key: 'road', label: '道路幅（幹線）', type: 'number', min: 0.1, max: 0.6, step: 0.01, default: 0.34 },
    { key: 'shape', label: '元の土地の形', type: 'select', options: [{ value: 'rect', label: '長方形' }, { value: 'poly', label: '不規則な多角形' }], default: 'rect' },
    { key: 'showDepth', label: '表示する分割の深さ', type: 'number', min: 1, max: 12, step: 1, default: 12 },
  ],
  distance: 19,
  elevation: 1.05,
  compareLabels: ['分割前の土地', '街区と道路'],
  build(p, env) {
    const rng = env.rng;
    const base = Number(p.road);
    const width = (d: number) => base * Math.max(0.22, Math.pow(0.7, d));
    const root = makeAPoly(rootShape(String(p.shape), rng), base);
    const { regions, cuts } = subdivide(root, {
      minArea: Number(p.minArea) * (env.quality === 'low' ? 1.3 : 1),
      jitter: Number(p.jitter),
      angle: (Number(p.angle) * Math.PI) / 180,
      width,
      maxDepth: Number(p.showDepth),
      rng,
    });

    const object = new THREE.Group();
    // 舗装面（土地全体）
    object.add(prismMesh([{ pts: root.pts, base: -0.04, height: 0.04, color: 0x3a3e4a, side: 0x2a2d36 }]));
    // 道路：外周と切り口の帯。格で色と幅を変える
    const roads = new BoxBatch();
    const counts = [0, 0, 0];
    for (const c of cuts) {
      const s = stripArgs(c.a, c.b, c.width, false);
      const k = roadClass(c.depth);
      counts[k]++;
      roads.add(s.x, 0.006, s.z, s.len, 0.012, c.width, ROAD_COLORS[k], s.ry);
    }
    for (let i = 0; i < root.pts.length; i++) {
      const s = stripArgs(root.pts[i], root.pts[(i + 1) % root.pts.length], base);
      roads.add(s.x, 0.006, s.z, s.len, 0.012, base, ROAD_COLORS[0], s.ry);
    }
    object.add(roads.build(new THREE.MeshStandardMaterial({ roughness: 0.85 })));
    // 街区：縁石の高さの角柱。深さで色分け
    const c = new THREE.Color();
    object.add(
      prismMesh(
        regions.map((r) => ({
          pts: r.block.pts,
          base: 0,
          height: 0.06 + 0.02 * (r.depth % 3),
          color: c.setHSL((0.55 + r.depth * 0.13) % 1, 0.6, 0.36 + rng() * 0.06).getHex(),
          side: 0xb8b2a4,
        })),
      ),
    );
    // 補助線：分割線（中心線）
    const cl: number[] = [];
    for (const k of cuts) cl.push(k.a[0], 0.02, k.a[1], k.b[0], 0.02, k.b[1]);
    const helpers = segments(cl, 0xffffff, { opacity: 0.25 });

    const before = new THREE.Group();
    before.add(prismMesh([{ pts: root.pts, base: -0.04, height: 0.1, color: 0x5d7d4a, side: 0x3c4a33 }]));
    before.add(segments(outlinePoints([root.pts], 0.07), 0xe0b25a));

    const maxD = regions.reduce((m, r) => Math.max(m, r.depth), 0);
    return {
      object,
      before,
      helpers,
      info: `街区 ${regions.length} · 道路 ${cuts.length} 本（幹線 ${counts[0]} / 街路 ${counts[1]} / 路地 ${counts[2]}） · 最大深さ ${maxD}`,
    };
  },
});
