import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';
import { DynLines, Markers, SampledCurve, TubeLine, deCasteljau, deCasteljauLevels, polyline } from '../framework/splineKit';

/** GEO-011 ベジェ曲線：隣り合う点を比率 t で内分する操作を n 回繰り返す（ド・カステリョ法） */

// 段ごとの色（0段目=制御多角形 … 最後=曲線上の点）
const LEVEL_COLORS = [0x8890b0, 0x5ab8ff, 0x63e6a3, 0xffc14d, 0xff7a59, 0xb38bff, 0xff5c8a, 0xffffff];

function basePoints(degree: number): THREE.Vector3[] {
  const n = degree + 1;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    const s = i / degree;
    const zig = i % 2 ? 1 : -1;
    pts.push(new THREE.Vector3((s - 0.5) * 5.2, 0.6 + zig * 1.3 + Math.sin(s * Math.PI) * 1.2, Math.cos(s * Math.PI * 1.5) * 1.3));
  }
  return pts;
}

export default defineGeometryDemo({
  id: 'GEO-011',
  notes: 'n+1 個の制御点に対し、隣り合う点を比率 t で内分する操作を n 段繰り返して曲線上の点 B(t) を求める。各段の点と線分を色分けして描き、t を動かすと作図全体が追従する。曲線（チューブ）も同じド・カステリョ法でサンプリングしており、t までの区間を明るく塗る。',
  params: [
    { key: 'degree', label: '次数（制御点数−1）', type: 'number', min: 2, max: 7, step: 1, default: 4 },
    { key: 't', label: 't（再生位置）', type: 'number', min: 0, max: 1, step: 0.001, default: 0.4 },
    { key: 'play', label: 't を自動で往復', type: 'bool', default: true },
    { key: 'speed', label: '再生速度', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.25 },
    { key: 'motion', label: '制御点の動き', type: 'number', min: 0, max: 1, step: 0.01, default: 0.4 },
    { key: 'levels', label: '作図線を表示', type: 'bool', default: true },
  ],
  liveKeys: ['t', 'play', 'speed', 'motion', 'levels'],
  distance: 9,
  elevation: 0.35,
  target: [0, 0.6, 0],
  compareLabels: ['制御多角形', 'ベジェ曲線'],
  build(p, env) {
    const degree = Math.round(Number(p.degree));
    const base = basePoints(degree);
    const pts = base.map((v) => v.clone());
    const segs = env.quality === 'low' ? 100 : 180;
    const tube = new TubeLine(0xffffff, 0.06, segs, 8);
    // 曲線も同じド・カステリョ法で等間隔の t にサンプリング
    const curve = new SampledCurve(Array.from({ length: segs + 1 }, () => new THREE.Vector3()));
    const lines = new DynLines(64);
    const marks = new Markers(64, 0.09);
    const helpers = new THREE.Group();
    helpers.add(lines.lines, marks.mesh);
    const before = polyline(base, 0x8890b0);
    const beforeDots = new THREE.Group();
    beforeDots.add(before);
    for (const b of base) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), new THREE.MeshStandardMaterial({ color: 0x8890b0 }));
      s.position.copy(b);
      beforeDots.add(s);
    }
    let tNow = Number(p.t);
    let phase = 0;
    let lastMotion = -1;
    const col = new THREE.Color();
    const dim = new THREE.Color(0x3a4a78), bright = new THREE.Color(0xffd27a);
    const draw = (live: typeof p) => {
      curve.pts.forEach((q, k) => deCasteljau(pts, k / segs, q));
      curve.updateArcLengths();
      tube.set(curve);
      // チューブは弧長で輪を並べるので、t に戻してから塗り分ける
      tube.colorRings((s, c) => c.copy(curve.getUtoTmapping(s, 0) <= tNow ? bright : dim));
      const lv = deCasteljauLevels(pts, tNow);
      lines.clear();
      let m = 0;
      const show = Boolean(live.levels);
      lv.forEach((level, k) => {
        if (!show && k > 0 && k < lv.length - 1) return;
        col.set(LEVEL_COLORS[Math.min(k, LEVEL_COLORS.length - 1)]);
        if (level.length > 1) lines.polyline(level, col);
        const last = k === lv.length - 1;
        for (const q of level) marks.set(m++, q, last ? 0xffffff : LEVEL_COLORS[Math.min(k, LEVEL_COLORS.length - 1)], last ? 1.9 : k === 0 ? 1.3 : 0.8);
      });
      lines.commit();
      marks.commit(m);
    };
    draw(p);
    return {
      object: tube.mesh,
      before: beforeDots,
      helpers,
      info: () => {
        const b = deCasteljau(pts, tNow);
        return `次数 ${degree}（作図 ${degree} 段・内分 ${(degree * (degree + 1)) / 2} 回） · t=${tNow.toFixed(3)} · B(t)=(${b.x.toFixed(2)}, ${b.y.toFixed(2)}, ${b.z.toFixed(2)})`;
      },
      update(dt, time, live) {
        const motion = Number(live.motion);
        if (live.play) {
          phase += dt * Number(live.speed);
          tNow = 0.5 - 0.5 * Math.cos(phase * Math.PI);
        } else tNow = Number(live.t);
        if (motion > 0 || motion !== lastMotion) {
          lastMotion = motion;
          for (let i = 0; i < pts.length; i++) {
            const a = time * 0.7 + i * 1.9;
            pts[i].copy(base[i]).add(new THREE.Vector3(Math.sin(a) * 0.6, Math.sin(a * 1.3 + 1) * 0.8, Math.cos(a * 0.9) * 0.6).multiplyScalar(motion));
          }
        }
        draw(live);
      },
    };
  },
});
