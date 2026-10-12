import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { deformable, polyline, rmfFrames, sampleCurve, frameTicks, type Frames } from '../framework/deformKit';

/** GEO-030 パスデフォーム：長さ方向 x を弧長に、断面 (y,z) を回転最小化フレームに写す */

class PathCurve extends THREE.Curve<THREE.Vector3> {
  constructor(private kind: string) {
    super();
  }
  getPoint(t: number, out = new THREE.Vector3()): THREE.Vector3 {
    const a = t * Math.PI * 2;
    if (this.kind === 'trefoil') {
      return out.set(Math.sin(a) + 2 * Math.sin(2 * a), Math.cos(a) - 2 * Math.cos(2 * a), -Math.sin(3 * a)).multiplyScalar(0.85).applyAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    }
    if (this.kind === 'wave') {
      return out.set(Math.cos(a) * 2.6, Math.sin(a * 3) * 0.9, Math.sin(a) * 2.6);
    }
    // 8の字（ベルヌーイのレムニスケートに高さを付けたもの）
    const d = 1 + Math.sin(a) ** 2;
    return out.set((3.2 * Math.cos(a)) / d, Math.sin(a * 2) * 0.8, (3.2 * Math.sin(a) * Math.cos(a)) / d);
  }
}

/** 弧長 s の位置にあるフレームを線形補間で取り出す */
function frameAt(f: Frames, s: number, P: THREE.Vector3, Nn: THREE.Vector3, B: THREE.Vector3): void {
  const L = f.lengths[f.lengths.length - 1];
  const n = f.points.length;
  s = ((s % L) + L) % L;
  // 等間隔サンプルなので添字は比例で求まる
  const u = (s / L) * n;
  const i = Math.floor(u) % n, j = (i + 1) % n, t = u - Math.floor(u);
  P.lerpVectors(f.points[i], f.points[j], t);
  Nn.lerpVectors(f.normals[i], f.normals[j], t).normalize();
  B.lerpVectors(f.binormals[i], f.binormals[j], t).normalize();
}

export default defineGeometryDemo({
  id: 'GEO-030',
  notes: '閉曲線を弧長で等間隔に再標本化し、二重反射法で回転最小化フレームを前計算する（一周のずれ角は弧長に比例して配る）。まっすぐな物体の x 座標を「オフセット＋x」の弧長位置に、断面 (y,z) をその点の法線・従法線方向に置くので、オフセットを動かすと物体が曲線上を流れる。赤/緑の短線がフレーム。',
  params: [
    { key: 'speed', label: '移動速度', type: 'number', min: -3, max: 3, step: 0.05, default: 1 },
    { key: 'curve', label: '曲線の形', type: 'select', options: [{ value: 'trefoil', label: '三葉結び目' }, { value: 'eight', label: '8の字' }, { value: 'wave', label: '波打つ輪' }], default: 'trefoil' },
    { key: 'length', label: '物体の長さ', type: 'number', min: 1, max: 14, step: 0.1, default: 6 },
    { key: 'segments', label: '長さ方向の分割数', type: 'number', min: 4, max: 300, step: 1, default: 160 },
    { key: 'showFrames', label: 'フレームの表示', type: 'bool', default: true },
  ],
  liveKeys: ['speed', 'showFrames'],
  distance: 11,
  elevation: 0.6,
  compareLabels: ['まっすぐな物体', '曲線に沿わせた物体'],
  build(p, env) {
    const len = Number(p.length);
    const seg = Number(p.segments);
    // 断面が長方形なので、ねじれが起きればすぐ分かる
    const src = new THREE.BoxGeometry(len, 0.28, 0.6, seg, 2, 3);
    const curve = new PathCurve(String(p.curve));
    const pts = sampleCurve(curve, env.quality === 'low' ? 400 : 800, true);
    const frames = rmfFrames(pts, true);
    const total = frames.lengths[frames.lengths.length - 1];
    const d = deformable(src);
    // 長さ方向に色の縞を付けて流れを見やすくする
    const colors = new Float32Array(d.orig.length);
    const c = new THREE.Color();
    for (let i = 0; i < d.orig.length / 3; i++) {
      const s = (d.orig[i * 3] / len + 0.5);
      c.setHSL(0.08 + 0.5 * s, 0.75, 0.55);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    d.geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const mesh = new THREE.Mesh(d.geo, std(0xffffff, { vertexColors: true }));
    const before = new THREE.Mesh(src, std(0x8890b0));
    const helpers = new THREE.Group();
    const ticks = frameTicks(frames, Math.max(1, Math.floor(pts.length / 90)), 0.35);
    helpers.add(polyline(pts, 0xffd27a, { closed: true, opacity: 0.8 }), ticks);
    const P = new THREE.Vector3(), N = new THREE.Vector3(), B = new THREE.Vector3();
    let offset = 0;
    const apply = () =>
      d.apply((x, y, z, out) => {
        frameAt(frames, offset + x + len / 2, P, N, B);
        out.copy(P).addScaledVector(N, y).addScaledVector(B, z);
      });
    apply();
    return {
      object: mesh,
      before,
      helpers,
      info: () => `曲線長 ${total.toFixed(2)} · 物体長 ${len.toFixed(1)} · オフセット ${(((offset % total) + total) % total).toFixed(2)}`,
      update(dt, _time, live) {
        ticks.visible = Boolean(live.showFrames);
        const v = Number(live.speed);
        if (v === 0 || dt === 0) return;
        offset += v * dt;
        apply();
      },
    };
  },
});
