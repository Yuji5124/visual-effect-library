import type { ParamValues } from '../../engine/types';
import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { hsl } from '../framework/crowdKit';
import { PointerTracker } from '../framework/steerKit';

const CURVES: Record<string, (u: number) => number> = {
  linear: (u) => u,
  easeIn: (u) => u * u * u,
  easeOut: (u) => 1 - (1 - u) ** 3,
  step: (u) => (u < 1 ? 0.15 : 1),
};

/** MOT-047 ヒットストップ：衝突で時間倍率を 0 にし、イージング曲線で 1 へ戻す。揺れは演出時間（実時間）で進める */
export default defineMotionDemo({
  id: 'MOT-047',
  notes: '箱の中を跳ねるボールが壁や他のボールに強く当たると、ゲーム時間の倍率を「停止時間」だけ 0 にし、その後「復帰の長さ」をかけて選んだ曲線で 1 に戻す。物理はゲーム時間 dt·倍率で進め、画面揺れと衝突の輪は実時間で進めるので、止まっている間も演出は動く。下のグラフが時間倍率の履歴。クリックでいちばん近いボールを弾く。',
  params: [
    { key: 'stop', label: '停止時間（秒）', type: 'number', min: 0, max: 0.4, step: 0.01, default: 0.09 },
    { key: 'recover', label: '復帰の長さ（秒）', type: 'number', min: 0, max: 1.5, step: 0.01, default: 0.35 },
    {
      key: 'curve', label: '復帰カーブ', type: 'select', default: 'easeIn',
      options: [{ value: 'linear', label: '線形' }, { value: 'easeIn', label: 'ゆっくり→速く' }, { value: 'easeOut', label: '速く→ゆっくり' }, { value: 'step', label: '段階' }],
    },
    { key: 'shake', label: '画面揺れ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.5 },
    { key: 'count', label: 'ボールの数', type: 'number', min: 1, max: 12, step: 1, default: 4 },
    { key: 'minHit', label: '反応する衝突の強さ', type: 'number', min: 0, max: 20, step: 0.5, default: 9 },
  ],
  resetKeys: ['count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    const balls = Array.from({ length: n }, (_, i) => {
      const a = env.rng() * Math.PI * 2, s = 8 + env.rng() * 6;
      return { x: (env.rng() * 2 - 1) * 6, y: (env.rng() * 2 - 1) * 3, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: 0.55 + env.rng() * 0.45, flash: 0, hue: i / n, trail: new Trail(120) };
    });
    let stopLeft = 0, recoverT = 1e9, scale = 1, shakeAmp = 0, realT = 0, hits = 0, frozenTotal = 0;
    const rings: { x: number; y: number; age: number }[] = [];
    const HIST = 240;
    const pt = new PointerTracker();
    const hist = new Float32Array(HIST).fill(1);
    let histHead = 0, histAcc = 0;
    const impact = (x: number, y: number, strength: number, p: ParamValues) => {
      if (strength < Number(p.minHit)) return;
      hits++;
      stopLeft = Number(p.stop);
      recoverT = 0;
      shakeAmp = Math.min(1.2, shakeAmp + strength * 0.05) * Number(p.shake);
      rings.push({ x, y, age: 0 });
      if (rings.length > 12) rings.shift();
    };
    const box = () => { const { w, h } = env.bounds(); return { W: w - 0.6, H: h - 3.4 }; };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        realT += dt;
        // 時間倍率：停止 → 曲線で復帰（実時間で進める）
        if (stopLeft > 0) { stopLeft -= dt; scale = 0; frozenTotal += dt; } else {
          recoverT += dt;
          const R = Number(p.recover);
          scale = R <= 0 ? 1 : Math.min(1, CURVES[String(p.curve)]?.(Math.min(1, recoverT / R)) ?? 1);
        }
        shakeAmp *= Math.exp(-dt * 9);
        for (const r of rings) r.age += dt;
        for (const b of balls) b.flash = Math.max(0, b.flash - dt * 4);
        histAcc += dt;
        if (histAcc >= 1 / 60) { histAcc = 0; hist[histHead] = scale; histHead = (histHead + 1) % HIST; }
        const gdt = dt * scale;
        if (gdt <= 0) return;
        const { W, H } = box();
        const yOff = 1.4;
        for (const b of balls) {
          b.vy -= 6 * gdt;
          const sp = Math.hypot(b.vx, b.vy);
          if (sp > 24) { b.vx *= 24 / sp; b.vy *= 24 / sp; }
          b.x += b.vx * gdt;
          b.y += b.vy * gdt;
          if (b.x < -W + b.r) { b.x = -W + b.r; impact(b.x - b.r, b.y, Math.abs(b.vx), p); b.vx = Math.abs(b.vx); b.flash = 1; }
          if (b.x > W - b.r) { b.x = W - b.r; impact(b.x + b.r, b.y, Math.abs(b.vx), p); b.vx = -Math.abs(b.vx); b.flash = 1; }
          if (b.y < -H + yOff + b.r) { b.y = -H + yOff + b.r; impact(b.x, b.y - b.r, Math.abs(b.vy), p); b.vy = Math.max(Math.abs(b.vy), 9); b.flash = 1; }
          if (b.y > H + yOff - b.r) { b.y = H + yOff - b.r; impact(b.x, b.y + b.r, Math.abs(b.vy), p); b.vy = -Math.abs(b.vy); b.flash = 1; }
          b.trail.push(b.x, b.y);
        }
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
          const a = balls[i], c = balls[j];
          const dx = c.x - a.x, dy = c.y - a.y, d = Math.hypot(dx, dy), rr = a.r + c.r;
          if (d < rr && d > 1e-6) {
            const nx = dx / d, ny = dy / d;
            const rel = (a.vx - c.vx) * nx + (a.vy - c.vy) * ny;
            const ov = (rr - d) / 2;
            a.x -= nx * ov; a.y -= ny * ov; c.x += nx * ov; c.y += ny * ov;
            if (rel > 0) {
              const ma = a.r * a.r, mc = c.r * c.r, jimp = (2 * rel) / (ma + mc);
              a.vx -= jimp * mc * nx; a.vy -= jimp * mc * ny;
              c.vx += jimp * ma * nx; c.vy += jimp * ma * ny;
              a.flash = c.flash = 1;
              impact(a.x + nx * a.r, a.y + ny * a.r, rel * 1.5, p);
            }
          }
        }
      },
      draw(g, p) {
        // 画面揺れ：すべての座標をずらして描く
        const sx = Math.sin(realT * 71) * shakeAmp * 0.6, sy = Math.cos(realT * 53) * shakeAmp * 0.6;
        const { W, H } = box();
        const { w, h } = env.bounds();
        g.rect(-W + sx, -H + 1.4 + sy, W * 2, H * 2, scale < 0.05 ? 0xffffff : 0x555a80);
        for (const r of rings) {
          const k = Math.min(1, r.age / 0.4);
          if (k < 1) g.circle(r.x + sx, r.y + sy, 0.3 + k * 1.8, 0xffd166, { alpha: 1 - k });
        }
        for (const b of balls) {
          const col = hsl(b.hue, 0.7, 0.6);
          if (p.showTrails) {
            const pts = b.trail.points().slice();
            for (let i = 0; i < pts.length; i += 2) { pts[i] += sx; pts[i + 1] += sy; }
            g.polyline(pts, col, { fade: true, alpha: 0.6 });
          }
          g.circle(b.x + sx, b.y + sy, b.r, b.flash > 0.5 && scale < 0.05 ? 0xffffff : col, { fill: true });
        }
        // 時間倍率の履歴（4秒）
        const gx0 = -w + 0.6, gw = 2 * w - 1.2, gy0 = -h + 0.4, gh = 1.6;
        g.rect(gx0, gy0, gw, gh, 0x2a2f50);
        const pts = new Float32Array(HIST * 2);
        for (let k = 0; k < HIST; k++) {
          const v = hist[(histHead + k) % HIST];
          pts[k * 2] = gx0 + (k / (HIST - 1)) * gw;
          pts[k * 2 + 1] = gy0 + v * gh;
        }
        g.polyline(pts, 0x7dff8a);
        g.rect(gx0 + gw - 0.3, gy0, 0.3, scale * gh, scale < 0.05 ? 0xff4d6d : 0x7dff8a, { fill: true });
      },
      pointer(x, y, down) {
        if (pt.update(down) !== 'press') return;
        let best = balls[0], bd = Infinity;
        for (const b of balls) { const d = Math.hypot(b.x - x, b.y - y); if (d < bd) { bd = d; best = b; } }
        const dx = best.x - x, dy = best.y - y, d = Math.hypot(dx, dy) || 1;
        best.vx += (dx / d) * 10;
        best.vy += (dy / d) * 10;
      },
      status() {
        return `時間倍率 ${scale.toFixed(2)} · ${stopLeft > 0 ? '停止中 · ' : ''}ヒット ${hits} · 止まっていた合計 ${frozenTotal.toFixed(2)}s / 実時間 ${realT.toFixed(1)}s · クリックでボールを弾く`;
      },
    };
  },
});
