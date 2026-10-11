import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';

/** MOT-004 フレームレート非依存の減衰：素朴な lerp と指数減衰を 60fps と低fps で並べる */
interface Runner { fps: number; acc: number; x: number; trail: Trail; naive: boolean }

export default defineMotionDemo({
  id: 'MOT-004',
  notes: '上段は毎フレーム x += (目標−x)·k（k は 60fps で λ に合うよう固定）、下段は x += (目標−x)·(1−e^(−λ·dt))。それぞれ 60fps（緑）と低fps（橙）の擬似フレームで更新し、右に変位の時間グラフを描く。下段は2本がほぼ重なり、上段はずれる。クリックで目標を移動。',
  params: [
    { key: 'lambda', label: '減衰の速さ λ（1/秒）', type: 'number', min: 0.5, max: 20, step: 0.1, default: 4 },
    { key: 'slowFps', label: '遅い側のfps', type: 'number', min: 5, max: 60, step: 1, default: 12 },
    {
      key: 'method', label: '方式', type: 'select', default: 'both',
      options: [
        { value: 'both', label: '両方を比較' },
        { value: 'naive', label: '素朴な lerp のみ' },
        { value: 'exp', label: '指数減衰のみ' },
      ],
    },
    { key: 'interval', label: '目標が跳ぶ間隔（秒）', type: 'number', min: 0.5, max: 5, step: 0.1, default: 2.2 },
  ],
  create(env) {
    const mk = (fps: number, naive: boolean): Runner => ({ fps, acc: 0, x: 0, trail: new Trail(400), naive });
    const runners = [mk(60, true), mk(12, true), mk(60, false), mk(12, false)];
    let target = 5;
    let t = 0, since = 0;
    let gapNaive = 0, gapExp = 0;
    return {
      step(dt, p) {
        t += dt;
        since += dt;
        if (since > Number(p.interval)) {
          since = 0;
          target = target > 0 ? -3 - env.rng() * 3 : 3 + env.rng() * 3;
        }
        const lambda = Number(p.lambda);
        runners[1].fps = runners[3].fps = Number(p.slowFps);
        for (const r of runners) {
          r.acc += dt;
          const fdt = 1 / r.fps;
          while (r.acc >= fdt) {
            r.acc -= fdt;
            // 素朴：k は「60fps のとき」の値で固定。指数：その時の dt から割合を求める
            const k = r.naive ? 1 - Math.exp(-lambda / 60) : 1 - Math.exp(-lambda * fdt);
            r.x += (target - r.x) * k;
          }
          r.trail.push(t, r.x);
        }
        const gN = Math.abs(runners[0].x - runners[1].x), gE = Math.abs(runners[2].x - runners[3].x);
        gapNaive = Math.max(gapNaive * Math.exp(-dt * 0.5), gN);
        gapExp = Math.max(gapExp * Math.exp(-dt * 0.5), gE);
      },
      draw(g, p) {
        g.grid(1);
        const { w } = env.bounds();
        const lanes: [number, Runner[], boolean][] = [
          [5, [runners[0], runners[1]], p.method !== 'exp'],
          [-5, [runners[2], runners[3]], p.method !== 'naive'],
        ];
        const colors = [0x7dff8a, 0xffa040];
        const tx0 = -w + 1, tw = Math.max(4, w * 0.6);
        const mapX = (v: number) => tx0 + tw * ((v + 7) / 14);
        for (const [y0, rs, on] of lanes) {
          g.rect(-w + 0.5, y0 - 4.2, 2 * w - 1, 8.4, on ? 0x3a4070 : 0x1d2238);
          if (!on) continue;
          // 左：横方向の位置で動く2つの点
          g.line(tx0, y0 - 2.5, tx0 + tw, y0 - 2.5, 0x3a4070);
          g.line(mapX(target), y0 - 3, mapX(target), y0 + 3, 0xffffff, 0.6);
          rs.forEach((r, i) => {
            const yy = y0 + (i === 0 ? 1.2 : -1.2);
            g.circle(mapX(r.x), yy, 0.55, colors[i], { fill: true });
            g.arrow(mapX(r.x), yy, (mapX(target) - mapX(r.x)) * 0.3, 0, colors[i], 0.5);
          });
          // 右：時間グラフ（低fpsは階段になる）
          const gx0 = tx0 + tw + 1, gw = w - 1 - gx0;
          if (gw < 2) continue;
          g.line(gx0, y0 + target * 0.5, gx0 + gw, y0 + target * 0.5, 0xffffff, 0.35);
          if (p.showTrails) {
            rs.forEach((r, i) => {
              const pts = r.trail.points();
              const tmax = pts.length ? pts[pts.length - 2] : 0;
              const span = 5;
              const out: number[] = [];
              for (let k = 0; k < pts.length; k += 2) {
                const x = gx0 + gw * (1 - (tmax - pts[k]) / span);
                if (x >= gx0) out.push(x, y0 + pts[k + 1] * 0.5);
              }
              g.polyline(out, colors[i], { fade: true });
            });
          }
        }
      },
      pointer(x, _y, down) {
        if (!down) return;
        const { w } = env.bounds();
        const tw = Math.max(4, w * 0.6);
        target = Math.max(-7, Math.min(7, ((x - (-w + 1)) / tw) * 14 - 7));
        since = 0;
      },
      status(p) {
        const f = Number(p.slowFps);
        return `素朴 lerp：60fps と ${f}fps の差 ${gapNaive.toFixed(2)} · 指数減衰：差 ${gapExp.toFixed(2)} · k(60fps)=${(1 - Math.exp(-Number(p.lambda) / 60)).toFixed(3)} · クリックで目標を移動`;
      },
    };
  },
});
