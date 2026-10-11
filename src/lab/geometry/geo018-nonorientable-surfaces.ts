import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';
import { GridSurface, twoSidedMesh } from '../framework/surfaceKit';
import { polyline } from '../framework/splineKit';

/** GEO-018 向き付け不可能な曲面：(u,v)→(x,y,z) を直接評価し、表裏を別色で塗る */

interface Surf {
  /** s∈[s0,s1], t∈[t0,t1] */
  range: [number, number, number, number];
  f(s: number, t: number, out: THREE.Vector3): THREE.Vector3;
  /** 曲面上の閉路（k∈[0,1]）。向きが反転する一周 */
  loop(k: number): [number, number];
  scale: number;
  lift: number;
  label: string;
}

const SURFS: Record<string, Surf> = {
  mobius: {
    range: [0, Math.PI * 2, -1, 1],
    f(u, v, out) {
      const r = 1 + (v / 2) * Math.cos(u / 2);
      return out.set(r * Math.cos(u), (v / 2) * Math.sin(u / 2), r * Math.sin(u));
    },
    loop: (k) => [k * Math.PI * 2, 0],
    scale: 2,
    lift: 1.6,
    label: 'メビウスの帯',
  },
  klein: {
    // 「瓶」型の埋め込み（自己交差あり）。(0,v) と (π,π−v) が同一視される
    range: [0, Math.PI, 0, Math.PI * 2],
    f(u, v, out) {
      const cu = Math.cos(u), su = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
      const c2 = cu * cu, c4 = c2 * c2, c6 = c4 * c2;
      const x = (-2 / 15) * cu * (3 * cv - 30 * su + 90 * c4 * su - 60 * c6 * su + 5 * cu * cv * su);
      const y = (-1 / 15) * su * (3 * cv - 3 * c2 * cv - 48 * c4 * cv + 48 * c6 * cv - 60 * su + 5 * cu * cv * su - 5 * c2 * cu * cv * su - 80 * c4 * cu * cv * su + 80 * c6 * cu * cv * su);
      const z = (2 / 15) * (3 + 5 * cu * su) * sv;
      return out.set(x, y, z);
    },
    loop: (k) => [k * Math.PI, Math.PI / 2],
    scale: 1.15,
    lift: 0.05,
    label: 'クラインの壺',
  },
  boy: {
    // Bryant–Kusner のパラメーター表示（単位円板 w=r e^{iφ}、境界は対蹠点どうしが同一視）
    range: [0, Math.PI * 2, 0, 1],
    f(phi, r, out) {
      const wr = r * Math.cos(phi), wi = r * Math.sin(phi);
      const m = (ar: number, ai: number, br: number, bi: number): [number, number] => [ar * br - ai * bi, ar * bi + ai * br];
      const w2 = m(wr, wi, wr, wi), w3 = m(w2[0], w2[1], wr, wi), w4 = m(w2[0], w2[1], w2[0], w2[1]), w6 = m(w3[0], w3[1], w3[0], w3[1]);
      const s5 = Math.sqrt(5);
      const dr = w6[0] + s5 * w3[0] - 1, di = w6[1] + s5 * w3[1];
      const dd = dr * dr + di * di;
      const dv = (ar: number, ai: number): [number, number] => [(ar * dr + ai * di) / dd, (ai * dr - ar * di) / dd];
      const a1 = m(wr, wi, 1 - w4[0], -w4[1]);
      const a2 = m(wr, wi, 1 + w4[0], w4[1]);
      const g1 = -1.5 * dv(a1[0], a1[1])[1];
      const g2 = -1.5 * dv(a2[0], a2[1])[0];
      const g3 = dv(1 + w6[0], w6[1])[1] - 0.5;
      const g = g1 * g1 + g2 * g2 + g3 * g3;
      return out.set(g1 / g, g3 / g, g2 / g);
    },
    loop: (k) => [k * Math.PI, 1],
    scale: 1.3,
    lift: 2.7,
    label: 'ボーイ曲面',
  },
};

/** 偏微分の外積による法線（生のパラメーター空間で数値微分） */
function normalAt(S: Surf, s: number, t: number, out: THREE.Vector3): THREE.Vector3 {
  const h = 1e-4;
  const a = S.f(s + h, t, new THREE.Vector3()), b = S.f(s - h, t, new THREE.Vector3());
  const c = S.f(s, t + h, new THREE.Vector3()), d = S.f(s, t - h, new THREE.Vector3());
  return out.crossVectors(a.sub(b), c.sub(d)).normalize();
}

/** 自前の矢印（ArrowHelper は共有ジオメトリを持つので使わない） */
function makeArrow(len: number, color: THREE.ColorRepresentation, head: number): THREE.Group {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, len - head, 6).translate(0, (len - head) / 2, 0), new THREE.MeshBasicMaterial({ color }));
  const cone = new THREE.Mesh(new THREE.ConeGeometry(head * 0.5, head, 10).translate(0, len - head / 2, 0), new THREE.MeshBasicMaterial({ color }));
  g.add(shaft, cone);
  return g;
}
const UP = new THREE.Vector3(0, 1, 0);
const aim = (o: THREE.Object3D, pos: THREE.Vector3, dir: THREE.Vector3) => {
  o.position.copy(pos);
  o.quaternion.setFromUnitVectors(UP, dir);
};

