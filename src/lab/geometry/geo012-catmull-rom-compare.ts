import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';
import { Markers, polyline } from '../framework/splineKit';

/** GEO-012 Catmull-Rom：ノット間隔 |Pi+1−Pi|^α（α=0 一様 / 0.5 求心 / 1 弦長）の違いを重ねて比べる */

const TYPES = [
  { key: 'catmullrom', label: '一様 α=0', color: 0xff7a59, r: 0.07 },
  { key: 'centripetal', label: '求心 α=0.5', color: 0x63e6a3, r: 0.055 },
  { key: 'chordal', label: '弦長 α=1', color: 0x5ab8ff, r: 0.04 },
] as const;

/** 通過点：u（不均一さ）が大きいほど一部の点の組が極端に近づく */
function passPoints(u: number): THREE.Vector3[] {
  const base: [number, number][] = [[-4, -1], [-2.6, 1.6], [-1.2, -0.6], [0.2, 1.8], [1.6, -0.4], [2.8, 1.4], [4, -0.8]];
  const pts = base.map(([x, y]) => new THREE.Vector3(x, y + 1.2, 0));
  // 2→3 と 4→5 の組を寄せ、間隔を不揃いにする
  for (const k of [2, 4]) pts[k].lerp(pts[k + 1], u * 0.93);
  pts.forEach((p, i) => (p.z = Math.sin(i * 1.3) * 0.25));
  return pts;
}

/** xy 平面へ投影した折れ線の自己交差数 */
function selfIntersections(s: THREE.Vector3[]): number {
  let n = 0;
  const cross = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  for (let i = 0; i < s.length - 1; i++) for (let j = i + 2; j < s.length - 1; j++) {
    const p = s[i], r = s[i + 1], q = s[j], t = s[j + 1];
    const rx = r.x - p.x, ry = r.y - p.y, sx = t.x - q.x, sy = t.y - q.y;
    const d = cross(rx, ry, sx, sy);
    if (Math.abs(d) < 1e-12) continue;
    const a = cross(q.x - p.x, q.y - p.y, sx, sy) / d, b = cross(q.x - p.x, q.y - p.y, rx, ry) / d;
    if (a > 0 && a < 1 && b > 0 && b < 1) n++;
  }
  return n;
}

export default defineGeometryDemo({
  id: 'GEO-012',
  notes: '同じ通過点に three.js の CatmullRomCurve3（catmullrom / centripetal / chordal）を3本重ね、赤=一様・緑=求心・青=弦長で描く。「点間隔の不均一さ」を上げると近接した点の付近で一様版にだけ輪や尖りが出る（xy 投影の自己交差数をステータスに表示）。張力は一様版にのみ効く。',
  params: [
    { key: 'show', label: '表示する種類', type: 'select', options: [{ value: 'all', label: '3種類を重ねる' }, { value: 'catmullrom', label: '一様のみ' }, { value: 'centripetal', label: '求心のみ' }, { value: 'chordal', label: '弦長のみ' }], default: 'all' },
    { key: 'uneven', label: '点間隔の不均一さ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.75 },
    { key: 'tension', label: '張力（一様のみ）', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'animate', label: '不均一さを自動で往復', type: 'bool', default: false },
  ],
  liveKeys: ['uneven', 'animate'],
  distance: 10,
  elevation: 0.15,
  target: [0, 1.2, 0],
  compareLabels: ['通過点の折れ線', 'Catmull-Rom'],
  build(p, env) {
    const segs = env.quality === 'low' ? 160 : 260;
    const show = String(p.show);
    const types = TYPES.filter((t) => show === 'all' || show === t.key);
    const group = new THREE.Group();
    const meshes = types.map((t) => {
      const m = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ color: t.color, roughness: 0.4, metalness: 0.1 }));
      group.add(m);
      return m;
    });
    const marks = new Markers(8, 0.11);
    const ctrl = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0x8890b0, dashSize: 0.12, gapSize: 0.1 }));
    const helpers = new THREE.Group();
    helpers.add(marks.mesh, ctrl);
    let last = -1;
    let crossings: number[] = [];
    let lengths: number[] = [];
    const set = (u: number) => {
      if (Math.abs(u - last) < 1e-4) return;
      last = u;
      const pts = passPoints(u);
      crossings = [];
      lengths = [];
      types.forEach((t, i) => {
        const c = new THREE.CatmullRomCurve3(pts, false, t.key, Number(p.tension));
        const g = new THREE.TubeGeometry(c, segs, t.r, 8, false);
        meshes[i].geometry.dispose();
        meshes[i].geometry = g;
        const s = c.getPoints(segs);
        crossings.push(selfIntersections(s));
        lengths.push(c.getLength());
      });
      pts.forEach((q, i) => marks.set(i, q, 0xffffff, 1));
      marks.commit(pts.length);
      ctrl.geometry.dispose();
      ctrl.geometry = new THREE.BufferGeometry().setFromPoints(pts);
      ctrl.computeLineDistances();
    };
    set(Number(p.uneven));
    const before = polyline(passPoints(Number(p.uneven)), 0xb0b8d8);
    let uNow = Number(p.uneven);
    return {
      object: group,
      before,
      helpers,
      info: () => `不均一さ ${uNow.toFixed(2)} · ` + types.map((t, i) => `${t.label}: 交差 ${crossings[i]} 長さ ${lengths[i].toFixed(2)}`).join(' / '),
      update(_dt, time, live) {
        uNow = live.animate ? 0.5 - 0.5 * Math.cos(time * 0.6) : Number(live.uneven);
        set(uNow);
      },
    };
  },
});
