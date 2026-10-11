import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';
import { DynLines, Markers, SampledCurve, TubeLine, coxDeBoor, knotDomain, makeKnots, nurbsPoint } from '../framework/splineKit';

/** GEO-013 Bスプライン：Cox–de Boor 基底で評価し、1つの制御点の影響範囲（局所性）を示す */

const N_CTRL = 9;

function baseCtrl(): THREE.Vector3[] {
  return Array.from({ length: N_CTRL }, (_, i) => {
    const s = i / (N_CTRL - 1);
    return new THREE.Vector3((s - 0.5) * 7, 1.6 + (i % 2 ? 1.1 : -0.9) + Math.sin(s * 5) * 0.3, Math.sin(s * Math.PI * 2) * 0.8);
  });
}

export default defineGeometryDemo({
  id: 'GEO-013',
  notes: 'Cox–de Boor の再帰式で基底 N_{i,p}(u) を評価して曲線を作る。選んだ制御点だけを上下に揺らし、その基底が非零になる区間 [u_i, u_{i+p+1}]（p+1 区間）を曲線上で赤く塗る。下段のグラフは全基底関数（選択中を黄色）で、白い小球はノット位置。クランプノットでは端点を通り、開いた一様ノットでは端点から離れる。',
  params: [
    { key: 'degree', label: '次数 p', type: 'number', min: 1, max: 5, step: 1, default: 3 },
    { key: 'knots', label: 'ノットの種類', type: 'select', options: [{ value: 'clamped', label: 'クランプ（両端 p+1 重）' }, { value: 'uniform', label: '開いた一様' }], default: 'clamped' },
    { key: 'sel', label: '動かす制御点', type: 'number', min: 0, max: N_CTRL - 1, step: 1, default: 4 },
    { key: 'amp', label: '揺らす量', type: 'number', min: 0, max: 2.5, step: 0.05, default: 1.2 },
  ],
  liveKeys: ['amp'],
  distance: 11,
  elevation: 0.2,
  target: [0, 0.6, 0],
  compareLabels: ['動かす前の曲線', '制御点を動かした曲線'],
  build(p, env) {
    const deg = Math.round(Number(p.degree));
    const kind = String(p.knots) === 'uniform' ? 'uniform' : 'clamped';
    const sel = Math.round(Number(p.sel));
    const knots = makeKnots(N_CTRL, deg, kind);
    const [u0, u1] = knotDomain(knots, deg, N_CTRL);
    const base = baseCtrl();
    const ctrl = base.map((v) => v.clone());
    const segs = env.quality === 'low' ? 120 : 220;
    // 定義域の右端は区間の外にならないよう僅かに内側で評価
    const uAt = (t: number) => u0 + (u1 - u0) * Math.min(t, 1 - 1e-9);
    const tube = new TubeLine(0xffffff, 0.07, segs, 8);
    // 曲線は等間隔の t でサンプリングして折れ線曲線に（チューブ側の弧長計算を軽くする）
    const sample = (cp: THREE.Vector3[]) => new SampledCurve(Array.from({ length: segs + 1 }, (_, k) => nurbsPoint(cp, null, deg, knots, uAt(k / segs))));
    let curve = sample(ctrl);
    tube.set(curve);
    const lo = knots[sel], hi = knots[sel + deg + 1];
    const hot = new THREE.Color(0xff5c5c), cold = new THREE.Color(0x5ab8ff);
    const paint = () => tube.colorRings((s, c) => {
      const N = coxDeBoor(sel, deg, uAt(curve.getUtoTmapping(s, 0)), knots);
      c.copy(cold).lerp(hot, Math.min(1, N * 2.2 + (N > 1e-9 ? 0.35 : 0)));
    });

    const helpers = new THREE.Group();
    const net = new DynLines(N_CTRL);
    const marks = new Markers(N_CTRL + knots.length, 0.1);
    helpers.add(net.lines, marks.mesh);
    // 基底関数のグラフ（曲線の下、x を u に対応させる）
    const gx0 = -3.5, gx1 = 3.5, gy = -1.6, gh = 1.4;
    const X = (u: number) => gx0 + ((u - knots[0]) / (knots[knots.length - 1] - knots[0])) * (gx1 - gx0);
    const graph = new DynLines(N_CTRL * 120 + 40);
    const c = new THREE.Color();
    const a = new THREE.Vector3(), b = new THREE.Vector3();
    for (let i = 0; i < N_CTRL; i++) {
      c.setHSL(i / N_CTRL, 0.55, 0.55);
      if (i === sel) c.set(0xffd23d);
      for (let k = 0; k < 120; k++) {
        const ua = knots[0] + ((knots[knots.length - 1] - knots[0]) * k) / 120;
        const ub = knots[0] + ((knots[knots.length - 1] - knots[0]) * (k + 1)) / 120;
        a.set(X(ua), gy + coxDeBoor(i, deg, Math.min(ua, 1 - 1e-9), knots) * gh, 0);
        b.set(X(ub), gy + coxDeBoor(i, deg, Math.min(ub, 1 - 1e-9), knots) * gh, 0);
        graph.seg(a, b, c);
      }
    }
    c.set(0x50587a);
    graph.seg(a.set(gx0, gy, 0), b.set(gx1, gy, 0), c);
    // 定義域と影響区間
    c.set(0xff5c5c);
    graph.seg(a.set(X(lo), gy - 0.15, 0), b.set(X(hi), gy - 0.15, 0), c);
    c.set(0xffffff);
    graph.seg(a.set(X(u0), gy - 0.3, 0), b.set(X(u1), gy - 0.3, 0), c);
    graph.commit();
    helpers.add(graph.lines);
    const knotMarks = new Markers(knots.length, 0.05);
    knots.forEach((k, i) => knotMarks.set(i, new THREE.Vector3(X(k), gy, 0), 0xffffff, 1));
    knotMarks.commit();
    helpers.add(knotMarks.mesh);

    const beforeTube = new TubeLine(0x8890b0, 0.07, segs, 8);
    beforeTube.set(sample(base));

    const knotOnCurve = new THREE.Vector3();
    const draw = () => {
      curve = sample(ctrl);
      tube.set(curve);
      paint();
      net.clear();
      net.polyline(ctrl, new THREE.Color(0x8890b0));
      net.commit();
      let m = 0;
      ctrl.forEach((q, i) => marks.set(m++, q, i === sel ? 0xffd23d : 0xb0b8d8, i === sel ? 1.6 : 1));
      // 曲線上のノット位置
      for (const k of knots) if (k >= u0 && k <= u1) marks.set(m++, nurbsPoint(ctrl, null, deg, knots, Math.min(k, u1 - 1e-9), knotOnCurve), 0xffffff, 0.55);
      marks.commit(m);
    };
    draw();
    return {
      object: tube.mesh,
      before: beforeTube.mesh,
      helpers,
      info: `次数 ${deg} · 制御点 ${N_CTRL} · ノット ${knots.length} 個 [${knots.map((k) => k.toFixed(2)).join(', ')}] · 点${sel} の影響区間 u∈[${lo.toFixed(2)}, ${hi.toFixed(2)}]（${deg + 1} 区間）`,
      update(_dt, time, live) {
        ctrl[sel].copy(base[sel]).add(new THREE.Vector3(0, Math.sin(time * 1.6) * Number(live.amp), Math.cos(time * 1.1) * Number(live.amp) * 0.3));
        draw();
      },
    };
  },
});
