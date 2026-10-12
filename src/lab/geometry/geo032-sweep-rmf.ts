import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { rmfFrames, frenetFrames, sampleCurve, starPoints, sweepSection, frameTicks, polyline } from '../framework/deformKit';

/** GEO-032 スイープ：フレネ枠と回転最小化フレーム（二重反射法）で断面の向きを決めて掃引する */

function makeCurve(kind: string): { curve: THREE.Curve<THREE.Vector3>; closed: boolean } {
  if (kind === 'scurve') {
    // 平面内の S 字：中央で曲率が0になり、フレネ枠の法線が反転する
    const pts = Array.from({ length: 9 }, (_, i) => {
      const x = -3.2 + i * 0.8;
      return new THREE.Vector3(x, 1.6 + Math.sin((x / 3.2) * Math.PI) * 1.3, 0);
    });
    return { curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), closed: false };
  }
  if (kind === 'wiggle') {
    // 曲がる平面が交互に変わる3D曲線（変曲点が何度も現れる）
    const pts = [
      [-3.2, 0.6, 0], [-2.2, 2.2, 0.6], [-1.0, 1.2, -0.8], [0, 2.6, 0.4], [1.0, 1.0, 0.9], [2.0, 2.4, -0.6], [3.2, 1.4, 0.2],
    ].map(([x, y, z]) => new THREE.Vector3(x, y, z));
    return { curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'), closed: false };
  }
  // 螺旋からまっすぐな区間へ続く曲線
  class HelixLine extends THREE.Curve<THREE.Vector3> {
    constructor() {
      super();
    }
    getPoint(t: number, out = new THREE.Vector3()) {
      if (t < 0.6) {
        const a = (t / 0.6) * Math.PI * 4;
        return out.set(Math.cos(a) * 1.2 - 1.2, 0.3 + t * 3, Math.sin(a) * 1.2);
      }
      // 螺旋の終端の接線方向へまっすぐ伸ばす（曲率0の区間）
      const s = (t - 0.6) / 0.4;
      const d = new THREE.Vector3(0, 3, (1.2 * Math.PI * 4) / 0.6).normalize();
      return out.set(0, 2.1, 0).addScaledVector(d, s * 3.4);
    }
  }
  return { curve: new HelixLine(), closed: false };
}

export default defineGeometryDemo({
  id: 'GEO-032',
  notes: '曲線を弧長で等間隔に標本化し、星形の断面をフレーム（法線=赤・従法線=緑）に沿って掃引する。フレネ枠は2階差分から主法線を取るので S 字の変曲点で法線が反転し断面が急回転する。回転最小化フレームは Wang らの二重反射法で隣のフレームへ運ぶので滑らか。比較の左は選んでいない方のフレーム。',
  params: [
    { key: 'frame', label: 'フレームの種類', type: 'select', options: [{ value: 'rmf', label: '回転最小化フレーム（二重反射法）' }, { value: 'frenet', label: 'フレネ枠' }], default: 'rmf' },
    { key: 'curve', label: '曲線', type: 'select', options: [{ value: 'scurve', label: '平面の S 字（変曲点あり）' }, { value: 'wiggle', label: '曲がる向きが変わる3D曲線' }, { value: 'helix', label: '螺旋＋直線' }], default: 'scurve' },
    { key: 'points', label: '断面の角数', type: 'number', min: 3, max: 10, step: 1, default: 5 },
    { key: 'radius', label: '太さ', type: 'number', min: 0.1, max: 0.6, step: 0.01, default: 0.32 },
    { key: 'samples', label: '曲線の標本数', type: 'number', min: 30, max: 400, step: 10, default: 200 },
  ],
  distance: 9,
  target: [0, 1.6, 0],
  compareLabels: ['もう一方のフレーム', '選択中のフレーム'],
  build(p) {
    const { curve, closed } = makeCurve(String(p.curve));
    const pts = sampleCurve(curve, Number(p.samples), closed);
    const r = Number(p.radius);
    const section = starPoints(Number(p.points), r, r * 0.45);
    const rmf = rmfFrames(pts, closed);
    const fre = frenetFrames(pts, closed);
    const useRmf = p.frame !== 'frenet';
    const main = useRmf ? rmf : fre;
    const other = useRmf ? fre : rmf;
    // 隣り合うフレームの最大回転角（接線まわり）で、急なねじれを数値化する
    const maxTwist = (f: typeof rmf) => {
      let m = 0;
      for (let i = 1; i < f.normals.length; i++) m = Math.max(m, f.normals[i].angleTo(f.normals[i - 1]));
      return THREE.MathUtils.radToDeg(m);
    };
    const object = new THREE.Mesh(sweepSection(main, section, closed), std(useRmf ? 0x7ee0a8 : 0xff8f6b, { flatShading: true }));
    const before = new THREE.Mesh(sweepSection(other, section, closed), std(0x8890b0, { flatShading: true }));
    const helpers = new THREE.Group();
    helpers.add(polyline(pts, 0xffd27a, { opacity: 0.6 }), frameTicks(main, Math.max(1, Math.floor(pts.length / 40)), r * 2.4));
    return {
      object,
      before,
      helpers,
      info: `${useRmf ? '回転最小化' : 'フレネ'} · 隣接フレーム間の最大回転 RMF ${maxTwist(rmf).toFixed(1)}° / フレネ ${maxTwist(fre).toFixed(1)}°`,
    };
  },
});
