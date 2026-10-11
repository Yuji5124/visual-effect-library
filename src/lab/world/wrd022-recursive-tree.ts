import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { InstSet, segmentMatrix, unitBranch } from '../framework/natureKit';

/** WRD-022 再帰分岐による3D樹木：開き角・黄金角の回転・縮小率・ダ・ヴィンチ則の太さ・重力の垂れ */
interface Seg {
  a: THREE.Vector3;
  b: THREE.Vector3;
  r: number;
  level: number;
}

function grow(
  p: { depth: number; n: number; spread: number; ratio: number; gravity: number; asym: number },
  rng: () => number,
  cap: number,
): { segs: Seg[]; tips: { pos: THREE.Vector3; dir: THREE.Vector3 }[]; depth: number } {
  // 本数の上限を超えない深さに抑える
  let depth = p.depth;
  while (depth > 1 && (Math.pow(p.n, depth + 1) - 1) / (p.n - 1) > cap) depth--;
  const segs: Seg[] = [];
  const tips: { pos: THREE.Vector3; dir: THREE.Vector3 }[] = [];
  const GOLDEN = THREE.MathUtils.degToRad(137.5);
  // 幅優先で作る（並び順＝成長順）
  let queue = [{ pos: new THREE.Vector3(0, 0, 0), dir: new THREE.Vector3(0, 1, 0), len: 1.6, r: 0.13, level: 0, roll: 0 }];
  const side = new THREE.Vector3(), tmp = new THREE.Vector3();
  while (queue.length) {
    const next: typeof queue = [];
    for (const q of queue) {
      const end = q.pos.clone().addScaledVector(q.dir, q.len);
      segs.push({ a: q.pos, b: end, r: q.r, level: q.level });
      if (q.level >= depth) {
        tips.push({ pos: end, dir: q.dir });
        continue;
      }
      // 親の向きに垂直な基準軸
      side.crossVectors(q.dir, Math.abs(q.dir.y) > 0.95 ? tmp.set(1, 0, 0) : tmp.set(0, 1, 0)).normalize();
      // ダ・ヴィンチ則：親の断面積 ≈ 子の断面積の和
      const cr = q.r / Math.sqrt(p.n);
      for (let i = 0; i < p.n; i++) {
        const roll = q.roll + (i * Math.PI * 2) / p.n + GOLDEN + (rng() - 0.5) * p.asym * 1.2;
        const axis = side.clone().applyAxisAngle(q.dir, roll);
        const ang = THREE.MathUtils.degToRad(p.spread) * (1 + (rng() - 0.5) * p.asym);
        const d = q.dir.clone().applyAxisAngle(axis, ang);
        // 重力：先端ほど下へ垂れる
        d.y -= p.gravity * ((q.level + 1) / depth) * 0.6;
        d.normalize();
        const len = q.len * p.ratio * (1 + (rng() - 0.5) * p.asym * 0.6);
        next.push({ pos: end, dir: d, len, r: cr, level: q.level + 1, roll });
      }
    }
    queue = next;
  }
  return { segs, tips, depth };
}

function makeTree(segs: Seg[], tips: { pos: THREE.Vector3; dir: THREE.Vector3 }[], leaves: boolean, rng: () => number, depth: number) {
  const group = new THREE.Group();
  const bark = new InstSet(unitBranch(7, 0.72), new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), segs.length);
  const m = new THREE.Matrix4();
  const c0 = new THREE.Color(0x5a3b22), c1 = new THREE.Color(0x8a6a3e), c = new THREE.Color();
  for (const s of segs) bark.putMatrix(segmentMatrix(m, s.a, s.b, s.r), c.copy(c0).lerp(c1, s.level / Math.max(1, depth)));
  bark.commit();
  group.add(bark.mesh);
  const per = 4;
  const leafGeo = new THREE.PlaneGeometry(1, 1);
  leafGeo.translate(0, 0.5, 0);
  const leaf = new InstSet(leafGeo, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }), leaves ? tips.length * per : 0);
  if (leaves) {
    const b = new THREE.Vector3(), d = new THREE.Vector3();
    const size = Math.max(0.12, segs[segs.length - 1].a.distanceTo(segs[segs.length - 1].b) * 0.9);
    for (const t of tips) {
      for (let k = 0; k < per; k++) {
        d.set(rng() - 0.5, rng() - 0.3, rng() - 0.5).normalize().add(t.dir).normalize();
        b.copy(t.pos).addScaledVector(d, size);
        c.setHSL(0.24 + rng() * 0.1, 0.6, 0.3 + rng() * 0.15);
        leaf.putMatrix(segmentMatrix(m, t.pos, b, size * 0.6, size * 0.6), c);
      }
    }
  }
  leaf.commit();
  group.add(leaf.mesh);
  return { group, bark, leaf };
}

