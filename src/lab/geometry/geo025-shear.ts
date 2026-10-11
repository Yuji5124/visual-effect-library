import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { deformable, lineSegs, signedVolume } from '../framework/deformKit';

/** GEO-025 シアー：非対角成分だけを持つ行列で平行性と体積を保ったまま傾ける */

function baseGeometry(): THREE.BufferGeometry {
  // 段々に積んだ箱と窓穴の柱：平行な面がずれる様子が分かりやすい
  const parts: THREE.BufferGeometry[] = [];
  const add = (w: number, h: number, d: number, x: number, y: number, z: number) => {
    const g = new THREE.BoxGeometry(w, h, d, 4, 4, 4);
    g.translate(x, y, z);
    parts.push(g);
  };
  add(2.4, 0.8, 2.4, 0, -1.2, 0);
  add(1.8, 0.8, 1.8, 0, -0.4, 0);
  add(1.2, 0.8, 1.2, 0, 0.4, 0);
  add(0.6, 0.8, 0.6, 0, 1.2, 0);
  return mergeGeometries(parts)!;
}

export default defineGeometryDemo({
  id: 'GEO-025',
  notes: 'せん断係数から M=[[1,XY,XZ],[0,1,0],[0,YZ,1]] を作り全頂点に掛ける（XY: x を y に比例してずらす、XZ: x を z に比例、YZ: z を y に比例）。水色の箱と矢印は変換後の基底ベクトル。行列式は常に1で、ステータスの体積比も1のまま。',
  params: [
    { key: 'xy', label: 'XY 方向（x += k·y）', type: 'number', min: -2, max: 2, step: 0.01, default: 0.6 },
    { key: 'xz', label: 'XZ 方向（x += k·z）', type: 'number', min: -2, max: 2, step: 0.01, default: 0 },
    { key: 'yz', label: 'YZ 方向（z += k·y）', type: 'number', min: -2, max: 2, step: 0.01, default: 0.3 },
    { key: 'animate', label: '係数を往復させる', type: 'bool', default: false },
  ],
  liveKeys: ['xy', 'xz', 'yz', 'animate'],
  distance: 9,
  compareLabels: ['元の形', 'シアー'],
  build(p) {
    const src = baseGeometry();
    const d = deformable(src);
    const mesh = new THREE.Mesh(d.geo, std(0xff8fb1));
    const before = new THREE.Mesh(src, std(0x8890b0));
    const v0 = Math.abs(signedVolume(src));
    // 単位立方体（基準格子）と基底ベクトル
    const cubeCorners: number[] = [];
    for (const [a, b] of [[0, 1], [1, 3], [3, 2], [2, 0], [4, 5], [5, 7], [7, 6], [6, 4], [0, 4], [1, 5], [2, 6], [3, 7]]) {
      for (const c of [a, b]) cubeCorners.push(c & 1 ? 1.6 : -1.6, c & 2 ? 1.6 : -1.6, c & 4 ? 1.6 : -1.6);
    }
    const cube = lineSegs(cubeCorners.slice(), 0x6bd3ff, 0.7);
    const axes = new THREE.Group();
    const arrows = [0xff6b6b, 0x6bff9a, 0x6b9aff].map((c) => new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(), 2, c, 0.3, 0.16));
    axes.add(...arrows);
    const helpers = new THREE.Group();
    helpers.add(cube, axes);
    const m = new THREE.Matrix4();
    const tmp = new THREE.Vector3();
    let cur = [NaN, NaN, NaN];
    let vol = 1;
    const apply = (xy: number, xz: number, yz: number) => {
      cur = [xy, xz, yz];
      m.set(1, xy, xz, 0, 0, 1, 0, 0, 0, yz, 1, 0, 0, 0, 0, 1);
      d.apply((x, y, z, out) => out.set(x, y, z).applyMatrix4(m));
      const cp = cube.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < cp.count; i++) {
        tmp.set(cubeCorners[i * 3], cubeCorners[i * 3 + 1], cubeCorners[i * 3 + 2]).applyMatrix4(m);
        cp.setXYZ(i, tmp.x, tmp.y, tmp.z);
      }
      cp.needsUpdate = true;
      cube.geometry.computeBoundingSphere();
      [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)].forEach((e, i) => {
        e.applyMatrix4(m);
        arrows[i].setDirection(e.clone().normalize());
        arrows[i].setLength(e.length() * 2, 0.3, 0.16);
      });
      vol = Math.abs(signedVolume(d.geo)) / v0;
    };
    apply(Number(p.xy), Number(p.xz), Number(p.yz));
    return {
      object: mesh,
      before,
      helpers,
      info: () => {
        const e = m.elements; // 列優先
        const row = (r: number) => `[${[0, 1, 2].map((c) => e[c * 4 + r].toFixed(2)).join(' ')}]`;
        return `M=${row(0)}${row(1)}${row(2)} · det=${m.determinant().toFixed(3)} · 体積比 ${vol.toFixed(4)}`;
      },
      update(_dt, time, live) {
        const s = live.animate ? Math.sin(time * 0.8) : 1;
        const xy = Number(live.xy) * s, xz = Number(live.xz) * s, yz = Number(live.yz) * s;
        if (xy !== cur[0] || xz !== cur[1] || yz !== cur[2]) apply(xy, xz, yz);
      },
    };
  },
});
