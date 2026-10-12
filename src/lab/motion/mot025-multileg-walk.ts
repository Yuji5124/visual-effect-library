import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { twoBoneIK } from '../framework/ikKit';
import { wrapAngle } from '../framework/steerKit';

/** MOT-025 手続き歩行：足先が理想位置から離れすぎたら1歩。交互の組で同時に踏み出さない。脚は2ボーン解析IK */
interface Leg {
  hx: number; hy: number; // 胴体座標系での付け根
  rx: number; ry: number; // 胴体座標系での理想の着地点
  side: number; group: number;
  fx: number; fy: number; // 足先（ワールド）
  sx: number; sy: number; ex: number; ey: number; // 踏み出しの始点・終点
  t: number; stepping: boolean;
}

export default defineMotionDemo({
  id: 'MOT-025',
  notes: '胴体はクリック地点へ旋回しながら歩く（触らないと自動で行き先を選ぶ）。各脚の足先は地面に固定され、胴体に対する理想の着地点（＋印と、しきい値の円）から離れすぎると、移動方向に少し先回りした点へ弧を描いて踏み出す（空中の足は大きく描く）。隣り合う脚が交互の組になり、もう一方の組が空中の間は踏み出さない。関節は付け根→足先の2ボーン解析IKで求める。',
  params: [
    { key: 'legs', label: '脚の数', type: 'select', default: '6', options: [{ value: '4', label: '4本' }, { value: '6', label: '6本' }, { value: '8', label: '8本' }] },
    { key: 'threshold', label: '歩幅しきい値', type: 'number', min: 0.3, max: 3, step: 0.05, default: 1.2 },
    { key: 'stepSpeed', label: '踏み出しの速さ（歩/秒）', type: 'number', min: 1, max: 15, step: 0.1, default: 6 },
    { key: 'bodySpeed', label: '胴体の速さ', type: 'number', min: 0.5, max: 8, step: 0.1, default: 2.8 },
    { key: 'alternate', label: '交互の組で制限', type: 'bool', default: true },
  ],
  resetKeys: ['legs'],
  create(env, params) {
    const pairs = Number(params.legs) / 2;
    const body = { x: -6, y: -3, a: 0.3, v: 0, len: 1.2 + pairs * 0.55 };
    const legs: Leg[] = [];
    for (let k = 0; k < pairs; k++) {
      const u = pairs === 1 ? 0 : k / (pairs - 1) - 0.5; // 前後位置
      for (const side of [1, -1]) {
        const hx = u * body.len * 1.2, hy = side * 0.55;
        const rx = u * body.len * 2.1 + 0.3, ry = side * 2.6;
        const c = Math.cos(body.a), s = Math.sin(body.a);
        const fx = body.x + c * rx - s * ry, fy = body.y + s * rx + c * ry;
        legs.push({ hx, hy, rx, ry, side, group: (k + (side > 0 ? 0 : 1)) % 2, fx, fy, sx: fx, sy: fy, ex: fx, ey: fy, t: 0, stepping: false });
      }
    }
    const goal = { x: 6, y: 3 };
    let idle = 0, steps = 0;
    const bodyTrail = new Trail(500);
    const prints: number[] = [];
    const toWorld = (lx: number, ly: number): [number, number] => {
      const c = Math.cos(body.a), s = Math.sin(body.a);
      return [body.x + c * lx - s * ly, body.y + s * lx + c * ly];
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        idle += dt;
        const { w, h } = env.bounds();
        const dist = Math.hypot(goal.x - body.x, goal.y - body.y);
        if (dist < 0.8 && idle > 2) {
          goal.x = (env.rng() * 2 - 1) * (w - 4);
          goal.y = (env.rng() * 2 - 1) * (h - 4);
        }
        // 胴体：旋回速度を制限して目標へ。近づくと減速
        const want = Math.atan2(goal.y - body.y, goal.x - body.x);
        const da = wrapAngle(want - body.a);
        body.a += Math.max(-1.6 * dt, Math.min(1.6 * dt, da));
        const vmax = Number(p.bodySpeed) * Math.max(0.15, Math.cos(Math.min(Math.abs(da), Math.PI / 2)));
        const vt = dist < 0.4 ? 0 : Math.min(vmax, dist * 1.5);
        body.v += (vt - body.v) * Math.min(1, dt * 4);
        const vx = Math.cos(body.a) * body.v, vy = Math.sin(body.a) * body.v;
        body.x += vx * dt;
        body.y += vy * dt;
        bodyTrail.push(body.x, body.y);
        const thr = Number(p.threshold), rate = Number(p.stepSpeed);
        const airborne = [0, 0];
        for (const l of legs) if (l.stepping) airborne[l.group]++;
        for (const l of legs) {
          const [ix, iy] = toWorld(l.rx, l.ry);
          if (l.stepping) {
            l.t += dt * rate;
            const u = Math.min(1, l.t);
            const e = u * u * (3 - 2 * u);
            l.fx = l.sx + (l.ex - l.sx) * e;
            l.fy = l.sy + (l.ey - l.sy) * e;
            if (u >= 1) {
              l.stepping = false;
              airborne[l.group]--;
              prints.push(l.fx, l.fy);
              if (prints.length > 240) prints.splice(0, 2);
            }
            continue;
          }
          const off = Math.hypot(l.fx - ix, l.fy - iy);
          const other = 1 - l.group;
          const allowed = !p.alternate || airborne[other] === 0;
          // 回転中でも足が残らないよう、しきい値の1.8倍を超えたら強制的に踏み出す
          if ((off > thr && allowed) || off > thr * 1.8) {
            l.stepping = true;
            l.t = 0;
            l.sx = l.fx; l.sy = l.fy;
            // 1歩の時間の半分ぶん移動方向に先回り
            const lead = (0.5 / rate) * 1.0 + thr * 0.5 / Math.max(0.5, Number(p.bodySpeed));
            l.ex = ix + vx * lead;
            l.ey = iy + vy * lead;
            airborne[l.group]++;
            steps++;
          }
        }
      },
      draw(g, p) {
        g.grid(1, 0x151a2c);
        const thr = Number(p.threshold);
        g.circle(goal.x, goal.y, 0.5, 0xffffff);
        g.line(goal.x - 0.3, goal.y, goal.x + 0.3, goal.y, 0xffffff);
        g.line(goal.x, goal.y - 0.3, goal.x, goal.y + 0.3, 0xffffff);
        if (p.showTrails) {
          g.polyline(bodyTrail.points(), 0x5a6090, { fade: true });
          for (let i = 0; i < prints.length; i += 2) g.circle(prints[i], prints[i + 1], 0.12, 0x6a5a40, { fill: true, alpha: 0.3 + (0.7 * i) / prints.length });
        }
        for (const l of legs) {
          const [ix, iy] = toWorld(l.rx, l.ry);
          const col = l.group ? 0xffa040 : 0x4ad8ff;
          g.line(ix - 0.2, iy, ix + 0.2, iy, col, 0.6);
          g.line(ix, iy - 0.2, ix, iy + 0.2, col, 0.6);
          g.circle(ix, iy, thr, col, { alpha: 0.18, segments: 24 });
          const [hx, hy] = toWorld(l.hx, l.hy);
          // 空中の足は少し外へ持ち上げたように見せる（上から見た高さの表現）
          const lift = l.stepping ? Math.sin(Math.min(1, l.t) * Math.PI) : 0;
          const fx = l.fx, fy = l.fy;
          const reach = Math.hypot(l.rx - l.hx, l.ry - l.hy);
          const [kx, ky] = twoBoneIK(hx, hy, reach * 0.62, reach * 0.62, fx, fy, -l.side);
          g.line(hx, hy, kx, ky, col, 1);
          g.line(kx, ky, fx, fy, col, 1);
          g.circle(kx, ky, 0.12 + lift * 0.08, col, { fill: true });
          g.circle(fx, fy, 0.18 + lift * 0.22, l.stepping ? 0xffffff : col, { fill: true });
          if (l.stepping) g.line(l.sx, l.sy, l.ex, l.ey, 0xffffff, 0.25);
        }
        // 胴体（楕円風の多角形）
        const pts: number[] = [];
        for (let k = 0; k < 20; k++) {
          const u = (k / 20) * Math.PI * 2;
          pts.push(...toWorld(Math.cos(u) * body.len * 0.85, Math.sin(u) * 0.8));
        }
        const [bx, by] = toWorld(0, 0);
        for (let k = 0; k < 20; k++) {
          const j = (k + 1) % 20;
          g.tri(bx, by, pts[k * 2], pts[k * 2 + 1], pts[j * 2], pts[j * 2 + 1], 0x3a4a80);
        }
        g.polyline(pts, 0x9aa0c8, { closed: true });
        const [hx, hy] = toWorld(body.len * 0.85, 0);
        g.circle(hx, hy, 0.35, 0x9aa0c8, { fill: true });
      },
      pointer(x, y, down) {
        if (!down) return;
        goal.x = x;
        goal.y = y;
        idle = 0;
      },
      status() {
        const air = legs.filter((l) => l.stepping).length;
        return `歩数 ${steps} · 空中の脚 ${air}/${legs.length} · 胴体の速さ ${body.v.toFixed(2)} · クリックで行き先`;
      },
    };
  },
});
