import * as THREE from 'three';
import { SceneSource } from '../../engine/sceneSource';
import type { SourceEffect } from '../../engine/types';

type Deriv = (x: number, y: number, z: number, out: Float32Array) => void;

const SYSTEMS: Record<string, { f: Deriv; scale: number; center: [number, number, number]; dt: number; spread: number }> = {
  lorenz: {
    f: (x, y, z, o) => {
      o[0] = 10 * (y - x);
      o[1] = x * (28 - z) - y;
      o[2] = x * y - (8 / 3) * z;
    },
    scale: 0.065,
    center: [0, 0, 25],
    dt: 0.004,
    spread: 20,
  },
  aizawa: {
    f: (x, y, z, o) => {
      const a = 0.95, b = 0.7, c = 0.6, d = 3.5, e = 0.25, f = 0.1;
      o[0] = (z - b) * x - d * y;
      o[1] = d * x + (z - b) * y;
      o[2] = c + a * z - (z * z * z) / 3 - (x * x + y * y) * (1 + e * z) + f * z * x * x * x;
    },
    scale: 1.2,
    center: [0, 0, 0.6],
    dt: 0.01,
    spread: 1.5,
  },
  thomas: {
    f: (x, y, z, o) => {
      const b = 0.208186;
      o[0] = Math.sin(y) - b * x;
      o[1] = Math.sin(z) - b * y;
      o[2] = Math.sin(x) - b * z;
    },
    scale: 0.42,
    center: [0, 0, 0],
    dt: 0.05,
    spread: 4,
  },
  halvorsen: {
    f: (x, y, z, o) => {
      const a = 1.89;
      o[0] = -a * x - 4 * y - 4 * z - y * y;
      o[1] = -a * y - 4 * z - 4 * x - z * z;
      o[2] = -a * z - 4 * x - 4 * y - x * x;
    },
    scale: 0.22,
    center: [-3, -3, -3],
    dt: 0.004,
    spread: 6,
  },
};

const effect: SourceEffect = {
  id: '080',
  kind: 'source',
  status: 'implemented',
  params: [
    {
      key: 'system',
      label: '方程式',
      type: 'select',
      options: [
        { value: 'lorenz', label: 'ローレンツ' },
        { value: 'aizawa', label: 'アイザワ' },
        { value: 'thomas', label: 'トーマス' },
        { value: 'halvorsen', label: 'ハルヴォルセン' },
      ],
      default: 'lorenz',
    },
    { key: 'speed', label: '積分速度', type: 'number', min: 0, max: 4, step: 0.01, default: 1 },
    { key: 'pointSize', label: '粒子サイズ', type: 'number', min: 0.5, max: 6, step: 0.1, default: 1.6 },
    { key: 'colorSlow', label: '低速の色', type: 'color', default: '#3d5cff' },
    { key: 'colorFast', label: '高速の色', type: 'color', default: '#ffb03d' },
    { key: 'orbit', label: 'カメラ周回', type: 'bool', default: true },
  ],
  notes: '多数の粒子をカオス方程式に従ってオイラー積分し、速度で色分け。粒子同士は相互作用しないため、粒子数を増やすほどアトラクターの形が浮かび上がる。',
  create(ctx) {
    const N = ctx.quality === 'high' ? 30000 : 10000;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020208);
    const camera = new THREE.PerspectiveCamera(50, ctx.width / ctx.height, 0.01, 100);
    const geo = new THREE.BufferGeometry();
    const state = new Float32Array(N * 3);
    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.PointsMaterial({
      size: 1.6,
      sizeAttenuation: false,
      vertexColors: true,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    scene.add(points);

    let current = '';
    const d = new Float32Array(3);
    const cSlow = new THREE.Color();
    const cFast = new THREE.Color();
    const tmp = new THREE.Color();
    const reset = (name: string) => {
      const sys = SYSTEMS[name];
      for (let i = 0; i < N; i++) {
        state[i * 3] = sys.center[0] + (Math.random() - 0.5) * sys.spread;
        state[i * 3 + 1] = sys.center[1] + (Math.random() - 0.5) * sys.spread;
        state[i * 3 + 2] = sys.center[2] + (Math.random() - 0.5) * sys.spread;
      }
      // 初期の過渡状態を飛ばして、粒子をアトラクター上に乗せる（初期位置を広く散らして軌道上に分布させる）
      for (let k = 0; k < 300; k++) integrate(sys, 2);
    };
    const integrate = (sys: (typeof SYSTEMS)[string], speed: number) => {
      const dt = sys.dt * speed;
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        sys.f(state[o], state[o + 1], state[o + 2], d);
        state[o] += d[0] * dt;
        state[o + 1] += d[1] * dt;
        state[o + 2] += d[2] * dt;
        if (!Number.isFinite(state[o]) || Math.abs(state[o]) > 1e3) {
          state[o] = sys.center[0] + Math.random();
          state[o + 1] = sys.center[1] + Math.random();
          state[o + 2] = sys.center[2] + Math.random();
        }
      }
    };

    let orbitT = 0;
    const source = new SceneSource(ctx.renderer, scene, camera, ctx.width, ctx.height, (frame, params) => {
      const name = String(params.system) in SYSTEMS ? String(params.system) : 'lorenz';
      if (name !== current) {
        current = name;
        reset(name);
      }
      const sys = SYSTEMS[name];
      const speed = Number(params.speed);
      integrate(sys, speed);
      cSlow.setStyle(String(params.colorSlow));
      cFast.setStyle(String(params.colorFast));
      let maxV = 0;
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        sys.f(state[o], state[o + 1], state[o + 2], d);
        const v = Math.hypot(d[0], d[1], d[2]);
        col[o] = v;
        if (v > maxV) maxV = v;
      }
      for (let i = 0; i < N; i++) {
        const o = i * 3;
        tmp.copy(cSlow).lerp(cFast, Math.min(1, col[o] / (maxV * 0.7 + 1e-6)));
        col[o] = tmp.r;
        col[o + 1] = tmp.g;
        col[o + 2] = tmp.b;
        pos[o] = (state[o] - sys.center[0]) * sys.scale;
        pos[o + 1] = (state[o + 2] - sys.center[2]) * sys.scale;
        pos[o + 2] = (state[o + 1] - sys.center[1]) * sys.scale;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      mat.size = Math.max(1, Number(params.pointSize) * (ctx.height / 600));
      if (params.orbit) orbitT += frame.dt * 0.25;
      camera.position.set(Math.sin(orbitT) * 4.2, 0.6, Math.cos(orbitT) * 4.2);
      camera.lookAt(0, 0, 0);
    });

    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      dispose: () => {
        source.dispose();
        geo.dispose();
        mat.dispose();
      },
    };
  },
};

export default effect;
