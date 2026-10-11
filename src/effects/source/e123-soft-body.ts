import * as THREE from 'three';
import type { SourceEffect } from '../../engine/types';

interface Blob {
  n: number;
  /** 重心からの初期オフセット（形状マッチング用） */
  ox: Float32Array;
  oy: Float32Array;
  x: Float32Array;
  y: Float32Array;
  px: Float32Array;
  py: Float32Array;
  rest: number;
  area0: number;
  color: THREE.Color;
  geo: THREE.BufferGeometry;
  line: THREE.BufferGeometry;
}

const effect: SourceEffect = {
  id: '123',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'pressure', label: '内圧', type: 'number', min: 0, max: 3, step: 0.01, default: 1.2 },
    { key: 'stiffness', label: '皮の硬さ', type: 'number', min: 0.05, max: 1, step: 0.01, default: 0.9 },
    { key: 'gravity', label: '重力', type: 'number', min: 0, max: 30, step: 0.1, default: 12 },
    { key: 'bounce', label: '弾み', type: 'number', min: 0, max: 0.9, step: 0.01, default: 0.3 },
    { key: 'tilt', label: '床を揺らす', type: 'bool', default: true },
  ],
  notes:
    '輪状に並べた質点を「ばね（皮）」と「内圧」で保つ圧力モデルのソフトボディ（形がねじれないよう、弱い形状マッチングも併用）。現在の面積が初期面積より小さいほど各辺を外向きに押す力が強くなり、つぶれても元の体積に戻ろうとする。Verlet積分＋距離拘束で安定させ、物体同士は相手の重心からの距離で押し合う。ドラッグでつかんで投げられる。',
  create(ctx) {
    const scene = new THREE.Scene();
    // レンダーターゲットへ直接描くので、色は表示空間(sRGB)の値のまま扱う
    scene.background = new THREE.Color(0x0e1020).convertLinearToSRGB();
    const aspect = ctx.width / ctx.height;
    const camera = new THREE.OrthographicCamera(-aspect * 5, aspect * 5, 5, -5, -1, 1);
    const blobs: Blob[] = [];
    const N = ctx.quality === 'high' ? 36 : 24;
    const count = 7;
    const palette = ['#ff4d7a', '#4dd2ff', '#ffd24d', '#7aff6a', '#b56bff', '#ff8a3d', '#3dffc8'];
    for (let b = 0; b < count; b++) {
      const r = 0.7 + Math.random() * 0.6;
      // 初期配置で重ならないよう横に並べ、高さだけずらす
      const cx = (b - (count - 1) / 2) * Math.min(2.8, (aspect * 9) / count);
      const cy = 1 + (b % 3) * 1.6;
      const x = new Float32Array(N), y = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const a = (i / N) * Math.PI * 2;
        x[i] = cx + Math.cos(a) * r;
        y[i] = cy + Math.sin(a) * r;
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array((N + 1) * 3), 3));
      const cols = new Float32Array((N + 1) * 3);
      const color = new THREE.Color(palette[b % palette.length]).convertLinearToSRGB();
      const light = color.clone().lerp(new THREE.Color(1, 1, 1), 0.45);
      cols.set([light.r, light.g, light.b], 0);
      for (let i = 1; i <= N; i++) cols.set([color.r * 0.8, color.g * 0.8, color.b * 0.8], i * 3);
      geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      const idx: number[] = [];
      for (let i = 0; i < N; i++) idx.push(0, 1 + i, 1 + ((i + 1) % N));
      geo.setIndex(idx);
      const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true }));
      mesh.frustumCulled = false;
      scene.add(mesh);
      const line = new THREE.BufferGeometry();
      line.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const loop = new THREE.LineLoop(line, new THREE.LineBasicMaterial({ color: light }));
      loop.frustumCulled = false;
      scene.add(loop);
      const area0 = Math.PI * r * r;
      const ox = new Float32Array(N), oy = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        ox[i] = x[i] - cx;
        oy[i] = y[i] - cy;
      }
      blobs.push({ n: N, ox, oy, x, y, px: x.slice(), py: y.slice(), rest: 2 * r * Math.sin(Math.PI / N), area0, color, geo, line });
    }
    const ptr = { x: 0, y: 0, down: false, grab: -1 };
    let t = 0;
    const area = (B: Blob) => {
      let s = 0;
      for (let i = 0; i < B.n; i++) {
        const j = (i + 1) % B.n;
        s += B.x[i] * B.y[j] - B.x[j] * B.y[i];
      }
      return s / 2;
    };
    const centroid = (B: Blob) => {
      let cx = 0, cy = 0;
      for (let i = 0; i < B.n; i++) {
        cx += B.x[i];
        cy += B.y[i];
      }
      return [cx / B.n, cy / B.n];
    };

    return {
      render(target, params, frame) {
        const dt = Math.min(frame.dt, 1 / 30) / 3;
        t += frame.dt;
        const A = ctx.width / ctx.height;
        camera.left = -A * 5;
        camera.right = A * 5;
        camera.updateProjectionMatrix();
        const g = Number(params.gravity);
        const kP = Number(params.pressure);
        const kS = Number(params.stiffness);
        const bounce = Number(params.bounce);
        const floorTilt = params.tilt ? Math.sin(t * 0.5) * 0.25 : 0;
        const wx = A * 5 - 0.05;
        const wp = [ptr.x * 2 - 1, ptr.y * 2 - 1];
        const pwx = wp[0] * A * 5, pwy = wp[1] * 5;
        for (let sub = 0; sub < 3; sub++) {
          for (let bi = 0; bi < blobs.length; bi++) {
            const B = blobs[bi];
            const cur = Math.abs(area(B));
            const P = kP * (B.area0 / Math.max(cur, 0.05) - 1);
            const [cx, cy] = centroid(B);
            for (let i = 0; i < B.n; i++) {
              const j = (i + 1) % B.n;
              const ex = B.x[j] - B.x[i], ey = B.y[j] - B.y[i];
              // 辺の外向き法線 × 内圧 × 辺の長さ
              const fx = ey * P * 300, fy = -ex * P * 300;
              let ax = fx, ay = fy - g;
              if (ptr.grab === bi) {
                ax += (pwx - cx) * 30;
                ay += (pwy - cy) * 30 + g;
              }
              const vx = (B.x[i] - B.px[i]) * 0.995, vy = (B.y[i] - B.py[i]) * 0.995;
              B.px[i] = B.x[i];
              B.py[i] = B.y[i];
              B.x[i] += vx + ax * dt * dt;
              B.y[i] += vy + ay * dt * dt;
            }
            // 皮（隣接・1つ飛ばし）の距離拘束
            for (let it = 0; it < 10; it++) {
              for (let i = 0; i < B.n; i++) {
                for (const step of [1, 2]) {
                  const j = (i + step) % B.n;
                  const L = B.rest * (step === 1 ? 1 : 1.95);
                  const dx = B.x[j] - B.x[i], dy = B.y[j] - B.y[i];
                  const d = Math.hypot(dx, dy) || 1e-6;
                  const c = ((d - L) / d) * 0.5 * kS * (step === 1 ? 1 : 0.5);
                  B.x[i] += dx * c; B.y[i] += dy * c;
                  B.x[j] -= dx * c; B.y[j] -= dy * c;
                }
              }
            }
            // 形状マッチング：現在の点群に最もよく合う回転を求め、回転させた初期形状へ少し引き戻す
            {
              const [gx, gy] = centroid(B);
              let sc = 0, ss = 0;
              for (let i = 0; i < B.n; i++) {
                const qx = B.x[i] - gx, qy = B.y[i] - gy;
                sc += B.ox[i] * qx + B.oy[i] * qy;
                ss += B.ox[i] * qy - B.oy[i] * qx;
              }
              const ang = Math.atan2(ss, sc);
              const ca = Math.cos(ang), sa = Math.sin(ang);
              const k = 0.04 * (1.2 - kS * 0.6);
              for (let i = 0; i < B.n; i++) {
                const tx = gx + B.ox[i] * ca - B.oy[i] * sa;
                const ty = gy + B.ox[i] * sa + B.oy[i] * ca;
                B.x[i] += (tx - B.x[i]) * k;
                B.y[i] += (ty - B.y[i]) * k;
              }
            }
            // 床と壁
            for (let i = 0; i < B.n; i++) {
              const floorY = -4.6 + B.x[i] * floorTilt;
              if (B.y[i] < floorY) {
                const vy = B.y[i] - B.py[i];
                B.y[i] = floorY;
                B.py[i] = floorY + vy * bounce;
                B.px[i] = B.x[i] - (B.x[i] - B.px[i]) * 0.8;
              }
              if (B.x[i] < -wx) { const vx = B.x[i] - B.px[i]; B.x[i] = -wx; B.px[i] = -wx + vx * bounce; }
              if (B.x[i] > wx) { const vx = B.x[i] - B.px[i]; B.x[i] = wx; B.px[i] = wx + vx * bounce; }
              if (B.y[i] > 6) B.y[i] = 6;
            }
          }
          // 物体同士の押し合い（相手の重心と平均半径による近似）
          for (let a = 0; a < blobs.length; a++) {
            const BA = blobs[a];
            for (let b = 0; b < blobs.length; b++) {
              if (a === b) continue;
              const BB = blobs[b];
              const [cx, cy] = centroid(BB);
              const rb = Math.sqrt(Math.abs(area(BB)) / Math.PI) * 0.95;
              for (let i = 0; i < BA.n; i++) {
                const dx = BA.x[i] - cx, dy = BA.y[i] - cy;
                const d = Math.hypot(dx, dy);
                if (d < rb && d > 1e-5) {
                  const push = Math.min((rb - d) * 0.5, 0.04);
                  BA.x[i] += (dx / d) * push;
                  BA.y[i] += (dy / d) * push;
                }
              }
            }
          }
        }
        for (const B of blobs) {
          const pa = B.geo.attributes.position as THREE.BufferAttribute;
          const la = B.line.attributes.position as THREE.BufferAttribute;
          const [cx, cy] = centroid(B);
          pa.setXYZ(0, cx, cy, 0);
          for (let i = 0; i < B.n; i++) {
            pa.setXYZ(i + 1, B.x[i], B.y[i], 0);
            la.setXYZ(i, B.x[i], B.y[i], 0.01);
          }
          pa.needsUpdate = true;
          la.needsUpdate = true;
        }
        ctx.renderer.setRenderTarget(target);
        ctx.renderer.render(scene, camera);
      },
      pointer(x, y, down) {
        ptr.x = x;
        ptr.y = y;
        if (down && !ptr.down) {
          const A = ctx.width / ctx.height;
          const wx = (x * 2 - 1) * A * 5, wy = (y * 2 - 1) * 5;
          let best = -1, bd = 2.5;
          blobs.forEach((B, i) => {
            const [cx, cy] = centroid(B);
            const d = Math.hypot(cx - wx, cy - wy);
            if (d < bd) { bd = d; best = i; }
          });
          ptr.grab = best;
        }
        if (!down) ptr.grab = -1;
        ptr.down = down;
      },
      dispose() {
        scene.traverse((o) => {
          const m = o as THREE.Mesh;
          m.geometry?.dispose();
          (m.material as THREE.Material | undefined)?.dispose?.();
        });
      },
    };
  },
};

export default effect;
