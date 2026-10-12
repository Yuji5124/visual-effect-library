import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';

/** GEO-048 フィロタキシス：n 番目の点を角度 n·φ ずつ回して置く（Vogel のモデル） */
const GOLDEN = 180 * (3 - Math.sqrt(5));

function place(layout: string, i: number, n: number, angleDeg: number, out: THREE.Vector3, normal: THREE.Vector3): number {
  const a = THREE.MathUtils.degToRad(angleDeg) * i;
  if (layout === 'sphere') {
    // フィボナッチ球：高さを等間隔に、方位を n·φ で回す
    const y = 1 - (2 * (i + 0.5)) / n;
    const r = Math.sqrt(1 - y * y);
    out.set(Math.cos(a) * r, y, Math.sin(a) * r).multiplyScalar(1.8);
    normal.copy(out).normalize();
    return 1.8 * Math.sqrt(4 / n) * 0.85;
  }
  if (layout === 'cone') {
    // 松ぼっくり：頂点から順に半径 √n で広がり、下へ下がる
    const t = Math.sqrt((i + 0.5) / n);
    const r = 1.6 * Math.sin(t * Math.PI * 0.95);
    const y = 2 - 4 * (i / n);
    out.set(Math.cos(a) * r, y, Math.sin(a) * r);
    normal.set(Math.cos(a), 0.4, Math.sin(a)).normalize();
    return Math.max(0.03, 2.2 * Math.sqrt(1 / n) * (0.4 + 0.6 * Math.sin(t * Math.PI)));
  }
  const r = 2 * Math.sqrt((i + 0.5) / n);
  out.set(Math.cos(a) * r, 0.1, Math.sin(a) * r);
  normal.set(0, 1, 0);
  return 2 * Math.sqrt(1 / n) * 0.9;
}

const FIB = [3, 5, 8, 13, 21, 34, 55, 89];

export default defineGeometryDemo({
  id: 'GEO-048',
  notes: 'n 番目の点を角度 n·φ・半径 √n（平面）、高さ等間隔（フィボナッチ球）、円錐状（松ぼっくり）に置き、InstancedMesh で描く。φ が黄金角 137.508° のときだけ均一に詰まり、斜列線（色分けの番号 mod フィボナッチ数）が現れる。少しずらすと直線状のすき間ができる。',
  params: [
    { key: 'angle', label: '回転角（度）', type: 'number', min: 130, max: 145, step: 0.001, default: Number(GOLDEN.toFixed(3)) },
    { key: 'count', label: '個数', type: 'number', min: 20, max: 3000, step: 1, default: 900 },
    { key: 'layout', label: '配置面', type: 'select', options: [{ value: 'plane', label: '平面（ひまわり）' }, { value: 'sphere', label: '球面（フィボナッチ球）' }, { value: 'cone', label: '円錐（松ぼっくり）' }], default: 'plane' },
    { key: 'coloring', label: '色分け', type: 'select', options: [{ value: 'index', label: '番号のグラデーション' }, { value: 'fib13', label: '番号 mod 13（斜列線）' }, { value: 'fib21', label: '番号 mod 21（斜列線）' }, { value: 'fib34', label: '番号 mod 34（斜列線）' }], default: 'fib21' },
    { key: 'sweep', label: '回転角をゆっくり動かす', type: 'bool', default: false },
  ],
  liveKeys: ['angle', 'sweep'],
  extraActions: [{ key: 'golden', label: 'φ 黄金角に戻す' }],
  onAction(key) {
    if (key === 'golden') return { angle: Number(GOLDEN.toFixed(3)), sweep: false };
  },
  distance: 7,
  elevation: 0.9,
  compareLabels: ['135°（有理数の角 3/8 回転）', '指定の回転角'],
  build(p, env) {
    let n = Number(p.count);
    if (env.quality === 'low') n = Math.min(n, 1500);
    const layout = String(p.layout);
    const geo = new THREE.SphereGeometry(1, 10, 6);
    geo.scale(1, 0.55, 1);
    const mk = () => new THREE.InstancedMesh(geo.clone(), new THREE.MeshStandardMaterial({ roughness: 0.5 }), n);
    const mesh = mk();
    const before = mk();
    geo.dispose();
    const coloring = String(p.coloring);
    const mod = coloring.startsWith('fib') ? Number(coloring.slice(3)) : 0;
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      if (mod) c.setHSL(((i % mod) / mod) * 0.8, 0.7, 0.55);
      else c.setHSL(0.08 + 0.12 * (i / n), 0.85, 0.35 + 0.3 * (1 - i / n));
      mesh.setColorAt(i, c);
      before.setColorAt(i, c);
    }
    const m = new THREE.Matrix4(), pos = new THREE.Vector3(), nrm = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0);
    const apply = (target: THREE.InstancedMesh, deg: number) => {
      for (let i = 0; i < n; i++) {
        const r = place(layout, i, n, deg, pos, nrm);
        q.setFromUnitVectors(up, nrm);
        target.setMatrixAt(i, m.compose(pos, q, s.setScalar(r)));
      }
      target.instanceMatrix.needsUpdate = true;
      target.computeBoundingSphere();
    };
    apply(before, 135);
    let shown = Number(p.angle);
    apply(mesh, shown);
    // 角度に最も近い有理数近似から、目立つ斜列線の数（フィボナッチ数）の目安を出す
    const fibNear = () => {
      const turn = shown / 360;
      let best = FIB[0], err = 1;
      for (const f of FIB) {
        if (f > n / 3) break;
        const e = Math.abs(turn * f - Math.round(turn * f));
        if (e < err) { err = e; best = f; }
      }
      return best;
    };
    return {
      object: mesh,
      before,
      info: () => `回転角 ${shown.toFixed(3)}°（黄金角との差 ${(shown - GOLDEN).toFixed(3)}°） · 点 ${n} · 目立つ斜列線 ≈ ${fibNear()} 本`,
      update(_dt, time, live) {
        const target = live.sweep ? GOLDEN + 2.5 * Math.sin(time * 0.15) : Number(live.angle);
        if (target !== shown) {
          shown = target;
          apply(mesh, shown);
        }
      },
    };
  },
});
