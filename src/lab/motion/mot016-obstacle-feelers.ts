import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { PointerTracker, hueColor, integrate, seekForce, type Mover } from '../framework/steerKit';

/** MOT-016 フィーラーによる障害物回避：前方の線分と円の交差を調べ、横向きの力で避ける */
interface Agent extends Mover { wp: number; trail: Trail; color: number; hit: number; hitObs: number; feel: number[] }
interface Obs { x: number; y: number; r: number }

export default defineMotionDemo({
  id: 'MOT-016',
  notes: '各エージェントは速度方向に長さ L の中央フィーラーと、±35°に 0.6L の側方フィーラーを伸ばす。障害物（半径＋余裕）との最初の交点を線分−円の交差で求め、最も近いものについて、その中心から進行方向に垂直に離れる力を「近いほど強く」加える。赤いフィーラーが検出中。巡回地点（四隅の◇）を Seek で回る。障害物はドラッグで動かせる。',
  params: [
    { key: 'feeler', label: 'フィーラーの長さ L', type: 'number', min: 0.5, max: 8, step: 0.1, default: 3.5 },
    { key: 'strength', label: '回避の強さ', type: 'number', min: 0, max: 80, step: 1, default: 40 },
    { key: 'count', label: '台数', type: 'number', min: 1, max: 60, step: 1, default: 24 },
    { key: 'obstacles', label: '障害物の数', type: 'number', min: 0, max: 24, step: 1, default: 11 },
    {
      key: 'feelers', label: 'フィーラーの本数', type: 'select', default: '3',
      options: [{ value: '1', label: '1本（中央）' }, { value: '3', label: '3本' }, { value: '5', label: '5本' }],
    },
  ],
  resetKeys: ['count', 'obstacles'],
  create(env, params) {
    const pt = new PointerTracker();
    const { w, h } = env.bounds();
    const wps = [[-w + 2.5, h - 2.5], [w - 2.5, h - 2.5], [w - 2.5, -h + 2.5], [-w + 2.5, -h + 2.5]];
    const obs: Obs[] = [];
    let guard = 0;
    while (obs.length < Number(params.obstacles) && guard++ < 500) {
      const o = { x: (env.rng() * 2 - 1) * (w - 4), y: (env.rng() * 2 - 1) * (h - 3.5), r: 0.8 + env.rng() * 1.6 };
      if (obs.every((q) => Math.hypot(q.x - o.x, q.y - o.y) > q.r + o.r + 1.2) && wps.every(([x, y]) => Math.hypot(x - o.x, y - o.y) > o.r + 1.5)) obs.push(o);
    }
    const agents: Agent[] = [];
    for (let i = 0; i < Number(params.count); i++) {
      const wp = Math.floor(env.rng() * 4);
      const [x, y] = wps[wp];
      agents.push({ x: x + (env.rng() - 0.5) * 3, y: y + (env.rng() - 0.5) * 3, vx: 0, vy: 0, wp: (wp + 1) % 4, trail: new Trail(160), color: hueColor(0.45 + env.rng() * 0.25), hit: 0, hitObs: -1, feel: [] });
    }
    let drag = -1, dragDx = 0, dragDy = 0;
    let penetrations = 0, time = 0;
    const AR = 0.35;
    /** 線分 (x,y)+(dx,dy)·u, u∈[0,1] と円の最初の交点の u。なければ -1 */
    const segCircle = (x: number, y: number, dx: number, dy: number, o: Obs, r: number): number => {
      const fx = x - o.x, fy = y - o.y;
      const a = dx * dx + dy * dy, b = 2 * (fx * dx + fy * dy), c = fx * fx + fy * fy - r * r;
      if (c < 0) return 0;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return -1;
      const u = (-b - Math.sqrt(disc)) / (2 * a);
      return u >= 0 && u <= 1 ? u : -1;
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        time += dt;
        const L = Number(p.feeler), K = Number(p.strength), nf = Number(p.feelers);
        const ms = 6, mf = 30;
        const angs = nf === 1 ? [0] : nf === 3 ? [0, -0.6, 0.6] : [0, -0.35, 0.35, -0.8, 0.8];
        for (const a of agents) {
          const [tx, ty] = wps[a.wp];
          if (Math.hypot(tx - a.x, ty - a.y) < 2) a.wp = (a.wp + 1) % 4;
          let [fx, fy] = seekForce(a, tx, ty, ms);
          const sp = Math.hypot(a.vx, a.vy);
          const hx = sp > 0.01 ? a.vx / sp : Math.cos(time), hy = sp > 0.01 ? a.vy / sp : Math.sin(time);
          // フィーラーごとに最初の交点を探し、全体で最も近い障害物を採用
          let best = 2, bestObs = -1;
          a.feel.length = 0;
          for (const da of angs) {
            const c = Math.cos(da), s = Math.sin(da);
            const len = da === 0 ? L : L * (Math.abs(da) > 0.5 ? 0.6 : 0.8);
            const dx = (hx * c - hy * s) * len, dy = (hx * s + hy * c) * len;
            let hitU = -1, hitO = -1;
            obs.forEach((o, i) => {
              const u = segCircle(a.x, a.y, dx, dy, o, o.r + AR);
              if (u >= 0 && (hitU < 0 || u < hitU)) { hitU = u; hitO = i; }
            });
            a.feel.push(dx, dy, hitU);
            const ratio = hitU < 0 ? 2 : (hitU * len) / L;
            if (hitO >= 0 && ratio < best) { best = ratio; bestObs = hitO; }
          }
          a.hitObs = bestObs;
          if (bestObs >= 0) {
            const o = obs[bestObs];
            // 障害物中心から見た横方向（進行方向に垂直）の外向き
            const ox = o.x - a.x, oy = o.y - a.y;
            const side = ox * -hy + oy * hx; // 左側にあれば正
            const nx = side > 0 ? hy : -hy, ny = side > 0 ? -hx : hx;
            const mag = K * (1 - Math.min(1, best));
            fx += nx * mag;
            fy += ny * mag;
            // 正面すぎる時は少し減速
            fx -= hx * mag * 0.3;
            fy -= hy * mag * 0.3;
          }
          integrate(a, fx, fy, mf + K, ms, dt);
          // めり込みは押し出す（衝突回数を数える）
          for (const o of obs) {
            const d = Math.hypot(a.x - o.x, a.y - o.y);
            if (d < o.r + AR * 0.5) {
              penetrations++;
              const k = (o.r + AR * 0.5) / (d || 1);
              a.x = o.x + (a.x - o.x) * k;
              a.y = o.y + (a.y - o.y) * k;
            }
          }
          a.trail.push(a.x, a.y);
        }
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        wps.forEach(([x, y]) => {
          g.line(x - 0.5, y, x, y + 0.5, 0x9aa0c8); g.line(x, y + 0.5, x + 0.5, y, 0x9aa0c8);
          g.line(x + 0.5, y, x, y - 0.5, 0x9aa0c8); g.line(x, y - 0.5, x - 0.5, y, 0x9aa0c8);
        });
        const hitSet = new Set(agents.map((a) => a.hitObs));
        obs.forEach((o, i) => {
          g.circle(o.x, o.y, o.r, hitSet.has(i) ? 0x6a3a4a : 0x2e3558, { fill: true, segments: 28 });
          g.circle(o.x, o.y, o.r + AR, hitSet.has(i) ? 0xff5060 : 0x5a6090, { segments: 28, alpha: 0.6 });
        });
        for (const a of agents) {
          if (p.showTrails) g.polyline(a.trail.points(), a.color, { fade: true, alpha: 0.6 });
          for (let k = 0; k < a.feel.length; k += 3) {
            const hit = a.feel[k + 2] >= 0;
            g.line(a.x, a.y, a.x + a.feel[k], a.y + a.feel[k + 1], hit ? 0xff5060 : 0x6a7090, hit ? 1 : 0.45);
            if (hit) g.circle(a.x + a.feel[k] * a.feel[k + 2], a.y + a.feel[k + 1] * a.feel[k + 2], 0.1, 0xff5060, { fill: true });
          }
          g.agent(a.x, a.y, Math.atan2(a.vy, a.vx), AR, a.color);
        }
      },
      pointer(x, y, down) {
        const ev = pt.update(down);
        if (ev === 'press') {
          drag = obs.findIndex((o) => Math.hypot(o.x - x, o.y - y) < o.r + 0.5);
          if (drag >= 0) { dragDx = obs[drag].x - x; dragDy = obs[drag].y - y; }
          else if (obs.length) {
            // 何もない所を押したら最も近い障害物をそこへ移す
            let bi = 0, bd = Infinity;
            obs.forEach((o, i) => { const d = Math.hypot(o.x - x, o.y - y); if (d < bd) { bd = d; bi = i; } });
            drag = bi; dragDx = 0; dragDy = 0;
          }
        }
        if ((ev === 'press' || ev === 'drag') && drag >= 0) { obs[drag].x = x + dragDx; obs[drag].y = y + dragDy; }
        if (ev === 'release') drag = -1;
      },
      status() {
        const detecting = agents.filter((a) => a.hitObs >= 0).length;
        return `検出中 ${detecting}/${agents.length} 台 · めり込み ${(penetrations / Math.max(1, time)).toFixed(1)} 回/秒 · 障害物をドラッグで移動`;
      },
    };
  },
});
