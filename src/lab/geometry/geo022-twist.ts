import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';

/** GEO-022 ツイスト：軸方向の位置に比例した角度で断面を回す */
function baseGeometry(shape: string, seg: number): THREE.BufferGeometry {
  if (shape === 'cylinder') return new THREE.CylinderGeometry(0.9, 0.9, 4, 48, seg, false);
  if (shape === 'star') {
    const s = new THREE.Shape();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 ? 0.45 : 1.1;
      const a = (i / 10) * Math.PI * 2;
      if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else s.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 4, steps: seg, bevelEnabled: false });
    g.rotateX(-Math.PI / 2);
    g.translate(0, -2, 0);
    return g;
  }
  return new THREE.BoxGeometry(1.4, 4, 1.4, 4, seg, 4);
}

export default defineGeometryDemo({
  id: 'GEO-022',
  notes: '各頂点を y に比例した角度 θ(y)=総ねじれ角×(y−y0)/高さ で y 軸まわりに回す。分割数が少ないと側面がねじれに追従できず折れて見える（分割数の必要性）。イーズを強めると中央に回転が集中する。',
  params: [
    { key: 'shape', label: '元の形', type: 'select', options: [{ value: 'box', label: '角柱' }, { value: 'star', label: '星形の押出' }, { value: 'cylinder', label: '円柱' }], default: 'star' },
    { key: 'angle', label: '総ねじれ角（度）', type: 'number', min: -720, max: 720, step: 5, default: 270 },
    { key: 'segments', label: '高さ方向の分割数', type: 'number', min: 1, max: 120, step: 1, default: 60 },
    { key: 'ease', label: '中央への集中（0=一様）', type: 'number', min: 0, max: 1, step: 0.01, default: 0 },
    { key: 'animate', label: 'ねじれ角を往復させる', type: 'bool', default: false },
  ],
  liveKeys: ['animate'],
  distance: 9,
  compareLabels: ['元の形', 'ツイスト'],
  build(p) {
    const seg = Number(p.segments);
    const src = baseGeometry(String(p.shape), seg);
    const geo = src.clone();
    const orig = (src.attributes.position.array as Float32Array).slice();
    const mat = std(0x5ab8ff, { flatShading: false, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    const before = new THREE.Mesh(src, std(0x8890b0));
    const apply = (deg: number) => {
      const pos = geo.attributes.position as THREE.BufferAttribute;
      const e = Number(p.ease);
      for (let i = 0; i < pos.count; i++) {
        const x = orig[i * 3], y = orig[i * 3 + 1], z = orig[i * 3 + 2];
        let t = (y + 2) / 4;
        // smoothstep と線形を混ぜる（中央ほど回転が速くなる）
        t = t * (1 - e) + t * t * (3 - 2 * t) * e;
        const a = THREE.MathUtils.degToRad(deg) * (t - 0.5);
        const c = Math.cos(a), s = Math.sin(a);
        pos.setXYZ(i, x * c - z * s, y, x * s + z * c);
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
    };
    apply(Number(p.angle));
    // ねじれ軸
    const axis = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, -2.6, 0), new THREE.Vector3(0, 2.6, 0)]), new THREE.LineBasicMaterial({ color: 0xffb84d }));
    let shown = Number(p.angle);
    return {
      object: mesh,
      before,
      helpers: axis,
      info: () => `ねじれ ${shown.toFixed(0)}° · 分割 ${seg}`,
      update(_dt, time, live) {
        if (!live.animate) {
          if (shown !== Number(p.angle)) apply((shown = Number(p.angle)));
          return;
        }
        shown = Number(p.angle) * Math.sin(time * 0.8);
        apply(shown);
      },
    };
  },
});
