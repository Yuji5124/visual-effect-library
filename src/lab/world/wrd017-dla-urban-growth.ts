import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { Ticker } from '../framework/worldKit';

/** WRD-017 都市成長（DLA）：ランダムウォーカーが市街地に隣接すると確率で定着し、樹枝状に広がる */
const SIZE = 12;
const DX = [1, -1, 0, 0], DY = [0, 0, 1, -1];

export default defineWorldDemo({
  id: 'WRD-017',
  notes: '格子上で多数のランダムウォーカー（白い点）を同時に歩かせ、市街地（既に定着したセル）に4近傍で接すると付着確率で定着させる（拡散律速凝集）。ウォーカーは各中心の現在の半径の少し外側の円（水色の輪）から放たれ、遠くへ迷い出ると放ち直す。定着した順に色（赤→黄→緑→青）を変え、中心に近いほど高い建物にする。中心からの半径 r 内のセル数 N(r) を両対数で直線当てはめした傾きをフラクタル次元として表示する（DLA の理論値は約 1.71、付着確率を下げると密になり 2 に近づく）。',
  params: [
    { key: 'stick', label: '付着確率', type: 'number', min: 0.02, max: 1, step: 0.01, default: 1 },
    { key: 'rate', label: '粒子数/フレーム（同時に歩く数の目安）', type: 'number', min: 2, max: 80, step: 1, default: 30 },
    { key: 'centers', label: '中心の数', type: 'number', min: 1, max: 5, step: 1, default: 2 },
    { key: 'res', label: '格子の細かさ', type: 'number', min: 80, max: 240, step: 10, default: 180 },
    { key: 'speed', label: '再生速度', type: 'number', min: 0.2, max: 4, step: 0.1, default: 1.5 },
  ],
  liveKeys: ['speed', 'stick'],
  distance: 15,
  elevation: 1.0,
  compareLabels: ['初期の市街地（種）', 'DLA による成長'],
  build(p, env) {
    const rng = env.rng;
    const G = env.quality === 'low' ? Math.min(140, Number(p.res)) : Number(p.res);
    const cell = SIZE / G;
    const K = Number(p.centers);
    const cap = Math.floor(G * G * 0.22);
    const occ = new Int32Array(G * G).fill(-1); // 定着した順番（-1 = 空）
    const owner = new Int8Array(G * G);
    const cx: number[] = [], cy: number[] = [], R: number[] = [];
    for (let k = 0; k < K; k++) {
      // 中心どうしを離して置く
      let bx = G / 2, by = G / 2, bd = -1;
      for (let t = 0; t < 30; t++) {
        const x = Math.floor(G * (0.25 + 0.5 * rng())), y = Math.floor(G * (0.25 + 0.5 * rng()));
        const d = k === 0 ? 1 : Math.min(...cx.map((q, i) => Math.hypot(q - x, cy[i] - y)));
        if (d > bd) (bd = d), (bx = x), (by = y);
      }
      if (K === 1) (bx = Math.floor(G / 2)), (by = Math.floor(G / 2));
      cx.push(bx);
      cy.push(by);
      R.push(1);
    }

    const object = new THREE.Group();
    const plate = new THREE.Mesh(new THREE.BoxGeometry(SIZE, 0.06, SIZE), new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 1 }));
    plate.position.y = -0.03;
    object.add(plate);
    const boxGeo = new THREE.BoxGeometry(1, 1, 1);
    boxGeo.translate(0, 0.5, 0);
    const mesh = new THREE.InstancedMesh(boxGeo, new THREE.MeshStandardMaterial({ roughness: 0.7 }), cap);
    mesh.count = 0;
    mesh.setColorAt(0, new THREE.Color());
    object.add(mesh);
    const m4 = new THREE.Matrix4(), col = new THREE.Color();
    let n = 0;
    const wx = (i: number) => (i + 0.5) * cell - SIZE / 2;
    const place = (i: number, j: number, k: number) => {
      const id = j * G + i;
      occ[id] = n;
      owner[id] = k;
      const d = Math.hypot(i - cx[k], j - cy[k]) * cell;
      const h = 0.03 + 0.55 * Math.exp(-d / 1.2) * (0.5 + rng()) + 0.03 * rng();
      m4.makeScale(cell * 0.9, h, cell * 0.9).setPosition(wx(i), 0, wx(j));
      mesh.setMatrixAt(n, m4);
      col.setHSL(Math.min(0.68, (n / (cap * 0.7)) * 0.68), 0.75, 0.55);
      mesh.setColorAt(n, col);
      n++;
      R[k] = Math.max(R[k], Math.hypot(i - cx[k], j - cy[k]));
    };
    for (let k = 0; k < K; k++) place(cx[k], cy[k], k);
    mesh.count = n;

    // ウォーカーの集団
    const W = Number(p.rate) * 8;
    const px = new Int32Array(W), py = new Int32Array(W), pk = new Int8Array(W);
    const launch = (w: number) => {
      const k = Math.floor(rng() * K);
      const a = rng() * Math.PI * 2, r = R[k] + 4;
      pk[w] = k;
      px[w] = Math.max(1, Math.min(G - 2, Math.round(cx[k] + Math.cos(a) * r)));
      py[w] = Math.max(1, Math.min(G - 2, Math.round(cy[k] + Math.sin(a) * r)));
      if (occ[py[w] * G + px[w]] >= 0) px[w] = -1;
    };
    for (let w = 0; w < W; w++) launch(w);
    const ptsGeo = new THREE.BufferGeometry();
    const ptsPos = new Float32Array(W * 3);
    ptsGeo.setAttribute('position', new THREE.BufferAttribute(ptsPos, 3));
    const pts = new THREE.Points(ptsGeo, new THREE.PointsMaterial({ color: 0xffffff, size: Math.max(0.04, cell * 1.2), sizeAttenuation: true }));
    pts.frustumCulled = false;
    const helpers = new THREE.Group();
    helpers.add(pts);
    const rings: THREE.Mesh[] = [];
    for (let k = 0; k < K; k++) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64), new THREE.MeshBasicMaterial({ color: 0x5ad1ff, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(wx(cx[k]), 0.01, wx(cy[k]));
      rings.push(ring);
      helpers.add(ring);
    }

    let done = false, dim = NaN, ticks = 0;
    const estimateDim = () => {
      // 質量–半径法：各中心から半径 r 以内の自クラスタのセル数
      const rmax = Math.max(4, Math.min(...R) * 0.75);
      const radii: number[] = [];
      for (let r = 2; r <= rmax; r *= 1.3) radii.push(r);
      if (radii.length < 3) return NaN;
      const cnt = new Float64Array(radii.length);
      for (let j = 0; j < G; j++)
        for (let i = 0; i < G; i++) {
          const id = j * G + i;
          if (occ[id] < 0) continue;
          const k = owner[id];
          const d = Math.hypot(i - cx[k], j - cy[k]);
          for (let q = 0; q < radii.length; q++) if (d <= radii[q]) cnt[q]++;
        }
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      const m = radii.length;
      for (let q = 0; q < m; q++) {
        const x = Math.log(radii[q]), y = Math.log(cnt[q] / K);
        sx += x;
        sy += y;
        sxx += x * x;
        sxy += x * y;
      }
      return (m * sxy - sx * sy) / (m * sxx - sx * sx);
    };
    const tick = new Ticker(30);
    const before = new THREE.Group();
    const plate2 = new THREE.Mesh(new THREE.BoxGeometry(SIZE, 0.06, SIZE), new THREE.MeshStandardMaterial({ color: 0x2f4a2a, roughness: 1 }));
    plate2.position.y = -0.03;
    before.add(plate2);
    const seeds = new THREE.InstancedMesh(boxGeo.clone(), new THREE.MeshStandardMaterial({ color: 0xff5040 }), K);
    for (let k = 0; k < K; k++) seeds.setMatrixAt(k, new THREE.Matrix4().makeScale(cell * 2, 0.3, cell * 2).setPosition(wx(cx[k]), 0, wx(cy[k])));
    before.add(seeds);

    return {
      object,
      before,
      helpers,
      info: () => `市街地 ${n.toLocaleString()} セル · ウォーカー ${W} · 推定フラクタル次元 ${Number.isFinite(dim) ? dim.toFixed(2) : '—'}${done ? ' · 成長完了' : ''}`,
      update(dt, _t, live) {
        if (done) return;
        const steps = tick.steps(dt * Number(live.speed), 3);
        const stick = Number(live.stick);
        for (let s = 0; s < steps && !done; s++) {
          ticks++;
          for (let w = 0; w < W; w++) {
            if (px[w] < 0) {
              launch(w);
              continue;
            }
            for (let k = 0; k < 12; k++) {
              const x = px[w], y = py[w];
              // 隣が市街地なら確率で定着
              let touch = -1;
              for (let d = 0; d < 4; d++) {
                const o = occ[(y + DY[d]) * G + x + DX[d]];
                if (o >= 0) touch = owner[(y + DY[d]) * G + x + DX[d]];
              }
              if (touch >= 0 && rng() < stick) {
                place(x, y, touch);
                if (n >= cap || R[touch] > G / 2 - 6) done = true;
                launch(w);
                break;
              }
              const d = Math.floor(rng() * 4);
              const nx = x + DX[d], ny = y + DY[d];
              if (nx < 1 || ny < 1 || nx > G - 2 || ny > G - 2) {
                launch(w);
                break;
              }
              if (occ[ny * G + nx] >= 0) continue;
              px[w] = nx;
              py[w] = ny;
              // 迷い出たら放ち直す
              const kk = pk[w];
              if (Math.hypot(nx - cx[kk], ny - cy[kk]) > R[kk] * 2 + 16) {
                launch(w);
                break;
              }
            }
            if (done) break;
          }
          if (ticks % 30 === 0 || done) dim = estimateDim();
        }
        if (steps > 0) {
          mesh.count = n;
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
          mesh.computeBoundingSphere();
          for (let w = 0; w < W; w++) {
            ptsPos[w * 3] = px[w] < 0 ? 0 : wx(px[w]);
            ptsPos[w * 3 + 1] = px[w] < 0 ? -10 : 0.06;
            ptsPos[w * 3 + 2] = px[w] < 0 ? 0 : wx(py[w]);
          }
          ptsGeo.attributes.position.needsUpdate = true;
          rings.forEach((r, k) => r.scale.setScalar((R[k] + 4) * cell));
          pts.visible = !done;
        }
      },
    };
  },
});
