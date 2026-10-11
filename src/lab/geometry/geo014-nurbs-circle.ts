import * as THREE from 'three';
import { defineGeometryDemo } from '../framework/sceneLab';
import { Markers, SampledCurve, TubeLine, nurbsPoint, polyline } from '../framework/splineKit';

/** GEO-014 NURBS：重み付き有理Bスプライン。2次・9点・角の重み √2/2 で厳密な円になる */

const R = 2;
const CY = 2.2;

interface Preset {
  ctrl: THREE.Vector3[];
  /** 選択点（重みを変える点）の添字 */
  corners: number[];
  knots: number[];
  exactW: number;
  circle: boolean;
}

function preset(kind: string, sel: number): Preset {
  const v = (x: number, y: number) => new THREE.Vector3(x * R, CY + y * R, 0);
  if (kind === 'circle7') {
    // 外接正三角形：接点（重み1）と頂点（重み cos60°=1/2）を交互に
    const ctrl: THREE.Vector3[] = [];
    for (let k = 0; k < 3; k++) {
      const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
      ctrl.push(v(Math.cos(a), Math.sin(a)));
      const b = a + Math.PI / 3;
      ctrl.push(v(2 * Math.cos(b), 2 * Math.sin(b)));
    }
    ctrl.push(ctrl[0].clone());
    return { ctrl, corners: [1, 3, 5], knots: [0, 0, 0, 1 / 3, 1 / 3, 2 / 3, 2 / 3, 1, 1, 1], exactW: 0.5, circle: true };
  }
  if (kind === 'arc') {
    return { ctrl: [v(1, 0), v(1, 1), v(0, 1)], corners: [1], knots: [0, 0, 0, 1, 1, 1], exactW: Math.SQRT1_2, circle: true };
  }
  if (kind === 'free') {
    const ctrl = [v(-1.6, -0.6), v(-1.1, 0.8), v(-0.3, -0.7), v(0.3, 0.9), v(1.1, -0.6), v(1.6, 0.7)];
    const knots = [0, 0, 0, 0.25, 0.5, 0.75, 1, 1, 1];
    return { ctrl, corners: [Math.min(sel, ctrl.length - 1)], knots, exactW: 1, circle: false };
  }
  // 外接正方形の9点（角は重み cos45°）
  const sq: [number, number][] = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]];
  return { ctrl: sq.map(([x, y]) => v(x, y)), corners: [1, 3, 5, 7], knots: [0, 0, 0, 0.25, 0.25, 0.5, 0.5, 0.75, 0.75, 1, 1, 1], exactW: Math.SQRT1_2, circle: true };
}

export default defineGeometryDemo({
  id: 'GEO-014',
  notes: '有理式 Σ N_i w_i P_i / Σ N_i w_i を独自の有理 de Boor（Cox–de Boor 基底）で評価する。円プリセットでは角の重みが cos(半角)（9点なら √2/2）のとき半径誤差が 0 になり、ステータスに最大誤差を表示する。「非有理と比較」で重み1の同じ曲線（灰色）を重ね、比較表示では左に並べる。黄色い点が重みを変える点で、球の大きさが重み。',
  params: [
    { key: 'preset', label: '円プリセット', type: 'select', options: [{ value: 'circle9', label: '円（正方形・9点）' }, { value: 'circle7', label: '円（三角形・7点）' }, { value: 'arc', label: '4分の1円弧（3点）' }, { value: 'free', label: '自由曲線（重み実験）' }], default: 'circle9' },
    { key: 'weight', label: '選択点（角）の重み', type: 'number', min: 0.05, max: 4, step: 0.0001, default: Math.SQRT1_2 },
    { key: 'sel', label: '自由曲線で重みを変える点', type: 'number', min: 0, max: 5, step: 1, default: 3 },
    { key: 'animW', label: '重みを自動で往復', type: 'bool', default: false },
    { key: 'overlay', label: '非有理（重み1）と比較', type: 'bool', default: true },
  ],
  liveKeys: ['weight', 'animW', 'overlay'],
  extraActions: [{ key: 'exact', label: '重みを正確な値に', title: '円になる重み cos(半角) に戻す' }],
  onAction(key, p) {
    if (key === 'exact') return { weight: String(p.preset) === 'circle7' ? 0.5 : String(p.preset) === 'free' ? 1 : Math.SQRT1_2, animW: false };
  },
  distance: 9,
  elevation: 0.12,
  target: [0, CY, 0],
  compareLabels: ['非有理（重み1）', 'NURBS'],
  build(p, env) {
    const pr = preset(String(p.preset), Math.round(Number(p.sel)));
    const n = pr.ctrl.length;
    const segs = env.quality === 'low' ? 160 : 320;
    const weights = new Array(n).fill(1);
    const tube = new TubeLine(0x63e6a3, 0.06, segs, 8);
    const plain = new TubeLine(0x8890b0, 0.035, segs, 6, { transparent: true, opacity: 0.8 });
    const ref = (w: number[] | null) => new SampledCurve(Array.from({ length: segs + 1 }, (_, k) => nurbsPoint(pr.ctrl, w, 2, pr.knots, Math.min(k / segs, 1))));
    const plainCurve = ref(null);
    plain.set(plainCurve);
    const before = new TubeLine(0x8890b0, 0.06, segs, 8);
    before.set(plainCurve);
    const center = new THREE.Vector3(0, CY, 0);
    const radialErr = (c: SampledCurve) => c.pts.reduce((m, q) => Math.max(m, Math.abs(q.distanceTo(center) - R)), 0);
    const plainErr = radialErr(plainCurve);

    const helpers = new THREE.Group();
    helpers.add(polyline(pr.ctrl, 0x8890b0, { opacity: 0.8 }));
    if (pr.circle) {
      const circ = Array.from({ length: 129 }, (_, k) => new THREE.Vector3(Math.cos((k / 128) * Math.PI * 2) * R, CY + Math.sin((k / 128) * Math.PI * 2) * R, 0));
      helpers.add(polyline(circ, 0xffffff, { dashed: true, opacity: 0.55 }));
    }
    const marks = new Markers(n, 0.1);
    helpers.add(marks.mesh, plain.mesh);

    let wNow = NaN;
    let err = 0;
    const set = (w: number) => {
      if (w === wNow) return;
      wNow = w;
      weights.fill(1);
      for (const i of pr.corners) weights[i] = w;
      const c = ref(weights);
      tube.set(c);
      err = radialErr(c);
      pr.ctrl.forEach((q, i) => {
        const isSel = pr.corners.includes(i);
        marks.set(i, q, isSel ? 0xffd23d : 0xb0b8d8, isSel ? 0.6 + Math.sqrt(w) * 0.9 : 1);
      });
      marks.commit(n);
    };
    set(Number(p.weight));
    return {
      object: tube.mesh,
      before: before.mesh,
      helpers,
      info: () =>
        `重み ${wNow.toFixed(4)}` +
        (pr.circle
          ? `（円になる値 ${pr.exactW.toFixed(4)}） · 半径の最大誤差 NURBS ${err < 1e-12 ? err.toExponential(1) : err.toFixed(5)} / 非有理 ${plainErr.toFixed(4)}`
          : ` · 重みを上げるとその点へ引き寄せられ、0 に近づけると離れる`),
      update(_dt, time, live) {
        plain.mesh.visible = Boolean(live.overlay);
        set(live.animW ? Math.exp(Math.sin(time * 0.8) * 1.4) * (pr.circle ? pr.exactW : 1) : Number(live.weight));
      },
    };
  },
});
