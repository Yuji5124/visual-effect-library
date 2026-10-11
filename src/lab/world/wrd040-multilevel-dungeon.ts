import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { BoxBatch, segments } from '../framework/worldKit';
import { UnionFind, rectIntersect, type Rect } from '../framework/geom2d';
import { bspLevel, type BspLevel } from '../framework/dungeonKit';

/** WRD-040 多層ダンジョン：BSPで各階を作り、上下で重なる部屋を階段でつなぐ */
const G = 40; // 1階の格子
const S = 0.25;
const toX = (x: number) => (x - G / 2) * S;

interface Stair { lower: number; a: number; b: number; r: Rect; alongX: boolean; up: boolean }

export default defineWorldDemo({
  id: 'WRD-040',
  notes: '各階を BSP（最大の区画を分割→区画内に部屋→兄弟区画を L字廊下で接続）で別々に生成し、上下の階で床が重なる部屋の組を探して階段（斜めの段）を置く。重なりがない階は上階に踊り場の小部屋と廊下を足してつなぐ。全階の部屋を Union-Find でまとめ、全体の連結性を確認する。「階の間隔」で分解表示、「表示する階」で1階ずつ見られる。',
  params: [
    { key: 'levels', label: '階数', type: 'number', min: 2, max: 6, step: 1, default: 4 },
    { key: 'rooms', label: '各階の部屋数', type: 'number', min: 3, max: 14, step: 1, default: 7 },
    { key: 'spacing', label: '階の間隔（分解表示）', type: 'number', min: 0.5, max: 3.5, step: 0.05, default: 1.9 },
    {
      key: 'show', label: '表示する階', type: 'select', default: 'all',
      options: [{ value: 'all', label: 'すべて' }, ...[1, 2, 3, 4, 5, 6].map((i) => ({ value: String(i), label: `${i} 階` }))],
    },
  ],
  liveKeys: ['spacing', 'show'],
  distance: 18,
  elevation: 0.5,
  target: [0, 2.5, 0],
  compareLabels: ['階ごとの生成のみ（階段なし）', '階段で接続'],
  build(p, env) {
    const L = Math.round(Number(p.levels));
    const rng = env.rng;
    const levels: BspLevel[] = [];
    for (let l = 0; l < L; l++) levels.push(bspLevel(G, G, Math.round(Number(p.rooms)), rng, 7));
    const levelColor = (l: number, light = 0) => new THREE.Color().setHSL((0.58 + l * 0.13) % 1, 0.5, 0.42 + light).getHex();

    const floorGroup = (lv: BspLevel, l: number, extra: { rooms: Rect[]; corridors: Rect[] } = { rooms: [], corridors: [] }) => {
      const g = new THREE.Group();
      const b = new BoxBatch();
      for (const r of [...lv.rooms, ...extra.rooms]) b.addOnGround(toX(r.x + r.w / 2), toX(r.y + r.h / 2), r.w * S, 0.08, r.h * S, levelColor(l));
      for (const r of [...lv.corridors, ...extra.corridors]) b.addOnGround(toX(r.x + r.w / 2), toX(r.y + r.h / 2), r.w * S, 0.05, r.h * S, levelColor(l, 0.25));
      g.add(b.build());
      // 階の外枠
      const e = G * S / 2;
      g.add(segments([-e, 0, -e, e, 0, -e, e, 0, -e, e, 0, e, e, 0, e, -e, 0, e, -e, 0, e, -e, 0, -e], levelColor(l, 0.1), { opacity: 0.5 }));
      return g;
    };

    // 処理前：階段なしで積んだだけ
    const before = new THREE.Group();
    levels.forEach((lv, l) => {
      const g = floorGroup(lv, l);
      g.position.y = l * 1.3;
      before.add(g);
    });

    // 階段の候補：上下の階で重なる部屋の組
    const extras = levels.map(() => ({ rooms: [] as Rect[], corridors: [] as Rect[] }));
    const stairs: Stair[] = [];
    let landings = 0;
    for (let l = 0; l + 1 < L; l++) {
      const cand: { a: number; b: number; r: Rect; score: number }[] = [];
      levels[l].rooms.forEach((ra, a) => levels[l + 1].rooms.forEach((rb, b) => {
        const r = rectIntersect(ra, rb);
        if (r && Math.max(r.w, r.h) >= 3 && Math.min(r.w, r.h) >= 2) cand.push({ a, b, r, score: r.w * r.h * (0.6 + rng() * 0.8) });
      }));
      cand.sort((x, y) => y.score - x.score);
      const used = new Set<string>();
      for (const c of cand.slice(0, 2)) {
        if (stairs.some((s) => s.lower === l) && rng() < 0.5) break;
        if (used.has('a' + c.a) || used.has('b' + c.b)) continue;
        used.add('a' + c.a); used.add('b' + c.b);
        stairs.push({ lower: l, a: c.a, b: c.b, r: c.r, alongX: c.r.w >= c.r.h, up: rng() < 0.5 });
      }
      if (!stairs.some((s) => s.lower === l)) {
        // 重なりがなければ、上階に踊り場を足して最寄りの部屋へ廊下を引く
        const ra = levels[l].rooms[Math.floor(rng() * levels[l].rooms.length)];
        const land: Rect = { x: Math.floor(ra.x + ra.w / 2 - 2), y: Math.floor(ra.y + ra.h / 2 - 1), w: 4, h: 3 };
        const cx = land.x + 2, cy = land.y + 1;
        let best = 0, bd = Infinity;
        levels[l + 1].rooms.forEach((rb, i) => {
          const d = Math.abs(rb.x + rb.w / 2 - cx) + Math.abs(rb.y + rb.h / 2 - cy);
          if (d < bd) { bd = d; best = i; }
        });
        const rb = levels[l + 1].rooms[best];
        const bx = Math.floor(rb.x + rb.w / 2), by = Math.floor(rb.y + rb.h / 2);
        extras[l + 1].rooms.push(land);
        extras[l + 1].corridors.push({ x: Math.min(cx, bx), y: cy, w: Math.abs(bx - cx) + 1, h: 1 }, { x: bx, y: Math.min(cy, by), w: 1, h: Math.abs(by - cy) + 1 });
        const r = rectIntersect(ra, land) ?? land;
        stairs.push({ lower: l, a: levels[l].rooms.indexOf(ra), b: best, r, alongX: r.w >= r.h, up: rng() < 0.5 });
        landings++;
      }
    }

    // 全体の連結性（部屋をノードに、階内の廊下と階段を辺に）
    const offs: number[] = [];
    let total = 0;
    for (const lv of levels) { offs.push(total); total += lv.rooms.length; }
    const uf = new UnionFind(total);
    levels.forEach((lv, l) => lv.links.forEach(([a, b]) => uf.union(offs[l] + a, offs[l] + b)));
    for (const s of stairs) uf.union(offs[s.lower] + s.a, offs[s.lower + 1] + s.b);
    const roots = new Set<number>();
    for (let i = 0; i < total; i++) roots.add(uf.find(i));

    const object = new THREE.Group();
    const floorGroups = levels.map((lv, l) => floorGroup(lv, l, extras[l]));
    object.add(...floorGroups);
    const stairGroups = stairs.map((s) => {
      const g = new THREE.Group();
      const b = new BoxBatch();
      const n = 8;
      const run = (s.alongX ? s.r.w : s.r.h) - 0.4;
      const width = Math.min(2, s.alongX ? s.r.h : s.r.w) * S;
      const cx = toX(s.r.x + s.r.w / 2), cz = toX(s.r.y + s.r.h / 2);
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n - 0.5;
        const off = (s.up ? t : -t) * run * S;
        const hgt = (i + 1) / n;
        // 高さ1の段を置き、グループの scale.y で階の間隔に合わせる
        if (s.alongX) b.addOnGround(cx + off, cz, (run * S) / n, hgt, width, 0xf0d070);
        else b.addOnGround(cx, cz + off, width, hgt, (run * S) / n, 0xf0d070);
      }
      g.add(b.build());
      return g;
    });
    object.add(...stairGroups);

    let lastKey = '';
    const apply = (spacing: number, show: string) => {
      floorGroups.forEach((g, l) => {
        g.position.y = l * spacing;
        g.visible = show === 'all' || Number(show) === l + 1;
      });
      stairGroups.forEach((g, i) => {
        const s = stairs[i];
        g.position.y = s.lower * spacing;
        g.scale.y = spacing;
        g.visible = show === 'all' || Number(show) === s.lower + 1 || Number(show) === s.lower + 2;
      });
    };
    apply(Number(p.spacing), String(p.show));
    return {
      object,
      before,
      info: `${L} 階 · 部屋 ${total} · 階段 ${stairs.length}${landings ? `（踊り場を追加 ${landings}）` : ''} · 全体の連結成分 ${roots.size}${roots.size === 1 ? '（すべて到達可能）' : ''}`,
      update(_dt, _t, pp) {
        const key = `${pp.spacing}|${pp.show}`;
        if (key === lastKey) return;
        lastKey = key;
        apply(Number(pp.spacing), String(pp.show));
      },
    };
  },
});
