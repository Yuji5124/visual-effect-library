import * as THREE from 'three';
import { hexToVec3 } from '../../engine/shaderEffect';
import type { SourceEffect } from '../../engine/types';

const VERT = /* glsl */ `
attribute float aGlow;
uniform float uSize;
varying float vGlow;
void main() {
  vGlow = aGlow;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize * (0.6 + aGlow * 1.6);
}
`;
const FRAG = /* glsl */ `
uniform vec3 uColor;
varying float vGlow;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = exp(-d * d * 18.0) * (0.12 + vGlow);
  gl_FragColor = vec4(uColor * a * 1.6 + vec3(1.0) * pow(a, 3.0) * 0.4, 1.0);
}
`;

const effect: SourceEffect = {
  id: '140',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'coupling', label: '結合の強さ K', type: 'number', min: 0, max: 5, step: 0.01, default: 1.6 },
    { key: 'spread', label: '固有周期のばらつき', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'radius', label: '見える範囲（局所結合）', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.18 },
    { key: 'color', label: '光の色', type: 'color', default: '#c8ff5a' },
    { key: 'size', label: '光の大きさ(px)', type: 'number', min: 4, max: 40, step: 0.5, default: 14 },
  ],
  notes:
    '蔵本モデル dθᵢ/dt = ωᵢ + K·mean(sin(θⱼ−θᵢ))。各ホタルは自分の周期で明滅しつつ、見える範囲の仲間の位相に引き寄せられる。結合 K が臨界値を超えると、ばらばらだった明滅が波のように揃っていく。画面下に同期度（秩序パラメータ r）を表示。ドラッグした周辺の位相を乱せる。',
  create(ctx) {
    const hi = ctx.quality === 'high';
    const N = hi ? 1600 : 700;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x02040a).convertLinearToSRGB();
    const aspect = ctx.width / ctx.height;
    const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, -1, 1);
    const pos = new Float32Array(N * 3);
    const glow = new Float32Array(N);
    const theta = new Float32Array(N);
    const omega = new Float32Array(N);
    const base = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * aspect * 0.95;
      pos[i * 3 + 1] = (Math.random() * 2 - 1) * 0.95;
      theta[i] = Math.random() * Math.PI * 2;
      base[i] = (Math.random() + Math.random() - 1) * 1.7; // 正規分布っぽいばらつき
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aGlow', new THREE.BufferAttribute(glow, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uSize: { value: 14 }, uColor: { value: new THREE.Vector3() } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    scene.add(points);
    // 近傍リスト（位置は動かないので一度だけ作る）
    let nbRadius = -1;
    let nbStart = new Int32Array(N + 1);
    let nbList = new Int32Array(0);
    const buildNeighbors = (r: number) => {
      nbRadius = r;
      const lists: number[][] = Array.from({ length: N }, () => []);
      const r2 = r * r;
      for (let i = 0; i < N; i++)
        for (let j = i + 1; j < N; j++) {
          const dx = pos[i * 3] - pos[j * 3], dy = pos[i * 3 + 1] - pos[j * 3 + 1];
          if (dx * dx + dy * dy < r2) {
            lists[i].push(j);
            lists[j].push(i);
          }
        }
      nbStart = new Int32Array(N + 1);
      for (let i = 0; i < N; i++) nbStart[i + 1] = nbStart[i] + lists[i].length;
      nbList = new Int32Array(nbStart[N]);
      lists.forEach((l, i) => nbList.set(l, nbStart[i]));
    };
    const dtheta = new Float32Array(N);
    const ptr = { x: 0, y: 0, down: false };
    let order = 0;
    return {
      render(target, params, frame) {
        const r = Number(params.radius);
        if (Math.abs(r - nbRadius) > 1e-4) buildNeighbors(r);
        const K = Number(params.coupling);
        const spread = Number(params.spread);
        for (let i = 0; i < N; i++) omega[i] = Math.PI * 2 * 0.8 * (1 + base[i] * spread * 0.5);
        const dt = Math.min(frame.dt, 1 / 30);
        let sx = 0, sy = 0;
        for (let i = 0; i < N; i++) {
          let s = 0;
          const a = nbStart[i], b = nbStart[i + 1];
          for (let k = a; k < b; k++) s += Math.sin(theta[nbList[k]] - theta[i]);
          dtheta[i] = omega[i] + (b > a ? (K * s) / (b - a) : 0) * 2;
        }
        const px = (ptr.x * 2 - 1) * aspect, py = ptr.y * 2 - 1;
        for (let i = 0; i < N; i++) {
          let th = theta[i] + dtheta[i] * dt;
          if (ptr.down) {
            const dx = pos[i * 3] - px, dy = pos[i * 3 + 1] - py;
            if (dx * dx + dy * dy < 0.03) th = Math.random() * Math.PI * 2;
          }
          th %= Math.PI * 2;
          theta[i] = th;
          // 位相が0を通過した直後に光る
          glow[i] = Math.exp(-th * 3.2);
          sx += Math.cos(th);
          sy += Math.sin(th);
        }
        order = Math.hypot(sx, sy) / N;
        geo.attributes.aGlow.needsUpdate = true;
        mat.uniforms.uSize.value = Number(params.size) * (ctx.height / 700);
        hexToVec3(String(params.color), mat.uniforms.uColor.value);
        ctx.renderer.setRenderTarget(target);
        ctx.renderer.render(scene, camera);
      },
      pointer(x, y, down) {
        ptr.x = x;
        ptr.y = y;
        ptr.down = down;
      },
      status: () => `同期度 r = ${order.toFixed(2)}（0: ばらばら 〜 1: 完全同期）`,
      dispose() {
        geo.dispose();
        mat.dispose();
      },
    };
  },
};

export default effect;
