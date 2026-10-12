import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';

/** GEO-040 フェースのインセットと押出：面ごとに独立して内側の面を作り、法線方向へ押し出す */
type Poly = { pts: THREE.Vector3[]; kind: number }; // kind 0=元の面 1=インセットの帯 2=押出の側面 3=押し出した上面

/** 凸多面体の三角形を、同じ平面ごとにまとめて多角形の面に戻す */
function polyFaces(g: THREE.BufferGeometry): THREE.Vector3[][] {
  const src = g.index ? g.toNonIndexed() : g;
  const pos = src.attributes.position as THREE.BufferAttribute;
  const groups = new Map<string, { n: THREE.Vector3; pts: THREE.Vector3[] }>();
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const n = new THREE.Triangle(a, b, c).getNormal(new THREE.Vector3());
    const d = n.dot(a);
    const key = `${n.x.toFixed(3)},${n.y.toFixed(3)},${n.z.toFixed(3)},${d.toFixed(3)}`;
    let gr = groups.get(key);
    if (!gr) groups.set(key, (gr = { n, pts: [] }));
    for (const v of [a, b, c]) if (!gr.pts.some((q) => q.distanceToSquared(v) < 1e-8)) gr.pts.push(v.clone());
  }
  if (src !== g) src.dispose();
  const out: THREE.Vector3[][] = [];
  for (const { n, pts } of groups.values()) {
    const cen = pts.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(pts.length);
    const u = pts[0].clone().sub(cen).normalize();
    const w = new THREE.Vector3().crossVectors(n, u);
    pts.sort((p, q) => {
      const dp = p.clone().sub(cen), dq = q.clone().sub(cen);
      return Math.atan2(dp.dot(w), dp.dot(u)) - Math.atan2(dq.dot(w), dq.dot(u));
    });
    out.push(pts);
  }
  return out;
}

function baseFaces(shape: string): THREE.Vector3[][] {
  if (shape === 'ico') return polyFaces(new THREE.IcosahedronGeometry(1.6, 0));
  if (shape === 'dodeca') return polyFaces(new THREE.DodecahedronGeometry(1.6, 0));
  // 立方体：各面を 3×3 の四角形に分割
  const faces: THREE.Vector3[][] = [];
  const s = 1.2, k = 3;
  const axes: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [];
  for (const n of [new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1)]) {
    const u = Math.abs(n.y) > 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
    const v = new THREE.Vector3().crossVectors(n, u);
    axes.push([n, u, v]);
  }
  for (const [n, u, v] of axes) {
    for (let i = 0; i < k; i++)
      for (let j = 0; j < k; j++) {
        const p = (a: number, b: number) => n.clone().multiplyScalar(s).addScaledVector(u, ((a / k) * 2 - 1) * s).addScaledVector(v, ((b / k) * 2 - 1) * s);
        // 外向き法線に対して反時計回り
        faces.push([p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1)]);
      }
  }
  return faces;
}

const normalOf = (pts: THREE.Vector3[]) => {
  // Newell 法
  const n = new THREE.Vector3();
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    n.x += (a.y - b.y) * (a.z + b.z);
    n.y += (a.z - b.z) * (a.x + b.x);
    n.z += (a.x - b.x) * (a.y + b.y);
  }
  return n.normalize();
};

/** 1つの面にインセット→押出を施し、置き換える面の列を返す */
function insetExtrude(face: THREE.Vector3[], inset: number, depth: number): { ring: Poly[]; cap: THREE.Vector3[] } {
  const cen = face.reduce((s, v) => s.add(v), new THREE.Vector3()).divideScalar(face.length);
  const n = normalOf(face);
  // 押出量は面の大きさに比例させる（細部ほど小さく）
  const size = Math.sqrt(face.reduce((s, v) => s + v.distanceToSquared(cen), 0) / face.length);
  const inner = face.map((v) => v.clone().lerp(cen, inset));
  const top = inner.map((v) => v.clone().addScaledVector(n, depth * size));
  const ring: Poly[] = [];
  const m = face.length;
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    if (inset > 0) ring.push({ pts: [face[i], face[j], inner[j], inner[i]], kind: 1 });
    if (Math.abs(depth) > 1e-6) ring.push({ pts: [inner[i], inner[j], top[j], top[i]], kind: 2 });
  }
  return { ring, cap: top };
}

