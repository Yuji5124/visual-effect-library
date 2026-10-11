import * as THREE from 'three';
import { MeshSurfaceSampler } from 'three/examples/jsm/math/MeshSurfaceSampler.js';
import { createDemoWorld } from '../../engine/demoWorld';
import { hexToVec3 } from '../../engine/shaderEffect';
import type { SourceEffect } from '../../engine/types';

const VERT = /* glsl */ `
uniform float uSize;
uniform float uTime;
uniform float uScan;
uniform float uJitter;
varying float vDepth;
varying float vScan;
void main() {
  vec3 p = position + normal * sin(uTime * 7.0 + position.x * 40.0) * uJitter;
  vec4 world = modelMatrix * vec4(p, 1.0);
  vec4 mv = viewMatrix * world;
  vDepth = -mv.z;
  float scanY = mod(uTime * 1.2, 6.0) - 1.0;
  vScan = uScan > 0.5 ? exp(-abs(world.y - scanY) * 8.0) : 0.0;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (1.0 + vScan * 1.5) * (8.0 / max(vDepth, 1.0));
}
`;
const FRAG = /* glsl */ `
uniform vec3 uNear;
uniform vec3 uFar;
varying float vDepth;
varying float vScan;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  vec3 c = mix(uNear, uFar, smoothstep(5.0, 15.0, vDepth));
  c += vec3(1.0) * vScan;
  gl_FragColor = vec4(c, 1.0);
}
`;

const effect: SourceEffect = {
  id: '115',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'density', label: '点の密度', type: 'number', min: 0.2, max: 2, step: 0.01, default: 1 },
    { key: 'size', label: '点の大きさ', type: 'number', min: 0.5, max: 6, step: 0.1, default: 2 },
    { key: 'scan', label: 'スキャンライン', type: 'bool', default: true },
    { key: 'jitter', label: '計測ノイズ', type: 'number', min: 0, max: 0.05, step: 0.001, default: 0.008 },
    { key: 'nearColor', label: '近い点の色', type: 'color', default: '#5afff0' },
    { key: 'farColor', label: '遠い点の色', type: 'color', default: '#5a3dff' },
  ],
  notes: '各メッシュの表面を面積に比例した確率でランダムサンプリング（MeshSurfaceSampler）して点群に置き換える。点は元のメッシュの子として配置するので、物体が動いても点群が追従する。LiDARやフォトグラメトリの点群表示を再現。',
  create(ctx) {
    const world = createDemoWorld(ctx);
    world.scene.fog = null;
    world.scene.background = new THREE.Color(0.01, 0.01, 0.02);
    world.floor.visible = false;
    world.grid.visible = false;
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: {
        uSize: { value: 2 },
        uTime: { value: 0 },
        uScan: { value: 1 },
        uJitter: { value: 0.01 },
        uNear: { value: new THREE.Vector3() },
        uFar: { value: new THREE.Vector3() },
      },
    });
    const clouds: THREE.Points[] = [];
    let density = -1;
    const build = (d: number) => {
      density = d;
      clouds.forEach((c) => {
        c.parent?.remove(c);
        c.geometry.dispose();
      });
      clouds.length = 0;
      const base = ctx.quality === 'high' ? 1 : 0.5;
      for (const mesh of world.subjects) {
        const sampler = new MeshSurfaceSampler(mesh).build();
        mesh.geometry.computeBoundingSphere();
        const r = mesh.geometry.boundingSphere!.radius;
        const n = Math.round(Math.min(30000, 900 * r * r * d * base * 6));
        const pos = new Float32Array(n * 3);
        const nor = new Float32Array(n * 3);
        const p = new THREE.Vector3();
        const q = new THREE.Vector3();
        for (let i = 0; i < n; i++) {
          sampler.sample(p, q);
          p.toArray(pos, i * 3);
          q.toArray(nor, i * 3);
        }
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
        const pts = new THREE.Points(g, mat);
        mesh.add(pts);
        (mesh.material as THREE.Material).visible = false;
        clouds.push(pts);
      }
      // 床は格子状の点にする
      const fg: number[] = [];
      for (let x = -12; x <= 12; x += 0.25) for (let z = -12; z <= 12; z += 0.25) fg.push(x + (Math.random() - 0.5) * 0.05, -0.2, z + (Math.random() - 0.5) * 0.05);
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(fg, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(fg.length).fill(0), 3));
      const floorPts = new THREE.Points(g, mat);
      world.scene.add(floorPts);
      clouds.push(floorPts);
    };
    return {
      render(target, params, frame) {
        if (Number(params.density) !== density) build(Number(params.density));
        world.update(frame.dt);
        world.camera.aspect = ctx.width / ctx.height;
        world.camera.updateProjectionMatrix();
        const u = mat.uniforms;
        u.uSize.value = Number(params.size) * (ctx.height / 700);
        u.uTime.value = frame.time;
        u.uScan.value = params.scan ? 1 : 0;
        u.uJitter.value = Number(params.jitter);
        hexToVec3(String(params.nearColor), u.uNear.value);
        hexToVec3(String(params.farColor), u.uFar.value);
        ctx.renderer.setRenderTarget(target);
        ctx.renderer.render(world.scene, world.camera);
      },
      dispose() {
        clouds.forEach((c) => c.geometry.dispose());
        mat.dispose();
        world.dispose();
      },
    };
  },
};

export default effect;
