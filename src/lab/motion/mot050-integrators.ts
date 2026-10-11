import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';

type Method = 'euler' | 'semi' | 'verlet' | 'rk4';
interface Integ { m: Method; label: string; color: number; s: Float64Array; ax: number; ay: number; trail: Trail; err: number[]; dead: boolean; nextPush: number }

/** 重力加速度（GM=1、太陽は原点） */
function accel(x: number, y: number): [number, number] {
  const r2 = x * x + y * y, r = Math.sqrt(r2), k = -1 / (r2 * r);
  return [x * k, y * k];
}
const energy = (s: Float64Array) => 0.5 * (s[2] * s[2] + s[3] * s[3]) - 1 / Math.hypot(s[0], s[1]);

function advance(it: Integ, h: number): void {
  const s = it.s;
  if (it.m === 'euler') {
    const [ax, ay] = accel(s[0], s[1]);
    s[0] += s[2] * h; s[1] += s[3] * h;
    s[2] += ax * h; s[3] += ay * h;
  } else if (it.m === 'semi') {
    const [ax, ay] = accel(s[0], s[1]);
    s[2] += ax * h; s[3] += ay * h;
    s[0] += s[2] * h; s[1] += s[3] * h;
  } else if (it.m === 'verlet') {
    s[0] += s[2] * h + 0.5 * it.ax * h * h;
    s[1] += s[3] * h + 0.5 * it.ay * h * h;
    const [ax, ay] = accel(s[0], s[1]);
    s[2] += 0.5 * (it.ax + ax) * h; s[3] += 0.5 * (it.ay + ay) * h;
    it.ax = ax; it.ay = ay;
  } else {
    const f = (x: number, y: number, vx: number, vy: number) => { const [ax, ay] = accel(x, y); return [vx, vy, ax, ay]; };
    const k1 = f(s[0], s[1], s[2], s[3]);
    const k2 = f(s[0] + k1[0] * h / 2, s[1] + k1[1] * h / 2, s[2] + k1[2] * h / 2, s[3] + k1[3] * h / 2);
    const k3 = f(s[0] + k2[0] * h / 2, s[1] + k2[1] * h / 2, s[2] + k2[2] * h / 2, s[3] + k2[3] * h / 2);
    const k4 = f(s[0] + k3[0] * h, s[1] + k3[1] * h, s[2] + k3[2] * h, s[3] + k3[3] * h);
    for (let i = 0; i < 4; i++) s[i] += (h / 6) * (k1[i] + 2 * k2[i] + 2 * k3[i] + k4[i]);
  }
}

const DEFS: [Method, string, number][] = [
  ['euler', '前進オイラー', 0xff4d6d],
  ['semi', '半陰的オイラー', 0xffd166],
  ['verlet', '速度ベルレ', 0x7dff8a],
  ['rk4', 'RK4', 0x5ab8ff],
];

