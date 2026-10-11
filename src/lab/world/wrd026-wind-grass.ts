import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { fbm2, makeNoise2 } from '../framework/random';
import { Heightfield } from '../framework/worldKit';
import { gridFrom } from '../framework/terrainKit';

/** WRD-026 風になびく草原：インスタンス描画の葉を頂点シェーダで曲げる */

/** 根元が原点、高さ1・幅1の先細りの葉（段数 seg） */
function bladeGeometry(seg = 4): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let s = 0; s <= seg; s++) {
    const t = s / seg;
    const w = 0.5 * (1 - t * 0.92);
    pos.push(-w, t, 0, w, t, 0);
  }
  for (let s = 0; s < seg; s++) {
    const a = s * 2;
    idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

const WIND_GLSL = /* glsl */ `
uniform float uTime;
uniform vec2 uDir;
uniform float uSpeed;
uniform float uScale;
uniform float uStrength;
varying float vGust;
float wHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
`;

function grassMaterial(uniforms: Record<string, THREE.IUniform>): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.75, metalness: 0, side: THREE.DoubleSide });
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = WIND_GLSL + shader.vertexShader.replace(
      '#include <project_vertex>',
      /* glsl */ `
      vec4 wp = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
      float bladeH = length(instanceMatrix[1].xyz);
      // 流れるノイズの風場：風下へ流れる2オクターブ
      vec2 q = wp.xz * uScale - uDir * uTime * uSpeed * 0.6;
      float gust = wNoise(q) * 0.7 + wNoise(q * 2.3 + 7.1) * 0.3;
      vGust = gust;
      float t = position.y;
      // 片持ち梁：先端ほど大きく（高さの2乗で）曲げる
      float bend = uStrength * (0.15 + 1.1 * gust) + 0.06 * sin(uTime * 3.0 + wp.x * 2.0 + wp.z * 1.3) * uStrength;
      float d = bend * t * t * bladeH;
      wp.xz += uDir * d;
      wp.y -= 0.5 * d * d / max(bladeH, 0.01) * t;
      vec4 mvPosition = viewMatrix * wp;
      gl_Position = projectionMatrix * mvPosition;
      `,
    );
    shader.fragmentShader = 'varying float vGust;\n' + shader.fragmentShader.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n diffuseColor.rgb *= 0.75 + 0.6 * vGust;',
    );
  };
  mat.customProgramCacheKey = () => 'wrd026-grass';
  return mat;
}

