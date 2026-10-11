import * as THREE from 'three';
import { SceneSource, disposeObject } from '../../engine/sceneSource';
import { valueNoise3 } from '../../engine/noise';
import type { SourceEffect } from '../../engine/types';

function patternTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 256, 256);
  grad.addColorStop(0, '#ff3d6b');
  grad.addColorStop(0.5, '#7a5cff');
  grad.addColorStop(1, '#3dfff0');
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(255,255,255,0.35)';
  g.lineWidth = 3;
  for (let i = 0; i <= 256; i += 32) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.moveTo(0, i);
    g.lineTo(256, i);
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const effect: SourceEffect = {
  id: '124',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'wind', label: '風の強さ', type: 'number', min: 0, max: 30, step: 0.1, default: 9 },
    { key: 'gust', label: '突風の変化', type: 'number', min: 0, max: 2, step: 0.01, default: 0.8 },
    { key: 'stiffness', label: '布の硬さ（反復回数）', type: 'number', min: 1, max: 20, step: 1, default: 8 },
    { key: 'gravity', label: '重力', type: 'number', min: 0, max: 20, step: 0.1, default: 9.8 },
    {
      key: 'pin',
      label: '固定方法',
      type: 'select',
      options: [
        { value: 'flag', label: '旗（左辺を固定）' },
        { value: 'corners', label: '上の2隅' },
        { value: 'top', label: '上辺全体（カーテン）' },
      ],
      default: 'flag',
    },
  ],
  notes:
    '質点を格子状に並べ、隣接（構造）と斜め（せん断）の距離拘束で結んだ位置ベースのVerlet積分。拘束は反復回数ぶん緩和するので、反復が多いほど伸びにくい硬い布になる。風は面の法線方向成分だけを受けるため、はためく・たわむ挙動が自然に出る。ドラッグで布を押せる。',
  create(ctx) {
    const hi = ctx.quality === 'high';
    const NX = hi ? 40 : 26;
    const NY = hi ? 28 : 18;
    const W = 4;
    const H = 2.8;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0d1222);
    scene.fog = new THREE.Fog(0x0d1222, 8, 24);
    const camera = new THREE.PerspectiveCamera(45, ctx.width / ctx.height, 0.1, 50);
    camera.position.set(2.5, 1.2, 7.5);
    camera.lookAt(1.6, 0.6, 0);
    scene.add(new THREE.HemisphereLight(0xcfe4ff, 0x302040, 1.3));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(3, 5, 6);
    scene.add(sun);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 6, 12), new THREE.MeshStandardMaterial({ color: 0xbbbbcc, metalness: 0.8, roughness: 0.3 }));
    pole.position.set(0, -0.5, 0);
    scene.add(pole);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: 0x1a2236 }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -3.5;
    scene.add(ground);

    const geo = new THREE.PlaneGeometry(W, H, NX - 1, NY - 1);
    const tex = patternTexture();
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.7 }));
    scene.add(mesh);

    const N = NX * NY;
    const pos = new Float32Array(N * 3);
    const prev = new Float32Array(N * 3);
    const pinned = new Uint8Array(N);
    const rest = new Float32Array(N * 3);
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        rest[k * 3] = (i / (NX - 1)) * W;
        rest[k * 3 + 1] = 2.2 - (j / (NY - 1)) * H;
        rest[k * 3 + 2] = 0;
      }
    pos.set(rest);
    prev.set(rest);
    const cons: number[] = [];
    const add = (a: number, b: number) => {
      const dx = rest[a * 3] - rest[b * 3];
      const dy = rest[a * 3 + 1] - rest[b * 3 + 1];
      cons.push(a, b, Math.hypot(dx, dy));
    };
    for (let j = 0; j < NY; j++)
      for (let i = 0; i < NX; i++) {
        const k = j * NX + i;
        if (i < NX - 1) add(k, k + 1);
        if (j < NY - 1) add(k, k + NX);
        if (i < NX - 1 && j < NY - 1) {
          add(k, k + NX + 1);
          add(k + 1, k + NX);
        }
      }
    const C = new Float32Array(cons);
    const normals = geo.attributes.normal as THREE.BufferAttribute;
    const positions = geo.attributes.position as THREE.BufferAttribute;
    let pinMode = '';
    const ptr = { x: 0, y: 0, down: false };
    const ray = new THREE.Raycaster();
    const hit = new THREE.Vector3();
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    let time = 0;

    const source = new SceneSource(ctx.renderer, scene, camera, ctx.width, ctx.height, (frame, params) => {
      const mode = String(params.pin);
      if (mode !== pinMode) {
        pinMode = mode;
        pinned.fill(0);
        for (let j = 0; j < NY; j++)
          for (let i = 0; i < NX; i++) {
            const k = j * NX + i;
            if (mode === 'flag' && i === 0) pinned[k] = 1;
            if (mode === 'corners' && j === 0 && (i === 0 || i === NX - 1)) pinned[k] = 1;
            if (mode === 'top' && j === 0) pinned[k] = 1;
          }
        pos.set(rest);
        prev.set(rest);
      }
      const dt = Math.min(frame.dt, 1 / 30);
      time += dt;
      const g = Number(params.gravity);
      const windBase = Number(params.wind);
      const gust = Number(params.gust);
      let push: THREE.Vector3 | null = null;
      if (ptr.down) {
        ray.setFromCamera(new THREE.Vector2(ptr.x * 2 - 1, ptr.y * 2 - 1), camera);
        if (ray.ray.intersectPlane(plane, hit)) push = hit;
      }
      // 外力（重力＋風）：風は面の法線方向成分のみ受ける
      for (let k = 0; k < N; k++) {
        if (pinned[k]) continue;
        const o = k * 3;
        const x = pos[o], y = pos[o + 1], z = pos[o + 2];
        const n = valueNoise3(x * 0.4 + time * gust, y * 0.4, time * 0.5) - 0.3;
        const wx = windBase * (0.6 + n);
        const wz = windBase * 0.4 * (valueNoise3(x * 0.3, y * 0.3 + 7, time * gust) - 0.5);
        const nx = normals.getX(k), ny = normals.getY(k), nz = normals.getZ(k);
        const dotw = wx * nx + wz * nz;
        let ax = nx * dotw * 0.6 + wx * 0.15;
        let ay = -g + ny * dotw * 0.6;
        let az = nz * dotw * 0.6 + wz * 0.15;
        if (push) {
          const dx = x - push.x, dy = y - push.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < 0.6) {
            az -= (0.6 - d2) * 60;
          }
        }
        const vx = (x - prev[o]) * 0.99, vy = (y - prev[o + 1]) * 0.99, vz = (z - prev[o + 2]) * 0.99;
        prev[o] = x;
        prev[o + 1] = y;
        prev[o + 2] = z;
        pos[o] = x + vx + ax * dt * dt;
        pos[o + 1] = y + vy + ay * dt * dt;
        pos[o + 2] = z + vz + az * dt * dt;
      }
      // 距離拘束の緩和
      const iters = Math.round(Number(params.stiffness));
      for (let it = 0; it < iters; it++) {
        for (let c = 0; c < C.length; c += 3) {
          const a = C[c] * 3, b = C[c + 1] * 3, L = C[c + 2];
          const dx = pos[b] - pos[a], dy = pos[b + 1] - pos[a + 1], dz = pos[b + 2] - pos[a + 2];
          const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const diff = (d - L) / d;
          const pa = pinned[C[c]], pb = pinned[C[c + 1]];
          const wa = pa ? 0 : pb ? 1 : 0.5;
          const wb = pb ? 0 : pa ? 1 : 0.5;
          pos[a] += dx * diff * wa; pos[a + 1] += dy * diff * wa; pos[a + 2] += dz * diff * wa;
          pos[b] -= dx * diff * wb; pos[b + 1] -= dy * diff * wb; pos[b + 2] -= dz * diff * wb;
        }
      }
      positions.array.set(pos);
      positions.needsUpdate = true;
      geo.computeVertexNormals();
      geo.computeBoundingSphere();
    });

    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      pointer(x, y, down) {
        ptr.x = x;
        ptr.y = y;
        ptr.down = down;
      },
      dispose: () => {
        source.dispose();
        disposeObject(scene);
      },
    };
  },
};

export default effect;
