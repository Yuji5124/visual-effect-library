import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';
import { FnCurve } from '../framework/splineKit';

/** GEO-004 トーラス結び目：トーラス面上を p 回まわり q 回くぐる閉曲線をチューブで掃引 */

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));
const COLORS = [0xff7a59, 0x5ab8ff, 0x63e6a3, 0xffc14d, 0xb38bff, 0xff5c8a, 0x4cf0e0, 0xe0e0e0];

export default defineGeometryDemo({
  id: 'GEO-004',
  notes: 'x=(R+r cos qφ)cos pφ, y=r sin qφ, z=(R+r cos qφ)sin pφ を独自の Curve として TubeGeometry で掃引する。gcd(p,q)=g>1 のときは1本に閉じず g 本の成分のリンクになり、成分ごとに色を変えて表示する。比較では曲線が乗っているトーラス面を並べる。',
  params: [
    { key: 'p', label: 'p（軸まわりの周回数）', type: 'number', min: 1, max: 12, step: 1, default: 2 },
    { key: 'q', label: 'q（穴をくぐる回数）', type: 'number', min: 1, max: 12, step: 1, default: 3 },
    { key: 'R', label: '主半径 R', type: 'number', min: 1, max: 3, step: 0.05, default: 1.8 },
    { key: 'r', label: 'トーラスの副半径 r', type: 'number', min: 0.2, max: 1.5, step: 0.05, default: 0.7 },
    { key: 'tube', label: 'チューブ半径', type: 'number', min: 0.03, max: 0.5, step: 0.01, default: 0.22 },
    { key: 'segments', label: '分割数', type: 'number', min: 32, max: 600, step: 8, default: 320 },
    { key: 'showTorus', label: 'トーラス面を薄く表示', type: 'bool', default: true },
  ],
  distance: 8,
  elevation: 0.6,
  compareLabels: ['土台のトーラス', '結び目'],
  build(prm, env) {
    const p = Math.round(Number(prm.p)), q = Math.round(Number(prm.q));
    const R = Number(prm.R), r = Number(prm.r);
    const g = gcd(p, q);
    const pp = p / g, qq = q / g;
    const seg = Math.max(16, Math.round(Number(prm.segments) / (env.quality === 'low' ? 2 : 1) / g));
    const group = new THREE.Group();
    for (let k = 0; k < g; k++) {
      // 成分 k：トーラス角 (pp·θ, qq·θ + 2πk/g)
      const curve = new FnCurve((t, out) => {
        const th = t * Math.PI * 2;
        const a = pp * th, b = qq * th + (Math.PI * 2 * k) / g;
        const rr = R + r * Math.cos(b);
        return out.set(rr * Math.cos(a), r * Math.sin(b), rr * Math.sin(a));
      });
      const mesh = new THREE.Mesh(
        new THREE.TubeGeometry(curve, seg, Number(prm.tube), 12, true),
        new THREE.MeshStandardMaterial({ color: COLORS[k % COLORS.length], roughness: 0.35, metalness: 0.15 }),
      );
      group.add(mesh);
    }
    const torusGeo = () => new THREE.TorusGeometry(R, r, 24, 72).rotateX(Math.PI / 2);
    const before = new THREE.Mesh(torusGeo(), new THREE.MeshStandardMaterial({ color: 0x8890b0, roughness: 0.6 }));
    let helpers: THREE.Object3D | undefined;
    if (prm.showTorus) {
      const tg = new THREE.TorusGeometry(R, r, 16, 48).rotateX(Math.PI / 2);
      helpers = new THREE.LineSegments(new THREE.WireframeGeometry(tg), new THREE.LineBasicMaterial({ color: 0x6c7ab0, transparent: true, opacity: 0.22 }));
      tg.dispose();
    }
    const kind = g === 1 ? (p === 1 || q === 1 ? '自明な結び目（ほどける）' : `結び目（${pp},${qq}）${(p === 2 && q === 3) || (p === 3 && q === 2) ? '＝三葉結び目' : ''}`) : `${g} 成分のリンク（各成分は (${pp},${qq})）`;
    return {
      object: group,
      before,
      helpers,
      info: `(p,q)=(${p},${q}) · gcd=${g} · ${kind}`,
    };
  },
});
