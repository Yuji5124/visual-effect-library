import * as THREE from 'three';
import { createDemoWorld } from '../../engine/demoWorld';
import { FullscreenQuad, createTarget, makeShader } from '../../engine/fullscreen';
import type { SourceEffect } from '../../engine/types';

const ND_VERT = /* glsl */ `
varying vec3 vN;
varying float vDepth;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vN = normalize(normalMatrix * normal);
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}
`;
const ND_FRAG = /* glsl */ `
varying vec3 vN;
varying float vDepth;
void main() { gl_FragColor = vec4(normalize(vN) * (gl_FrontFacing ? 1.0 : -1.0), vDepth); }
`;

const AO = /* glsl */ `
uniform sampler2D tND;
uniform float uTanHalf;
uniform float uAspect;
uniform float uRadius;
uniform float uSamples;
uniform float uTime;
varying vec2 vUv;
float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 viewPos(vec2 uv, float d) {
  vec2 ndc = uv * 2.0 - 1.0;
  return vec3(ndc.x * uTanHalf * uAspect * d, ndc.y * uTanHalf * d, -d);
}
void main() {
  vec4 nd = texture2D(tND, vUv);
  if (nd.w <= 0.0) { gl_FragColor = vec4(0.0); return; }
  vec3 P = viewPos(vUv, nd.w);
  vec3 N = normalize(nd.xyz);
  // 画素ごとにランダム回転した接空間（ノイズはぼかしパスで消える）
  float a = hash(gl_FragCoord.xy) * 6.2831853;
  vec3 rnd = vec3(cos(a), sin(a), 0.0);
  vec3 T = normalize(rnd - N * dot(rnd, N));
  vec3 B = cross(N, T);
  float occ = 0.0;
  for (int i = 0; i < 32; i++) {
    if (float(i) >= uSamples) break;
    float fi = float(i);
    // 半球内の点（中心に近いほど密になるよう二乗で配分）
    float h1 = hash(vec2(fi, 1.7)), h2 = hash(vec2(fi, 9.1)), h3 = hash(vec2(fi, 4.3));
    vec3 s = normalize(vec3(h1 * 2.0 - 1.0, h2 * 2.0 - 1.0, h3 * 0.9 + 0.1));
    float scale = (fi + 1.0) / uSamples;
    s *= mix(0.1, 1.0, scale * scale);
    vec3 Q = P + (T * s.x + B * s.y + N * s.z) * uRadius;
    vec2 q = vec2(Q.x / (-Q.z * uTanHalf * uAspect), Q.y / (-Q.z * uTanHalf)) * 0.5 + 0.5;
    float sceneD = texture2D(tND, q).w;
    if (sceneD <= 0.0) continue;
    float range = smoothstep(0.0, 1.0, uRadius / abs(-P.z - sceneD + 1e-4));
    occ += step(sceneD, -Q.z - 0.03) * range;
  }
  gl_FragColor = vec4(vec3(occ / uSamples), 1.0);
}
`;

