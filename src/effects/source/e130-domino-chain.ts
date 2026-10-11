import * as THREE from 'three';
import { SceneSource, disposeObject } from '../../engine/sceneSource';
import type { SourceEffect } from '../../engine/types';

const effect: SourceEffect = {
  id: '130',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'count', label: 'ドミノの数', type: 'number', min: 40, max: 400, step: 10, default: 220 },
    { key: 'spacing', label: '間隔（高さ比）', type: 'number', min: 0.25, max: 0.8, step: 0.01, default: 0.45 },
    { key: 'gravity', label: '重力', type: 'number', min: 2, max: 30, step: 0.1, default: 9.8 },
    {
      key: 'path',
      label: '並べ方',
      type: 'select',
      options: [
        { value: 'spiral', label: '渦巻き' },
        { value: 'wave', label: '波線' },
        { value: 'heart', label: 'ハート' },
      ],
      default: 'spiral',
    },
  ],
  notes:
    '各ドミノを「底辺を軸に回転する剛体の棒」としてモデル化し、角運動方程式 θ¨ = (3g/2h)·sinθ を積分する。前のドミノの上端が次の側面に届く角度で接触とみなし、角運動量の一部を渡しつつ「寄りかかり」拘束で次を押し倒す。汎用剛体エンジンを使わない専用モデルなので、数百枚でも軽い。最後まで倒れると並べ直す。',
  create(ctx) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x101624);
    scene.fog = new THREE.Fog(0x101624, 14, 40);
    const camera = new THREE.PerspectiveCamera(50, ctx.width / ctx.height, 0.1, 100);
    scene.add(new THREE.HemisphereLight(0xdde8ff, 0x302838, 1.3));
    const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
    sun.position.set(6, 12, 4);
    scene.add(sun);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x232b40, roughness: 0.9 }));
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);
    const Hd = 1;
    const geo = new THREE.BoxGeometry(0.5, Hd, 0.12);
    geo.translate(0, Hd / 2, 0);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.1 });
    const MAX = 400;
    const mesh = new THREE.InstancedMesh(geo, mat, MAX);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(mesh);

    let n = 0;
    const px = new Float32Array(MAX), pz = new Float32Array(MAX), yaw = new Float32Array(MAX);
    const th = new Float32Array(MAX), om = new Float32Array(MAX);
    let config = '';
    let done = 0;
    let lastFallen = 0;
    const color = new THREE.Color();
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const qYaw = new THREE.Quaternion();
    const qTilt = new THREE.Quaternion();
    const one = new THREE.Vector3(1, 1, 1);
    const p = new THREE.Vector3();
    const camTarget = new THREE.Vector3();
    const camPos = new THREE.Vector3(0, 8, 12);

    const layout = (count: number, spacing: number, path: string) => {
      n = count;
      // 経路を細かくサンプリングし、弧長が spacing ごとになるように配置
      const pts: THREE.Vector2[] = [];
      const S = 4000;
      for (let i = 0; i <= S; i++) {
        const t = i / S;
        let x = 0, z = 0;
        if (path === 'spiral') {
          const a = t * Math.PI * 7;
          const r = 9 - t * 7.5;
          x = Math.cos(a) * r;
          z = Math.sin(a) * r;
        } else if (path === 'wave') {
          x = (t - 0.5) * 34;
          z = Math.sin(t * Math.PI * 6) * 4;
        } else {
          const a = t * Math.PI * 2;
          x = 16 * Math.pow(Math.sin(a), 3) * 0.5;
          z = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a)) * 0.5;
        }
        pts.push(new THREE.Vector2(x, z));
      }
      let acc = 0;
      let k = 0;
      px[0] = pts[0].x;
      pz[0] = pts[0].y;
      for (let i = 1; i < pts.length && k < count - 1; i++) {
        acc += pts[i].distanceTo(pts[i - 1]);
        if (acc >= spacing * Hd) {
          acc = 0;
          k++;
          px[k] = pts[i].x;
          pz[k] = pts[i].y;
        }
      }
      n = k + 1;
      for (let i = 0; i < n; i++) {
        const j = Math.min(i + 1, n - 1);
        const jj = j === i ? i - 1 : i;
        const dx = px[j] - px[jj], dz = pz[j] - pz[jj];
        yaw[i] = Math.atan2(dx, dz);
        th[i] = 0;
        om[i] = 0;
        mesh.setColorAt(i, color.setHSL(i / n, 0.75, 0.55));
      }
      th[0] = 0.15;
      om[0] = 1.5;
      done = 0;
      lastFallen = 0;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    };

    const source = new SceneSource(ctx.renderer, scene, camera, ctx.width, ctx.height, (frame, params) => {
      const key = `${params.count}|${params.spacing}|${params.path}`;
      if (key !== config) {
        config = key;
        layout(Math.round(Number(params.count)), Number(params.spacing), String(params.path));
      }
      const g = Number(params.gravity);
      const spacing = Number(params.spacing) * Hd;
      const contact = Math.asin(Math.min(0.99, spacing / Hd)); // 上端が次に届く角度
      const sub = 4;
      const dt = Math.min(frame.dt, 1 / 30) / sub;
      for (let s = 0; s < sub; s++) {
        for (let i = 0; i < n; i++) {
          if (th[i] <= 0 && om[i] <= 0) continue;
          om[i] += ((3 * g) / (2 * Hd)) * Math.sin(th[i]) * dt;
          om[i] *= 0.999;
          th[i] += om[i] * dt;
          const next = i + 1;
          if (next < n) {
            // 寄りかかり拘束：前のドミノは「次の角度 + 接触角」より倒れられない
            const limit = th[next] + contact;
            if (th[i] > limit) {
              const excess = om[i] - om[next];
              if (excess > 0) {
                om[next] += excess * 0.55; // 衝突で角運動量を渡す
                om[i] = om[next];
              }
              th[i] = limit;
              if (th[next] <= 0) th[next] = 0.001;
            }
          }
          if (th[i] >= Math.PI / 2) {
            th[i] = Math.PI / 2;
            om[i] = 0;
          }
        }
      }
      let front = 0;
      for (let i = 0; i < n; i++) {
        if (th[i] > 0.05) front = i;
        qYaw.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw[i]);
        qTilt.setFromAxisAngle(new THREE.Vector3(1, 0, 0), th[i]);
        q.copy(qYaw).multiply(qTilt);
        p.set(px[i], 0, pz[i]);
        m.compose(p, q, one);
        mesh.setMatrixAt(i, m);
      }
      mesh.count = n;
      mesh.instanceMatrix.needsUpdate = true;
      if (front > lastFallen) lastFallen = front;
      if (front >= n - 1 || (frame.time > 2 && front === lastFallen && th[front] >= Math.PI / 2 - 0.05)) done += frame.dt;
      if (done > 2.5) layout(n, Number(params.spacing), String(params.path));
      // カメラは倒れていく先端を追う
      camTarget.lerp(new THREE.Vector3(px[front], 0.5, pz[front]), 0.05);
      camPos.lerp(new THREE.Vector3(px[front] * 0.6 + 6, 7, pz[front] * 0.6 + 9), 0.03);
      camera.position.copy(camPos);
      camera.lookAt(camTarget);
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
