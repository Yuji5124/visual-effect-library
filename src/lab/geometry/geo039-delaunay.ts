import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';
import { makeNoise2, fbm2 } from '../framework/random';

/** GEO-039 ドロネー三角形分割：Bowyer-Watson 法（自前実装）で点を1つずつ挿入する */
interface Tri { a: number; b: number; c: number; cx: number; cy: number; r2: number }

class BowyerWatson {
  readonly tris: Tri[] = [];
  constructor(readonly xs: Float64Array, readonly ys: Float64Array) {}
  make(a: number, b: number, c: number): Tri {
    const { xs, ys } = this;
    const ax = xs[a], ay = ys[a], bx = xs[b], by = ys[b], cx = xs[c], cy = ys[c];
    const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
    const a2 = ax * ax + ay * ay, b2 = bx * bx + by * by, c2 = cx * cx + cy * cy;
    const ux = (a2 * (by - cy) + b2 * (cy - ay) + c2 * (ay - by)) / d;
    const uy = (a2 * (cx - bx) + b2 * (ax - cx) + c2 * (bx - ax)) / d;
    // 向きを反時計回りに揃える
    if (d < 0) return { a, b: c, c: b, cx: ux, cy: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
    return { a, b, c, cx: ux, cy: uy, r2: (ax - ux) ** 2 + (ay - uy) ** 2 };
  }
  /** 外接円が点 p を含む三角形を全て消し、できた多角形の穴を p と結ぶ */
  insert(p: number): void {
    const x = this.xs[p], y = this.ys[p];
    const keep: Tri[] = [];
    const edges = new Map<string, [number, number] | null>();
    for (const t of this.tris) {
      if ((x - t.cx) ** 2 + (y - t.cy) ** 2 < t.r2) {
        for (const [u, v] of [[t.a, t.b], [t.b, t.c], [t.c, t.a]]) {
          const k = u < v ? `${u},${v}` : `${v},${u}`;
          // 2つの「悪い三角形」が共有する辺は穴の内部なので捨てる
          edges.set(k, edges.has(k) ? null : [u, v]);
        }
      } else keep.push(t);
    }
    this.tris.length = 0;
    this.tris.push(...keep);
    for (const e of edges.values()) if (e) this.tris.push(this.make(e[0], e[1], p));
  }
}

export default defineGeometryDemo({
  id: 'GEO-039',
  notes: '平面上のランダムな点を Bowyer-Watson 法（自前実装）で1点ずつ挿入する：外接円が新しい点を含む三角形を消し、残った穴の境界辺を新しい点と結ぶ。点に fBm ノイズの高さを持たせた地形（TIN）として表示し、外接円を補助線で描ける。「挿入を再生」で分割が育つ過程を見られる。',
  params: [
    { key: 'count', label: '点の数', type: 'number', min: 3, max: 1500, step: 1, default: 220 },
    { key: 'height', label: '高さ', type: 'number', min: 0, max: 2.5, step: 0.05, default: 1.2 },
    { key: 'circles', label: '外接円の表示', type: 'bool', default: true },
    { key: 'distribution', label: '点の分布', type: 'select', options: [{ value: 'uniform', label: '一様乱数' }, { value: 'jitter', label: 'ゆらいだ格子' }, { value: 'cluster', label: '集中' }], default: 'uniform' },
    { key: 'animate', label: '挿入を再生（1点ずつ）', type: 'bool', default: false },
    { key: 'seed', label: 'シード', type: 'number', min: 1, max: 9999, step: 1, default: 1 },
  ],
  liveKeys: ['animate', 'circles'],
  distance: 11,
  elevation: 0.75,
  compareLabels: ['点群', 'ドロネー三角形分割'],
  build(p, env) {
    const rng = env.rng;
    let n = Number(p.count);
    if (env.quality === 'low') n = Math.min(n, 800);
    const R = 3;
    const xs = new Float64Array(n + 3), ys = new Float64Array(n + 3);
    const dist = String(p.distribution);
    const side = Math.ceil(Math.sqrt(n));
    for (let i = 0; i < n; i++) {
      if (dist === 'jitter') {
        const gx = i % side, gy = Math.floor(i / side);
        xs[i] = ((gx + 0.5 + (rng() - 0.5) * 0.7) / side) * 2 * R - R;
        ys[i] = ((gy + 0.5 + (rng() - 0.5) * 0.7) / side) * 2 * R - R;
      } else if (dist === 'cluster') {
        const a = rng() * Math.PI * 2, r = Math.pow(rng(), 1.8) * R;
        xs[i] = Math.cos(a) * r; ys[i] = Math.sin(a) * r;
      } else {
        xs[i] = (rng() * 2 - 1) * R; ys[i] = (rng() * 2 - 1) * R;
      }
    }
    // 全点を含む大きな三角形（最後に取り除く）
    xs[n] = -100; ys[n] = -100; xs[n + 1] = 100; ys[n + 1] = -100; xs[n + 2] = 0; ys[n + 2] = 100;
    const noise = makeNoise2(env.seed);
    const hs = new Float32Array(n);
    const H = Number(p.height);
    for (let i = 0; i < n; i++) hs[i] = Math.max(0, fbm2(noise, xs[i] * 0.35 + 3, ys[i] * 0.35 - 2, 4) * 0.5 + 0.35) * H;

    const positions = new Float32Array(n * 3);
    const colors = new Float32Array(n * 3);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      positions.set([xs[i], hs[i], ys[i]], i * 3);
      const t = H > 0 ? hs[i] / H : 0.3;
      c.setHSL(0.33 - t * 0.28, 0.45, 0.28 + t * 0.4);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    const posAttr = new THREE.BufferAttribute(positions, 3);
    const colAttr = new THREE.BufferAttribute(colors, 3);
    const arr = new Uint16Array((2 * n + 2) * 3);
    const mesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true, side: THREE.DoubleSide }));