const COLORS = [0x8890b0, 0x5a6ad8, 0x4fc3e8, 0xffb84d];

function toGeometry(polys: Poly[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  for (const { pts, kind } of polys) {
    c.set(COLORS[kind]);
    for (let i = 1; i + 1 < pts.length; i++) {
      for (const v of [pts[0], pts[i], pts[i + 1]]) {
        pos.push(v.x, v.y, v.z);
        col.push(c.r, c.g, c.b);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}

export default defineGeometryDemo({
  id: 'GEO-040',
  notes: '面を分離して1枚ずつ処理する：各頂点を重心へ寄せた内側の面を作り、元の辺との間を四角形の帯（青）で埋め、内側の面を法線方向へ押し出して側面（水色）を張る。押し出した上面（橙）に同じ操作を繰り返す。選択パターンで処理する面を変えられ、比較では元の多面体を並べる。',
  params: [
    { key: 'inset', label: 'インセット量', type: 'number', min: 0, max: 0.9, step: 0.01, default: 0.3 },
    { key: 'depth', label: '押出量（負で凹む）', type: 'number', min: -0.8, max: 1.5, step: 0.01, default: 0.45 },
    { key: 'pattern', label: '選択パターン', type: 'select', options: [{ value: 'all', label: '全部' }, { value: 'alt', label: '1つおき' }, { value: 'random', label: 'ランダム（50%）' }], default: 'all' },
    { key: 'iterations', label: '繰り返し', type: 'number', min: 1, max: 4, step: 1, default: 2 },
    { key: 'decay', label: '繰り返しごとの押出の減衰', type: 'number', min: 0.2, max: 1.2, step: 0.01, default: 0.7 },
    { key: 'shape', label: '元の形', type: 'select', options: [{ value: 'cube', label: '立方体（3×3分割）' }, { value: 'ico', label: '正二十面体' }, { value: 'dodeca', label: '正十二面体' }], default: 'cube' },
    { key: 'seed', label: 'シード（ランダム選択）', type: 'number', min: 1, max: 9999, step: 1, default: 1 },
  ],
  distance: 8,
  compareLabels: ['元の多面体', 'インセット＋押出'],
  build(p, env) {
    const base = baseFaces(String(p.shape));
    const inset = Number(p.inset);
    const pattern = String(p.pattern);
    const its = Number(p.iterations);
    const done: Poly[] = [];
    let active: Poly[] = base.map((pts) => ({ pts, kind: 0 }));
    let ops = 0;
    for (let it = 0; it < its; it++) {
      const depth = Number(p.depth) * Math.pow(Number(p.decay), it);
      const next: Poly[] = [];
      active.forEach((f, i) => {
        const pick = pattern === 'all' || (pattern === 'alt' ? i % 2 === 0 : env.rng() < 0.5);
        if (!pick) {
          done.push(f);
          return;
        }
        const { ring, cap } = insetExtrude(f.pts, inset, depth);
        done.push(...ring);
        next.push({ pts: cap, kind: 3 });
        ops++;
      });
      active = next;
    }
    done.push(...active);
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, flatShading: true });
    const mesh = new THREE.Mesh(toGeometry(done), mat);
    const before = new THREE.Mesh(toGeometry(base.map((pts) => ({ pts, kind: 0 }))), std(0xffffff, { vertexColors: true, flatShading: true }));
    return {
      object: mesh,
      before,
      info: `元の面 ${base.length} · 処理した面 ${ops} 回 · 結果の多角形 ${done.length}`,
    };
  },
});
