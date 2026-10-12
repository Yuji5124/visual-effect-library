import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { clamp } from '../framework/crowdKit';

const G = 9.81, MC = 1.0, MP = 0.3, HL = 0.6; // 台車・棒の質量、棒の半長（m）
const S = 4.2; // 1 m を何ワールド単位で描くか

/** 台車倒立振子の運動方程式。θ は真上からの傾き（右に倒れると正） */
function accel(th: number, om: number, f: number): [number, number] {
  const sin = Math.sin(th), cos = Math.cos(th);
  const total = MC + MP;
  const tmp = (f + MP * HL * om * om * sin) / total;
  const thAcc = (G * sin - cos * tmp) / (HL * (4 / 3 - (MP * cos * cos) / total));
  const xAcc = tmp - (MP * HL * thAcc * cos) / total;
  return [xAcc, thAcc];
}

/** MOT-028 倒立振子：PD 制御＋位置の戻しで台車の上の棒を立て続ける */
export default defineMotionDemo({
  id: 'MOT-028',
  notes: '台車と棒の運動方程式（台車倒立振子）を細かい刻みで数値積分し、制御は30ms周期で更新。台車を押す力 F = Kθ·θ + Kω·θ˙ + Kx·(x−目標) + Kv·x˙ で棒を立てる。ゲインが小さいと倒れ、大きいと振動する。画面の上半分をクリックすると棒を突き（外乱）、下半分をクリックすると台車の目標位置が移る。',
  params: [
    { key: 'kp', label: '角度ゲイン Kθ', type: 'number', min: 0, max: 200, step: 0.5, default: 45 },
    { key: 'kd', label: '角速度ゲイン Kω', type: 'number', min: 0, max: 40, step: 0.1, default: 9 },
    { key: 'kx', label: '位置ゲイン Kx', type: 'number', min: 0, max: 10, step: 0.05, default: 1.6 },
    { key: 'kv', label: '速度ゲイン Kv', type: 'number', min: 0, max: 10, step: 0.05, default: 2.6 },
    { key: 'noise', label: '外乱（ランダムな力）', type: 'number', min: 0, max: 20, step: 0.1, default: 2 },
    { key: 'fmax', label: '最大の力（N）', type: 'number', min: 5, max: 100, step: 1, default: 40 },
  ],
  create(env) {
    let x = 0, v = 0, th = 0.12, om = 0, force = 0;
    let target = 0, fallen = 0, falls = 0, t = 0, nz = 0, ctl = 0;
    const tip = new Trail(260);
    const reset = () => {
      x = 0; v = 0; th = (env.rng() - 0.5) * 0.3; om = 0; fallen = 0;
    };
    return {
      step(dt, p) {
        t += dt;
        const sub = 8, h = dt / sub;
        // 外乱はゆっくり変わる乱数
        nz += ((env.rng() * 2 - 1) * Number(p.noise) - nz) * Math.min(1, dt * 8);
        for (let i = 0; i < sub; i++) {
          // 制御は 30ms 周期で更新し、間は同じ力を保つ（実機と同じく遅れがあるので高ゲインで振動する）
          ctl += h;
          if (ctl >= 0.03) {
            ctl -= 0.03;
            let f = 0;
            if (!fallen) f = Number(p.kp) * th + Number(p.kd) * om + Number(p.kx) * (x - target) + Number(p.kv) * v;
            force = clamp(f, -Number(p.fmax), Number(p.fmax));
          }
          const [xa, ta] = accel(th, om, force + nz);
          v += xa * h;
          x += v * h;
          om += ta * h;
          th += om * h;
          // レールの端
          const lim = env.bounds().w / S - 0.4;
          if (Math.abs(x) > lim) { x = Math.sign(x) * lim; v = -v * 0.3; }
          if (fallen) { om *= 0.995; th = clamp(th, -Math.PI / 2, Math.PI / 2); if (Math.abs(th) >= Math.PI / 2) om = 0; }
        }
        if (!fallen && Math.abs(th) > 1.0) { fallen = t; falls++; }
        if (fallen && t - fallen > 1.6) reset();
        tip.push(x * S + Math.sin(th) * HL * 2 * S, -4 + Math.cos(th) * HL * 2 * S);
      },
      draw(g, p) {
        g.grid(1);
        const { w } = env.bounds();
        const y0 = -4;
        g.line(-w, y0 - 0.55, w, y0 - 0.55, 0x5a6390);
        g.line(target * S, y0 - 1.2, target * S, y0 - 0.6, 0xffd166);
        g.circle(target * S, y0 - 1.3, 0.12, 0xffd166, { fill: true });
        const cx = x * S;
        g.rect(cx - 1.1, y0 - 0.45, 2.2, 0.9, fallen ? 0x804050 : 0x6fd3ff, { fill: true });
        g.circle(cx - 0.7, y0 - 0.5, 0.2, 0x222638, { fill: true });
        g.circle(cx + 0.7, y0 - 0.5, 0.2, 0x222638, { fill: true });
        const ex = cx + Math.sin(th) * HL * 2 * S, ey = y0 + Math.cos(th) * HL * 2 * S;
        g.line(cx, y0, ex, ey, fallen ? 0xff3355 : 0xffffff);
        g.circle(ex, ey, 0.3, fallen ? 0xff3355 : 0xffd166, { fill: true });
        g.circle(cx, y0, 0.12, 0xffffff, { fill: true });
        // 制御力と外乱の矢印
        g.arrow(cx, y0 + 0.9, force * 0.08, 0, 0x7dff8a);
        g.arrow(cx, y0 + 1.3, nz * 0.08, 0, 0xff8a5a);
        // 鉛直の基準線
        g.line(cx, y0, cx, y0 + HL * 2 * S, 0x444a70, 0.6);
        if (p.showTrails) g.polyline(tip.points(), 0xffd166, { fade: true, alpha: 0.6 });
      },
      pointer(px, py, down, _p) {
        if (!down) return;
        if (py > -2) {
          // 棒を突く：クリックが棒より右なら左へ押す
          const ex = x * S + Math.sin(th) * HL * 2 * S;
          om += px > ex ? -1.6 : 1.6;
        } else {
          target = clamp(px / S, -(env.bounds().w / S - 1), env.bounds().w / S - 1);
        }
      },
      action(key) {
        if (key === 'poke') om += (env.rng() < 0.5 ? -1 : 1) * 2.2;
      },
      status() {
        return `θ ${((th * 180) / Math.PI).toFixed(1)}° · θ˙ ${om.toFixed(2)} rad/s · x ${x.toFixed(2)} m · F ${force.toFixed(1)} N · 転倒 ${falls} 回 · 上半分クリック=突く／下半分=目標位置`;
      },
    };
  },
  extraActions: [{ key: 'poke', label: '👉 棒を突く' }],
});
