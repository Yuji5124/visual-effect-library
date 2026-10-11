import * as THREE from 'three';
import { SceneSource } from '../../engine/sceneSource';
import { GLSL_NOISE } from '../../engine/glsl';
import type { SourceEffect } from '../../engine/types';

const VERT = /* glsl */ `
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vP = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = projectionMatrix * viewMatrix * w;
}
`;
const FRAG = /* glsl */ `
${GLSL_NOISE}
uniform float uTime;
uniform float uThickness;
uniform float uIor;
uniform float uSwirl;
varying vec3 vN;
varying vec3 vV;
varying vec3 vP;
vec3 env(vec3 d) {
  vec3 c = mix(vec3(0.08, 0.06, 0.12), vec3(0.6, 0.75, 1.0), smoothstep(-0.3, 0.8, d.y));
  c += vec3(1.0, 0.9, 0.8) * pow(max(dot(d, normalize(vec3(0.5, 0.7, 0.4))), 0.0), 60.0) * 4.0;
  c += vec3(1.0, 0.4, 0.7) * pow(max(dot(d, normalize(vec3(-0.7, 0.2, -0.3))), 0.0), 20.0) * 1.5;
  return c;
}
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(vV);
  if (!gl_FrontFacing) n = -n;
  float cosI = clamp(dot(n, v), 0.0, 1.0);
  // 膜厚（nm）は重力で下が厚く、渦で流れる
  float swirl = fbm(vP.xy * 3.0 + vec2(uTime * 0.2, -uTime * 0.15)) * uSwirl;
  float d = uThickness * (0.6 + 0.5 * (0.5 - vP.y) + swirl);
  float sinT2 = (1.0 - cosI * cosI) / (uIor * uIor);
  float cosT = sqrt(max(1.0 - sinT2, 0.0));
  float opd = 2.0 * uIor * d * cosT;            // 光路差
  vec3 lambda = vec3(650.0, 510.0, 475.0);
  vec3 interference = 0.5 + 0.5 * cos(6.2831853 * opd / lambda + 3.14159);
  float fres = 0.04 + 0.96 * pow(1.0 - cosI, 5.0);
  vec3 refl = env(reflect(-v, n));
  vec3 col = (refl * 0.7 + 0.35) * interference * (0.7 + fres * 1.5) + refl * fres * 0.4;
  float alpha = clamp(0.12 + fres * 0.8 + dot(interference, vec3(0.1)), 0.0, 0.95);
  gl_FragColor = vec4(col, alpha);
}
`;

const effect: SourceEffect = {
  id: '207',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'thickness', label: '膜の厚さ(nm)', type: 'number', min: 100, max: 1200, step: 1, default: 420 },
    { key: 'ior', label: '膜の屈折率', type: 'number', min: 1, max: 2, step: 0.01, default: 1.33 },
    { key: 'swirl', label: '膜の流れ', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.7 },
    { key: 'count', label: '泡の数', type: 'number', min: 1, max: 40, step: 1, default: 14 },
  ],
  notes:
    '石けん膜や油膜の虹色は、膜の表と裏で反射した光が干渉して特定の波長だけが強め合うことで生まれる。膜内の光路差 2·n·d·cosθt を R・G・B の代表波長で割って位相を求め、干渉による強度を計算する。膜の厚さはノイズで流れるように変化させ、フレネル反射と組み合わせてシャボン玉にする。（着想: three.js examples の iridescence（薄膜干渉）。実装は独自）',
  create(ctx) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1830);
    const camera = new THREE.PerspectiveCamera(50, ctx.width / ctx.height, 0.1, 100);
    camera.position.set(0, 0, 8);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uThickness: { value: 420 }, uIor: { value: 1.33 }, uSwirl: { value: 0.7 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const geo = new THREE.SphereGeometry(1, ctx.quality === 'high' ? 64 : 32, ctx.quality === 'high' ? 48 : 24);
    const MAX = 40;
    const bubbles: { mesh: THREE.Mesh; v: THREE.Vector3; s: number; ph: number }[] = [];
    for (let i = 0; i < MAX; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      const s = 0.3 + Math.random() * 0.9;
      mesh.scale.setScalar(s);
      mesh.position.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4);
      scene.add(mesh);
      bubbles.push({ mesh, v: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.2 + Math.random() * 0.3, 0), s, ph: Math.random() * 6 });
    }
    let t = 0;
    const source = new SceneSource(ctx.renderer, scene, camera, ctx.width, ctx.height, (frame, params) => {
      t += frame.dt;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uThickness.value = Number(params.thickness);
      mat.uniforms.uIor.value = Number(params.ior);
      mat.uniforms.uSwirl.value = Number(params.swirl);
      const n = Math.round(Number(params.count));
      bubbles.forEach((b, i) => {
        b.mesh.visible = i < n;
        b.mesh.position.addScaledVector(b.v, frame.dt);
        b.mesh.position.x += Math.sin(t + b.ph) * 0.003;
        // ゆらゆら変形
        b.mesh.scale.set(b.s * (1 + Math.sin(t * 3 + b.ph) * 0.03), b.s * (1 - Math.sin(t * 3 + b.ph) * 0.03), b.s);
        if (b.mesh.position.y > 4.5) b.mesh.position.set((Math.random() - 0.5) * 10, -4.5, (Math.random() - 0.5) * 4);
      });
      camera.aspect = ctx.width / ctx.height;
    });
    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      dispose() {
        source.dispose();
        geo.dispose();
        mat.dispose();
      },
    };
  },
};

export default effect;
