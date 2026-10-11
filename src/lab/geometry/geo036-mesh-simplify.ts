import * as THREE from 'three';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';
import { TeapotGeometry } from 'three/examples/jsm/geometries/TeapotGeometry.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { makeNoise3 } from '../framework/random';

/** GEO-036 メッシュ簡略化：three.js の SimplifyModifier で辺を縮約し、目標頂点数まで減らす */
function source(shape: string): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  if (shape === 'teapot') {
    g = new TeapotGeometry(1.1, 10);
    g.translate(0, -0.4, 0);
  } else if (shape === 'knot') {
    g = new THREE.TorusKnotGeometry(1.1, 0.38, 220, 24);
  } else {
    // 凹凸のある岩：細かい球をノイズで押し出す
    g = new THREE.IcosahedronGeometry(1.5, 24);
    g.deleteAttribute('uv');
    g = mergeVertices(g);
    const n = makeNoise3(7);
    const pos = g.attributes.position as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const d = 0.75 + 0.5 * n(v.x * 1.4 + 9, v.y * 1.4, v.z * 1.4) + 0.18 * n(v.x * 4, v.y * 4 + 3, v.z * 4);
      v.multiplyScalar(d);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
  }
  g.deleteAttribute('uv');
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  g.computeVertexNormals();
  return g;
}

const tris = (g: THREE.BufferGeometry) => (g.index ? g.index.count : g.attributes.position.count) / 3;

export default defineGeometryDemo({
  id: 'GEO-036',
  notes: '元のメッシュの頂点を溶接し、three.js の SimplifyModifier（内部は meshoptimizer の二次誤差に基づく辺の縮約）で「削減率×頂点数」だけ頂点を取り除く。境界は固定。比較表示で元のメッシュと並べ、三角形数の削減率を表示する。',
  params: [
    { key: 'ratio', label: '削減率（取り除く頂点の割合）', type: 'number', min: 0, max: 0.99, step: 0.01, default: 0.9 },
    { key: 'shape', label: '元の形', type: 'select', options: [{ value: 'rock', label: '凹凸のある岩' }, { value: 'knot', label: 'トーラス結び目' }, { value: 'teapot', label: 'ティーポット' }], default: 'rock' },
    { key: 'flat', label: 'フラットシェーディング', type: 'bool', default: true },
  ],
  distance: 7,
  compareLabels: ['元のメッシュ', '簡略化後'],
  build(p) {
    const src = source(String(p.shape));
    const flat = Boolean(p.flat);
    const before = new THREE.Mesh(src, std(0x8890b0, { flatShading: flat }));
    const group = new THREE.Group();
    // 結果が届くまでの仮表示（比較レイアウトの幅計算にも使う）
    const placeholderMat = new THREE.MeshBasicMaterial({ color: 0x3a4060, wireframe: true });
    const placeholder = new THREE.Mesh(src, placeholderMat);
    group.add(placeholder);
    const srcTris = tris(src);
    const srcVerts = src.attributes.position.count;
    let resultTris = -1;
    let resultVerts = 0;
    let disposed = false;
    const ratio = Number(p.ratio);
    const t0 = performance.now();
    let ms = 0;
    new SimplifyModifier()
      .modify(src, Math.floor(srcVerts * ratio))
      .then((g) => {
        if (disposed) {
          g.dispose();
          return;
        }
        ms = performance.now() - t0;
        g.computeVertexNormals();
        resultTris = tris(g);
        resultVerts = g.attributes.position.count;
        // 仮表示のワイヤーフレーム状態（フレームワークが切り替えたもの）を引き継ぐ
        const wire = placeholderMat.wireframe;
        group.remove(placeholder);
        placeholderMat.dispose();
        group.add(new THREE.Mesh(g, std(0x5ab8ff, { flatShading: flat, wireframe: wire })));
      })
      .catch((e) => console.error('[GEO-036] simplify failed', e));
    return {
      object: group,
      before,
      info: () =>
        resultTris < 0
          ? `縮約を計算中… 元 ${srcTris.toLocaleString()} 三角形`
          : `頂点 ${srcVerts.toLocaleString()}→${resultVerts.toLocaleString()} · 三角形 ${srcTris.toLocaleString()}→${resultTris.toLocaleString()}（${((1 - resultTris / srcTris) * 100).toFixed(1)}% 削減, ${ms.toFixed(0)}ms）`,
      dispose() {
        disposed = true;
      },
    };
  },
});
