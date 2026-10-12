import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { InstSet, segmentMatrix, unitBranch } from '../framework/natureKit';

/** WRD-023 L-システム植物：並列書き換えで文字列を世代ごとに展開し、3Dタートルで枝と葉にする */
interface RuleSet {
  axiom: string;
  angle: number;
  rules: Record<string, string[]>;
  maxGen: number;
}

// ABOP（Prusinkiewicz & Lindenmayer）の代表的な規則。確率規則では右辺の候補から等確率で選ぶ
const SETS: Record<string, RuleSet> = {
  bush: {
    axiom: 'A',
    angle: 22.5,
    rules: { A: ['[&FLA]/////[&FLA]///////[&FLA]', '[&FLA]///////[&FLA]', '[&FLA]////[&FLA]////[&FLA]////[&FLA]'], F: ['S/////F'], S: ['FL'] },
    maxGen: 7,
  },
  plant: {
    axiom: 'F',
    angle: 25.7,
    rules: { F: ['F[+F]F[-F]F', 'F[+F]F', 'F[-F]F'] },
    maxGen: 5,
  },
  weed: {
    axiom: 'X',
    angle: 22.5,
    rules: { X: ['F[+X]//F[-X]//+XL', 'F[-X]//F[+X]//-XL', 'F[&X]//F[^X]X'], F: ['FF'] },
    maxGen: 7,
  },
  grass: {
    axiom: 'F',
    angle: 22.5,
    rules: { F: ['FF-[-F+F+F]+[+F-F-F]', 'FF+[+F-F]-[-F+F+F]', 'FF/[-F+F+F]\\[+F-F-F]'] },
    maxGen: 4,
  },
};

const MAX_LEN = 260000;

function rewrite(set: RuleSet, gens: number, stochastic: boolean, rng: () => number): string[] {
  const out = [set.axiom];
  let s = set.axiom;
  for (let g = 0; g < gens; g++) {
    let n = '';
    for (const ch of s) {
      const r = set.rules[ch];
      if (!r) n += ch;
      else n += stochastic ? r[Math.floor(rng() * r.length)] : r[0];
      if (n.length > MAX_LEN) break;
    }
    if (n.length > MAX_LEN) break;
    out.push((s = n));
  }
  return out;
}

interface Shape {
  segs: Float32Array; // ax ay az bx by bz depth
  nSeg: number;
  leaves: Float32Array; // x y z hx hy hz
  nLeaf: number;
  height: number;
}

/** 3Dタートル：H（進行方向）・L（左）・U（上）の直交座標系を回して解釈する */
function interpret(str: string, angleDeg: number, stochastic: boolean, rng: () => number): Shape {
  const segs: number[] = [];
  const leaves: number[] = [];
  let pos = new THREE.Vector3();
  let H = new THREE.Vector3(0, 1, 0), L = new THREE.Vector3(-1, 0, 0), U = new THREE.Vector3(0, 0, 1);
  let depth = 0;
  const stack: { pos: THREE.Vector3; H: THREE.Vector3; L: THREE.Vector3; U: THREE.Vector3; depth: number }[] = [];
  let maxY = 0.001;
  const rot = (axis: THREE.Vector3, a: number, v1: THREE.Vector3, v2: THREE.Vector3) => {
    v1.applyAxisAngle(axis, a);
    v2.applyAxisAngle(axis, a);
  };
  for (const ch of str) {
    const a = THREE.MathUtils.degToRad(angleDeg) * (stochastic ? 0.85 + rng() * 0.3 : 1);
    switch (ch) {
      case 'F': {
        const next = pos.clone().add(H);
        segs.push(pos.x, pos.y, pos.z, next.x, next.y, next.z, depth);
        pos = next;
        maxY = Math.max(maxY, pos.y);
        break;
      }
      case 'f':
        pos = pos.clone().add(H);
        break;
      case '+': rot(U, a, H, L); break;
      case '-': rot(U, -a, H, L); break;
      case '&': rot(L, a, H, U); break;
      case '^': rot(L, -a, H, U); break;
      case '\\': rot(H, a, L, U); break;
      case '/': rot(H, -a, L, U); break;
      case '|': rot(U, Math.PI, H, L); break;
      case '!': depth += 0.5; break;
      case 'L': leaves.push(pos.x, pos.y, pos.z, H.x, H.y, H.z); break;
      case '[':
        stack.push({ pos, H: H.clone(), L: L.clone(), U: U.clone(), depth });
        depth += 1;
        break;
      case ']': {
        const s = stack.pop();
        if (s) ({ pos, H, L, U, depth } = s);
        break;
      }
    }
  }
  return { segs: new Float32Array(segs), nSeg: segs.length / 7, leaves: new Float32Array(leaves), nLeaf: leaves.length / 6, height: maxY };
}

