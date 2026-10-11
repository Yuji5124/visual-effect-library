import * as THREE from 'three';
import { SceneSource, disposeObject } from '../../engine/sceneSource';
import type { SourceEffect } from '../../engine/types';

const BOUNDS = new THREE.Vector3(9, 4.5, 6);

const effect: SourceEffect = {
  id: '131',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'separation', label: '分離', type: 'number', min: 0, max: 4, step: 0.01, default: 1.6 },
    { key: 'alignment', label: '整列', type: 'number', min: 0, max: 4, step: 0.01, default: 1 },
    { key: 'cohesion', label: '結合', type: 'number', min: 0, max: 4, step: 0.01, default: 0.8 },
    { key: 'radius', label: '視野半径', type: 'number', min: 0.3, max: 3, step: 0.01, default: 1.2 },
    { key: 'maxSpeed', label: '最高速度', type: 'number', min: 0.5, max: 8, step: 0.01, default: 3.5 },
    { key: 'predator', label: '捕食者を出す', type: 'bool', default: true },
  ],
  notes:
    'Craig Reynolds の Boids（分離・整列・結合）。一様グリッドで近傍探索を行い O(N²) を回避。描画は InstancedMesh 1回のドローコール。ゲームの鳥・魚・虫の群れにそのまま流用できる。',
  create(ctx) {
    const N = ctx.quality === 'high' ? 900 : 350;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x061626);
    scene.fog = new THREE.Fog(0x061626, 8, 30);
    const camera = new THREE.PerspectiveCamera(55, ctx.width / ctx.height, 0.1, 80);
    camera.position.set(0, 2, 16);
    scene.add(new THREE.HemisphereLight(0xbfe6ff, 0x0b2030, 1.6));
    const sun = new THREE.DirectionalLight(0xfff0d0, 2);
    sun.position.set(3, 8, 5);
    scene.add(sun);

    const geo = new THREE.ConeGeometry(0.08, 0.32, 5);
    geo.rotateX(Math.PI / 2); // 先端を +Z に向ける
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.5, metalness: 0.2 });
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);

    const predator = new THREE.Mesh(
      new THREE.ConeGeometry(0.22, 0.8, 6).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xff3344, emissive: 0x551010 }),
    );
    scene.add(predator);

    const p = new Float32Array(N * 3);
    const v = new Float32Array(N * 3);
    const c = new THREE.Color();
    for (let i = 0; i < N; i++) {
      p[i * 3] = (Math.random() * 2 - 1) * BOUNDS.x;
      p[i * 3 + 1] = (Math.random() * 2 - 1) * BOUNDS.y;
      p[i * 3 + 2] = (Math.random() * 2 - 1) * BOUNDS.z;
      v[i * 3] = Math.random() - 0.5;
      v[i * 3 + 1] = Math.random() - 0.5;
      v[i * 3 + 2] = Math.random() - 0.5;
      mesh.setColorAt(i, c.setHSL(0.5 + Math.random() * 0.12, 0.7, 0.55 + Math.random() * 0.2));
    }

    // 一様グリッドによる近傍探索
    const cellSize = 1.5;
    const gx = Math.ceil((BOUNDS.x * 2) / cellSize) + 1;
    const gy = Math.ceil((BOUNDS.y * 2) / cellSize) + 1;
    const gz = Math.ceil((BOUNDS.z * 2) / cellSize) + 1;
    const cellStart = new Int32Array(gx * gy * gz + 1);
    const cellOf = new Int32Array(N);
    const sorted = new Int32Array(N);
    const cellIndex = (x: number, y: number, z: number) => {
      const ix = Math.min(gx - 1, Math.max(0, Math.floor((x + BOUNDS.x) / cellSize)));
      const iy = Math.min(gy - 1, Math.max(0, Math.floor((y + BOUNDS.y) / cellSize)));
      const iz = Math.min(gz - 1, Math.max(0, Math.floor((z + BOUNDS.z) / cellSize)));
      return ix + gx * (iy + gy * iz);
    };

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const fwd = new THREE.Vector3(0, 0, 1);
    const dir = new THREE.Vector3();
    const one = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    const pred = new THREE.Vector3();
    let time = 0;

    const source = new SceneSource(ctx.renderer, scene, camera, ctx.width, ctx.height, (frame, params) => {
      const dt = Math.min(frame.dt, 1 / 30);
      time += dt;
      const sep = Number(params.separation);
      const ali = Number(params.alignment);
      const coh = Number(params.cohesion);
      const R = Math.min(Number(params.radius), cellSize);
      const R2 = R * R;
      const maxSpeed = Number(params.maxSpeed);
      const usePred = Boolean(params.predator);
      predator.visible = usePred;
      pred.set(Math.sin(time * 0.37) * BOUNDS.x * 0.8, Math.sin(time * 0.53) * BOUNDS.y * 0.6, Math.cos(time * 0.29) * BOUNDS.z * 0.8);
      dir.set(Math.cos(time * 0.37) * 0.37 * BOUNDS.x, Math.cos(time * 0.53) * 0.53 * BOUNDS.y, -Math.sin(time * 0.29) * 0.29 * BOUNDS.z).normalize();
      predator.position.copy(pred);
      predator.quaternion.setFromUnitVectors(fwd, dir);

      // バケットソート
      cellStart.fill(0);
      for (let i = 0; i < N; i++) {
        const k = cellIndex(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
        cellOf[i] = k;
        cellStart[k + 1]++;
      }
      for (let k = 1; k < cellStart.length; k++) cellStart[k] += cellStart[k - 1];
      const fill = cellStart.slice();
      for (let i = 0; i < N; i++) sorted[fill[cellOf[i]]++] = i;

      for (let i = 0; i < N; i++) {
        const ix = p[i * 3], iy = p[i * 3 + 1], iz = p[i * 3 + 2];
        let sx = 0, sy = 0, sz = 0, ax = 0, ay = 0, az = 0, cx = 0, cy = 0, cz = 0, n = 0;
        const bx = Math.floor((ix + BOUNDS.x) / cellSize);
        const by = Math.floor((iy + BOUNDS.y) / cellSize);
        const bz = Math.floor((iz + BOUNDS.z) / cellSize);
        for (let dz = -1; dz <= 1; dz++) {
          const zz = bz + dz;
          if (zz < 0 || zz >= gz) continue;
          for (let dy = -1; dy <= 1; dy++) {
            const yy = by + dy;
            if (yy < 0 || yy >= gy) continue;
            for (let dx = -1; dx <= 1; dx++) {
              const xx = bx + dx;
              if (xx < 0 || xx >= gx) continue;
              const k = xx + gx * (yy + gy * zz);
              for (let s = cellStart[k]; s < cellStart[k + 1]; s++) {
                const j = sorted[s];
                if (j === i) continue;
                const ox = p[j * 3] - ix, oy = p[j * 3 + 1] - iy, oz = p[j * 3 + 2] - iz;
                const d2 = ox * ox + oy * oy + oz * oz;
                if (d2 > R2 || d2 < 1e-8) continue;
                const inv = 1 / d2;
                sx -= ox * inv; sy -= oy * inv; sz -= oz * inv;
                ax += v[j * 3]; ay += v[j * 3 + 1]; az += v[j * 3 + 2];
                cx += ox; cy += oy; cz += oz;
                n++;
              }
            }
          }
        }
        let fx = 0, fy = 0, fz = 0;
        if (n > 0) {
          fx += sx * sep * 0.15 + (ax / n - v[i * 3]) * ali * 0.6 + (cx / n) * coh * 0.4;
          fy += sy * sep * 0.15 + (ay / n - v[i * 3 + 1]) * ali * 0.6 + (cy / n) * coh * 0.4;
          fz += sz * sep * 0.15 + (az / n - v[i * 3 + 2]) * ali * 0.6 + (cz / n) * coh * 0.4;
        }
        // 境界で押し戻す
        const edge = 1.5;
        if (ix > BOUNDS.x - edge) fx -= (ix - BOUNDS.x + edge) * 2;
        if (ix < -BOUNDS.x + edge) fx += (-BOUNDS.x + edge - ix) * 2;
        if (iy > BOUNDS.y - edge) fy -= (iy - BOUNDS.y + edge) * 2;
        if (iy < -BOUNDS.y + edge) fy += (-BOUNDS.y + edge - iy) * 2;
        if (iz > BOUNDS.z - edge) fz -= (iz - BOUNDS.z + edge) * 2;
        if (iz < -BOUNDS.z + edge) fz += (-BOUNDS.z + edge - iz) * 2;
        if (usePred) {
          const ox = ix - pred.x, oy = iy - pred.y, oz = iz - pred.z;
          const d2 = ox * ox + oy * oy + oz * oz;
          if (d2 < 9) {
            const k = (9 - d2) * 1.2 / Math.sqrt(d2 + 1e-4);
            fx += ox * k; fy += oy * k; fz += oz * k;
          }
        }
        let vx = v[i * 3] + fx * dt * 4, vy = v[i * 3 + 1] + fy * dt * 4, vz = v[i * 3 + 2] + fz * dt * 4;
        const sp = Math.hypot(vx, vy, vz);
        const target = Math.min(maxSpeed, Math.max(maxSpeed * 0.4, sp));
        if (sp > 1e-5) {
          vx = (vx / sp) * target; vy = (vy / sp) * target; vz = (vz / sp) * target;
        }
        v[i * 3] = vx; v[i * 3 + 1] = vy; v[i * 3 + 2] = vz;
      }
      for (let i = 0; i < N; i++) {
        p[i * 3] += v[i * 3] * dt;
        p[i * 3 + 1] += v[i * 3 + 1] * dt;
        p[i * 3 + 2] += v[i * 3 + 2] * dt;
        pos.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
        dir.set(v[i * 3], v[i * 3 + 1], v[i * 3 + 2]).normalize();
        q.setFromUnitVectors(fwd, dir);
        m.compose(pos, q, one);
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
      camera.position.set(Math.sin(time * 0.05) * 16, 2 + Math.sin(time * 0.1), Math.cos(time * 0.05) * 16);
      camera.lookAt(0, 0, 0);
    });

    return {
      render: (target, params, frame) => source.render(target, params, frame),
      resize: (w, h) => source.resize(w, h),
      dispose: () => {
        source.dispose();
        disposeObject(scene);
      },
    };
  },
};

export default effect;
