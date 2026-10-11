import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import { COPY_FRAGMENT, FullscreenQuad, createTarget, makeShader } from '../../engine/fullscreen';
import type { SourceEffect } from '../../engine/types';

// 頂点を低解像度の画面格子へスナップし、テクスチャ座標を画面上で線形（アフィン）に補間する。
// GLSL ES 3.0 には noperspective が無いので、(uv·w, w) を渡して画素側で w で割り、遠近補正を打ち消す。
const VERT = /* glsl */ `
uniform vec2 uSnap;
uniform float uAffine;
uniform vec3 uLightDir;
varying vec3 vUvw;
varying vec2 vUvPersp;
varying float vLight;
void main() {
  vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  vec2 ndc = clip.xy / clip.w;
  ndc = floor(ndc * uSnap + 0.5) / uSnap;
  clip.xy = ndc * clip.w;
  gl_Position = clip;
  vUvw = vec3(uv * clip.w, clip.w);
  vUvPersp = uv;
  // 頂点単位のランバート（グーローシェーディング）
  vec3 n = normalize(mat3(modelMatrix) * normal);
  vLight = 0.35 + 0.75 * max(dot(n, normalize(uLightDir)), 0.0);
}
`;
const FRAG = /* glsl */ `
uniform sampler2D uTex;
uniform vec3 uColor;
uniform float uAffine;
uniform float uDither;
uniform float uRepeat;
varying vec3 vUvw;
varying vec2 vUvPersp;
varying float vLight;
float bayer4(vec2 p) {
  int x = int(mod(p.x, 4.0)), y = int(mod(p.y, 4.0));
  int i = x + y * 4;
  float m[16] = float[16](0.,8.,2.,10.,12.,4.,14.,6.,3.,11.,1.,9.,15.,7.,13.,5.);
  for (int k = 0; k < 16; k++) if (k == i) return m[k] / 16.0 - 0.5;
  return 0.0;
}
void main() {
  vec2 affineUv = vUvw.xy / vUvw.z;
  vec2 uv = mix(vUvPersp, affineUv, uAffine) * uRepeat;
  vec3 c = texture2D(uTex, uv).rgb * uColor * vLight;
  // 15bitカラー（各5bit）＋順序ディザ
  c += uDither * bayer4(gl_FragCoord.xy) / 31.0;
  c = floor(clamp(c, 0.0, 1.0) * 31.0 + 0.5) / 31.0;
  gl_FragColor = vec4(c, 1.0);
}
`;

function checker(): THREE.DataTexture {
  const n = 16;
  const d = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const k = (y * n + x) * 4;
      const v = ((x >> 2) + (y >> 2)) % 2 ? 255 : 120;
      const edge = x % 4 === 0 || y % 4 === 0 ? 0.75 : 1;
      d[k] = v * edge;
      d[k + 1] = v * edge;
      d[k + 2] = v * edge;
      d[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(d, n, n, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = t.minFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}

const effect: SourceEffect = {
  id: '025',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'lines', label: '内部解像度（縦の画素数）', type: 'number', min: 120, max: 480, step: 8, default: 240 },
    { key: 'snap', label: '頂点スナップの格子（縦）', type: 'number', min: 40, max: 480, step: 4, default: 120 },
    { key: 'affine', label: 'アフィン補間の強さ（0=遠近補正）', type: 'number', min: 0, max: 1, step: 0.01, default: 1 },
    { key: 'dither', label: '15bitカラーのディザ', type: 'number', min: 0, max: 1.5, step: 0.01, default: 1 },
  ],
  notes:
    '頂点をクリップ空間で低解像度の格子へ丸めて「ガタつき」を、テクスチャ座標を遠近補正せず画面上で線形補間して「床の歪み」を再現する（(uv·w, w) を補間して画素でwで割るとアフィンになる）。内部解像度で描いて最近傍で拡大し、各色5bitに量子化して4×4のベイヤーディザを掛ける。床の格子は大きな三角形なので歪みが分かりやすい。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    world.scene.fog = null;
    world.grid.visible = false;
    const tex = checker();
    const mats: THREE.ShaderMaterial[] = [];
    const makeMat = (color: THREE.Color, repeat: number) => {
      const m = new THREE.ShaderMaterial({
        vertexShader: VERT,
        fragmentShader: FRAG,
        uniforms: {
          uSnap: { value: new THREE.Vector2(160, 120) },
          uAffine: { value: 1 },
          uLightDir: { value: new THREE.Vector3(0.5, 1, 0.4) },
          uTex: { value: tex },
          uColor: { value: color.clone().convertLinearToSRGB() },
          uDither: { value: 1 },
          uRepeat: { value: repeat },
        },
      });
      mats.push(m);
      return m;
    };
    for (const m of world.subjects) {
      const old = m.material as THREE.MeshStandardMaterial;
      const c = old.emissive && old.emissive.getHex() ? old.emissive : old.color;
      const mat = makeMat(c, 2);
      old.dispose();
      m.material = mat;
    }
    // 床は粗い分割の大きな三角形（アフィン歪みが目立つ）
    world.floor.geometry.dispose();
    world.floor.geometry = new THREE.PlaneGeometry(40, 40, 3, 3);
    (world.floor.material as THREE.Material).dispose();
    world.floor.material = makeMat(new THREE.Color(0.55, 0.5, 0.75), 24);
    world.scene.background = new THREE.Color(0x101830);

    let low = createTarget(4, 4, { filter: THREE.NearestFilter, depth: true });
    const quad = new FullscreenQuad();
    const copy = makeShader(COPY_FRAGMENT, { tDiffuse: { value: null } });
    const sizeLow = (lines: number) => {
      const h = Math.min(ctx.height, Math.round(lines));
      const w = Math.max(1, Math.round((h * ctx.width) / ctx.height));
      if (low.width !== w || low.height !== h) low.setSize(w, h);
    };
    return {
      render(target, p, frame) {
        world.update(frame.dt);
        world.camera.aspect = ctx.width / ctx.height;
        world.camera.updateProjectionMatrix();
        sizeLow(Number(p.lines));
        const snapY = Number(p.snap) / 2;
        for (const m of mats) {
          m.uniforms.uSnap.value.set((snapY * ctx.width) / ctx.height, snapY);
          m.uniforms.uAffine.value = Number(p.affine);
          m.uniforms.uDither.value = Number(p.dither);
        }
        ctx.renderer.setRenderTarget(low);
        ctx.renderer.clear();
        ctx.renderer.render(world.scene, world.camera);
        copy.uniforms.tDiffuse.value = low.texture;
        quad.render(ctx.renderer, copy, target);
      },
      resize() {
        low.dispose();
        low = createTarget(4, 4, { filter: THREE.NearestFilter, depth: true });
      },
      dispose() {
        low.dispose();
        quad.dispose();
        copy.dispose();
        tex.dispose();
        mats.forEach((m) => m.dispose());
        world.dispose();
      },
    };
  },
};

export default effect;