export default defineWorldDemo({
  id: 'WRD-023',
  notes: '規則（例 F→F[+F]F[−F]F）で文字列の全文字を同時に書き換え、F=前進、+−=左右、&^=上下、\\/=ひねり、[ ]=分岐の保存と復元、L=葉として3Dタートルで解釈する。再生中は世代0から順に、各世代を描き順に伸ばしていく。確率規則では右辺を乱数で選び、角度も揺らぐ。',
  params: [
    {
      key: 'set',
      label: '規則セット',
      type: 'select',
      options: [
        { value: 'bush', label: '3D低木（ABOP 図1.25風）' },
        { value: 'weed', label: '3D草本（X→F[+X]F[−X]+X 系）' },
        { value: 'plant', label: '枝分かれ植物（F→F[+F]F[−F]F）' },
        { value: 'grass', label: '茂み（F→FF−[−F+F+F]+[+F−F−F]）' },
      ],
      default: 'bush',
    },
    { key: 'gen', label: '世代（最大）', type: 'number', min: 1, max: 7, step: 1, default: 6 },
    { key: 'angle', label: '角度（度）', type: 'number', min: 5, max: 60, step: 0.5, default: 22.5 },
    { key: 'stochastic', label: '確率規則（個体差）', type: 'bool', default: true },
    { key: 'animate', label: '世代を時間とともに進める', type: 'bool', default: true },
  ],
  liveKeys: ['animate'],
  distance: 10,
  elevation: 0.25,
  target: [0, 2.6, 0],
  build(p, env) {
    const set = SETS[String(p.set)] ?? SETS.bush;
    const maxGen = Math.min(set.maxGen - (env.quality === 'low' ? 1 : 0), Number(p.gen));
    const stochastic = Boolean(p.stochastic);
    const strs = rewrite(set, maxGen, stochastic, env.rng);
    const angle = Number(p.angle);
    const shapes = strs.map((s) => interpret(s, angle, stochastic, env.rng));
    const G = strs.length - 1;
    const capSeg = Math.max(1, ...shapes.map((s) => s.nSeg));
    const capLeaf = Math.max(1, ...shapes.map((s) => s.nLeaf));
    const group = new THREE.Group();
    const bark = new InstSet(unitBranch(5, 0.8), new THREE.MeshStandardMaterial({ roughness: 0.85, flatShading: true }), capSeg);
    const leafGeo = new THREE.PlaneGeometry(1, 1);
    leafGeo.translate(0, 0.5, 0);
    const leaf = new InstSet(leafGeo, new THREE.MeshStandardMaterial({ roughness: 0.7, side: THREE.DoubleSide }), capLeaf);
    const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.7, 0.4, 24), new THREE.MeshStandardMaterial({ color: 0x8a4b32, roughness: 0.9 }));
    pot.position.y = -0.2;
    group.add(bark.mesh, leaf.mesh, pot);
    const m = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), h = new THREE.Vector3();
    const c = new THREE.Color(), cBase = new THREE.Color(0x4f3a22), cTip = new THREE.Color(0x6fae3c);
    let shownGen = -1;
    // 世代 g を描く。古い世代ほど小さい（同じ歩幅で育つ様子に近づける）
    const fill = (g: number) => {
      shownGen = g;
      const s = shapes[g];
      const H = 5.2 * (0.3 + (0.7 * g) / Math.max(1, G));
      const k = H / s.height;
      bark.reset();
      for (let i = 0; i < s.nSeg; i++) {
        const o = i * 7;
        a.set(s.segs[o], s.segs[o + 1], s.segs[o + 2]).multiplyScalar(k);
        b.set(s.segs[o + 3], s.segs[o + 4], s.segs[o + 5]).multiplyScalar(k);
        const d = s.segs[o + 6];
        const r = Math.max(0.006, H * 0.014 * Math.pow(0.78, d));
        bark.putMatrix(segmentMatrix(m, a, b, r), c.copy(cBase).lerp(cTip, Math.min(1, d / 5)));
      }
      bark.commit();
      leaf.reset();
      const ls = Math.max(0.08, H * 0.035);
      for (let i = 0; i < s.nLeaf; i++) {
        const o = i * 6;
        a.set(s.leaves[o], s.leaves[o + 1], s.leaves[o + 2]).multiplyScalar(k);
        h.set(s.leaves[o + 3], s.leaves[o + 4], s.leaves[o + 5]);
        h.x += Math.sin(i * 12.9898) * 0.6;
        h.z += Math.cos(i * 78.233) * 0.6;
        b.copy(a).addScaledVector(h.normalize(), ls);
        c.setHSL(0.26 + 0.06 * Math.sin(i * 3.1), 0.6, 0.35);
        leaf.putMatrix(segmentMatrix(m, a, b, ls * 0.6), c);
      }
      leaf.commit();
    };
    fill(G);
    let reveal = 1;
    const period = 2;
    return {
      object: group,
      info: () => `世代 ${shownGen}/${G} · 文字列長 ${strs[shownGen].length.toLocaleString()} · 枝 ${shapes[shownGen].nSeg.toLocaleString()} · 葉 ${shapes[shownGen].nLeaf.toLocaleString()}${strs.length - 1 < maxGen ? ' · 長さ上限で打ち切り' : ''}`,
      update(_dt, time, live) {
        let g = G;
        reveal = 1;
        if (live.animate) {
          const cyc = time / period;
          // 世代1から順に（公理だけの世代0は省く）、最終世代は2周期ぶん見せる
          g = 1 + (Math.floor(cyc) % (G + 1));
          if (g > G) g = G;
          else reveal = Math.min(1, (cyc - Math.floor(cyc)) * 1.6);
        }
        if (g !== shownGen) fill(g);
        bark.mesh.count = Math.ceil(shapes[g].nSeg * reveal);
        leaf.mesh.count = Math.ceil(shapes[g].nLeaf * reveal);
      },
    };
  },
});
