import * as THREE from 'three';
import { MarchingCubes } from 'three/examples/jsm/objects/MarchingCubes.js';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { makeNoise3 } from '../framework/random';

/** GEO-038 マーチングキューブ：3Dノイズの動く密度場を three.js の MarchingCubes に直接書き込み、等値面を抽出する */
export default defineGeometryDemo({
  id: 'GEO-038',
  notes: '3D バリューノイズ2オクターブに中心からの距離による減衰を掛けた密度場を、毎フレーム three.js の MarchingCubes の格子に書き込み、しきい値の等値面を三角形化する（セル8頂点の内外256通りを表で引き、辺上の交点を線形補間）。比較表示の左は同じ場をしきい値以上の格子点だけ点で描いたもの。',
  params: [
    { key: 'threshold', label: 'しきい値', type: 'number', min: 0.2, max: 0.8, step: 0.01, default: 0.5 },
    { key: 'res', label: '解像度（格子の分割数）', type: 'number', min: 12, max: 48, step: 2, default: 32 },
    { key: 'speed', label: '場の流れる速さ', type: 'number', min: 0, max: 2, step: 0.01, default: 0.4 },
    { key: 'scale', label: 'ノイズの細かさ', type: 'number', min: 1, max: 6, step: 0.1, default: 2.6 },
    { key: 'seed', label: 'シード', type: 'number', min: 1, max: 9999, step: 1, default: 1 },
  ],
  liveKeys: ['threshold', 'speed', 'scale'],
  distance: 8,
  compareLabels: ['密度場（しきい値以上の格子点）', '等値面メッシュ'],
  build(p, env) {
    let res = Number(p.res);
    if (env.quality === 'low') res = Math.min(res, 28);
    const noise = makeNoise3(env.seed);
    const mc = new MarchingCubes(res, std(0x7fd1ff, { roughness: 0.3, side: THREE.DoubleSide }), false, false, res * res * 28);
    mc.scale.setScalar(2);
    const pos = mc.geometry.attributes.position.array as Float32Array;
    const nrm = mc.geometry.attributes.normal.array as Float32Array;
    let prevCount = 0;

    // 比較用：粗い格子の点群（しきい値以上の点だけ明るく）
    const pr = Math.min(res, 24);
    const ptsPos = new Float32Array(pr * pr * pr * 3);
    const ptsCol = new Float32Array(pr * pr * pr * 3);
    for (let z = 0, i = 0; z < pr; z++)
      for (let y = 0; y < pr; y++)
        for (let x = 0; x < pr; x++, i++) ptsPos.set([((x + 0.5) / pr) * 4 - 2, ((y + 0.5) / pr) * 4 - 2, ((z + 0.5) / pr) * 4 - 2], i * 3);
    const pgeo = new THREE.BufferGeometry();
    pgeo.setAttribute('position', new THREE.BufferAttribute(ptsPos, 3));
    pgeo.setAttribute('color', new THREE.BufferAttribute(ptsCol, 3).setUsage(THREE.DynamicDrawUsage));
    const before = new THREE.Points(pgeo, new THREE.PointsMaterial({ size: 0.07, vertexColors: true }));
    const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4, 4, 4)), new THREE.LineBasicMaterial({ color: 0x4a5080 }));

    // 密度：ノイズ（0..1）に中心からの減衰を掛ける（箱の端で必ず外側になり、面が閉じる）
    const density = (u: number, v: number, w: number, t: number, sc: number) => {
      const r2 = u * u + v * v + w * w;
      const fall = Math.max(0, 1 - r2 * 0.9);
      const d = 0.65 * noise(u * sc + 11, v * sc + t, w * sc - 5) + 0.35 * noise(u * sc * 2.1 - t * 0.5, v * sc * 2.1 + 7, w * sc * 2.1);
      return d * (0.35 + 0.95 * fall) * (r2 < 0.92 ? 1 : 0);
    };
    let t = 0;
    let ms = 0;
    let lastIso = -1, lastScale = -1;
    const fill = (iso: number, sc: number) => {
      const t0 = performance.now();
      const f = mc.field;
      const s = mc.size;
      for (let z = 0; z < s; z++) {
        const w = (z / (s - 1)) * 2 - 1;
        for (let y = 0; y < s; y++) {
          const v = (y / (s - 1)) * 2 - 1;
          for (let x = 0; x < s; x++) f[x + s * (y + s * z)] = density((x / (s - 1)) * 2 - 1, v, w, t, sc);
        }
      }
      mc.isolation = iso;
      mc.update();
      // 書き出し時に前フレームの三角形が残らないよう末尾を潰す
      if (mc.count < prevCount) {
        pos.fill(0, mc.count * 3, prevCount * 3);
        nrm.fill(0, mc.count * 3, prevCount * 3);
      }
      prevCount = mc.count;
      ms = performance.now() - t0;
    };
    const fillPoints = (iso: number, sc: number) => {
      for (let z = 0, i = 0; z < pr; z++)
        for (let y = 0; y < pr; y++)
          for (let x = 0; x < pr; x++, i++) {
            const d = density(((x + 0.5) / pr) * 2 - 1, ((y + 0.5) / pr) * 2 - 1, ((z + 0.5) / pr) * 2 - 1, t, sc);
            const on = d >= iso;
            const k = on ? 0.5 + d : d * 0.35;
            ptsCol.set(on ? [1 * k, 0.75 * k, 0.35 * k] : [0.3 * k, 0.4 * k, 0.8 * k], i * 3);
          }
      pgeo.attributes.color.needsUpdate = true;
    };
    fill(Number(p.threshold), Number(p.scale));
    fillPoints(Number(p.threshold), Number(p.scale));
    return {
      object: mc,
      before,
      helpers: frame,
      info: () => `格子 ${res}³ · 三角形 ${(mc.count / 3).toLocaleString()} · 場の書込み+抽出 ${ms.toFixed(1)}ms`,
      update(dt, _time, live) {
        const speed = Number(live.speed);
        const iso = Number(live.threshold);
        const sc = Number(live.scale);
        if (speed > 0) t += dt * speed;
        if (speed > 0 || iso !== lastIso || sc !== lastScale) {
          fill(iso, sc);
          if (live.compare) fillPoints(iso, sc);
          lastIso = iso;
          lastScale = sc;
        }
      },
    };
  },
});
