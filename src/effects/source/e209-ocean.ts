import * as THREE from 'three';
import { SceneSource } from '../../engine/sceneSource';
import type { SourceEffect } from '../../engine/types';

const WAVES = 6;

const VERT = /* glsl */ `
uniform float uTime;
uniform vec4 uWaves[${WAVES}]; // xy: 方向, z: 波長, w: 尖り(steepness)
uniform float uHeight;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
void main() {
  vec3 p = position;
  vec3 tangent = vec3(1.0, 0.0, 0.0);
  vec3 binormal = vec3(0.0, 0.0, 1.0);
  float crest = 0.0;
  for (int i = 0; i < ${WAVES}; i++) {
    vec4 w = uWaves[i];
    vec2 d = normalize(w.xy);
    float k = 6.2831853 / w.z;
    float c = sqrt(9.8 / k);
    float f = k * (dot(d, position.xz) - c * uTime);
    float a = w.w / k * uHeight;
    p.x += d.x * a * cos(f);
    p.y += a * sin(f);
    p.z += d.y * a * cos(f);
    tangent += vec3(-d.x * d.x * w.w * sin(f), d.x * w.w * cos(f), -d.x * d.y * w.w * sin(f)) * uHeight;
    binormal += vec3(-d.x * d.y * w.w * sin(f), d.y * w.w * cos(f), -d.y * d.y * w.w * sin(f)) * uHeight;
    crest += w.w * sin(f);
  }
  vNormal = normalize(cross(binormal, tangent));
  vCrest = crest;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const FRAG = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uDeep;
uniform vec3 uShallow;
uniform float uFoam;
varying vec3 vWorld;
varying vec3 vNormal;
varying float vCrest;
vec3 sky(vec3 d) {
  float y = max(d.y, 0.0);
  vec3 c = mix(vec3(0.85, 0.75, 0.65), vec3(0.25, 0.45, 0.85), pow(y, 0.5));
  float s = max(dot(d, uSunDir), 0.0);
  return c + vec3(1.0, 0.85, 0.6) * (pow(s, 800.0) * 40.0 + pow(s, 12.0) * 0.4);
}
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = 0.02 + 0.98 * pow(1.0 - max(dot(n, v), 0.0), 5.0);
  vec3 refl = sky(reflect(-v, n));
  float sss = pow(max(dot(v, -uSunDir), 0.0), 4.0) * max(vCrest, 0.0);
  vec3 water = mix(uDeep, uShallow, clamp(vCrest * 0.6 + 0.3, 0.0, 1.0)) + uShallow * sss * 0.6;
  vec3 col = mix(water, refl, fres);
  float foam = smoothstep(0.9, 1.4, vCrest) * uFoam;
  col = mix(col, vec3(1.0), foam);
  float dist = length(vWorld - cameraPosition);
  col = mix(col, sky(normalize(vec3(-v.x, 0.02, -v.z))), smoothstep(40.0, 160.0, dist));
  gl_FragColor = vec4(col, 1.0);
}
`;

const SKY_FRAG = /* glsl */ `
uniform vec3 uSunDir;
varying vec3 vDir;
void main() {
  vec3 d = normalize(vDir);
  float y = max(d.y, 0.0);
  vec3 c = mix(vec3(0.85, 0.75, 0.65), vec3(0.25, 0.45, 0.85), pow(y, 0.5));
  float s = max(dot(d, uSunDir), 0.0);
  c += vec3(1.0, 0.85, 0.6) * (pow(s, 800.0) * 40.0 + pow(s, 12.0) * 0.4);
  gl_FragColor = vec4(c, 1.0);
}
`;

const effect: SourceEffect = {
  id: '209',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'height', label: '波の高さ', type: 'number', min: 0, max: 2, step: 0.01, default: 1 },
    { key: 'steepness', label: '波頭の尖り', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'wavelength', label: '波長', type: 'number', min: 2, max: 40, step: 0.1, default: 14 },
    { key: 'foam', label: '白波', type: 'number', min: 0, max: 1, step: 0.01, default: 0.6 },
    { key: 'sunHeight', label: '太陽の高さ', type: 'number', min: 0.02, max: 1, step: 0.01, default: 0.12 },
    { key: 'deep', label: '深い色', type: 'color', default: '#03263a' },
  ],
  notes:
    '向き・波長・尖りの異なる6つのゲルストナー波を頂点シェーダーで合成する。ゲルストナー波は頂点を円運動させるので、正弦波と違って波頭が鋭く谷が広い本物らしい形になる。法線は解析的な偏微分で求め、フレネル反射で空を映し、波頭の高さで白波と透過光を加える。（着想: three.js examples の webgl_shaders_ocean。実装は独自でテクスチャ不要）',
  create(ctx) {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, ctx.width / ctx.height, 0.1, 500);
    const seg = ctx.quality === 'high' ? 256 : 128;
    const geo = new THREE.PlaneGeometry(200, 200, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const sunDir = new THREE.Vector3();
    const waves = new Array(WAVES * 4).fill(0);
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uTime: { value: 0 },
        uWaves: { value: waves },
        uHeight: { value: 1 },
        uSunDir: { value: sunDir },
        uDeep: { value: new THREE.Color() },
        uShallow: { value: new THREE.Color(0.1, 0.45, 0.45) },
        uFoam: { value: 0.6 },
      },
    });
    const ocean = new THREE.Mesh(geo, mat);
    ocean.frustumCulled = false;
    scene.add(ocean);
    const skyMat = new THREE.ShaderMaterial({
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: SKY_FRAG,
      uniforms: { uSunDir: { value: sunDir } },
      side: THREE.BackSide,
      depthWrite: false,
    });
    const skyMesh = new THREE.Mesh(new THREE.SphereGeometry(300, 32, 16), skyMat);
    scene.add(skyMesh);
    const dirs = [0.0, 0.4, -0.5, 1.1, -1.3, 2.2];
    const lens = [1, 0.62, 0.41, 0.27, 0.19, 0.13];
    let t = 0;
    const source = new SceneSource(ctx.renderer, scene, camera, ctx.width, ctx.height, (frame, params) => {
      t += frame.dt;
      mat.uniforms.uTime.value = t;
      mat.uniforms.uHeight.value = Number(params.height);
      mat.uniforms.uFoam.value = Number(params.foam);
      (mat.uniforms.uDeep.value as THREE.Color).set(String(params.deep));
      const st = Number(params.steepness);
      const L = Number(params.wavelength);
      for (let i = 0; i < WAVES; i++) {
        // 尖りの合計が1を超えると波が自己交差するので、各波に配分する
        waves[i * 4] = Math.cos(dirs[i]);
        waves[i * 4 + 1] = Math.sin(dirs[i]);
        waves[i * 4 + 2] = L * lens[i];
        waves[i * 4 + 3] = (st / WAVES) * 1.6;
      }
      const sh = Number(params.sunHeight);
      sunDir.set(0.3, sh, -1).normalize();
      skyMesh.position.copy(camera.position);
      camera.position.set(Math.sin(t * 0.03) * 4, 4.5, 18 - t * 0.0);
      camera.lookAt(0, 1.2, -30);
    });
    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      dispose() {
        source.dispose();
        geo.dispose();
        mat.dispose();
        skyMesh.geometry.dispose();
        skyMat.dispose();
      },
    };
  },
};

export default effect;
