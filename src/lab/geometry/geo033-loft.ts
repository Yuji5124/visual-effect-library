import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { polyline, dots } from '../framework/deformKit';

/** GEO-033 ロフト：断面を弧長で再標本化し、開始点と向きを揃えて Catmull-Rom で縦につなぐ */

type Poly = THREE.Vector2[];

const circle = (r: number, start = 0): Poly => Array.from({ length: 64 }, (_, i) => {
  const a = start + (i / 64) * Math.PI * 2;
  return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
});
const square = (h: number, rot = Math.PI / 4): Poly => [0, 1, 2, 3].map((i) => {
  const a = rot + (i / 4) * Math.PI * 2;
  return new THREE.Vector2(Math.cos(a) * h * Math.SQRT2, Math.sin(a) * h * Math.SQRT2);
});
const star = (k: number, r1: number, r2: number, rot: number): Poly => Array.from({ length: k * 2 }, (_, i) => {
  const a = rot + (i / (k * 2)) * Math.PI * 2;
  const r = i % 2 ? r2 : r1;
  return new THREE.Vector2(Math.cos(a) * r, Math.sin(a) * r);
});
const reversed = (p: Poly): Poly => [...p].reverse();

/** 断面の組み合わせ（意図的に開始点・回り方向がばらばら） */
function sections(kind: string): Poly[] {
  if (kind === 'tower') return [square(1.1, 0.3), circle(0.9, 2.0), reversed(square(0.9, 0)), star(4, 1.0, 0.45, 1.2)];
  if (kind === 'vase') return [circle(0.7, 1.0), circle(1.35, 3.0), reversed(star(6, 1.1, 0.75, 0.4)), circle(0.55, 5.0), circle(0.8, 0.5)];
  return [circle(1.2, 0), square(0.95, 0.9), reversed(star(5, 1.2, 0.55, 2.2)), circle(0.45, 4.0)];
}

/** 閉多角形を弧長で等間隔に m 点へ再標本化 */
function resample(poly: Poly, m: number): Poly {
  const n = poly.length;
  const L = [0];
  for (let i = 0; i < n; i++) L.push(L[i] + poly[i].distanceTo(poly[(i + 1) % n]));
  const total = L[n];
  const out: Poly = [];
  let k = 0;
  for (let j = 0; j < m; j++) {
    const s = (j / m) * total;
    while (L[k + 1] < s) k++;
    const t = (s - L[k]) / Math.max(1e-9, L[k + 1] - L[k]);
    out.push(poly[k].clone().lerp(poly[(k + 1) % n], t));
  }
  return out;
}

const signedArea = (p: Poly) => p.reduce((s, v, i) => s + v.x * p[(i + 1) % p.length].y - p[(i + 1) % p.length].x * v.y, 0) / 2;

/** 前の断面との距離の二乗和が最小になる巡回シフトを選ぶ（必要なら向きも反転） */
function align(prev: Poly, cur: Poly): { poly: Poly; shift: number; flipped: boolean } {
  let c = cur;
  const flipped = Math.sign(signedArea(c)) !== Math.sign(signedArea(prev));
  if (flipped) c = reversed(c);
  const m = c.length;
  let best = 0, bestCost = Infinity;
  for (let s = 0; s < m; s++) {
    let cost = 0;
    for (let j = 0; j < m; j++) cost += prev[j].distanceToSquared(c[(j + s) % m]);
    if (cost < bestCost) {
      bestCost = cost;
      best = s;
    }
  }
  return { poly: c.map((_, j) => c[(j + best) % m]), shift: best, flipped };
}

