import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { deformable, polyline, lineSegs } from '../framework/deformKit';

/** GEO-023 テーパー：断面座標に高さの関数 s(y) を掛ける */
const H = 4;

function baseGeometry(shape: string, seg: number): THREE.BufferGeometry {
  if (shape === 'cylinder') return new THREE.CylinderGeometry(0.9, 0.9, H, 48, seg, false);
  if (shape === 'star') {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.45 : 1.05;
      const a = (i / 10) * Math.PI * 2;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: H, steps: seg, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -H / 2, 0);
    return g;
  }
  return new THREE.BoxGeometry(1.6, H, 1.6, 6, seg, 6);
}

/** プロファイル関数 s(t)（t=0 が下端、1 が上端） */
function profile(kind: string, k: number, t: number): number {
  if (kind === 'quad') return 1 + k * (1 - (2 * t - 1) ** 2);
  if (kind === 'sine') return 1 + 0.5 * k * Math.sin(t * Math.PI * 4);
  return 1 - k * t;
}

export default defineGeometryDemo({
  id: 'GEO-023',
  notes: '各頂点の断面座標 (x,z) に高さ t の関数 s(t) を掛ける。線形 s=1−kt で先細り、二次 s=1+k(1−(2t−1)²) で膨らみ、正弦で波打つ。非対称を上げると x と z の倍率が分かれる。右の橙の線が s(t) のグラフ。',
  params: [
    { key: 'strength', label: '強さ k', type: 'number', min: -1, max: 1, step: 0.01, default: 0.8 },
    {
      key: 'profile', label: 'プロファイル', type: 'select', default: 'linear',
      options: [{ value: 'linear', label: '線形 1−kt' }, { value: 'quad', label: '二次（膨らみ）' }, { value: 'sine', label: '正弦（波）' }],
    },
    { key: 'asym', label: '非対称（x と z で別倍率）', type: 'number', min: -1, max: 1, step: 0.01, default: 0 },
    { key: 'shape', label: '元の形', type: 'select', options: [{ value: 'box', label: '角柱' }, { value: 'star', label: '星形の押出' }, { value: 'cylinder', label: '円柱' }], default: 'box' },
    { key: 'segments', label: '高さ方向の分割数', type: 'number', min: 1, max: 100, step: 1, default: 48 },
    { key: 'animate', label: '強さを往復させる', type: 'bool', default: false },
  ],
  liveKeys: ['animate', 'strength', 'asym'],
  distance: 9,
  compareLabels: ['元の形', 'テーパー'],
  build(p) {
    const src = baseGeometry(String(p.shape), Number(p.segments));
    const d = deformable(src);
    const mesh = new THREE.Mesh(d.geo, std(0x7ee0a8, { side: THREE.DoubleSide }));
    const before = new THREE.Mesh(src, std(0x8890b0));
    const kind = String(p.profile);
    const helpers = new THREE.Group();
    const graphPts = Array.from({ length: 81 }, () => new THREE.Vector3());
    const graph = polyline(graphPts, 0xffb84d);
    // グラフの基準線（s=0 と s=1）
    const gx = 1.9;
    helpers.add(graph, lineSegs([gx, -H / 2, 0, gx, H / 2, 0], 0x666a90), lineSegs([gx + 0.7, -H / 2, 0, gx + 0.7, H / 2, 0], 0x3a3f6a));
    helpers.add(lineSegs([0, -H / 2 - 0.5, 0, 0, H / 2 + 0.5, 0], 0x6bd3ff));
    let shown = { k: NaN, a: NaN };
    let range = '';
    const apply = (k: number, a: number) => {
      shown = { k, a };
      let mn = Infinity, mx = -Infinity;
      d.apply((x, y, z, out) => {
        const s = profile(kind, k, (y + H / 2) / H);
        const sx = Math.max(0.02, 1 + (s - 1) * (1 + a));
        const sz = Math.max(0.02, 1 + (s - 1) * (1 - a));
        mn = Math.min(mn, s);
        mx = Math.max(mx, s);
        out.set(x * sx, y, z * sz);
      });
      const gp = graph.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < gp.count; i++) {
        const t = i / (gp.count - 1);
        gp.setXYZ(i, gx + 0.7 * profile(kind, k, t), -H / 2 + t * H, 0);
      }
      gp.needsUpdate = true;
      graph.geometry.computeBoundingSphere();
      range = `s(t) ∈ [${mn.toFixed(2)}, ${mx.toFixed(2)}]`;
    };
    apply(Number(p.strength), Number(p.asym));
    return {
      object: mesh,
      before,
      helpers,
      info: () => `k=${shown.k.toFixed(2)} · 非対称 ${shown.a.toFixed(2)} · ${range}`,
      update(_dt, time, live) {
        const k = live.animate ? Number(live.strength) * Math.sin(time * 0.9) : Number(live.strength);
        const a = Number(live.asym);
        if (k !== shown.k || a !== shown.a) apply(k, a);
      },
    };
  },
});
