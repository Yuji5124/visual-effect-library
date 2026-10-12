import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { PointerTracker } from '../framework/steerKit';

/** MOT-005 慣性スクロール：ドラッグ履歴から最小二乗で速度を推定し、指数減速で滑らせる */
export default defineMotionDemo({
  id: 'MOT-005',
  notes: 'ドラッグ中の位置履歴（直近の窓）に直線を最小二乗で当てはめて離した瞬間の速度を推定し、v ← v·e^(−μ·dt)（位置は厳密解で更新）で滑らせる。破線の予測経路と ✕ の予測停止点（壁なしなら距離 v/μ）が実際の停止位置と一致する。触らない間は自動で投げる。',
  params: [
    { key: 'friction', label: '摩擦係数 μ（1/秒）', type: 'number', min: 0.2, max: 8, step: 0.05, default: 1.6 },
    { key: 'restitution', label: '壁の反発', type: 'number', min: 0, max: 1, step: 0.01, default: 0.7 },
    { key: 'window', label: '速度推定の窓（秒）', type: 'number', min: 0.03, max: 0.4, step: 0.01, default: 0.1 },
  ],
  create(env) {
    const pt = new PointerTracker();
    const puck = { x: 0, y: 0, vx: 0, vy: 0, r: 0.8 };
    const trail = new Trail(400);
    let dragging = false;
    let grabDx = 0, grabDy = 0;
    let hist: number[] = []; // t,x,y
    let clock = 0, idle = 1.5;
    let pred: number[] = [];
    let releaseX = 0, releaseY = 0, travelled = 0, predicted = 0, fitV = 0;
    let fitLine: number[] = [];
    const box = () => {
      const { w } = env.bounds();
      return { hw: w - 0.8, hh: 9.2 };
    };
    // 摩擦の厳密解で1ステップ進め、壁で反射
    const advance = (s: { x: number; y: number; vx: number; vy: number }, dt: number, mu: number, e: number): number => {
      const k = Math.exp(-mu * dt);
      const f = (1 - k) / mu;
      const ox = s.x, oy = s.y;
      s.x += s.vx * f;
      s.y += s.vy * f;
      s.vx *= k;
      s.vy *= k;
      const { hw, hh } = box();
      const r = puck.r;
      if (s.x > hw - r) { s.x = hw - r - (s.x - (hw - r)) * e; s.vx = -Math.abs(s.vx) * e; }
      if (s.x < -hw + r) { s.x = -hw + r + (-hw + r - s.x) * e; s.vx = Math.abs(s.vx) * e; }
      if (s.y > hh - r) { s.y = hh - r - (s.y - (hh - r)) * e; s.vy = -Math.abs(s.vy) * e; }
      if (s.y < -hh + r) { s.y = -hh + r + (-hh + r - s.y) * e; s.vy = Math.abs(s.vy) * e; }
      return Math.hypot(s.x - ox, s.y - oy);
    };
    const predict = (mu: number, e: number) => {
      const s = { x: puck.x, y: puck.y, vx: puck.vx, vy: puck.vy };
      pred = [s.x, s.y];
      predicted = 0;
      for (let i = 0; i < 1200 && Math.hypot(s.vx, s.vy) > 0.01; i++) {
        predicted += advance(s, 1 / 60, mu, e);
        if (i % 2 === 0) pred.push(s.x, s.y);
      }
      pred.push(s.x, s.y);
      releaseX = puck.x;
      releaseY = puck.y;
      travelled = 0;
    };
    // 最小二乗：x(t) = a + b t の傾き b を速度とする
    const fit = (win: number): [number, number] => {
      const tEnd = hist[hist.length - 3];
      let n = 0, st = 0, sx = 0, sy = 0, stt = 0, stx = 0, sty = 0;
      for (let i = 0; i < hist.length; i += 3) {
        const t = hist[i] - tEnd;
        if (t < -win) continue;
        n++; st += t; sx += hist[i + 1]; sy += hist[i + 2]; stt += t * t; stx += t * hist[i + 1]; sty += t * hist[i + 2];
      }
      const den = n * stt - st * st;
      if (n < 2 || Math.abs(den) < 1e-12) return [0, 0];
      const bx = (n * stx - st * sx) / den, by = (n * sty - st * sy) / den;
      const ax = (sx - bx * st) / n, ay = (sy - by * st) / n;
      fitLine = [ax + bx * -win, ay + by * -win, ax, ay];
      return [bx, by];
    };
    return {
      step(dt, p) {
        clock += dt;
        const mu = Number(p.friction), e = Number(p.restitution);
        if (dragging) {
          trail.push(puck.x, puck.y);
          return;
        }
        idle += dt;
        const speed = Math.hypot(puck.vx, puck.vy);
        if (idle > 3 && speed < 0.05) {
          // 自動で投げる（窓内の履歴を合成して推定を通す）
          const a = env.rng() * Math.PI * 2, s = 8 + env.rng() * 14;
          puck.vx = Math.cos(a) * s;
          puck.vy = Math.sin(a) * s;
          fitV = s;
          hist = [];
          fitLine = [puck.x - puck.vx * 0.1, puck.y - puck.vy * 0.1, puck.x, puck.y];
          predict(mu, e);
          idle = 0;
        }
        travelled += advance(puck, dt, mu, e);
        trail.push(puck.x, puck.y);
      },
      draw(g, p) {
        g.grid(1);
        const { hw, hh } = box();
        g.rect(-hw, -hh, hw * 2, hh * 2, 0x8890c0);
        if (p.showTrails) g.polyline(trail.points(), 0x4ad8ff, { fade: true });
        // 予測経路（破線）と予測停止点
        for (let i = 2; i < pred.length; i += 4) g.line(pred[i - 2], pred[i - 1], pred[i], pred[i + 1] ?? pred[i - 1], 0xffd36b, 0.7);
        if (pred.length >= 2) {
          const ex = pred[pred.length - 2], ey = pred[pred.length - 1];
          g.line(ex - 0.4, ey - 0.4, ex + 0.4, ey + 0.4, 0xffd36b);
          g.line(ex - 0.4, ey + 0.4, ex + 0.4, ey - 0.4, 0xffd36b);
          g.circle(releaseX, releaseY, 0.15, 0xffd36b, { fill: true, alpha: 0.6 });
        }
        // ドラッグ履歴の点と当てはめ直線
        for (let i = 0; i < hist.length; i += 3) g.circle(hist[i + 1], hist[i + 2], 0.07, 0xff7dc0, { fill: true });
        if (fitLine.length) g.line(fitLine[0], fitLine[1], fitLine[2], fitLine[3], 0xff7dc0);
        g.circle(puck.x, puck.y, puck.r, dragging ? 0xffffff : 0x4ad8ff, { fill: true });
        g.arrow(puck.x, puck.y, puck.vx * 0.15, puck.vy * 0.15, 0xffa040);
      },
      pointer(x, y, down, p) {
        const ev = pt.update(down);
        if (ev === 'press') {
          dragging = true;
          idle = 0;
          if (Math.hypot(x - puck.x, y - puck.y) > puck.r * 1.5) {
            puck.x = x; puck.y = y;
          }
          grabDx = puck.x - x;
          grabDy = puck.y - y;
          puck.vx = puck.vy = 0;
          hist = [clock, puck.x, puck.y];
          pred = [];
          fitLine = [];
        } else if (ev === 'drag' && dragging) {
          puck.x = x + grabDx;
          puck.y = y + grabDy;
          hist.push(clock, puck.x, puck.y);
          // 古い履歴は捨てる
          while (hist.length > 3 && clock - hist[0] > 0.6) hist.splice(0, 3);
        } else if (ev === 'release' && dragging) {
          dragging = false;
          idle = 0;
          hist.push(clock, puck.x, puck.y);
          const [vx, vy] = fit(Number(p.window));
          puck.vx = vx;
          puck.vy = vy;
          fitV = Math.hypot(vx, vy);
          predict(Number(p.friction), Number(p.restitution));
        }
      },
      status(p) {
        const mu = Number(p.friction);
        return `推定速度 ${fitV.toFixed(2)} · 予測距離 v/μ=${(fitV / mu).toFixed(2)}（壁込み ${predicted.toFixed(2)}）· 実際 ${travelled.toFixed(2)} · ドラッグして離すと滑る`;
      },
    };
  },
});