export default defineGeometryDemo({
  id: 'GEO-033',
  notes: '各断面を弧長で等間隔に m 点へ再標本化し、ねじれ補正をオンにすると、前の断面と向き（符号付き面積）を揃えたうえで距離の二乗和が最小になる開始点へ巡回シフトする。対応する点を高さ方向に Catmull-Rom でつないで側面を張り、上下は三角形分割で蓋をする。補正をオフにすると開始点・回り方向のずれで面がねじれる（黄色の点が各断面の開始点）。',
  params: [
    { key: 'combo', label: '断面の組み合わせ', type: 'select', options: [{ value: 'csq', label: '円→四角→星→小円' }, { value: 'tower', label: '四角→円→四角→十字星' }, { value: 'vase', label: '花瓶（円と星）' }], default: 'csq' },
    { key: 'correct', label: 'ねじれ補正（開始点と向きを揃える）', type: 'bool', default: true },
    { key: 'height', label: '高さ', type: 'number', min: 1.5, max: 6, step: 0.1, default: 4 },
    { key: 'samples', label: '断面の点数 m', type: 'number', min: 8, max: 160, step: 4, default: 96 },
    { key: 'rows', label: '断面間の分割数', type: 'number', min: 1, max: 32, step: 1, default: 14 },
  ],
  distance: 9,
  target: [0, 2, 0],
  compareLabels: ['入力の断面', 'ロフト'],
  build(p) {
    const m = Number(p.samples);
    const H = Number(p.height);
    const raw = sections(String(p.combo)).map((s) => resample(s, m));
    const S = raw.length;
    const ys = raw.map((_, i) => (i / (S - 1)) * H);
    const secs: Poly[] = [raw[0]];
    let shifts = 0, flips = 0;
    for (let i = 1; i < S; i++) {
      if (p.correct) {
        const r = align(secs[i - 1], raw[i]);
        secs.push(r.poly);
        if (r.shift) shifts++;
        if (r.flipped) flips++;
      } else secs.push(raw[i]);
    }
    // 各列（同じ添字の点）を高さ方向の Catmull-Rom 曲線にする
    const K = Number(p.rows);
    const R = (S - 1) * K + 1;
    const pos: number[] = [];
    const tmp = new THREE.Vector3();
    const cols = Array.from({ length: m }, (_, j) => new THREE.CatmullRomCurve3(secs.map((s, i) => new THREE.Vector3(s[j].x, ys[i], s[j].y)), false, 'catmullrom', 0.5));
    for (let r = 0; r < R; r++) {
      for (let j = 0; j <= m; j++) {
        cols[j % m].getPoint(r / (R - 1), tmp);
        pos.push(tmp.x, tmp.y, tmp.z);
      }
    }
    const idx: number[] = [];
    for (let r = 0; r < R - 1; r++)
      for (let j = 0; j < m; j++) {
        const a = r * (m + 1) + j, b = a + 1, c = a + m + 1, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
    // 上下の蓋
    for (const [si, row, up] of [[0, 0, false], [S - 1, R - 1, true]] as [number, number, boolean][]) {
      const tris = THREE.ShapeUtils.triangulateShape(secs[si].map((v) => v.clone()), []);
      for (const [a, b, c] of tris) {
        const o = row * (m + 1);
        if (up) idx.push(o + a, o + c, o + b);
        else idx.push(o + a, o + b, o + c);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setIndex(idx);
    geo.computeVertexNormals();
    const object = new THREE.Mesh(geo, std(0xffb86b, { side: THREE.DoubleSide }));

    // 処理前：断面だけを高さに並べる
    const before = new THREE.Group();
    const helpers = new THREE.Group();
    const starts: THREE.Vector3[] = [];
    secs.forEach((s, i) => {
      const flat = new THREE.ShapeGeometry(new THREE.Shape(raw[i].map((v) => new THREE.Vector2(v.x, -v.y))));
      flat.rotateX(-Math.PI / 2);
      flat.translate(0, ys[i], 0);
      before.add(new THREE.Mesh(flat, std(0x8890b0, { side: THREE.DoubleSide, transparent: true, opacity: 0.85 })));
      helpers.add(polyline(s.map((v) => new THREE.Vector3(v.x, ys[i], v.y)), 0x6bd3ff, { closed: true }));
      // 開始点と2番目の点を結ぶ線で回り方向も示す
      starts.push(new THREE.Vector3(s[0].x, ys[i], s[0].y));
      helpers.add(polyline([new THREE.Vector3(s[0].x, ys[i], s[0].y), new THREE.Vector3(s[4 % m].x, ys[i], s[4 % m].y)], 0xff6b6b));
    });
    helpers.add(dots(starts, 0xffe08a, 0.2));
    return {
      object,
      before,
      helpers,
      info: `断面 ${S} · 各 ${m} 点 · ${p.correct ? `補正: 開始点シフト ${shifts} 断面 / 向き反転 ${flips} 断面` : '補正なし'}`,
    };
  },
});
