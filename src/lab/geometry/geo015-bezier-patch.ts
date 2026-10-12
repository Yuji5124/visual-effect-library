import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { Markers, bernstein } from '../framework/splineKit';
import { NetLines } from '../framework/surfaceKit';

/** GEO-015 双三次ベジェ曲面：S(u,v)=ΣΣ B_i(u) B_j(v) P_ij。法線は ∂S/∂u × ∂S/∂v */

const SIZE = 4.4;

function restNet(): THREE.Vector3[][] {
  const net: THREE.Vector3[][] = [];
  for (let i = 0; i < 4; i++) {
    const row: THREE.Vector3[] = [];
    for (let j = 0; j < 4; j++) {
      const x = (i / 3 - 0.5) * SIZE, z = (j / 3 - 0.5) * SIZE;
      const inner = i > 0 && i < 3 && j > 0 && j < 3;
      row.push(new THREE.Vector3(x, 1.2 + (inner ? 1.4 : 0) + Math.sin(i * 1.7 + j) * 0.25, z));
    }
    net.push(row);
  }
  return net;
}

/** 3次バーンスタイン基底とその微分 */
function basis3(t: number, b: number[], d: number[]): void {
  for (let i = 0; i < 4; i++) b[i] = bernstein(3, i, t);
  // dB_{i,3}/dt = 3 (B_{i-1,2} − B_{i,2})
  const b2 = [bernstein(2, 0, t), bernstein(2, 1, t), bernstein(2, 2, t)];
  for (let i = 0; i < 4; i++) d[i] = 3 * ((i > 0 ? b2[i - 1] : 0) - (i < 3 ? b2[i] : 0));
}