/** MOT-050 数値積分法の比較：同じケプラー軌道を4つの方法で積分し、全エネルギーの相対誤差を比べる */
export default defineMotionDemo({
  id: 'MOT-050',
  notes: '太陽（GM=1）を回る同じ初期条件（近点から離心率 e の速度）を、前進オイラー・半陰的オイラー・速度ベルレ・RK4 で刻み幅 h ごとに積分する。左が軌道（白は解析解の楕円）、右が全エネルギー E=v²/2−1/r の相対誤差 |E−E₀|/|E₀| の時間変化（縦軸は log10、−12〜+1）。オイラーは外へ広がり、シンプレクティックな2つは誤差が振動するだけで増えず、RK4 は小さいがゆっくり減衰する。クリックした方向・距離を新しい近点にして再スタート。',
  params: [
    { key: 'h', label: '刻み幅 h', type: 'number', min: 0.002, max: 0.3, step: 0.001, default: 0.05 },
    {
      key: 'show', label: '表示する積分法', type: 'select', default: 'all',
      options: [{ value: 'all', label: 'すべて' }, ...DEFS.map(([m, l]) => ({ value: m, label: l }))],
    },
    { key: 'ecc', label: '軌道の離心率', type: 'number', min: 0, max: 0.9, step: 0.01, default: 0.6 },
    { key: 'rate', label: 'シミュレーションの速さ（時間/秒）', type: 'number', min: 0.5, max: 30, step: 0.5, default: 4 },
  ],
  resetKeys: ['h', 'ecc'],
  create(env, p0) {
    const e = Number(p0.ecc), h = Number(p0.h);
    let rp = 1 - e, ang = 0;
    let E0 = -0.5;
    const its: Integ[] = DEFS.map(([m, label, color]) => ({ m, label, color, s: new Float64Array(4), ax: 0, ay: 0, trail: new Trail(1200), err: [], dead: false, nextPush: 0 }));
    let t = 0, acc = 0, sampleDt = 0.05, nextSample = 0;
    const MAXS = 1600;
    const restart = () => {
      const v = Math.sqrt((1 + e) / rp);
      for (const it of its) {
        it.s[0] = Math.cos(ang) * rp; it.s[1] = Math.sin(ang) * rp;
        it.s[2] = -Math.sin(ang) * v; it.s[3] = Math.cos(ang) * v;
        [it.ax, it.ay] = accel(it.s[0], it.s[1]);
        it.trail.clear(); it.err = []; it.dead = false; it.nextPush = 0;
      }
      E0 = energy(its[0].s);
      t = 0; acc = 0; sampleDt = 0.05; nextSample = 0;
    };
    restart();
    const view = () => {
      const { w, h: hh } = env.bounds();
      const b = Math.sqrt(1 - e * e);
      const S = Math.min(w * 0.5 - 1.2, (hh - 1.2) / Math.max(b, 0.45));
      return { S, sunX: -w * 0.5 + e * S, sunY: 0, w, hh };
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        acc += dt * Number(p.rate);
        let n = 0;
        while (acc >= h && n++ < 3000) {
          acc -= h;
          t += h;
          for (const it of its) {
            if (it.dead) continue;
            advance(it, h);
            const r = Math.hypot(it.s[0], it.s[1]);
            if (!(r < 40 && r > 1e-3)) it.dead = true;
            if (t >= it.nextPush) { it.trail.push(it.s[0], it.s[1]); it.nextPush = t + 0.03; }
          }
          if (t >= nextSample) {
            nextSample = t + sampleDt;
            for (const it of its) it.err.push(it.dead ? NaN : Math.abs((energy(it.s) - E0) / E0));
            // 多くなったら半分に間引いて時間軸を伸ばす
            if (its[0].err.length >= MAXS) {
              for (const it of its) it.err = it.err.filter((_, i) => i % 2 === 0);
              sampleDt *= 2;
            }
          }
        }
      },
      draw(g, p) {
        const { S, sunX, sunY, w, hh } = view();
        const show = String(p.show);
        // 解析解の楕円（焦点が太陽、近点方向 ang）
        const a = rp / (1 - e), b = a * Math.sqrt(1 - e * e);
        const cx = sunX - Math.cos(ang) * a * e * S, cy = sunY - Math.sin(ang) * a * e * S;
        const ell: number[] = [];
        for (let k = 0; k <= 96; k++) {
          const u = (k / 96) * Math.PI * 2, ex = Math.cos(u) * a * S, ey = Math.sin(u) * b * S;
          ell.push(cx + ex * Math.cos(ang) - ey * Math.sin(ang), cy + ex * Math.sin(ang) + ey * Math.cos(ang));
        }
        g.polyline(ell, 0xffffff, { alpha: 0.35 });
        g.circle(sunX, sunY, 0.35, 0xffe08a, { fill: true });
        for (const it of its) {
          if (show !== 'all' && show !== it.m) continue;
          if (p.showTrails) {
            const pts = it.trail.points().slice();
            for (let k = 0; k < pts.length; k += 2) { pts[k] = sunX + pts[k] * S; pts[k + 1] = sunY + pts[k + 1] * S; }
            g.polyline(pts, it.color, { fade: true, alpha: 0.85 });
          }
          g.circle(sunX + it.s[0] * S, sunY + it.s[1] * S, 0.25, it.color, { fill: true });
        }
        // 右：エネルギー誤差（log10）
        const gx0 = 0.6, gx1 = w - 0.5, gy0 = -hh + 1, gy1 = hh - 1;
        const LO = -12, HI = 1;
        g.rect(gx0, gy0, gx1 - gx0, gy1 - gy0, 0x2a2f50);
        for (let d = LO; d <= HI; d += 2) {
          const y = gy0 + ((d - LO) / (HI - LO)) * (gy1 - gy0);
          g.line(gx0, y, gx1, y, 0x1d2238);
        }
        const nS = its[0].err.length;
        for (const it of its) {
          if (show !== 'all' && show !== it.m) continue;
          const pts: number[] = [];
          for (let k = 0; k < nS; k++) {
            const v = it.err[k];
            if (!(v >= 0)) break;
            const l = Math.max(LO, Math.min(HI, Math.log10(v + 1e-16)));
            pts.push(gx0 + (k / Math.max(1, MAXS - 1)) * (gx1 - gx0), gy0 + ((l - LO) / (HI - LO)) * (gy1 - gy0));
          }
          g.polyline(pts, it.color);
        }
      },
      pointer(x, y, down) {
        if (!down) return;
        const { S, sunX, sunY } = view();
        const dx = (x - sunX) / S, dy = (y - sunY) / S;
        // 長半径が大きくなりすぎないよう近点距離を制限
        rp = Math.max(0.15, Math.min(1.3 * (1 - e), Math.hypot(dx, dy)));
        ang = Math.atan2(dy, dx);
        restart();
      },
      status() {
        const period = 2 * Math.PI * Math.pow(rp / (1 - e), 1.5);
        const last = (it: Integ) => {
          if (it.dead) return '発散';
          const v = it.err[it.err.length - 1];
          return v === undefined ? '-' : v.toExponential(1);
        };
        return `t=${t.toFixed(1)}（${(t / period).toFixed(1)} 周）· 1周 ${Math.round(period / h)} 歩 · 相対誤差：${its.map((it) => `${it.label} ${last(it)}`).join(' / ')} · クリックで近点を変更`;
      },
    };
  },
});
