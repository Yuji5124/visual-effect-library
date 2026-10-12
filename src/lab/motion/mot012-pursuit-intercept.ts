import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { interceptTime } from '../framework/steerKit';

/** MOT-012 純追跡と迎撃：現在位置を狙う追跡者と、衝突時刻を二次方程式で解いて先回りする追跡者 */
interface Chaser { x: number; y: number; a: number; trail: Trail; caught: number; time: number; best: number; aimX: number; aimY: number; color: number }

export default defineMotionDemo({
  id: 'MOT-012',
  notes: '橙は常に目標の現在位置へ進む純追跡、水色は |P+V·t|=s·t（P,V は目標の相対位置・速度）を t について解き、その時刻の目標位置（✕）へ直進する迎撃。捕まえると左下からやり直し、捕獲時間の平均を比べる。クリックした位置が目標の進路の中心になる。',
  params: [
    { key: 'chaser', label: '追跡者の速さ', type: 'number', min: 1, max: 15, step: 0.1, default: 6 },
    { key: 'target', label: '目標の速さ', type: 'number', min: 0.5, max: 12, step: 0.1, default: 4.5 },
    {
      key: 'path', label: '目標の進路', type: 'select', default: 'circle',
      options: [
        { value: 'circle', label: '円' },
        { value: 'eight', label: '8の字' },
        { value: 'line', label: '直線往復' },
      ],
    },
  ],
  create(env) {
    let cx = 2, cy = 0;
    let phase = 0;
    const tgt = { x: 0, y: 0, vx: 0, vy: 0, trail: new Trail(300) };
    const mk = (color: number): Chaser => ({ x: 0, y: 0, a: 0, trail: new Trail(500), caught: 0, time: 0, best: 0, aimX: 0, aimY: 0, color });
    const pure = mk(0xffa040), inter = mk(0x4ad8ff);
    const startPos = () => { const { w } = env.bounds(); return [-w + 1.5, -8.5]; };
    const restart = (c: Chaser) => { const [x, y] = startPos(); c.x = x; c.y = y; c.time = 0; c.trail.clear(); };
    restart(pure);
    restart(inter);
    const sum = { p: 0, i: 0 };
    // 進路：弧長の速さが一定になるよう位相を進める
    const posAt = (ph: number, path: string): [number, number] => {
      const { w } = env.bounds();
      const R = Math.min(6.5, w - 3);
      if (path === 'eight') return [cx + Math.sin(ph) * R * 1.2, cy + Math.sin(ph * 2) * R * 0.5];
      if (path === 'line') return [cx + Math.sin(ph) * R * 1.3, cy + R * 0.6];
      return [cx + Math.cos(ph) * R, cy + Math.sin(ph) * R];
    };
    const steer = (c: Chaser, ax: number, ay: number, s: number, dt: number) => {
      c.aimX = ax; c.aimY = ay;
      c.a = Math.atan2(ay - c.y, ax - c.x);
      c.x += Math.cos(c.a) * s * dt;
      c.y += Math.sin(c.a) * s * dt;
      c.time += dt;
      c.trail.push(c.x, c.y);
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        const path = String(p.path);
        // 目標：数値微分で速さを測り、指定の速さになるよう位相の進みを調整
        const [x0, y0] = posAt(phase, path);
        const [x1, y1] = posAt(phase + 1e-3, path);
        const dl = Math.hypot(x1 - x0, y1 - y0) / 1e-3;
        phase += (Number(p.target) / Math.max(0.3, dl)) * dt;
        const [nx, ny] = posAt(phase, path);
        tgt.vx = (nx - tgt.x) / dt;
        tgt.vy = (ny - tgt.y) / dt;
        if (Math.hypot(tgt.vx, tgt.vy) > 50) { tgt.vx = 0; tgt.vy = 0; }
        tgt.x = nx; tgt.y = ny;
        tgt.trail.push(nx, ny);
        const s = Number(p.chaser);
        steer(pure, tgt.x, tgt.y, s, dt);
        const t = interceptTime(tgt.x - inter.x, tgt.y - inter.y, tgt.vx, tgt.vy, s);
        if (t > 0) steer(inter, tgt.x + tgt.vx * t, tgt.y + tgt.vy * t, s, dt);
        else steer(inter, tgt.x, tgt.y, s, dt);
        for (const c of [pure, inter]) {
          if (Math.hypot(c.x - tgt.x, c.y - tgt.y) < 0.45) {
            c.caught++;
            c.best = c.time;
            if (c === pure) sum.p += c.time; else sum.i += c.time;
            restart(c);
          } else if (c.time > 30) restart(c);
        }
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const pts: number[] = [];
        for (let k = 0; k <= 200; k++) pts.push(...posAt((k / 200) * Math.PI * 2, String(p.path)));
        g.polyline(pts, 0x2a3050);
        const [sx, sy] = startPos();
        g.rect(sx - 0.4, sy - 0.4, 0.8, 0.8, 0x9aa0c8);
        if (p.showTrails) {
          g.polyline(tgt.trail.points(), 0xffffff, { fade: true, alpha: 0.6 });
          g.polyline(pure.trail.points(), pure.color, { fade: true });
          g.polyline(inter.trail.points(), inter.color, { fade: true });
        }
        // 予測点と視線
        g.line(pure.x, pure.y, tgt.x, tgt.y, pure.color, 0.3);
        g.line(inter.x, inter.y, inter.aimX, inter.aimY, inter.color, 0.45);
        g.line(tgt.x, tgt.y, inter.aimX, inter.aimY, 0xffffff, 0.3);
        g.line(inter.aimX - 0.35, inter.aimY - 0.35, inter.aimX + 0.35, inter.aimY + 0.35, inter.color);
        g.line(inter.aimX - 0.35, inter.aimY + 0.35, inter.aimX + 0.35, inter.aimY - 0.35, inter.color);
        g.circle(tgt.x, tgt.y, 0.45, 0xffffff, { fill: true });
        g.arrow(tgt.x, tgt.y, tgt.vx * 0.3, tgt.vy * 0.3, 0xffffff, 0.7);
        g.agent(pure.x, pure.y, pure.a, 0.4, pure.color);
        g.agent(inter.x, inter.y, inter.a, 0.4, inter.color);
        g.circle(cx, cy, 0.15, 0x9aa0c8);
      },
      pointer(x, y, down) {
        if (!down) return;
        cx = x;
        cy = y;
      },
      status() {
        const av = (s: number, n: number) => (n ? (s / n).toFixed(2) + '秒' : '—');
        return `純追跡：捕獲 ${pure.caught} 回 平均 ${av(sum.p, pure.caught)} · 迎撃：捕獲 ${inter.caught} 回 平均 ${av(sum.i, inter.caught)} · クリックで進路の中心を移動`;
      },
    };
  },
});
