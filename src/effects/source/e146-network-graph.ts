import * as THREE from 'three';
import { SceneSource, disposeObject } from '../../engine/sceneSource';
import type { SourceEffect } from '../../engine/types';

const effect: SourceEffect = {
  id: '146',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'nodes', label: '最大ノード数', type: 'number', min: 20, max: 400, step: 10, default: 180 },
    { key: 'repulsion', label: '反発力', type: 'number', min: 0.1, max: 5, step: 0.01, default: 1.2 },
    { key: 'linkLength', label: 'エッジの長さ', type: 'number', min: 0.3, max: 3, step: 0.01, default: 1 },
    { key: 'growth', label: '成長速度(ノード/秒)', type: 'number', min: 0, max: 30, step: 0.5, default: 6 },
    { key: 'pulses', label: 'データの流れ', type: 'bool', default: true },
  ],
  notes:
    '力学モデル（ばね＋クーロン反発）による3Dグラフ自動配置。ノードは「人気のあるノードほどつながりやすい」優先的選択で追加され、スケールフリー（ハブを持つ）ネットワークが育つ。エッジ上を光のパケットが流れ、最大数に達すると解体して再成長する。',
  create(ctx) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x05070f);
    scene.fog = new THREE.FogExp2(0x05070f, 0.06);
    const camera = new THREE.PerspectiveCamera(55, ctx.width / ctx.height, 0.1, 100);
    scene.add(new THREE.AmbientLight(0x8899ff, 0.6));
    const pl = new THREE.PointLight(0xffffff, 40, 30);
    scene.add(pl);
    const MAX = 400;
    const nodeGeo = new THREE.SphereGeometry(0.08, 12, 8);
    const nodeMat = new THREE.MeshStandardMaterial({ emissive: 0xffffff, emissiveIntensity: 0.6, roughness: 0.4 });
    const nodes = new THREE.InstancedMesh(nodeGeo, nodeMat, MAX);
    nodes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(nodes);
    const MAXE = MAX * 2;
    const ePos = new Float32Array(MAXE * 6);
    const eGeo = new THREE.BufferGeometry();
    eGeo.setAttribute('position', new THREE.BufferAttribute(ePos, 3).setUsage(THREE.DynamicDrawUsage));
    const edges = new THREE.LineSegments(eGeo, new THREE.LineBasicMaterial({ color: 0x4a6bff, transparent: true, opacity: 0.45 }));
    edges.frustumCulled = false;
    scene.add(edges);
    const pulseGeo = new THREE.SphereGeometry(0.035, 6, 4);
    const pulses = new THREE.InstancedMesh(pulseGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3, 1) }), MAXE);
    pulses.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(pulses);

    const px: number[] = [], py: number[] = [], pz: number[] = [], vx: number[] = [], vy: number[] = [], vz: number[] = [];
    const deg: number[] = [];
    const ea: number[] = [], eb: number[] = [], phase: number[] = [];
    const c = new THREE.Color();
    const m = new THREE.Matrix4();
    const v = new THREE.Vector3();
    let acc = 0;
    let t = 0;
    let dissolve = 0;
    const addNode = () => {
      const n = px.length;
      let target = -1;
      if (n > 0) {
        // 優先的選択：次数に比例した確率で接続先を選ぶ
        const total = deg.reduce((s, d) => s + d + 1, 0);
        let r = Math.random() * total;
        for (let i = 0; i < n; i++) {
          r -= deg[i] + 1;
          if (r <= 0) { target = i; break; }
        }
      }
      const b = target >= 0 ? target : 0;
      px.push((px[b] ?? 0) + (Math.random() - 0.5) * 0.5);
      py.push((py[b] ?? 0) + (Math.random() - 0.5) * 0.5);
      pz.push((pz[b] ?? 0) + (Math.random() - 0.5) * 0.5);
      vx.push(0); vy.push(0); vz.push(0); deg.push(0);
      if (target >= 0) {
        ea.push(n); eb.push(target); phase.push(Math.random());
        deg[n]++; deg[target]++;
        if (Math.random() < 0.15 && n > 3) {
          const o = Math.floor(Math.random() * n);
          if (o !== target) { ea.push(n); eb.push(o); phase.push(Math.random()); deg[n]++; deg[o]++; }
        }
      }
      nodes.setColorAt(n, c.setHSL(0.55 + Math.random() * 0.15, 0.8, 0.6));
      if (nodes.instanceColor) nodes.instanceColor.needsUpdate = true;
    };
    const reset = () => {
      px.length = py.length = pz.length = vx.length = vy.length = vz.length = deg.length = 0;
      ea.length = eb.length = phase.length = 0;
      addNode();
    };
    reset();

    const source = new SceneSource(ctx.renderer, scene, camera, ctx.width, ctx.height, (frame, params) => {
      const dt = Math.min(frame.dt, 1 / 30);
      t += dt;
      const maxN = Math.round(Number(params.nodes));
      acc += dt * Number(params.growth);
      while (acc >= 1 && px.length < Math.min(maxN, MAX) && dissolve === 0) {
        acc -= 1;
        addNode();
      }
      if (px.length >= Math.min(maxN, MAX)) dissolve += dt;
      if (dissolve > 6) { dissolve = 0; reset(); }
      const n = px.length;
      const rep = Number(params.repulsion) * 0.05;
      const L = Number(params.linkLength);
      // 反発（O(n²) だが最大400ノードなので許容）
      for (let i = 0; i < n; i++) {
        let fx = -px[i] * 0.02, fy = -py[i] * 0.02, fz = -pz[i] * 0.02;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const dx = px[i] - px[j], dy = py[i] - py[j], dz = pz[i] - pz[j];
          const d2 = dx * dx + dy * dy + dz * dz + 0.01;
          const f = rep / d2;
          fx += dx * f; fy += dy * f; fz += dz * f;
        }
        vx[i] = (vx[i] + fx) * 0.85; vy[i] = (vy[i] + fy) * 0.85; vz[i] = (vz[i] + fz) * 0.85;
      }
      for (let e = 0; e < ea.length; e++) {
        const a = ea[e], b = eb[e];
        const dx = px[b] - px[a], dy = py[b] - py[a], dz = pz[b] - pz[a];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) + 1e-5;
        const f = (d - L) * 0.05 / d;
        vx[a] += dx * f; vy[a] += dy * f; vz[a] += dz * f;
        vx[b] -= dx * f; vy[b] -= dy * f; vz[b] -= dz * f;
      }
      const scaleOut = dissolve > 0 ? Math.max(0, 1 - dissolve / 6) : 1;
      for (let i = 0; i < n; i++) {
        px[i] += vx[i]; py[i] += vy[i]; pz[i] += vz[i];
        const s = (0.6 + Math.sqrt(deg[i]) * 0.5) * scaleOut;
        m.makeScale(s, s, s).setPosition(px[i], py[i], pz[i]);
        nodes.setMatrixAt(i, m);
      }
      nodes.count = n;
      nodes.instanceMatrix.needsUpdate = true;
      for (let e = 0; e < ea.length; e++) {
        const a = ea[e], b = eb[e], o = e * 6;
        ePos[o] = px[a]; ePos[o + 1] = py[a]; ePos[o + 2] = pz[a];
        ePos[o + 3] = px[b]; ePos[o + 4] = py[b]; ePos[o + 5] = pz[b];
        phase[e] = (phase[e] + dt * 0.6) % 1;
        const k = phase[e];
        v.set(px[a] + (px[b] - px[a]) * k, py[a] + (py[b] - py[a]) * k, pz[a] + (pz[b] - pz[a]) * k);
        m.makeScale(scaleOut, scaleOut, scaleOut).setPosition(v);
        pulses.setMatrixAt(e, m);
      }
      eGeo.setDrawRange(0, ea.length * 2);
      eGeo.attributes.position.needsUpdate = true;
      pulses.count = params.pulses ? ea.length : 0;
      pulses.instanceMatrix.needsUpdate = true;
      let radius = 2;
      for (let i = 0; i < n; i++) radius = Math.max(radius, Math.hypot(px[i], py[i], pz[i]));
      const cr = radius * 2.2 + 2;
      camera.position.set(Math.sin(t * 0.15) * cr, Math.sin(t * 0.1) * cr * 0.3, Math.cos(t * 0.15) * cr);
      camera.lookAt(0, 0, 0);
      pl.position.copy(camera.position);
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