export default defineGeometryDemo({
  id: 'GEO-018',
  notes: '各曲面の式 (u,v)→(x,y,z) を格子上で評価して頂点と面を作り、表面を橙・裏面を水色で塗る（u 方向の色帯つき）。継ぎ目で色が入れ替わるのが裏表のない証拠。白い矢印は曲面上の閉路に沿って連続に運んだ法線で、一周して戻ると逆向き（n·n0=−1）になる。',
  params: [
    { key: 'kind', label: '曲面の種類', type: 'select', options: [{ value: 'mobius', label: 'メビウスの帯' }, { value: 'klein', label: 'クラインの壺' }, { value: 'boy', label: 'ボーイ曲面' }], default: 'mobius' },
    { key: 'div', label: '分割数', type: 'number', min: 16, max: 200, step: 4, default: 120 },
    { key: 'bands', label: '色帯の数', type: 'number', min: 0, max: 24, step: 1, default: 8 },
    { key: 'translucent', label: '半透明（内側の閉路も見せる）', type: 'bool', default: true },
    { key: 'walk', label: '法線を一周させる', type: 'bool', default: true },
    { key: 'speed', label: '一周の速さ', type: 'number', min: 0.02, max: 0.5, step: 0.01, default: 0.12 },
  ],
  liveKeys: ['walk', 'speed'],
  distance: 9,
  elevation: 0.4,
  target: [0, 2, 0],
  build(p, env) {
    const S = SURFS[String(p.kind)] ?? SURFS.mobius;
    const [s0, s1, t0, t1] = S.range;
    const div = Math.max(16, Math.round(Number(p.div)) >> (env.quality === 'low' ? 1 : 0));
    const nu = div, nv = String(p.kind) === 'mobius' ? Math.max(4, Math.round(div / 8)) : Math.max(8, Math.round(div / 2));
    const toWorld = (v: THREE.Vector3) => v.multiplyScalar(S.scale).setY(v.y + S.lift);
    const surf = new GridSurface(nu, nv, (u, v, out) => toWorld(S.f(s0 + (s1 - s0) * u, t0 + (t1 - t0) * v, out)));
    const bands = Math.round(Number(p.bands));
    surf.colorize((u, _v, c) => c.setScalar(bands > 0 && Math.floor(u * bands) % 2 ? 0.42 : 1));
    const object = twoSidedMesh(surf.geo, 0xff9a3d, 0x4cc7f0, true);
    if (p.translucent) {
      // 半透明：裏面→表面の順に描き、内側を通る閉路と法線も見えるようにする
      object.children.forEach((c, i) => {
        const m = (c as THREE.Mesh).material as THREE.MeshStandardMaterial;
        m.transparent = true;
        m.opacity = 0.62;
        m.depthWrite = false;
        c.renderOrder = i === 0 ? 2 : 1;
      });
    }

    // 閉路と、それに沿って連続に運んだ法線
    const M = 480;
    const path: THREE.Vector3[] = [];
    const normals: THREE.Vector3[] = [];
    for (let i = 0; i <= M; i++) {
      const [s, t] = S.loop(i / M);
      path.push(toWorld(S.f(s, t, new THREE.Vector3())));
      const n = normalAt(S, s, t, new THREE.Vector3());
      if (i > 0 && n.dot(normals[i - 1]) < 0) n.negate();
      normals.push(n);
    }
    const endDot = normals[M].dot(normals[0]);
    const helpers = new THREE.Group();
    const loopLine = polyline(path, 0xffffff, { dashed: true, opacity: 0.9 });
    const arrow = makeArrow(0.9, 0xffffff, 0.25);
    const startArrow = makeArrow(0.7, 0xffd23d, 0.2);
    aim(startArrow, path[0], normals[0]);
    const ant = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    helpers.add(loopLine, arrow, startArrow, ant);
    let k = 0;
    let dotNow = 1;
    const place = (x: number) => {
      const f = x * M;
      const i = Math.min(M - 1, Math.floor(f));
      const a = f - i;
      ant.position.copy(path[i]).lerp(path[i + 1], a);
      const n = normals[i].clone().lerp(normals[i + 1], a).normalize();
      aim(arrow, ant.position, n);
      dotNow = n.dot(normals[0]);
    };
    place(0);
    return {
      object,
      helpers,
      info: () => `${S.label} · 分割 ${nu}×${nv} · 運んだ法線 n·n0=${dotNow.toFixed(3)}（一周後 ${endDot.toFixed(3)}） · 黄=出発時の法線`,
      update(dt, _time, live) {
        const show = Boolean(live.walk);
        arrow.visible = ant.visible = startArrow.visible = loopLine.visible = show;
        if (!show) return;
        k = (k + dt * Number(live.speed)) % 1;
        place(k);
      },
    };
  },
});
