import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { defineGeometryDemo } from '../framework/sceneLab';

/** GEO-008 プリミティブ組立：部品の種類・寸法・相対位置から石灯籠を毎回組み立てて1つに結合する */

interface Part {
  name: string;
  geo: THREE.BufferGeometry;
}

/** n 角形の屋根（笠）：回転体を作ってから多角形化し、角ほど縁を反らせる */
function roof(n: number, R: number, H: number, sori: number): THREE.BufferGeometry {
  const prof: THREE.Vector2[] = [];
  // 上面：頂部から縁へ（下に凸のゆるい曲線）
  const steps = 10;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    prof.push(new THREE.Vector2(0.001 + R * t, H * (1 - Math.pow(t, 0.7)) + 0.08));
  }
  prof.push(new THREE.Vector2(R, 0.0));
  prof.push(new THREE.Vector2(R * 0.55, 0.0));
  prof.push(new THREE.Vector2(0.001, 0.0));
  const g = new THREE.LatheGeometry(prof, n * 8);
  const pos = g.attributes.position as THREE.BufferAttribute;
  const seg = (Math.PI * 2) / n;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const r = Math.hypot(x, z);
    if (r < 1e-6) continue;
    const phi = Math.atan2(x, z);
    const local = ((phi % seg) + seg) % seg - seg / 2;
    // 円 → 正 n 角形（角で 1、辺の中央で cos(π/n)）
    const poly = Math.cos(Math.PI / n) / Math.cos(local);
    const corner = (poly - Math.cos(Math.PI / n)) / (1 - Math.cos(Math.PI / n));
    const rr = r * poly;
    // 反り：縁ほど、角ほど持ち上げる（蕨手のような反り）
    const lift = sori * Math.pow(r / R, 4) * (0.35 + 0.65 * corner) * 0.45;
    pos.setXYZ(i, (x / r) * rr, y + lift, (z / r) * rr);
  }
  g.computeVertexNormals();
  return g;
}

function finial(): THREE.BufferGeometry {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    // 宝珠：玉ねぎ形
    const r = 0.17 * Math.sin(Math.PI * Math.pow(t, 0.8)) * (1 - 0.3 * t);
    pts.push(new THREE.Vector2(Math.max(0.001, r), t * 0.42));
  }
  return new THREE.LatheGeometry(pts, 16);
}

function assemble(tiers: number, sori: number, n: number, slim: number): { parts: Part[]; height: number; lightY: number } {
  const w = 1 / slim;
  const parts: Part[] = [];
  let y = 0;
  const add = (name: string, geo: THREE.BufferGeometry, ty: number) => {
    geo.translate(0, ty, 0);
    parts.push({ name, geo });
  };
  const rot = Math.PI / n;
  // 基礎：段数ぶんの多角形の板（上ほど小さい）
  for (let i = 0; i < tiers; i++) {
    const r = (1.05 - i * 0.14) * w;
    const h = 0.2;
    add(`基礎${i + 1}`, new THREE.CylinderGeometry(r * 0.94, r, h, n, 1).rotateY(rot), y + h / 2);
    y += h;
  }
  // 竿
  const poleH = 1.5 * slim;
  add('竿', new THREE.CylinderGeometry(0.2 * w, 0.24 * w, poleH, 24), y + poleH / 2);
  y += poleH;
  // 中台（逆さの角錐台）
  add('中台', new THREE.CylinderGeometry(0.72 * w, 0.32 * w, 0.32, n).rotateY(rot), y + 0.16);
  y += 0.32;
  // 火袋：底板・柱・腰壁・天板。柱の間が窓
  const fbH = 0.72;
  const R = 0.5 * w;
  add('火袋の底板', new THREE.CylinderGeometry(R * 1.08, R * 1.08, 0.08, n).rotateY(rot), y + 0.04);
  const lightY = y + 0.08 + fbH / 2;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rot;
    const post = new THREE.BoxGeometry(0.11 * w, fbH, 0.11 * w).rotateY(a).translate(Math.sin(a) * R, 0, Math.cos(a) * R);
    add(`柱${k + 1}`, post, y + 0.08 + fbH / 2);
    // 腰壁（窓の下の壁）
    const am = a + Math.PI / n;
    const side = 2 * R * Math.sin(Math.PI / n);
    const wall = new THREE.BoxGeometry(side, fbH * 0.28, 0.06).rotateY(am).translate(Math.sin(am) * R * Math.cos(Math.PI / n), 0, Math.cos(am) * R * Math.cos(Math.PI / n));
    add(`腰壁${k + 1}`, wall, y + 0.08 + fbH * 0.14);
  }
  y += 0.08 + fbH;
  add('火袋の天板', new THREE.CylinderGeometry(R * 1.08, R * 1.08, 0.08, n).rotateY(rot), y + 0.04);
  y += 0.08;
  // 笠
  const roofR = 0.95 * w;
  add('笠', roof(n, roofR, 0.42, sori).rotateY(rot), y);
  y += 0.5;
  // 請花と宝珠
  add('請花', new THREE.CylinderGeometry(0.16, 0.22, 0.1, n).rotateY(rot), y + 0.05);
  y += 0.1;
  add('宝珠', finial(), y);
  y += 0.42;
  return { parts, height: y, lightY };
}