export default defineWorldDemo({
  id: 'WRD-022',
  notes: '各枝の先で分岐数ぶんの子枝を、親の向きから開き角だけ傾け、黄金角（137.5°）ずつ回して生やす。長さは縮小率倍、太さはダ・ヴィンチ則（子の半径＝親÷√分岐数）。重力で先端ほど垂れ、非対称さで個体差が出る。比較の左は重力と乱れを0にした同じ規則の木。',
  params: [
    { key: 'depth', label: '深さ', type: 'number', min: 1, max: 10, step: 1, default: 7 },
    { key: 'n', label: '分岐数', type: 'number', min: 2, max: 5, step: 1, default: 3 },
    { key: 'spread', label: '開き角（度）', type: 'number', min: 5, max: 80, step: 1, default: 34 },
    { key: 'ratio', label: '縮小率', type: 'number', min: 0.5, max: 0.92, step: 0.01, default: 0.74 },
    { key: 'gravity', label: '重力（垂れ）', type: 'number', min: -0.3, max: 1.2, step: 0.01, default: 0.3 },
    { key: 'asym', label: '非対称さ（乱れ）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.35 },
    { key: 'leaves', label: '葉をつける', type: 'bool', default: true },
    { key: 'grow', label: '成長を再生', type: 'bool', default: true },
  ],
  liveKeys: ['grow'],
  distance: 9,
  elevation: 0.3,
  target: [0, 2.6, 0],
  compareLabels: ['重力・乱れなし', '再帰樹木'],
  build(p, env) {
    const cap = env.quality === 'low' ? 8000 : 30000;
    const prm = { depth: Number(p.depth), n: Number(p.n), spread: Number(p.spread), ratio: Number(p.ratio), gravity: Number(p.gravity), asym: Number(p.asym) };
    const t = grow(prm, env.rng, cap);
    const tree = makeTree(t.segs, t.tips, Boolean(p.leaves), env.rng, t.depth);
    const tb = grow({ ...prm, gravity: 0, asym: 0 }, () => 0.5, cap);
    const before = makeTree(tb.segs, tb.tips, Boolean(p.leaves), () => 0.5, tb.depth).group;
    const ground = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.6, 0.08, 40), new THREE.MeshStandardMaterial({ color: 0x3b4a2a, roughness: 1 }));
    ground.position.y = -0.04;
    tree.group.add(ground);
    const nSeg = t.segs.length, nLeaf = tree.leaf.capacity;
    let f = 1;
    return {
      object: tree.group,
      before,
      info: () => `枝 ${nSeg.toLocaleString()} 本 · 葉 ${nLeaf.toLocaleString()} 枚 · 実効の深さ ${t.depth}${t.depth < prm.depth ? '（本数上限で制限）' : ''} · 成長 ${(f * 100).toFixed(0)}%`,
      update(_dt, time, live) {
        f = live.grow ? Math.min(1, time / 3.5) : 1;
        // 幅優先の順に並んでいるので、表示数を指数的に増やすと根元から先端へ一定の速さで育つ
        tree.bark.mesh.count = Math.round(Math.pow(nSeg, Math.min(1, f * 1.25)));
        tree.leaf.mesh.count = f > 0.8 ? Math.ceil(nLeaf * (f - 0.8) * 5) : 0;
      },
    };
  },
});
