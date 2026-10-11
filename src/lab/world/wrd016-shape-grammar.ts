import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { BoxBatch } from '../framework/worldKit';

/**
 * WRD-016 形状文法（CGA 風）：スコープ（向き付きの箱・面）に規則を段ごとに並列適用する小さなインタプリタ。
 *   1  Lot     → extrude(H) Mass
 *   2  Mass    → comp(f){ front | right | back | left : Facade , top : Roof }
 *   3  Facade  → split(y){ G : Ground | { ~F : Floor }* }
 *      Roof    → p·0.6 : Gable | p·0.4 : Hip | 1-p : Flat
 *   4  Floor   → split(x){ { ~B : Bay }* }
 *      Ground  → split(x){ { ~B : Shop }* }（正面の中央は Door）
 *   5  Bay     → split(x){ ~1 : Wall | ~r : WinCol | ~1 : Wall }
 *      Shop    → split(y){ ~0.8 : ShopWindow | ~0.2 : Wall }
 *   6  WinCol  → split(y){ ~s : Wall | ~1 : Window | ~t : Wall }
 */
const STAGES = 6;
const RULES = ['Lot（敷地）', 'Lot→extrude→Mass', 'Mass→comp(f)→Facade×4+Roof', 'Facade→split(y)→Ground|Floor*, Roof→Gable|Hip|Flat', 'Floor→split(x)→Bay*, Ground→Shop*|Door', 'Bay→split(x)→Wall|WinCol|Wall, Shop→split(y)', 'WinCol→split(y)→Wall|Window|Wall'];

/** スコープ：原点 o、幅方向 a（水平単位）、外向き法線 n、幅 w・高さ h・奥行き d（面は d=0） */
interface Shape {
  sym: string;
  o: [number, number, number];
  a: [number, number];
  n: [number, number];
  w: number;
  h: number;
  d: number;
  born: number;
  died: number;
  front?: boolean;
  floors?: number;
}

const PH_COLOR: Record<string, number> = { Lot: 0x4f8a3c, Mass: 0x8fa3ff, Facade: 0xff9f43, Roof: 0xff5d8f, Floor: 0x4dd2ff, Ground: 0xc77dff, Bay: 0x5cff9d, Shop: 0xffe066, WinCol: 0xf0f0f0 };

