import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { Ticker } from '../framework/worldKit';
import { rectsOverlap, type Rect } from '../framework/geom2d';

/** WRD-038 モジュール接続：開いたコネクタに、向かい合うよう回転したモジュールを AABB 判定付きで繋いでいく */
interface Tpl { name: string; w: number; d: number; conns: [number, number, number][]; color: number; weight: (b: number, big: number) => number }
// dir: 0=+x 1=+z 2=-x 3=-z。座標はモジュール中心を原点としたセル単位
const TEMPLATES: Tpl[] = [
  { name: '廊下', w: 5, d: 1, conns: [[2.5, 0, 0], [-2.5, 0, 2]], color: 0x8f8a7a, weight: (b) => 3 * (1 - b) + 0.4 },
  { name: '長い廊下', w: 9, d: 1, conns: [[4.5, 0, 0], [-4.5, 0, 2]], color: 0x8f8a7a, weight: (b) => 1.5 * (1 - b) + 0.2 },
  { name: 'L字', w: 3, d: 3, conns: [[-1.5, 0, 2], [0, 1.5, 1]], color: 0x7aa0b0, weight: () => 1.5 },
  { name: 'T字', w: 3, d: 3, conns: [[-1.5, 0, 2], [1.5, 0, 0], [0, 1.5, 1]], color: 0x6f9ad0, weight: (b) => 2.5 * b + 0.2 },
  { name: '十字路', w: 3, d: 3, conns: [[-1.5, 0, 2], [1.5, 0, 0], [0, 1.5, 1], [0, -1.5, 3]], color: 0x5a86e0, weight: (b) => 2 * b + 0.1 },
  { name: '小部屋', w: 5, d: 5, conns: [[-2.5, 0, 2], [2.5, 0, 0], [0, 2.5, 1]], color: 0x9a7ad0, weight: () => 1 },
  { name: '大部屋', w: 9, d: 7, conns: [[-4.5, 0, 2], [4.5, 0, 0], [-2, 3.5, 1], [2, 3.5, 1], [0, -3.5, 3]], color: 0xd08a50, weight: (_b, big) => big * 8 },
];
const DIRS: [number, number][] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
const S = 0.26;
const WALL_H = 0.4;

interface Conn { x: number; z: number; dir: number; state: 'open' | 'used' | 'closed'; owner: number }
interface Placed { tpl: Tpl; cx: number; cz: number; w: number; d: number; rect: Rect; conns: number[] }

function rot(x: number, z: number, r: number): [number, number] {
  for (let i = 0; i < r; i++) [x, z] = [-z, x];
  return [x, z];
}

