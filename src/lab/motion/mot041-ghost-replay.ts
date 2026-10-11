import type { ParamValues } from '../../engine/types';
import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { hsl } from '../framework/crowdKit';
import { PointerTracker } from '../framework/steerKit';

interface Clip {
  /** 粗いサンプル（t, x, y の組） */
  s: number[];
  /** 誤差測定用の細かい記録（毎ステップ） */
  fine: number[];
  dur: number;
  hue: number;
}

/** 時刻 t の位置を前後のサンプルから線形補間 */
function sampleAt(s: number[], t: number): [number, number] {
  const n = s.length / 3;
  if (n === 0) return [0, 0];
  if (t <= s[0]) return [s[1], s[2]];
  if (t >= s[(n - 1) * 3]) return [s[(n - 1) * 3 + 1], s[(n - 1) * 3 + 2]];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (s[m * 3] <= t) lo = m; else hi = m; }
  const u = (t - s[lo * 3]) / (s[hi * 3] - s[lo * 3] || 1);
  return [s[lo * 3 + 1] + (s[hi * 3 + 1] - s[lo * 3 + 1]) * u, s[lo * 3 + 2] + (s[hi * 3 + 2] - s[lo * 3 + 2]) * u];
}

/** MOT-041 軌跡の記録と再生：操作の結果を時刻つきサンプルで保存し、ゴーストとして重ねて再生 */
export default defineMotionDemo({
  id: 'MOT-041',
  notes: 'プレイヤー（黄）の位置を「サンプル間隔」ごとに時刻つきで記録し、1周（周回の長さ）ごとに区切ってゴーストとして保存する。ゴーストは再生速度に応じた時刻で前後のサンプルを線形補間して動き、点がサンプル位置。間隔を粗くすると実際の軌跡（細線）とのずれが status の補間誤差に出る。ドラッグで操作、離すと自動操縦。',
  params: [
    { key: 'interval', label: 'サンプル間隔（秒）', type: 'number', min: 0.02, max: 1, step: 0.01, default: 0.1 },
    { key: 'ghosts', label: 'ゴーストの数', type: 'number', min: 1, max: 8, step: 1, default: 4 },
    { key: 'playSpeed', label: '再生速度', type: 'number', min: 0.25, max: 3, step: 0.05, default: 1 },
    { key: 'lap', label: '周回の長さ（秒）', type: 'number', min: 2, max: 12, step: 0.5, default: 5 },
  ],
  create(env) {
    const pl = { x: 0, y: 0, vx: 0, vy: 0 };
    let wx = 0, wy = 0, px = 0, py = 0, dragging = false;
    const pt = new PointerTracker();
    let recording = true;
    let cur: Clip | null = null;
    let lapT = 0, sinceSample = 0, playT = 0, clipCount = 0;
    const clips: Clip[] = [];
    const trail = new Trail(400);
    let lastErr = 0;
    const newWaypoint = () => {
      const { w, h } = env.bounds();
      wx = (env.rng() * 2 - 1) * (w - 2);
      wy = (env.rng() * 2 - 1) * (h - 2);
    };
    newWaypoint();
    const startClip = () => {
      cur = { s: [], fine: [], dur: 0, hue: (clipCount++ * 0.17) % 1 };
      lapT = 0;
      sinceSample = Infinity;
    };
    startClip();
    const measureErr = (c: Clip) => {
      let e = 0;
      for (let i = 0; i < c.fine.length; i += 3) {
        const [x, y] = sampleAt(c.s, c.fine[i]);
        e = Math.max(e, Math.hypot(x - c.fine[i + 1], y - c.fine[i + 2]));
      }
      return e;
    };
    const finishClip = (p: ParamValues) => {
      if (!cur || cur.s.length < 6) return;
      // 終点も必ずサンプルに入れる
      cur.s.push(lapT, pl.x, pl.y);
      cur.dur = lapT;
      lastErr = measureErr(cur);
      clips.push(cur);
      while (clips.length > Math.round(Number(p.ghosts))) clips.shift();
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        // プレイヤー：ドラッグ中はポインタへ、そうでなければ乱数の経由点へ
        const tx = dragging ? px : wx, ty = dragging ? py : wy;
        const dx = tx - pl.x, dy = ty - pl.y, d = Math.hypot(dx, dy);
        if (!dragging && d < 1) newWaypoint();
        const want = dragging ? Math.min(14, d * 6) : 6;
        const ax = (d > 1e-6 ? (dx / d) * want : 0) - pl.vx, ay = (d > 1e-6 ? (dy / d) * want : 0) - pl.vy;
        pl.vx += ax * Math.min(1, dt * 4);
        pl.vy += ay * Math.min(1, dt * 4);
        pl.x += pl.vx * dt;
        pl.y += pl.vy * dt;
        trail.push(pl.x, pl.y);
        if (recording && cur) {
          lapT += dt;
          sinceSample += dt;
          cur.fine.push(lapT, pl.x, pl.y);
          if (sinceSample >= Number(p.interval)) {
            sinceSample = 0;
            cur.s.push(lapT, pl.x, pl.y);
          }
          if (lapT >= Number(p.lap)) {
            finishClip(p);
            startClip();
          }
        }
        playT += dt * Number(p.playSpeed);
      },
      draw(g, p) {
        g.grid(1);
        const n = Math.min(clips.length, Math.round(Number(p.ghosts)));
        for (let k = clips.length - n; k < clips.length; k++) {
          const c = clips[k];
          const col = hsl(c.hue, 0.7, 0.62);
          // 実際の細かい軌跡と、サンプル点を結んだ折れ線
          if (p.showTrails) {
            const f = new Float32Array((c.fine.length / 3) * 2);
            for (let i = 0, j = 0; i < c.fine.length; i += 3, j += 2) { f[j] = c.fine[i + 1]; f[j + 1] = c.fine[i + 2]; }
            g.polyline(f, col, { alpha: 0.18 });
            const s = new Float32Array((c.s.length / 3) * 2);
            for (let i = 0, j = 0; i < c.s.length; i += 3, j += 2) { s[j] = c.s[i + 1]; s[j + 1] = c.s[i + 2]; }
            g.polyline(s, col, { alpha: 0.45 });
            for (let i = 0; i < s.length; i += 2) g.circle(s[i], s[i + 1], 0.07, col, { fill: true, segments: 6, alpha: 0.7 });
          }
          // ゴースト本体：ループ再生（周ごとに少し位相をずらす）
          const t = (playT + k * 0.37) % c.dur;
          const [x, y] = sampleAt(c.s, t);
          const [x2, y2] = sampleAt(c.s, t + 0.05);
          g.circle(x, y, 0.5, col, { fill: true, alpha: 0.4 });
          g.agent(x, y, Math.atan2(y2 - y, x2 - x), 0.32, col, 0.75);
        }
        if (p.showTrails) g.polyline(trail.points(), 0xffd166, { fade: true, alpha: 0.6 });
        if (!dragging) g.circle(wx, wy, 0.2, 0x666a90);
        g.circle(pl.x, pl.y, 0.5, 0xffd166, { fill: true });
        if (recording) g.circle(pl.x, pl.y, 0.8 + 0.1 * Math.sin(lapT * 10), 0xff4d6d);
        // 周回の進み具合
        const { w, h } = env.bounds();
        const u = Math.min(1, lapT / Number(p.lap));
        g.rect(-w + 0.5, -h + 0.4, (w * 2 - 1) * u, 0.25, recording ? 0xff4d6d : 0x555a80, { fill: true });
      },
      pointer(x, y, down) {
        const e = pt.update(down);
        if (e === 'press' || e === 'drag') { dragging = true; px = x; py = y; }
        if (e === 'release') dragging = false;
      },
      action(key, p) {
        if (key === 'rec') {
          if (recording) { finishClip(p); recording = false; cur = null; } else { recording = true; startClip(); }
        } else if (key === 'clear') {
          clips.length = 0;
          lastErr = 0;
        }
      },
      status(p) {
        const samples = clips.length ? clips[clips.length - 1].s.length / 3 : 0;
        return `${recording ? '● 記録中' : '■ 停止'} ${lapT.toFixed(1)}/${Number(p.lap).toFixed(1)}s · ゴースト ${clips.length} · 最新のサンプル数 ${samples} · 補間誤差（最大）${lastErr.toFixed(3)} · ドラッグで操作`;
      },
    };
  },
  extraActions: [{ key: 'rec', label: '● 記録 開始／停止' }, { key: 'clear', label: '✕ ゴースト消去' }],
});