const BLUR = /* glsl */ `
uniform sampler2D tAO;
uniform sampler2D tND;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  float d0 = texture2D(tND, vUv).w;
  float sum = 0.0, w = 0.0;
  for (int y = -2; y <= 2; y++) for (int x = -2; x <= 2; x++) {
    vec2 o = vec2(float(x), float(y)) * uTexel;
    float d = texture2D(tND, vUv + o).w;
    float k = exp(-abs(d - d0) * 4.0); // 深度の違う画素は混ぜない（輪郭を保つ）
    sum += texture2D(tAO, vUv + o).r * k;
    w += k;
  }
  gl_FragColor = vec4(vec3(sum / max(w, 1e-4)), 1.0);
}
`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tBeauty;
uniform sampler2D tAO;
uniform float uIntensity;
uniform float uMode;
uniform float uExposure;
varying vec2 vUv;
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
vec3 toSRGB(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  float ao = texture2D(tAO, vUv).r;
  vec3 c = texture2D(tBeauty, vUv).rgb * uExposure;
  float k = 1.0 - ao * uIntensity;
  vec3 col;
  if (uMode < 0.5) col = toSRGB(aces(c * k));
  else if (uMode < 1.5) col = vec3(clamp(k, 0.0, 1.0));
  else col = vUv.x < 0.5 ? toSRGB(aces(c)) : toSRGB(aces(c * k));
  if (uMode > 1.5) col = mix(col, vec3(1.0), smoothstep(0.002, 0.0, abs(vUv.x - 0.5)));
  gl_FragColor = vec4(col, 1.0);
}
`;

const effect: SourceEffect = {
  id: '201',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'radius', label: '遮蔽を調べる半径', type: 'number', min: 0.05, max: 2, step: 0.01, default: 0.6 },
    { key: 'intensity', label: '強さ', type: 'number', min: 0, max: 2, step: 0.01, default: 1.2 },
    { key: 'samples', label: 'サンプル数', type: 'number', min: 4, max: 32, step: 1, default: 16 },
    {
      key: 'mode',
      label: '表示',
      type: 'select',
      options: [
        { value: 'final', label: '適用後' },
        { value: 'ao', label: '遮蔽だけ' },
        { value: 'compare', label: '左右比較（左がなし）' },
      ],
      default: 'compare',
    },
  ],
  notes:
    'まず全物体の「視点空間の法線」と「深度」を1枚のバッファに描く。各画素の周囲の半球にサンプル点を置き、それが他の面の奥にめり込んでいる割合を遮蔽率とする（スクリーンスペース・アンビエントオクルージョン）。ノイズは深度を考慮したぼかしで除去し、照明に掛け合わせる。物体の接地感と立体感が大きく増す。（着想: pmndrs/postprocessing の SSAOEffect。実装は独自）',
  create(ctx) {
    const world = createDemoWorld(ctx);
    const r = ctx.renderer;
    const ndMat = new THREE.ShaderMaterial({ vertexShader: ND_VERT, fragmentShader: ND_FRAG, side: THREE.DoubleSide });
    let w = ctx.width, h = ctx.height;
    const beauty = createTarget(w, h, { float: true, depth: true });
    const nd = createTarget(w, h, { float: true, depth: true, filter: THREE.NearestFilter });
    const aoW = () => Math.max(1, Math.floor(w / 2)), aoH = () => Math.max(1, Math.floor(h / 2));
    const ao = createTarget(aoW(), aoH());
    const aoBlur = createTarget(aoW(), aoH());
    const quad = new FullscreenQuad();
    const aoMat = makeShader(AO, {
      tND: { value: nd.texture },
      uTanHalf: { value: 1 },
      uAspect: { value: 1 },
      uRadius: { value: 0.6 },
      uSamples: { value: 16 },
      uTime: { value: 0 },
    });
    const blurMat = makeShader(BLUR, { tAO: { value: ao.texture }, tND: { value: nd.texture }, uTexel: { value: new THREE.Vector2() } });
    const comp = makeShader(COMPOSITE, {
      tBeauty: { value: beauty.texture },
      tAO: { value: aoBlur.texture },
      uIntensity: { value: 1 },
      uMode: { value: 0 },
      uExposure: { value: 1.1 },
    });
    const modes = ['final', 'ao', 'compare'];
    world.grid.visible = false;
    return {
      render(target, params, frame) {
        world.update(frame.dt);
        const cam = world.camera;
        cam.aspect = w / h;
        cam.updateProjectionMatrix();
        r.setRenderTarget(beauty);
        r.clear();
        r.render(world.scene, cam);
        const bg = world.scene.background;
        world.scene.background = null;
        world.scene.overrideMaterial = ndMat;
        r.setRenderTarget(nd);
        r.setClearColor(0x000000, 0);
        r.clear();
        r.render(world.scene, cam);
        world.scene.overrideMaterial = null;
        world.scene.background = bg;
        r.setClearColor(0x000000, 1);
        const u = aoMat.uniforms;
        u.uTanHalf.value = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
        u.uAspect.value = cam.aspect;
        u.uRadius.value = Number(params.radius);
        u.uSamples.value = Math.round(Number(params.samples) * (ctx.quality === 'high' ? 1 : 0.5));
        quad.render(r, aoMat, ao);
        blurMat.uniforms.uTexel.value.set(1 / aoW(), 1 / aoH());
        quad.render(r, blurMat, aoBlur);
        comp.uniforms.uIntensity.value = Number(params.intensity);
        comp.uniforms.uMode.value = Math.max(0, modes.indexOf(String(params.mode)));
        quad.render(r, comp, target);
      },
      resize(nw, nh) {
        w = nw;
        h = nh;
        beauty.setSize(w, h);
        nd.setSize(w, h);
        ao.setSize(aoW(), aoH());
        aoBlur.setSize(aoW(), aoH());
      },
      dispose() {
        [beauty, nd, ao, aoBlur].forEach((t) => t.dispose());
        [ndMat, aoMat, blurMat, comp].forEach((m) => m.dispose());
        quad.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