export default defineWorldDemo({
  id: 'WRD-016',
  notes: 'CGA shape 風の小さな規則インタプリタ。各段で、まだ書き換えられていない形状すべてに規則を1回ずつ並列適用する：1 Lot→extrude→Mass、2 Mass→comp(f)→4面の Facade と Roof、3 Facade→split(y)→Ground|{Floor}*、Roof→確率で Gable|Hip|Flat、4 Floor→split(x)→{Bay}*、Ground→{Shop}*（正面中央は Door）、5 Bay→split(x)→Wall|WinCol|Wall、Shop→split(y)、6 WinCol→split(y)→Wall|Window|Wall。「~」付きの寸法は残りを比で配る相対寸法、「*」は入るだけ繰り返す。未展開の非終端記号は半透明の色付きスコープで表示（緑 Lot・青 Mass・橙 Facade・桃 Roof・水色 Floor・紫 Ground・黄緑 Bay・黄 Shop・白 WinCol）。「段を自動再生」で導出が順に進む。',
  params: [
    { key: 'stage', label: '適用する段数', type: 'number', min: 0, max: STAGES, step: 1, default: STAGES },
    { key: 'count', label: '棟数', type: 'number', min: 1, max: 12, step: 1, default: 6 },
    { key: 'roofP', label: '屋根（勾配屋根）の確率', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'winR', label: '窓の幅の比', type: 'number', min: 0.5, max: 4, step: 0.1, default: 1.6 },
    { key: 'play', label: '段を自動再生', type: 'bool', default: false },
  ],
  liveKeys: ['stage', 'play'],
  distance: 12,
  elevation: 0.85,
  target: [0, 0.6, 0],
  compareLabels: ['規則適用前（Lot）', '導出結果'],
  build(p, env) {
    const rng = env.rng;
    const N = Number(p.count), roofP = Number(p.roofP), winR = Number(p.winR);
    const FH = 0.32, BW = 0.42;
    // 通りの両側に敷地を並べる
    const shapes: Shape[] = [];
    const widths = Array.from({ length: N }, () => 1.0 + rng() * 0.9);
    const rowW = [0, 1].map((r) => widths.filter((_, i) => i % 2 === r).reduce((a, b) => a + b + 0.15, 0));
    const cursor = [-rowW[0] / 2, rowW[1] / 2];
    for (let i = 0; i < N; i++) {
      const row = i % 2, w = widths[i], d = 1.0 + rng() * 0.5;
      if (row === 0) {
        // 手前側の列：正面は +z を向く（奥行きは -z 方向）
        shapes.push({ sym: 'Lot', o: [cursor[0], 0.03, -0.8], a: [1, 0], n: [0, 1], w, h: 0, d, born: 0, died: Infinity, floors: 2 + Math.floor(rng() * 4) });
        cursor[0] += w + 0.15;
      } else {
        shapes.push({ sym: 'Lot', o: [cursor[1], 0.03, 0.8], a: [-1, 0], n: [0, -1], w, h: 0, d, born: 0, died: Infinity, floors: 2 + Math.floor(rng() * 4) });
        cursor[1] -= w + 0.15;
      }
    }
    const at = (s: Shape, u: number, v: number, dd = 0): [number, number, number] => [s.o[0] + s.a[0] * u - s.n[0] * dd, s.o[1] + v, s.o[2] + s.a[1] * u - s.n[1] * dd];
    // 相対寸法（~）と繰り返し（*）を解く split
    const splitSizes = (total: number, items: { size: number; rel: boolean }[]) => {
      const fixed = items.filter((it) => !it.rel).reduce((a, b) => a + b.size, 0);
      const rel = items.filter((it) => it.rel).reduce((a, b) => a + b.size, 0);
      const k = rel > 0 ? Math.max(0, total - fixed) / rel : 0;
      return items.map((it) => (it.rel ? it.size * k : it.size));
    };
    const repeat = (total: number, size: number) => Math.max(1, Math.round(total / size));
    const faceChild = (s: Shape, sym: string, u0: number, v0: number, w: number, h: number, stage: number, extra: Partial<Shape> = {}): Shape => ({
      sym, o: at(s, u0, v0), a: s.a, n: s.n, w, h, d: 0, born: stage, died: Infinity, front: s.front, ...extra,
    });
    const terminals: { sym: string; s: Shape; r: number }[] = [];
    const addT = (t: { sym: string; s: Shape }) => terminals.push({ ...t, r: rng() });

    for (let stage = 1; stage <= STAGES; stage++) {
      const alive = shapes.filter((s) => s.died === Infinity && s.born < stage && PH_COLOR[s.sym] !== undefined);
      for (const s of alive) {
        const out: Shape[] = [];
        switch (s.sym) {
          case 'Lot':
            out.push({ ...s, sym: 'Mass', h: (s.floors ?? 3) * FH + 0.12, born: stage, died: Infinity });
            break;
          case 'Mass': {
            const [ax, az] = s.a, [nx, nz] = s.n;
            const W = s.w, D = s.d, H = s.h;
            const base = s.o;
            const P = (u: number, dd: number): [number, number, number] => [base[0] + ax * u - nx * dd, base[1], base[2] + az * u - nz * dd];
            out.push({ sym: 'Facade', o: P(0, 0), a: [ax, az], n: [nx, nz], w: W, h: H, d: 0, born: stage, died: Infinity, front: true });
            out.push({ sym: 'Facade', o: P(W, 0), a: [-nx, -nz], n: [ax, az], w: D, h: H, d: 0, born: stage, died: Infinity });
            out.push({ sym: 'Facade', o: P(W, D), a: [-ax, -az], n: [-nx, -nz], w: W, h: H, d: 0, born: stage, died: Infinity });
            out.push({ sym: 'Facade', o: P(0, D), a: [nx, nz], n: [-ax, -az], w: D, h: H, d: 0, born: stage, died: Infinity });
            out.push({ sym: 'Roof', o: [base[0], base[1] + H, base[2]], a: [ax, az], n: [nx, nz], w: W, h: 0, d: D, born: stage, died: Infinity });
            break;
          }
          case 'Facade': {
            const g = FH * 1.25;
            const nF = repeat(s.h - g - 0.12, FH);
            const sizes = splitSizes(s.h - 0.12, [{ size: g, rel: false }, ...Array.from({ length: nF }, () => ({ size: 1, rel: true }))]);
            let v = 0;
            sizes.forEach((h, i) => {
              out.push(faceChild(s, i === 0 ? 'Ground' : 'Floor', 0, v, s.w, h, stage));
              v += h;
            });
            addT({ sym: 'Cornice', s: faceChild(s, 'Cornice', 0, v, s.w, 0.12, stage) });
            break;
          }
          case 'Roof': {
            const r = rng();
            addT({ sym: r < roofP * 0.6 ? 'Gable' : r < roofP ? 'Hip' : 'Flat', s: { ...s, born: stage } });
            break;
          }
          case 'Floor':
          case 'Ground': {
            const nb = repeat(s.w, BW);
            const sizes = splitSizes(s.w, Array.from({ length: nb }, () => ({ size: 1, rel: true })));
            let u = 0;
            sizes.forEach((w, i) => {
              const door = s.sym === 'Ground' && s.front && i === Math.floor(nb / 2);
              if (door) addT({ sym: 'Door', s: faceChild(s, 'Door', u, 0, w, s.h, stage) });
              else out.push(faceChild(s, s.sym === 'Floor' ? 'Bay' : 'Shop', u, 0, w, s.h, stage));
              u += w;
            });
            break;
          }
          case 'Bay': {
            const sizes = splitSizes(s.w, [{ size: 1, rel: true }, { size: winR, rel: true }, { size: 1, rel: true }]);
            let u = 0;
            sizes.forEach((w, i) => {
              if (i === 1) out.push(faceChild(s, 'WinCol', u, 0, w, s.h, stage));
              else addT({ sym: 'Wall', s: faceChild(s, 'Wall', u, 0, w, s.h, stage) });
              u += w;
            });
            break;
          }
          case 'Shop': {
            const sizes = splitSizes(s.h, [{ size: 0.8, rel: true }, { size: 0.2, rel: true }]);
            addT({ sym: 'ShopWindow', s: faceChild(s, 'ShopWindow', 0.02, 0, s.w - 0.04, sizes[0], stage) });
            addT({ sym: 'Wall', s: faceChild(s, 'Wall', 0, sizes[0], s.w, sizes[1], stage) });
            break;
          }
          case 'WinCol': {
            const sizes = splitSizes(s.h, [{ size: 0.3, rel: true }, { size: 1, rel: true }, { size: 0.25, rel: true }]);
            let v = 0;
            sizes.forEach((h, i) => {
              addT({ sym: i === 1 ? 'Window' : 'Wall', s: faceChild(s, i === 1 ? 'Window' : 'Wall', 0, v, s.w, h, stage) });
              v += h;
            });
            break;
          }
        }
        s.died = stage;
        shapes.push(...out);
      }
    }

    // ---- 段ごとの表示グループ ----
    const ry = (a: [number, number]) => Math.atan2(-a[1], a[0]);
    const gableGeo = (() => {
      const g = new THREE.BufferGeometry();
      // 底面 1×1（y=0）、棟は x 方向（y=1）
      const v = [-0.5, 0, 0.5, 0.5, 0, 0.5, 0.5, 1, 0, -0.5, 1, 0, -0.5, 0, -0.5, 0.5, 0, -0.5];
      const idx = [0, 1, 2, 0, 2, 3, 5, 4, 3, 5, 3, 2, 4, 0, 3, 1, 5, 2];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.setIndex(idx);
      const ng = g.toNonIndexed();
      g.dispose();
      ng.computeVertexNormals();
      return ng;
    })();
    const makeStage = (S: number) => {
      const grp = new THREE.Group();
      const walls = new BoxBatch(), glass = new BoxBatch(), gables = new BoxBatch(), hips = new BoxBatch(), ph = new BoxBatch();
      const c = new THREE.Color();
      for (const t of terminals) {
        if (t.s.born > S) continue;
        const s = t.s;
        const r = ry(s.a);
        const ctr = (dd: number) => at(s, s.w / 2, s.h / 2, dd);
        switch (t.sym) {
          case 'Wall':
          case 'Cornice': {
            const [x, y, z] = ctr(t.sym === 'Cornice' ? -0.03 : 0.04);
            walls.add(x, y, z, s.w + (t.sym === 'Cornice' ? 0.06 : 0), s.h, t.sym === 'Cornice' ? 0.14 : 0.08, t.sym === 'Cornice' ? 0xe8e1d0 : 0xd9c7a6, r);
            break;
          }
          case 'Window':
          case 'ShopWindow':
          case 'Door': {
            const [x, y, z] = ctr(0.07);
            glass.add(x, y, z, s.w, s.h, 0.04, t.sym === 'Door' ? 0x4a2e1e : t.sym === 'ShopWindow' ? 0x7fb6d8 : t.r < 0.15 ? 0xf2d27a : 0x3d5b78, r);
            // 窓まわりの枠（下枠）
            if (t.sym === 'Window') {
              const [sx, sy, sz] = at(s, s.w / 2, 0.01, 0.02);
              walls.add(sx, sy, sz, s.w + 0.04, 0.03, 0.1, 0xf0ece4, r);
            }
            break;
          }
          case 'Flat': {
            const [x, , z] = at(s, s.w / 2, 0, s.d / 2);
            walls.add(x, s.o[1] + 0.03, z, s.w + 0.04, 0.06, s.d + 0.04, 0x8c8f96, r);
            break;
          }
          case 'Gable':
          case 'Hip': {
            const [x, , z] = at(s, s.w / 2, 0, s.d / 2);
            c.setHSL(0.02 + t.r * 0.05, 0.5, 0.35 + t.r * 0.1);
            const hh = Math.min(s.w, s.d) * 0.45;
            if (t.sym === 'Gable') gables.add(x, s.o[1], z, s.w + 0.1, hh, s.d + 0.1, c, r);
            else hips.add(x, s.o[1], z, s.w + 0.1, hh, s.d + 0.1, c, r);
            break;
          }
        }
      }
      for (const s of shapes) {
        if (!(s.born <= S && S < s.died) || PH_COLOR[s.sym] === undefined) continue;
        const col = PH_COLOR[s.sym];
        const r = ry(s.a);
        if (s.sym === 'Lot') {
          const [x, , z] = at(s, s.w / 2, 0, s.d / 2);
          ph.add(x, 0.04, z, s.w, 0.03, s.d, col, r);
        } else if (s.sym === 'Mass' || s.sym === 'Roof') {
          const [x, , z] = at(s, s.w / 2, 0, s.d / 2);
          const h = s.sym === 'Roof' ? 0.05 : s.h;
          ph.add(x, s.o[1] + h / 2, z, s.w - 0.02, h, s.d - 0.02, col, r);
        } else {
          const m = Math.min(0.025, s.w * 0.08, s.h * 0.08);
          const [x, y, z] = at(s, s.w / 2, s.h / 2, -0.03);
          ph.add(x, y, z, s.w - 2 * m, s.h - 2 * m, 0.03, col, r);
        }
      }
      if (walls.count) grp.add(walls.build(new THREE.MeshStandardMaterial({ roughness: 0.85 })));
      if (glass.count) grp.add(glass.build(new THREE.MeshStandardMaterial({ roughness: 0.2, metalness: 0.4 })));
      if (gables.count) grp.add(gables.build(new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true, side: THREE.DoubleSide }), gableGeo.clone()));
      if (hips.count) {
        const hg = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4);
        hg.rotateY(Math.PI / 4);
        hg.translate(0, 0.5, 0);
        grp.add(hips.build(new THREE.MeshStandardMaterial({ roughness: 0.7, flatShading: true }), hg));
      }
      if (ph.count) grp.add(ph.build(new THREE.MeshStandardMaterial({ roughness: 0.6, transparent: true, opacity: 0.55, depthWrite: false })));
      return grp;
    };

    const object = new THREE.Group();
    const street = new BoxBatch();
    const len = Math.max(rowW[0], rowW[1]) + 1.5;
    street.add(0, 0.005, 0, len, 0.01, 1.6, 0x3a3d45);
    street.add(0, 0.015, -0.7, len, 0.03, 0.2, 0xa8a49a);
    street.add(0, 0.015, 0.7, len, 0.03, 0.2, 0xa8a49a);
    street.add(0, 0.008, 0, len, 0.01, 0.025, 0xe8e2c8);
    object.add(street.build(new THREE.MeshStandardMaterial({ roughness: 0.9 })));
    const stages = Array.from({ length: STAGES + 1 }, (_, s) => makeStage(s));
    gableGeo.dispose();
    stages.forEach((g) => object.add(g));

    const before = new THREE.Group();
    const st2 = new BoxBatch();
    st2.add(0, 0.005, 0, len, 0.01, 1.6, 0x3a3d45);
    before.add(st2.build());
    before.add(makeStage(0));

    let shown = -1;
    const show = (s: number) => {
      if (s === shown) return;
      shown = s;
      stages.forEach((g, i) => (g.visible = i === s));
    };
    show(Number(p.stage));
    const count = (S: number) => {
      const nt = terminals.filter((t) => t.s.born <= S).length;
      const open = shapes.filter((s) => s.born <= S && S < s.died && PH_COLOR[s.sym] !== undefined).length;
      return `終端 ${nt} · 未展開 ${open}`;
    };
    return {
      object,
      before,
      info: () => `段 ${shown}/${STAGES}: ${RULES[shown]} · ${count(shown)} · 棟数 ${N}`,
      update(_dt, time, live) {
        show(live.play ? Math.floor(time * 0.9) % (STAGES + 1) : Number(live.stage));
      },
    };
  },
});