export default defineGeometryDemo({
  id: 'GEO-015',
  notes: '4×4 の制御点にバーンスタイン基底のテンソル積をとって頂点を評価し、基底の微分から ∂S/∂u と ∂S/∂v を求め、その外積を法線にする。制御点はゆっくり揺れ、曲面が追従する。黄色い線は境界の4辺（それぞれ制御網の外周の行・列だけで決まるベジェ曲線）で、内側の4点（橙）は面のふくらみだけを決める。',
  params: [
    { key: 'div', label: '分割数', type: 'number', min: 2, max: 64, step: 1, default: 24 },
    { key: 'wobble', label: '制御点の揺れ', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.6 },
    { key: 'showNet', label: '制御網の表示', type: 'bool', default: true },
    { key: 'animate', label: '制御点を動かす', type: 'bool', default: true },
  ],
  liveKeys: ['wobble', 'showNet', 'animate'],
  distance: 9,
  elevation: 0.55,
  target: [0, 1.3, 0],
  compareLabels: ['制御網（双一次）', 'ベジェ曲面'],
  build(p, env) {
    const div = Math.max(2, Math.round(Number(p.div)) >> (env.quality === 'low' ? 1 : 0));
    const rest = restNet();
    const P = rest.map((r) => r.map((v) => v.clone()));
    const nv = div + 1;
    const pos = new Float32Array(nv * nv * 3);
    const nor = new Float32Array(nv * nv * 3);
    const geo = new THREE.BufferGeometry();
    const idx: number[] = [];
    for (let a = 0; a < div; a++) for (let b = 0; b < div; b++) {
      const k = a * nv + b;
      idx.push(k, k + 1, k + nv + 1, k, k + nv + 1, k + nv);
    }
    geo.setIndex(idx);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3).setUsage(THREE.DynamicDrawUsage));
    const mesh = new THREE.Mesh(geo, std(0x5ab8ff, { side: THREE.DoubleSide, roughness: 0.35 }));
    // 基底は分割数ごとに前計算
    const Bu: number[][] = [], Du: number[][] = [];
    for (let a = 0; a <= div; a++) {
      const b = [0, 0, 0, 0], d = [0, 0, 0, 0];
      basis3(a / div, b, d);
      Bu.push(b);
      Du.push(d);
    }
    const su = new THREE.Vector3(), sv = new THREE.Vector3(), n = new THREE.Vector3();
    const evalSurface = () => {
      for (let a = 0; a <= div; a++) for (let b = 0; b <= div; b++) {
        let x = 0, y = 0, z = 0;
        su.set(0, 0, 0);
        sv.set(0, 0, 0);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const q = P[i][j];
          const w = Bu[a][i] * Bu[b][j];
          x += q.x * w; y += q.y * w; z += q.z * w;
          su.addScaledVector(q, Du[a][i] * Bu[b][j]);
          sv.addScaledVector(q, Bu[a][i] * Du[b][j]);
        }
        const k = (a * nv + b) * 3;
        pos[k] = x; pos[k + 1] = y; pos[k + 2] = z;
        n.crossVectors(sv, su).normalize();
        nor[k] = n.x; nor[k + 1] = n.y; nor[k + 2] = n.z;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.normal.needsUpdate = true;
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
    };

    const helpers = new THREE.Group();
    const net = new NetLines(4, 4, 0x9aa4d0, 0.85);
    const marks = new Markers(16, 0.09);
    // 境界の4辺（u=0,1 / v=0,1）
    const border = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xffd23d }));
    const borderPos = new Float32Array(div * 4 * 6);
    border.geometry.setAttribute('position', new THREE.BufferAttribute(borderPos, 3).setUsage(THREE.DynamicDrawUsage));
    border.frustumCulled = false;
    helpers.add(net.lines, marks.mesh, border);
    const updateHelpers = (showNet: boolean) => {
      net.lines.visible = marks.mesh.visible = showNet;
      net.set(P);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        const inner = i > 0 && i < 3 && j > 0 && j < 3;
        marks.set(i * 4 + j, P[i][j], inner ? 0xff9a3d : 0xffffff, inner ? 1.3 : 1);
      }
      marks.commit(16);
      let o = 0;
      const vtx = (a: number, b: number) => pos.subarray((a * nv + b) * 3, (a * nv + b) * 3 + 3);
      for (let s = 0; s < div; s++) {
        for (const [a0, b0, a1, b1] of [[s, 0, s + 1, 0], [s, div, s + 1, div], [0, s, 0, s + 1], [div, s, div, s + 1]]) {
          borderPos.set(vtx(a0, b0), o);
          borderPos.set(vtx(a1, b1), o + 3);
          o += 6;
        }
      }
      border.geometry.attributes.position.needsUpdate = true;
    };
    evalSurface();
    updateHelpers(Boolean(p.showNet));

    // 比較用：制御網を双一次の四角形でそのまま張ったもの
    const bgeo = new THREE.BufferGeometry();
    bgeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(rest.flat().flatMap((v) => [v.x, v.y, v.z])), 3));
    const bidx: number[] = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const k = i * 4 + j;
      bidx.push(k, k + 1, k + 5, k, k + 5, k + 4);
    }
    bgeo.setIndex(bidx);
    bgeo.computeVertexNormals();
    const before = new THREE.Mesh(bgeo, std(0x8890b0, { side: THREE.DoubleSide, flatShading: true }));

    let t = 0;
    return {
      object: mesh,
      before,
      helpers,
      info: `分割 ${div}×${div} · 制御点 4×4（境界 12 + 内部 4） · 法線は偏微分の外積`,
      update(dt, _time, live) {
        if (live.animate) t += dt;
        const w = Number(live.wobble);
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
          const ph = i * 2.3 + j * 1.7;
          P[i][j].copy(rest[i][j]).add(new THREE.Vector3(Math.sin(t * 0.7 + ph) * 0.35, Math.sin(t * 1.1 + ph * 1.3) * 1.2, Math.cos(t * 0.8 + ph) * 0.35).multiplyScalar(w));
        }
        evalSurface();
        updateHelpers(Boolean(live.showNet));
        // 比較用の制御網も同じ制御点に追従させる
        const bp = bgeo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) bp.setXYZ(i * 4 + j, P[i][j].x, P[i][j].y, P[i][j].z);
        bp.needsUpdate = true;
        bgeo.computeVertexNormals();
      },
    };
  },
});
