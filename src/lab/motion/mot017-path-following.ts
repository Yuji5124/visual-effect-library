import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { PointerTracker, closestOnSegment, hueColor, integrate, pickHandle, seekForce, type Mover } from '../framework/steerKit';

/** MOT-017 Reynolds の経路追従：予測点を経路へ射影し、半径を超えた時だけ前方の点へ Seek */
interface Agent extends Mover { trail: Trail; color: number; px: number; py: number; qx: number; qy: number; tx: number; ty: number; steering: boolean }

export default defineMotionDemo({
  id: 'MOT-017',
  notes: '速度方向に予測距離だけ先の未来位置（小円）を閉じた折れ線へ射影し（四角）、その距離が経路半径を超えた時だけ、射影点から経路方向に少し先の点（✕）へ Seek する。帯の内側では舵を切らないので自然に蛇行する。舵を切っている個体は線が赤くなる。経路の頂点はドラッグで動かせる。',
  params: [
    { key: 'predict', label: '予測距離', type: 'number', min: 0.2, max: 6, step: 0.1, default: 2 },
    { key: 'radius', label: '経路半径', type: 'number', min: 0.2, max: 4, step: 0.05, default: 1.2 },
    { key: 'count', label: '台数', type: 'number', min: 1, max: 40, step: 1, default: 14 },
    { key: 'maxSpeed', label: '最大速度', type: 'number', min: 1, max: 15, step: 0.1, default: 6 },
  ],
  resetKeys: ['count'],
  create(env, params) {
    const pt = new PointerTracker();
    const { w } = env.bounds();
    const sx = Math.min(1, (w - 1.5) / 13);
    const path = [-13, 2, -7, 7.5, 0, 4, 5, 8, 12.5, 5, 11, -3, 4, -1, -1, -7.5, -8, -7, -12, -3].map((v, i) => (i % 2 === 0 ? v * sx : v));
    const m = path.length / 2;
    const agents: Agent[] = [];
    for (let i = 0; i < Number(params.count); i++) {
      const a = env.rng() * Math.PI * 2;
      agents.push({ x: (env.rng() * 2 - 1) * w * 0.8, y: (env.rng() * 2 - 1) * 8, vx: Math.cos(a) * 3, vy: Math.sin(a) * 3, trail: new Trail(200), color: hueColor(0.1 + i * 0.047), px: 0, py: 0, qx: 0, qy: 0, tx: 0, ty: 0, steering: false });
    }
    let drag = -1;
    let offSum = 0, offN = 0;
    return {
      step(dt, p) {
        if (dt <= 0) return;
        const pd = Number(p.predict), R = Number(p.radius), ms = Number(p.maxSpeed);
        for (const a of agents) {
          const sp = Math.hypot(a.vx, a.vy) || 1;
          a.px = a.x + (a.vx / sp) * pd;
          a.py = a.y + (a.vy / sp) * pd;
          // 予測点に最も近い経路上の点（全区間を調べる。進行方向と逆向きの区間は不利にする）
          let bd = Infinity, bi = 0;
          for (let i = 0; i < m; i++) {
            const j = (i + 1) % m;
            const [cx, cy] = closestOnSegment(a.px, a.py, path[i * 2], path[i * 2 + 1], path[j * 2], path[j * 2 + 1]);
            const sdx = path[j * 2] - path[i * 2], sdy = path[j * 2 + 1] - path[i * 2 + 1];
            const back = sdx * a.vx + sdy * a.vy < 0 ? 3 : 0;
            const d = Math.hypot(a.px - cx, a.py - cy) + back;
            if (d < bd) { bd = d; bi = i; a.qx = cx; a.qy = cy; }
          }
          const j = (bi + 1) % m;
          const sdx = path[j * 2] - path[bi * 2], sdy = path[j * 2 + 1] - path[bi * 2 + 1];
          const sl = Math.hypot(sdx, sdy) || 1;
          a.tx = a.qx + (sdx / sl) * 1.5;
          a.ty = a.qy + (sdy / sl) * 1.5;
          const off = Math.hypot(a.px - a.qx, a.py - a.qy);
          a.steering = off > R;
          let fx = 0, fy = 0;
          if (a.steering) [fx, fy] = seekForce(a, a.tx, a.ty, ms);
          else { fx = (a.vx / sp) * ms - a.vx; fy = (a.vy / sp) * ms - a.vy; }
          integrate(a, fx, fy, 12, ms, dt);
          a.trail.push(a.x, a.y);
          // 現在位置の経路からのずれ（統計用）
          let dmin = Infinity;
          for (let i = 0; i < m; i++) {
            const k = (i + 1) % m;
            const [cx, cy] = closestOnSegment(a.x, a.y, path[i * 2], path[i * 2 + 1], path[k * 2], path[k * 2 + 1]);
            dmin = Math.min(dmin, Math.hypot(a.x - cx, a.y - cy));
          }
          offSum = offSum * 0.999 + dmin;
          offN = offN * 0.999 + 1;
        }
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const R = Number(p.radius);
        // 半径付きの帯（区間ごとの平行線＋頂点の円）
        for (let i = 0; i < m; i++) {
          const j = (i + 1) % m;
          const x0 = path[i * 2], y0 = path[i * 2 + 1], x1 = path[j * 2], y1 = path[j * 2 + 1];
          const l = Math.hypot(x1 - x0, y1 - y0) || 1;
          const nx = (-(y1 - y0) / l) * R, ny = ((x1 - x0) / l) * R;
          g.tri(x0 + nx, y0 + ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny, 0x1c2440);
          g.tri(x0 + nx, y0 + ny, x1 - nx, y1 - ny, x0 - nx, y0 - ny, 0x1c2440);
          g.line(x0 + nx, y0 + ny, x1 + nx, y1 + ny, 0x3a4070);
          g.line(x0 - nx, y0 - ny, x1 - nx, y1 - ny, 0x3a4070);
          g.arrow(x0, y0, (x1 - x0) * 0.5, (y1 - y0) * 0.5, 0x8890c0, 0.6);
          g.line(x0, y0, x1, y1, 0x8890c0, 0.6);
          g.circle(x0, y0, R, 0x3a4070, { segments: 24 });
        }
        for (let i = 0; i < m; i++) g.circle(path[i * 2], path[i * 2 + 1], 0.25, drag === i ? 0xffffff : 0x9aa0c8, { fill: true });
        for (const a of agents) {
          if (p.showTrails) g.polyline(a.trail.points(), a.color, { fade: true, alpha: 0.7 });
          const c = a.steering ? 0xff5060 : 0x6a7090;
          g.line(a.x, a.y, a.px, a.py, c, 0.7);
          g.circle(a.px, a.py, 0.12, c);
          g.line(a.px, a.py, a.qx, a.qy, c, 0.5);
          g.rect(a.qx - 0.1, a.qy - 0.1, 0.2, 0.2, c, { fill: true });
          if (a.steering) {
            g.line(a.tx - 0.2, a.ty - 0.2, a.tx + 0.2, a.ty + 0.2, 0xff5060);
            g.line(a.tx - 0.2, a.ty + 0.2, a.tx + 0.2, a.ty - 0.2, 0xff5060);
          }
          g.agent(a.x, a.y, Math.atan2(a.vy, a.vx), 0.35, a.color);
        }
      },
      pointer(x, y, down) {
        const ev = pt.update(down);
        if (ev === 'press') drag = pickHandle(path, x, y, 1.2);
        if ((ev === 'press' || ev === 'drag') && drag >= 0) { path[drag * 2] = x; path[drag * 2 + 1] = y; }
        if (ev === 'release') drag = -1;
      },
      status() {
        const st = agents.filter((a) => a.steering).length;
        return `舵を切っている ${st}/${agents.length} 台 · 経路からの平均ずれ ${(offSum / Math.max(1, offN)).toFixed(2)} · 頂点をドラッグで経路を編集`;
      },
    };
  },
});
