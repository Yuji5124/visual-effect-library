import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { makeRng } from '../framework/random';
import { BoxBatch, Ticker, segments } from '../framework/worldKit';
import { delaunay, kruskal, triangleEdges, rectsOverlap, type Edge, type Rect } from '../framework/geom2d';

/** WRD-035 部屋分離＋ドロネー＋MST（TinyKeep 方式）：分離をアニメーションし、段階ごとに表示を切り替える */
interface Room { x: number; y: number; w: number; h: number; big: boolean }

const S = 0.2; // 1格子 → ワールド
const STAGES = ['sep', 'big', 'del', 'mst', 'loop', 'final'];

export default defineWorldDemo({
  id: 'WRD-035',
  notes: '円内に重ねて置いた部屋を、重なる相手から離れる向き（separation）へ毎ステップ押し出して散らし、格子に揃える。大部屋の中心を独自のボウヤー・ワトソン法でドロネー分割し、Kruskal 法の最小全域木に残りの辺を確率で戻してループを作り、L字の廊下を通す。廊下と交わる小部屋は採用する。「表示する段階」で各段階を見比べられる。',
  params: [
    { key: 'rooms', label: '部屋の数', type: 'number', min: 15, max: 90, step: 1, default: 55 },
    { key: 'bigThreshold', label: '大部屋の閾値（平均面積の倍率）', type: 'number', min: 0.8, max: 2.5, step: 0.05, default: 1.25 },
    { key: 'loops', label: 'ループの割合', type: 'number', min: 0, max: 0.6, step: 0.01, default: 0.15 },
    {
      key: 'stage', label: '表示する段階', type: 'select', default: 'final',
      options: [
        { value: 'sep', label: '1 分離' },
        { value: 'big', label: '2 大部屋の選択' },
        { value: 'del', label: '3 ドロネー三角形分割' },
        { value: 'mst', label: '4 最小全域木' },
        { value: 'loop', label: '5 ループ辺の追加' },
        { value: 'final', label: '6 L字の廊下（完成）' },
      ],
    },
    { key: 'speed', label: '分離の速さ（ステップ/秒）', type: 'number', min: 10, max: 240, step: 5, default: 90 },
  ],
  liveKeys: ['stage', 'speed'],
  distance: 15,
  elevation: 1.0,
  compareLabels: ['初期配置（重なり）', '分離後'],
  build(p, env) {
    const n = Math.round(Number(p.rooms));
    const rng = env.rng;
    const rooms: Room[] = [];
    for (let i = 0; i < n; i++) {
      const w = 2 + Math.floor(Math.pow(rng(), 1.7) * 10);
      const h = Math.max(2, Math.min(12, Math.round(w * (0.6 + rng() * 0.8))));
      const r = 7 * Math.sqrt(rng()), a = rng() * Math.PI * 2;
      rooms.push({ x: Math.round(r * Math.cos(a)), y: Math.round(r * Math.sin(a)), w, h, big: false });
    }
    const mean = rooms.reduce((s, r) => s + r.w * r.h, 0) / n;
    for (const r of rooms) r.big = r.w * r.h > mean * Number(p.bigThreshold);
    const bigCount = rooms.filter((r) => r.big).length;

    // 処理前：重なった初期配置
    const pre = new BoxBatch();
    for (const r of rooms) pre.addOnGround(r.x * S, r.y * S, r.w * S * 0.98, r.big ? 0.5 : 0.2, r.h * S * 0.98, r.big ? 0xb08040 : 0x56607a);
    const before = pre.build();

    const object = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 1, 1);
    geo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.05 }), n);
    mesh.frustumCulled = false;
    object.add(mesh);
    const helpers = new THREE.Group();

    const overl = new Uint8Array(n);
    const vx = new Float32Array(n), vy = new Float32Array(n);
    const margin = 1;
    let steps = 0;
    let done = false;
    let overlapPairs = 0;
    const separate = (m: number): number => {
      let pairs = 0;
      vx.fill(0); vy.fill(0); overl.fill(0);
      for (let i = 0; i < n; i++) {
        const A = rooms[i];
        for (let j = i + 1; j < n; j++) {
          const B = rooms[j];
          if (Math.abs(A.x - B.x) < (A.w + B.w) / 2 + m && Math.abs(A.y - B.y) < (A.h + B.h) / 2 + m) {
            let dx = A.x - B.x, dy = A.y - B.y;
            let d = Math.hypot(dx, dy);
            if (d < 1e-6) { dx = Math.cos(i * 2.4); dy = Math.sin(i * 2.4); d = 1; }
            vx[i] += dx / d; vy[i] += dy / d; vx[j] -= dx / d; vy[j] -= dy / d;
            overl[i] = overl[j] = 1;
            pairs++;
          }
        }
      }
      for (let i = 0; i < n; i++) {
        const l = Math.hypot(vx[i], vy[i]);
        if (l > 1e-9) { rooms[i].x += (vx[i] / l) * 0.35; rooms[i].y += (vy[i] / l) * 0.35; }
      }
      return pairs;
    };

    // 分離後の各段階の生成物
    let delaunayLines: THREE.Object3D | null = null, mstLines: THREE.Object3D | null = null, loopLines: THREE.Object3D | null = null, corridorMesh: THREE.Object3D | null = null;
    const kept = new Uint8Array(n);
    let nDel = 0, nMst = 0, nLoop = 0, nKept = 0;
    const finalize = () => {
      for (const r of rooms) {
        r.x = Math.round(r.x - r.w / 2) + r.w / 2;
        r.y = Math.round(r.y - r.h / 2) + r.h / 2;
      }
      const big = rooms.map((r, i) => (r.big ? i : -1)).filter((i) => i >= 0);
      const pts = big.map((i) => ({ x: rooms[i].x, y: rooms[i].y }));
      let edges: Edge[];
      if (pts.length >= 3) edges = triangleEdges(delaunay(pts), pts);
      else edges = pts.length === 2 ? [{ a: 0, b: 1, w: 1 }] : [];
      const [mst, rest] = kruskal(pts.length, edges);
      const r2 = makeRng(env.seed * 7 + 3);
      const loops = rest.filter(() => r2() < Number(p.loops));
      nDel = edges.length; nMst = mst.length; nLoop = loops.length;
      const lineOf = (list: Edge[], color: number, y: number) => {
        const arr: number[] = [];
        for (const e of list) {
          const A = rooms[big[e.a]], B = rooms[big[e.b]];
          arr.push(A.x * S, y, A.y * S, B.x * S, y, B.y * S);
        }
        return segments(arr.length ? arr : [0, 0, 0, 0, 0, 0], color);
      };
      delaunayLines = lineOf(edges, 0x58c8ff, 0.62);
      mstLines = lineOf(mst, 0xffd84a, 0.66);
      loopLines = lineOf(loops, 0xff5ad0, 0.66);
      helpers.add(delaunayLines, mstLines, loopLines);
      // L字の廊下（幅 cw）
      const cw = 1.4;
      const rects: Rect[] = [];
      for (const e of [...mst, ...loops]) {
        const A = rooms[big[e.a]], B = rooms[big[e.b]];
        const hFirst = r2() < 0.5;
        const cx = hFirst ? B.x : A.x, cy = hFirst ? A.y : B.y; // 曲がり角
        rects.push({ x: Math.min(A.x, cx) - cw / 2, y: Math.min(A.y, cy) - cw / 2, w: Math.abs(cx - A.x) + cw, h: Math.abs(cy - A.y) + cw });
        rects.push({ x: Math.min(B.x, cx) - cw / 2, y: Math.min(B.y, cy) - cw / 2, w: Math.abs(cx - B.x) + cw, h: Math.abs(cy - B.y) + cw });
      }
      const cb = new BoxBatch();
      for (const r of rects) cb.addOnGround((r.x + r.w / 2) * S, (r.y + r.h / 2) * S, r.w * S, 0.08, r.h * S, 0xc8b48a);
      corridorMesh = cb.build();
      object.add(corridorMesh);
      rooms.forEach((r, i) => {
        if (r.big) return;
        const rr: Rect = { x: r.x - r.w / 2, y: r.y - r.h / 2, w: r.w, h: r.h };
        if (rects.some((c) => rectsOverlap(rr, c))) { kept[i] = 1; nKept++; }
      });
      done = true;
    };

    const m4 = new THREE.Matrix4();
    const col = new THREE.Color();
    let lastStage = '';
    let dirty = true;
    const draw = (stage: string) => {
      const si = STAGES.indexOf(stage);
      for (let i = 0; i < n; i++) {
        const r = rooms[i];
        let show = true;
        let c = 0x56607a;
        if (!done || si === 0) c = overl[i] ? 0xd05a50 : 0x6a7ca0;
        else if (r.big) c = 0xe0a040;
        else if (si === 5) { show = kept[i] === 1; c = 0x4aa8a0; }
        const hgt = done && si >= 1 && r.big ? 0.5 : 0.2;
        m4.makeScale(show ? r.w * S * 0.98 : 1e-4, show ? hgt : 1e-4, show ? r.h * S * 0.98 : 1e-4);
        m4.setPosition(r.x * S, 0, r.y * S);
        mesh.setMatrixAt(i, m4);
        mesh.setColorAt(i, col.setHex(c));
      }
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.computeBoundingBox();
      if (delaunayLines) delaunayLines.visible = si === 2 || si === 3;
      if (mstLines) mstLines.visible = si >= 3 && si <= 4;
      if (loopLines) loopLines.visible = si === 4;
      if (corridorMesh) corridorMesh.visible = si === 5;
    };
    draw(String(p.stage));
    const ticker = new Ticker(Number(p.speed));

    return {
      object,
      before,
      helpers,
      info: () => {
        if (!done) return `分離中 ${steps} ステップ · 重なり ${overlapPairs} 組 · 部屋 ${n}（大部屋 ${bigCount}）`;
        return `分離 ${steps} ステップで完了 · 大部屋 ${bigCount} · ドロネー辺 ${nDel} · MST ${nMst} · ループ ${nLoop} · 廊下に掛かる小部屋 ${nKept}`;
      },
      update(dt, _t, pp) {
        ticker.rate = Number(pp.speed);
        if (!done) {
          const k = ticker.steps(dt, 8);
          for (let s = 0; s < k && !done; s++) {
            overlapPairs = separate(margin);
            steps++;
            dirty = true;
            if (overlapPairs === 0 || steps > 4000) finalize();
          }
        }
        const stage = String(pp.stage);
        if (dirty || stage !== lastStage) {
          draw(stage);
          dirty = false;
          lastStage = stage;
        }
      },
    };
  },
});
