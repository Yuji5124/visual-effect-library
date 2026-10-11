import * as THREE from 'three';
import type { SourceEffect } from '../../engine/types';

const effect: SourceEffect = {
  id: '133',
  kind: 'source',
  status: 'implemented',
  params: [
    {
      key: 'form',
      label: '形',
      type: 'select',
      options: [
        { value: 'tree', label: '樹木' },
        { value: 'vessel', label: '血管（全方向）' },
        { value: 'roots', label: '根（下向き）' },
      ],
      default: 'tree',
    },
    { key: 'attractors', label: '養分点の数', type: 'number', min: 200, max: 3000, step: 50, default: 1400 },
    { key: 'influence', label: '影響距離', type: 'number', min: 0.05, max: 0.6, step: 0.01, default: 0.25 },
    { key: 'speed', label: '成長速度（反復/フレーム）', type: 'number', min: 1, max: 8, step: 1, default: 2 },
    { key: 'color', label: '色', type: 'color', default: '#9dff7a' },
  ],
  notes:
    'Space Colonization（Runions らの手法）。空間に「養分点」をばらまき、各養分点は影響距離内で最も近い枝先を引き寄せる。枝先は引き寄せられた方向の平均へ1歩伸び、近づきすぎた養分点は消費される。この単純な規則だけで、樹木・血管・根のような分岐構造が自然に生まれる。',
  create(ctx) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x06090c).convertLinearToSRGB();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, -1, 1);
    const MAXN = 12000;
    const linePos = new Float32Array(MAXN * 6);
    const lineCol = new Float32Array(MAXN * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(linePos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(lineCol, 3).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.LineBasicMaterial({ vertexColors: true });
    const lines = new THREE.LineSegments(geo, mat);
    lines.frustumCulled = false;
    scene.add(lines);
    const dotGeo = new THREE.BufferGeometry();
    const dotPos = new Float32Array(3000 * 3);
    dotGeo.setAttribute('position', new THREE.BufferAttribute(dotPos, 3).setUsage(THREE.DynamicDrawUsage));
    const dots = new THREE.Points(dotGeo, new THREE.PointsMaterial({ size: 2, sizeAttenuation: false, color: new THREE.Color(0.25, 0.3, 0.35) }));
    dots.frustumCulled = false;
    scene.add(dots);

    let ax: number[] = [], ay: number[] = [];
    let nx: number[] = [], ny: number[] = [], parent: number[] = [], depth: number[] = [];
    let config = '';
    let idle = 0;
    const base = new THREE.Color();
    const c = new THREE.Color();
    const STEP = 0.012;

    const reset = (form: string, count: number) => {
      const A = ctx.width / ctx.height;
      ax = []; ay = [];
      for (let i = 0; i < count; i++) {
        let x: number, y: number;
        if (form === 'tree') {
          // 樹冠（楕円）の中に分布
          const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random());
          x = Math.cos(a) * r * 0.75 * Math.min(A, 1.6);
          y = 0.25 + Math.sin(a) * r * 0.6;
        } else if (form === 'vessel') {
          const a = Math.random() * Math.PI * 2, r = 0.15 + Math.sqrt(Math.random()) * 0.8;
          x = Math.cos(a) * r * A * 0.95;
          y = Math.sin(a) * r * 0.95;
        } else {
          x = (Math.random() * 2 - 1) * A * 0.9;
          y = 0.6 - Math.pow(Math.random(), 0.7) * 1.5;
        }
        ax.push(x); ay.push(y);
      }
      nx = []; ny = []; parent = []; depth = [];
      if (form === 'tree') { nx.push(0); ny.push(-0.95); }
      else if (form === 'vessel') { nx.push(0); ny.push(0); }
      else { nx.push(0); ny.push(0.95); }
      parent.push(-1); depth.push(0);
      // 幹：養分点に届くまでまっすぐ伸ばす
      if (form !== 'vessel') {
        const dir = form === 'tree' ? 1 : -1;
        for (let k = 0; k < 40; k++) {
          const i = nx.length - 1;
          nx.push(nx[i]); ny.push(ny[i] + STEP * dir); parent.push(i); depth.push(depth[i] + 1);
        }
      }
      idle = 0;
    };

    const grow = (influence: number) => {
      const kill = STEP * 1.5;
      const dirX = new Float32Array(nx.length), dirY = new Float32Array(nx.length), cnt = new Uint16Array(nx.length);
      const alive: number[] = [];
      // 枝先を一様グリッドに登録し、近傍セルだけを探索する
      const cs = influence;
      const grid = new Map<number, number[]>();
      const keyOf = (gx: number, gy: number) => (gx + 512) * 4096 + (gy + 512);
      for (let i = 0; i < nx.length; i++) {
        const k = keyOf(Math.floor(nx[i] / cs), Math.floor(ny[i] / cs));
        let l = grid.get(k);
        if (!l) grid.set(k, (l = []));
        l.push(i);
      }
      for (let a = 0; a < ax.length; a++) {
        let best = -1, bd = influence * influence;
        let killed = false;
        const gx = Math.floor(ax[a] / cs), gy = Math.floor(ay[a] / cs);
        for (let oy = -1; oy <= 1 && !killed; oy++)
          for (let ox = -1; ox <= 1 && !killed; ox++) {
            const l = grid.get(keyOf(gx + ox, gy + oy));
            if (!l) continue;
            for (const i of l) {
              const dx = ax[a] - nx[i], dy = ay[a] - ny[i];
              const d2 = dx * dx + dy * dy;
              if (d2 < kill * kill) { killed = true; break; }
              if (d2 < bd) { bd = d2; best = i; }
            }
          }
        if (killed) continue;
        alive.push(a);
        if (best >= 0) {
          const d = Math.sqrt(bd);
          dirX[best] += (ax[a] - nx[best]) / d;
          dirY[best] += (ay[a] - ny[best]) / d;
          cnt[best]++;
        }
      }
      ax = alive.map((a) => ax[a]);
      ay = alive.map((a) => ay[a]);
      let grew = false;
      const n0 = nx.length;
      for (let i = 0; i < n0 && nx.length < MAXN; i++) {
        if (!cnt[i]) continue;
        let dx = dirX[i] / cnt[i] + (Math.random() - 0.5) * 0.2, dy = dirY[i] / cnt[i] + (Math.random() - 0.5) * 0.2;
        const l = Math.hypot(dx, dy) || 1;
        dx /= l; dy /= l;
        nx.push(nx[i] + dx * STEP); ny.push(ny[i] + dy * STEP); parent.push(i); depth.push(depth[i] + 1);
        grew = true;
      }
      return grew;
    };

    return {
      render(target, params, frame) {
        const key = `${params.form}|${params.attractors}`;
        if (key !== config) {
          config = key;
          reset(String(params.form), Math.round(Number(params.attractors)));
        }
        const A = ctx.width / ctx.height;
        camera.left = -A;
        camera.right = A;
        camera.updateProjectionMatrix();
        let grew = false;
        for (let i = 0; i < Number(params.speed); i++) grew = grow(Number(params.influence)) || grew;
        if (!grew) idle += frame.dt;
        if (idle > 3) reset(String(params.form), Math.round(Number(params.attractors)));
        base.set(String(params.color)).convertLinearToSRGB();
        let maxD = 1;
        for (const d of depth) if (d > maxD) maxD = d;
        let k = 0;
        for (let i = 1; i < nx.length; i++) {
          const p = parent[i];
          if (p < 0) continue;
          const o = k * 6;
          linePos[o] = nx[p]; linePos[o + 1] = ny[p]; linePos[o + 2] = 0;
          linePos[o + 3] = nx[i]; linePos[o + 4] = ny[i]; linePos[o + 5] = 0;
          const t = depth[i] / maxD;
          c.copy(base).lerp(new THREE.Color(1, 0.95, 0.8), 1 - t).multiplyScalar(0.5 + 0.5 * (1 - t));
          lineCol[o] = lineCol[o + 3] = c.r;
          lineCol[o + 1] = lineCol[o + 4] = c.g;
          lineCol[o + 2] = lineCol[o + 5] = c.b;
          k++;
        }
        geo.setDrawRange(0, k * 2);
        geo.attributes.position.needsUpdate = true;
        geo.attributes.color.needsUpdate = true;
        const nd = Math.min(ax.length, 3000);
        for (let i = 0; i < nd; i++) {
          dotPos[i * 3] = ax[i]; dotPos[i * 3 + 1] = ay[i]; dotPos[i * 3 + 2] = 0;
        }
        dotGeo.setDrawRange(0, nd);
        dotGeo.attributes.position.needsUpdate = true;
        ctx.renderer.setRenderTarget(target);
        ctx.renderer.render(scene, camera);
      },
      resize() {
        config = '';
      },
      dispose() {
        geo.dispose();
        mat.dispose();
        dotGeo.dispose();
        (dots.material as THREE.Material).dispose();
      },
    };
  },
};

export default effect;