export default defineWorldDemo({
  id: 'WRD-026',
  notes: '草の葉（先細りの5段の帯）をジッター格子で地形の起伏に沿って並べ、InstancedMesh で一度に描く。頂点シェーダで、時間とともに風下へ流れる2オクターブのノイズ（突風の帯）を葉の根元の位置で読み、先端ほど高さの2乗で風下へ曲げる。突風の強い所は葉を明るくしているので、帯が草原を渡っていく様子が見える。比較の左は無風。書き出しは曲げる前の静止した草。',
  params: [
    { key: 'count', label: '本数', type: 'number', min: 2000, max: 60000, step: 1000, default: 30000 },
    { key: 'dir', label: '風向（°）', type: 'number', min: 0, max: 359, step: 1, default: 60 },
    { key: 'speed', label: '風速', type: 'number', min: 0, max: 3, step: 0.05, default: 1.2 },
    { key: 'gust', label: '突風のスケール', type: 'number', min: 0.1, max: 2, step: 0.05, default: 0.55 },
    { key: 'bladeHeight', label: '草の高さ', type: 'number', min: 0.1, max: 0.6, step: 0.01, default: 0.32 },
  ],
  liveKeys: ['dir', 'speed', 'gust'],
  distance: 10,
  elevation: 0.45,
  compareLabels: ['無風', '風あり'],
  build(p, env) {
    const count = env.quality === 'low' ? Math.min(14000, Number(p.count)) : Number(p.count);
    const size = 10, n = 64, Hs = 0.9;
    const noise = makeNoise2(env.seed);
    const h = gridFrom(n, (u, v) => fbm2(noise, u * 1.6, v * 1.6, 4) * 0.8);
    const groundOf = () => {
      const hf = new Heightfield(n, size);
      hf.setHeights(h, Hs);
      hf.setColors((k, c) => c.setRGB(0.24 + h[k] * 0.1, 0.32 + h[k] * 0.12, 0.12));
      return hf;
    };
    const geo = bladeGeometry(4);
    const make = (uniforms: Record<string, THREE.IUniform>) => {
      const hf = groundOf();
      const mesh = new THREE.InstancedMesh(geo.clone(), grassMaterial(uniforms), count);
      mesh.frustumCulled = false;
      const rng = env.rng;
      const g = Math.ceil(Math.sqrt(count));
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), pos = new THREE.Vector3(), sc = new THREE.Vector3();
      const up = new THREE.Vector3(0, 1, 0);
      const c = new THREE.Color();
      const bh = Number(p.bladeHeight);
      const tint = makeNoise2(env.seed + 31);
      for (let i = 0; i < count; i++) {
        // ジッター格子：格子点の中で乱数ずらし
        const gx = i % g, gz = Math.floor(i / g);
        const x = ((gx + rng()) / g - 0.5) * size, z = ((gz + rng()) / g - 0.5) * size;
        const patch = tint(x * 0.5, z * 0.5);
        const hh = bh * (0.6 + rng() * 0.6) * (1 + 0.35 * patch);
        pos.set(x, hf.sample(h, x, z) * Hs - 0.01, z);
        q.setFromAxisAngle(up, rng() * Math.PI);
        sc.set(0.035 + rng() * 0.02, hh, 1);
        m.compose(pos, q, sc);
        mesh.setMatrixAt(i, m);
        c.setHSL(0.24 + patch * 0.05 + rng() * 0.03, 0.55, 0.28 + rng() * 0.12);
        mesh.setColorAt(i, c);
      }
      mesh.instanceMatrix.needsUpdate = true;
      const grp = new THREE.Group();
      grp.add(hf.mesh, mesh);
      return grp;
    };
    const uni = {
      uTime: { value: 0 },
      uDir: { value: new THREE.Vector2(1, 0) },
      uSpeed: { value: 1 },
      uScale: { value: 1 },
      uStrength: { value: 1 },
    };
    const calm = {
      uTime: uni.uTime,
      uDir: uni.uDir,
      uSpeed: { value: 0 },
      uScale: uni.uScale,
      uStrength: { value: 0 },
    };
    const object = make(uni);
    const before = make(calm);
    geo.dispose();

    const helpers = new THREE.Group();
    const arrowGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.6, 0, 0.3), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0.6, 0, -0.3)]);
    const arrow = new THREE.LineSegments(arrowGeo, new THREE.LineBasicMaterial({ color: 0x9fe0ff }));
    arrow.position.set(0, 1.6, 0);
    helpers.add(arrow);

    let dirDeg = 0, gustW = 0;
    const apply = (live: Record<string, unknown>) => {
      dirDeg = Number(live.dir);
      gustW = Number(live.gust);
      const a = (Number(live.dir) * Math.PI) / 180;
      uni.uDir.value.set(Math.cos(a), Math.sin(a));
      uni.uSpeed.value = Number(live.speed);
      uni.uStrength.value = Math.min(1.4, 0.25 + Number(live.speed) * 0.55);
      uni.uScale.value = 1 / Math.max(0.1, Number(live.gust)) * 0.35;
      arrow.rotation.y = -a;
    };
    apply(p);
    return {
      object,
      before,
      helpers,
      info: () => `${count.toLocaleString()} 本（1回の描画呼び出し）· 風向 ${dirDeg}° · 突風の帯の幅 ≈ ${(gustW * 2.8).toFixed(1)}`,
      update(_dt, time, live) {
        uni.uTime.value = time;
        apply(live);
      },
    };
  },
});