    const dotGeo = new THREE.SphereGeometry(0.035, 6, 4);
    const mkDots = (color: number) => {
      const d = new THREE.InstancedMesh(dotGeo.clone(), new THREE.MeshBasicMaterial({ color }), n);
      const m = new THREE.Matrix4();
      for (let i = 0; i < n; i++) d.setMatrixAt(i, m.makeTranslation(xs[i], hs[i] + 0.01, ys[i]));
      return d;
    };
    dotGeo.dispose();
    const before = mkDots(0xdfe6ff);
    const helpers = new THREE.Group();
    const dots = mkDots(0xffffff);
    helpers.add(dots);
    // 外接円（地面 y=0 に描く）
    const circleSeg = 40;
    const maxCircles = Math.min(2 * n + 2, 600);
    const cArr = new Float32Array(maxCircles * circleSeg * 6);
    const cgeo = new THREE.BufferGeometry();
    cgeo.setAttribute('position', new THREE.BufferAttribute(cArr, 3).setUsage(THREE.DynamicDrawUsage));
    const circleLines = new THREE.LineSegments(cgeo, new THREE.LineBasicMaterial({ color: 0xffb84d, transparent: true, opacity: 0.35 }));
    circleLines.visible = Boolean(p.circles);
    helpers.add(circleLines);
    const ground = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(2 * R, 2 * R).rotateX(-Math.PI / 2)), new THREE.LineBasicMaterial({ color: 0x4a5080 }));
    helpers.add(ground);

    const bw = new BowyerWatson(xs, ys);
    const reset = () => {
      bw.tris.length = 0;
      bw.tris.push(bw.make(n, n + 1, n + 2));
    };
    let inserted = 0;
    let triCount = 0;
    let ms = 0;
    const emit = () => {
      let k = 0;
      let ck = 0;
      for (const t of bw.tris) {
        if (t.a >= n || t.b >= n || t.c >= n) continue;
        // xz 平面で上向き（y+）になるよう向きを揃える
        arr[k++] = t.a; arr[k++] = t.c; arr[k++] = t.b;
        if (ck < maxCircles) {
          const r = Math.sqrt(t.r2);
          for (let s = 0; s < circleSeg; s++) {
            const a0 = (s / circleSeg) * Math.PI * 2, a1 = ((s + 1) / circleSeg) * Math.PI * 2;
            cArr.set([t.cx + Math.cos(a0) * r, 0.005, t.cy + Math.sin(a0) * r, t.cx + Math.cos(a1) * r, 0.005, t.cy + Math.sin(a1) * r], (ck * circleSeg + s) * 6);
          }
          ck++;
        }
      }
      triCount = k / 3;
      // 三角形の数ちょうどの索引でジオメトリを作り直す（頂点の属性は共有）
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', posAttr);
      geo.setAttribute('color', colAttr);
      geo.setIndex(new THREE.BufferAttribute(arr.slice(0, k), 1));
      mesh.geometry.dispose();
      mesh.geometry = geo;
      cgeo.setDrawRange(0, ck * circleSeg * 2);
      cgeo.attributes.position.needsUpdate = true;
      cgeo.computeBoundingSphere();
      dots.count = Math.max(1, inserted);
    };
    const t0 = performance.now();
    reset();
    for (let i = 0; i < n; i++) bw.insert(i);
    inserted = n;
    ms = performance.now() - t0;
    emit();

    let playing = false;
    let acc = 0;
    return {
      object: mesh,
      before,
      helpers,
      info: () => `挿入 ${inserted}/${n} 点 · 三角形 ${triCount}${n >= 3 ? `（理論値 ≤ 2n−5 = ${2 * n - 5}）` : ''} · 分割 ${ms.toFixed(1)}ms`,
      update(dt, _t, live) {
        circleLines.visible = Boolean(live.circles);
        if (live.animate && !playing) {
          playing = true;
          reset();
          inserted = 0;
          acc = 0;
        }
        if (!live.animate && playing) {
          playing = false;
          for (let i = inserted; i < n; i++) bw.insert(i);
          inserted = n;
          emit();
        }
        if (!playing) return;
        // 約8秒で全点（終わったら少し止まって最初から）
        acc += dt * Math.max(4, n / 8);
        const target = Math.min(n, Math.floor(acc));
        if (target > inserted) {
          for (let i = inserted; i < target; i++) bw.insert(i);
          inserted = target;
          emit();
        } else if (inserted >= n && acc > n * 1.25) {
          reset();
          inserted = 0;
          acc = 0;
          emit();
        }
      },
    };
  },
});
