import * as THREE from 'three';
import { fbm3 } from '../../engine/noise';
import { hexToVec3 } from '../../engine/shaderEffect';
import type { SourceEffect } from '../../engine/types';

const VERT = /* glsl */ `
attribute float aHue;
uniform float uSize;
varying float vHue;
void main() {
  vHue = aHue;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = uSize;
}
`;
const FRAG = /* glsl */ `
uniform vec3 uColorA;
uniform vec3 uColorB;
varying float vHue;
void main() {
  float d = length(gl_PointCoord - 0.5);
  float a = smoothstep(0.5, 0.0, d);
  gl_FragColor = vec4(mix(uColorA, uColorB, vHue) * a, 1.0);
}
`;

/** Canvas2D に文字を描き、塗られた画素の座標を目標点として取り出す */
function sampleText(text: string, count: number, aspect: number): Float32Array<ArrayBuffer> {
  const H = 200;
  const W = Math.round(H * aspect);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#fff';
  let size = H * 0.55;
  g.font = `900 ${size}px system-ui, "Hiragino Sans", "Yu Gothic", sans-serif`;
  const w = g.measureText(text).width;
  if (w > W * 0.9) size *= (W * 0.9) / w;
  g.font = `900 ${size}px system-ui, "Hiragino Sans", "Yu Gothic", sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, W / 2, H / 2);
  const data = g.getImageData(0, 0, W, H).data;
  const pts: number[] = [];
  for (let y = 0; y < H; y += 1)
    for (let x = 0; x < W; x += 1) if (data[(y * W + x) * 4 + 3] > 128) pts.push(x, y);
  const out = new Float32Array(count * 2);
  for (let i = 0; i < count; i++) {
    const k = pts.length ? Math.floor(Math.random() * (pts.length / 2)) * 2 : 0;
    out[i * 2] = ((pts[k] ?? W / 2) / W * 2 - 1) * aspect;
    out[i * 2 + 1] = -((pts[k + 1] ?? H / 2) / H * 2 - 1);
  }
  return out;
}

const effect: SourceEffect = {
  id: '143',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'words', label: '表示する言葉（/区切り）', type: 'select', options: [
      { value: 'VISUAL/EFFECT/LIBRARY/200', label: 'VISUAL / EFFECT / LIBRARY / 200' },
      { value: 'MUTOPIA/GIANT CLIMB', label: 'MUTOPIA / GIANT CLIMB' },
      { value: '映像/演出/実験室', label: '映像 / 演出 / 実験室' },
    ], default: 'VISUAL/EFFECT/LIBRARY/200' },
    { key: 'hold', label: '表示時間(秒)', type: 'number', min: 1, max: 8, step: 0.1, default: 2.5 },
    { key: 'spring', label: '集まる強さ', type: 'number', min: 1, max: 20, step: 0.1, default: 6 },
    { key: 'colorA', label: '色A', type: 'color', default: '#3dfff0' },
    { key: 'colorB', label: '色B', type: 'color', default: '#ff3b8b' },
  ],
  notes:
    '文字をCanvas2Dに描いて塗られた画素を目標点として抽出し、各粒子をばね＋減衰で目標へ引き寄せる。言葉が切り替わるときは粒子をノイズの流れ場で吹き散らしてから、次の言葉の目標点へ再集合させる。ドラッグで粒子を押しのけられる。',
  create(ctx) {
    const N = ctx.quality === 'high' ? 9000 : 4000;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05050c).convertLinearToSRGB();
    let aspect = ctx.width / ctx.height;
    const camera = new THREE.OrthographicCamera(-aspect, aspect, 1, -1, -1, 1);
    const pos = new Float32Array(N * 3);
    const vel = new Float32Array(N * 2);
    const hue = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      pos[i * 3] = (Math.random() * 2 - 1) * aspect;
      pos[i * 3 + 1] = Math.random() * 2 - 1;
      hue[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aHue', new THREE.BufferAttribute(hue, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uSize: { value: 2 }, uColorA: { value: new THREE.Vector3() }, uColorB: { value: new THREE.Vector3() } },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);
    let targets: Float32Array<ArrayBuffer> = new Float32Array(N * 2);
    let wordsKey = '';
    let words: string[] = [];
    let index = -1;
    let phaseT = 0;
    const ptr = { x: 0, y: 0, down: false };
    const nextWord = () => {
      index = (index + 1) % words.length;
      targets = sampleText(words[index], N, aspect);
      phaseT = 0;
    };
    return {
      render(target, params, frame) {
        if (params.words !== wordsKey) {
          wordsKey = String(params.words);
          words = wordsKey.split('/');
          index = -1;
          nextWord();
        }
        const dt = Math.min(frame.dt, 1 / 30);
        phaseT += dt;
        const hold = Number(params.hold);
        const scatter = phaseT > hold && phaseT < hold + 0.9;
        if (phaseT >= hold + 0.9) nextWord();
        const k = Number(params.spring);
        const px = (ptr.x * 2 - 1) * aspect, py = ptr.y * 2 - 1;
        for (let i = 0; i < N; i++) {
          const o = i * 3;
          let ax: number, ay: number;
          if (scatter) {
            const a = fbm3(pos[o] * 1.5, pos[o + 1] * 1.5, frame.time * 0.3, 2) * Math.PI * 4;
            ax = Math.cos(a) * 3;
            ay = Math.sin(a) * 3;
          } else {
            const delay = (i % 97) / 97 * 0.4; // 少しずつずらして集まる
            const kk = phaseT > delay ? k : 0;
            ax = (targets[i * 2] - pos[o]) * kk * kk * 0.5;
            ay = (targets[i * 2 + 1] - pos[o + 1]) * kk * kk * 0.5;
          }
          if (ptr.down) {
            const dx = pos[o] - px, dy = pos[o + 1] - py;
            const d2 = dx * dx + dy * dy;
            if (d2 < 0.06) { ax += (dx / (d2 + 0.01)) * 2; ay += (dy / (d2 + 0.01)) * 2; }
          }
          vel[i * 2] = (vel[i * 2] + ax * dt) * (scatter ? 0.98 : 0.86);
          vel[i * 2 + 1] = (vel[i * 2 + 1] + ay * dt) * (scatter ? 0.98 : 0.86);
          pos[o] += vel[i * 2] * dt;
          pos[o + 1] += vel[i * 2 + 1] * dt;
        }
        geo.attributes.position.needsUpdate = true;
        mat.uniforms.uSize.value = Math.max(1.5, ctx.height / 260);
        hexToVec3(String(params.colorA), mat.uniforms.uColorA.value);
        hexToVec3(String(params.colorB), mat.uniforms.uColorB.value);
        ctx.renderer.setRenderTarget(target);
        ctx.renderer.render(scene, camera);
      },
      resize(w, h) {
        aspect = w / h;
        camera.left = -aspect;
        camera.right = aspect;
        camera.updateProjectionMatrix();
        if (words.length) targets = sampleText(words[index], N, aspect);
      },
      pointer(x, y, down) {
        ptr.x = x;
        ptr.y = y;
        ptr.down = down;
      },
      dispose() {
        geo.dispose();
        mat.dispose();
      },
    };
  },
};

export default effect;