const PALETTE = [0x8fa3c8, 0xc89f8f, 0x9fc88f, 0xc8b88f, 0xb08fc8, 0x8fc8c2];

export default defineGeometryDemo({
  id: 'GEO-008',
  notes: '基礎・竿・中台・火袋（柱・腰壁・板）・笠・宝珠をそれぞれ円柱・箱・回転体で作り、寸法を幅と細さの比率で拘束して積み上げ、mergeGeometries で石の部分を1つのジオメトリに結合する（石＝ドローコール1回＋灯り）。笠は回転体を正 n 角形に変形し、縁と角ほど持ち上げて反りを付ける。比較では結合前の部品を分解して並べる。',
  params: [
    { key: 'tiers', label: '基礎の段数', type: 'number', min: 1, max: 4, step: 1, default: 2 },
    { key: 'sori', label: '笠の反り', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'windows', label: '窓の数（火袋の面数）', type: 'number', min: 3, max: 8, step: 1, default: 6 },
    { key: 'slim', label: '細さ（高さ/幅の比）', type: 'number', min: 0.7, max: 1.6, step: 0.01, default: 1 },
  ],
  distance: 8,
  target: [0, 1.8, 0],
  compareLabels: ['部品（分解）', '結合後'],
  build(p) {
    const n = Math.round(Number(p.windows));
    const { parts, height, lightY } = assemble(Math.round(Number(p.tiers)), Number(p.sori), n, Number(p.slim));
    const merged = mergeGeometries(parts.map((q) => q.geo), false);
    if (!merged) throw new Error('結合に失敗しました');
    const group = new THREE.Group();
    group.add(new THREE.Mesh(merged, new THREE.MeshStandardMaterial({ color: 0xa9adb5, roughness: 0.85, metalness: 0, flatShading: true, side: THREE.DoubleSide })));
    const light = new THREE.Mesh(new THREE.OctahedronGeometry(0.16, 1), new THREE.MeshBasicMaterial({ color: 0xffb347 }));
    light.position.y = lightY;
    group.add(light);
    // 分解図：部品を種類ごとの色で、少しずつ上下に離して並べる
    const before = new THREE.Group();
    const kinds = new Map<string, number>();
    parts.forEach((q) => {
      const kind = q.name.replace(/[0-9]+$/, '');
      if (!kinds.has(kind)) kinds.set(kind, kinds.size);
      const m = new THREE.Mesh(q.geo.clone(), new THREE.MeshStandardMaterial({ color: PALETTE[kinds.get(kind)! % PALETTE.length], roughness: 0.7, flatShading: true, side: THREE.DoubleSide }));
      m.position.y = kinds.get(kind)! * 0.28;
      before.add(m);
    });
    for (const q of parts) q.geo.dispose();
    return {
      object: group,
      before,
      info: `部品 ${parts.length} 個（${kinds.size} 種類）→ 石は1ジオメトリに結合 · 高さ ${height.toFixed(2)} · 窓 ${n}`,
    };
  },
});