export default defineWorldDemo({
  id: 'WRD-038',
  notes: '開いているコネクタ（黄色の矢印）を1つ選び、候補モジュールのコネクタが向かい合うよう90°単位で回転・平行移動し、既存モジュールの AABB と重ならなければ確定する。どのモジュールも入らないコネクタは赤い壁で塞ぐ。比較の左はモジュールの見本（矢印がコネクタ）。',
  params: [
    { key: 'modules', label: 'モジュール数', type: 'number', min: 5, max: 90, step: 1, default: 45 },
    { key: 'bigRoom', label: '大部屋の確率', type: 'number', min: 0, max: 0.6, step: 0.01, default: 0.15 },
    { key: 'branch', label: '分岐の多さ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.45 },
    { key: 'speed', label: '配置の速さ（個/秒）', type: 'number', min: 1, max: 60, step: 1, default: 8 },
  ],
  liveKeys: ['speed'],
  distance: 15,
  elevation: 1.0,
  compareLabels: ['モジュールの見本', '接続結果'],
  build(p, env) {
    const rng = env.rng;
    const target = Math.round(Number(p.modules));
    const branch = Number(p.branch), big = Number(p.bigRoom);
    const LIMIT = 24;
    const placed: Placed[] = [];
    const conns: Conn[] = [];

    const boxGeo = () => {
      const g = new THREE.BoxGeometry(1, 1, 1);
      g.translate(0, 0.5, 0);
      return g;
    };
    const floors = new THREE.InstancedMesh(boxGeo(), new THREE.MeshStandardMaterial({ roughness: 0.85 }), 100);
    const walls = new THREE.InstancedMesh(boxGeo(), new THREE.MeshStandardMaterial({ color: 0xd8d4c8, roughness: 0.7 }), 1600);
    const plugs = new THREE.InstancedMesh(boxGeo(), new THREE.MeshStandardMaterial({ color: 0xd04848, roughness: 0.6 }), 600);
    const coneGeo = new THREE.ConeGeometry(0.11, 0.3, 10);
    coneGeo.rotateZ(-Math.PI / 2);
    const arrows = new THREE.InstancedMesh(coneGeo, new THREE.MeshStandardMaterial({ color: 0xffe060, emissive: 0xffc020, emissiveIntensity: 0.8 }), 600);
    floors.setColorAt(0, new THREE.Color(1, 1, 1));
    for (const m of [floors, walls, plugs, arrows]) { m.count = 0; m.frustumCulled = false; }
    // 成長途中でも比較表示の間隔が決まるよう、外形は成長範囲で固定する
    floors.boundingBox = new THREE.Box3(new THREE.Vector3(-LIMIT * S * 0.6, 0, -LIMIT * S * 0.6), new THREE.Vector3(LIMIT * S * 0.6, 0.5, LIMIT * S * 0.6));
    const object = new THREE.Group();
    object.add(floors, walls, plugs);
    const helpers = new THREE.Group();
    helpers.add(arrows);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), pv = new THREE.Vector3(), sv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const col = new THREE.Color();

    const addBox = (mesh: THREE.InstancedMesh, x: number, z: number, sx: number, sy: number, sz: number, color?: number) => {
      if (mesh.count >= mesh.instanceMatrix.count) return;
      m4.makeScale(sx, sy, sz);
      m4.setPosition(x, 0, z);
      mesh.setMatrixAt(mesh.count, m4);
      if (color !== undefined) mesh.setColorAt(mesh.count, col.setHex(color));
      mesh.count++;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    /** モジュールの床と、コネクタ位置に幅1の開口を残した外周壁 */
    const drawModule = (pm: Placed, fl: THREE.InstancedMesh, wl: THREE.InstancedMesh, ox = 0, oz = 0) => {
      addBox(fl, (pm.cx + ox) * S, (pm.cz + oz) * S, pm.w * S * 0.98, 0.05, pm.d * S * 0.98, pm.tpl.color);
      const r = pm.rect;
      const t = 0.12;
      const edges: [number, number, number, number, number][] = [
        // 軸(0=x方向に伸びる 1=z方向), 固定座標, 開始, 終了, 向き
        [0, r.y, r.x, r.x + r.w, 3], [0, r.y + r.h, r.x, r.x + r.w, 1],
        [1, r.x, r.y, r.y + r.h, 2], [1, r.x + r.w, r.y, r.y + r.h, 0],
      ];
      for (const [axis, fixed, a0, a1, dir] of edges) {
        const gaps = pm.conns.map((ci) => conns[ci]).filter((c) => c.dir === dir).map((c) => (axis === 0 ? c.x : c.z)).sort((a, b) => a - b);
        let s = a0;
        for (const gpos of [...gaps, a1 + 0.5]) {
          const e = Math.min(a1, gpos - 0.5);
          if (e > s + 1e-6) {
            const mid = (s + e) / 2, len = e - s;
            if (axis === 0) addBox(wl, (mid + ox) * S, (fixed + oz) * S, len * S, WALL_H, t);
            else addBox(wl, (fixed + ox) * S, (mid + oz) * S, t, WALL_H, len * S);
          }
          s = gpos + 0.5;
        }
      }
    };

    const place = (tpl: Tpl, cx: number, cz: number, r: number, owner: number, attachTo: number): Placed => {
      const odd = r % 2 === 1;
      const w = odd ? tpl.d : tpl.w, d = odd ? tpl.w : tpl.d;
      const pm: Placed = { tpl, cx, cz, w, d, rect: { x: cx - w / 2, y: cz - d / 2, w, h: d }, conns: [] };
      for (const [lx, lz, ld] of tpl.conns) {
        const [x, z] = rot(lx, lz, r);
        const c: Conn = { x: cx + x, z: cz + z, dir: (ld + r) % 4, state: 'open', owner };
        // 接続に使ったコネクタ
        if (attachTo >= 0 && Math.abs(c.x - conns[attachTo].x) < 1e-6 && Math.abs(c.z - conns[attachTo].z) < 1e-6) c.state = 'used';
        pm.conns.push(conns.length);
        conns.push(c);
      }
      placed.push(pm);
      drawModule(pm, floors, walls);
      return pm;
    };

    const fits = (rect: Rect) => {
      if (rect.x < -LIMIT || rect.y < -LIMIT || rect.x + rect.w > LIMIT || rect.y + rect.h > LIMIT) return false;
      return !placed.some((pm) => rectsOverlap(rect, pm.rect));
    };

    const pickTpl = (): Tpl => {
      const ws = TEMPLATES.map((t) => t.weight(branch, big));
      let r = rng() * ws.reduce((a, b) => a + b, 0);
      for (let i = 0; i < ws.length; i++) if ((r -= ws[i]) <= 0) return TEMPLATES[i];
      return TEMPLATES[0];
    };

    /** 1回の拡張：開いたコネクタを1つ選び、モジュールが入るまで候補を試す */
    let rejected = 0;
    const grow = (): boolean => {
      const open = conns.map((c, i) => (c.state === 'open' ? i : -1)).filter((i) => i >= 0);
      if (!open.length || placed.length >= target) return false;
      const ci = open[Math.floor(rng() * open.length)];
      const c = conns[ci];
      for (let attempt = 0; attempt < 8; attempt++) {
        const tpl = pickTpl();
        const order = tpl.conns.map((_, i) => i).sort(() => rng() - 0.5);
        for (const k of order) {
          const [lx, lz, ld] = tpl.conns[k];
          const r = ((c.dir + 2 - ld) % 4 + 4) % 4;
          const [qx, qz] = rot(lx, lz, r);
          const cx = c.x - qx, cz = c.z - qz;
          const odd = r % 2 === 1;
          const w = odd ? tpl.d : tpl.w, d = odd ? tpl.w : tpl.d;
          if (!fits({ x: cx - w / 2, y: cz - d / 2, w, h: d })) { rejected++; continue; }
          c.state = 'used';
          place(tpl, cx, cz, r, placed.length, ci);
          return true;
        }
      }
      // 何も入らない → 壁で塞ぐ
      c.state = 'closed';
      plug(c);
      return true;
    };

    const plug = (c: Conn) => {
      const along = c.dir % 2 === 0;
      addBox(plugs, c.x * S, c.z * S, along ? 0.14 : S, WALL_H * 0.9, along ? S : 0.14);
    };

    const drawArrows = () => {
      arrows.count = 0;
      for (const c of conns) {
        if (c.state !== 'open') continue;
        q.setFromAxisAngle(up, -c.dir * Math.PI / 2);
        pv.set((c.x + DIRS[c.dir][0] * 0.4) * S, 0.25, (c.z + DIRS[c.dir][1] * 0.4) * S);
        m4.compose(pv, q, sv.set(1, 1, 1));
        if (arrows.count < arrows.instanceMatrix.count) arrows.setMatrixAt(arrows.count++, m4);
      }
      arrows.instanceMatrix.needsUpdate = true;
    };

    // 最初は中央に十字路
    place(TEMPLATES[4], 0, 0, 0, 0, -1);
    drawArrows();
    let finished = false;
    const finish = () => {
      for (const c of conns) if (c.state === 'open') { c.state = 'closed'; plug(c); }
      finished = true;
      drawArrows();
    };

    // 比較用：モジュールの見本を一列に並べる
    const before = new THREE.Group();
    const bf = new THREE.InstancedMesh(boxGeo(), new THREE.MeshStandardMaterial({ roughness: 0.85 }), 20);
    const bw = new THREE.InstancedMesh(boxGeo(), new THREE.MeshStandardMaterial({ color: 0xd8d4c8 }), 200);
    const ba = new THREE.InstancedMesh(coneGeo.clone(), new THREE.MeshStandardMaterial({ color: 0xffe060, emissive: 0xffc020, emissiveIntensity: 0.8 }), 60);
    bf.setColorAt(0, new THREE.Color(1, 1, 1));
    for (const m of [bf, bw, ba]) { m.count = 0; m.frustumCulled = false; }
    const saveConns = conns.length;
    TEMPLATES.forEach((tpl, ti) => {
      const row = ti < 4 ? 0 : 1;
      const list = TEMPLATES.filter((_, i) => (i < 4 ? 0 : 1) === row);
      const total = list.reduce((a, t) => a + t.w + 2, 0);
      let ox = -total / 2;
      for (const t of list) { if (t === tpl) break; ox += t.w + 2; }
      ox += tpl.w / 2 + 1;
      const oz = row === 0 ? -6 : 5;
      const pm: Placed = { tpl, cx: 0, cz: 0, w: tpl.w, d: tpl.d, rect: { x: -tpl.w / 2, y: -tpl.d / 2, w: tpl.w, h: tpl.d }, conns: [] };
      for (const [x, z, dir] of tpl.conns) { pm.conns.push(conns.length); conns.push({ x, z, dir, state: 'open', owner: -1 }); }
      drawModule(pm, bf, bw, ox, oz);
      for (const ci of pm.conns) {
        const c = conns[ci];
        q.setFromAxisAngle(up, -c.dir * Math.PI / 2);
        m4.compose(pv.set((c.x + ox + DIRS[c.dir][0] * 0.4) * S, 0.25, (c.z + oz + DIRS[c.dir][1] * 0.4) * S), q, sv.set(1, 1, 1));
        ba.setMatrixAt(ba.count++, m4);
      }
    });
    conns.length = saveConns;
    before.add(bf, bw, ba);

    const ticker = new Ticker(Number(p.speed));
    return {
      object,
      before,
      helpers,
      info: () => {
        const open = conns.filter((c) => c.state === 'open').length;
        const closed = conns.filter((c) => c.state === 'closed').length;
        return `モジュール ${placed.length}/${target} · 開いたコネクタ ${open} · 塞いだコネクタ ${closed} · AABB で却下した候補 ${rejected}${finished ? ' · 完成' : ''}`;
      },
      update(dt, _t, pp) {
        if (finished) return;
        ticker.rate = Number(pp.speed);
        let k = ticker.steps(dt, 10);
        while (k-- > 0 && !finished) {
          if (!grow()) finish();
        }
        drawArrows();
      },
    };
  },
});
