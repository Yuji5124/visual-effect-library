import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';

interface Chain {
  /** 本体に対する付け根の角度・初期の向き（本体の向き基準） */
  rootAng: number; restAng: number; bend: number;
  k: number; drag: number; grav: number; len: number;
  x: Float32Array; y: Float32Array; px: Float32Array; py: Float32Array;
  color: number; trail: Trail;
}

/** MOT-030 揺れもの：VRM 型のスプリングボーン（慣性＋元の向きへ戻るばね＋重力→長さを正規化） */
export default defineMotionDemo({
  id: 'MOT-030',
  notes: '各節の先端を「慣性（前回からの移動×(1−抵抗)）＋元の向きへ戻る力×剛性×dt＋重力×dt」で動かし、親からの距離を骨の長さへ正規化する（VRM SpringBone と同じ手順）。3本の尾は剛性・抵抗・重力の倍率が異なる（黄=硬い髪、桃=標準、水色=柔らかい尾）。薄い線は本来の向き（ばねの目標）。本体は自動の動きをし、ドラッグ中はポインタへ動く。',
  params: [
    { key: 'stiff', label: '剛性', type: 'number', min: 0, max: 8, step: 0.05, default: 4 },
    { key: 'drag', label: '抵抗', type: 'number', min: 0, max: 1, step: 0.01, default: 0.25 },
    { key: 'gravity', label: '重力', type: 'number', min: 0, max: 5, step: 0.05, default: 1 },
    {
      key: 'motion', label: '本体の動き', type: 'select', default: 'shake',
      options: [{ value: 'shake', label: '左右に往復' }, { value: 'circle', label: '円を描く' }, { value: 'stop', label: '急停止をくり返す' }, { value: 'pointer', label: 'ポインタに追従' }],
    },
    { key: 'amp', label: '本体の動きの大きさ', type: 'number', min: 0, max: 10, step: 0.1, default: 4 },
    { key: 'joints', label: '節の数', type: 'number', min: 2, max: 16, step: 1, default: 7 },
  ],
  resetKeys: ['joints'],
  create(_env, p0) {
    const nj = Math.round(Number(p0.joints));
    let bx = 0, by = 0, bAng = 0, t = 0;
    let tx = 0, ty = 0, dragging = false;
    let bvx = 0, bvy = 0;
    const mk = (rootAng: number, restAng: number, bend: number, k: number, drag: number, grav: number, len: number, color: number): Chain => {
      const c: Chain = {
        rootAng, restAng, bend, k, drag, grav, len,
        x: new Float32Array(nj + 1), y: new Float32Array(nj + 1), px: new Float32Array(nj + 1), py: new Float32Array(nj + 1),
        color, trail: new Trail(220),
      };
      for (let i = 0; i <= nj; i++) {
        c.x[i] = c.px[i] = bx + Math.cos(rootAng) * 1.2 + Math.cos(restAng) * len * i;
        c.y[i] = c.py[i] = by + Math.sin(rootAng) * 1.2 + Math.sin(restAng) * len * i;
      }
      return c;
    };
    const chains = [
      mk(Math.PI * 0.55, Math.PI * 0.6, 0.06, 2.2, 1.4, 0.4, 0.55, 0xffd166),
      mk(Math.PI * 1.0, Math.PI * 1.05, -0.05, 1, 1, 1, 0.75, 0xff7a90),
      mk(Math.PI * 1.35, Math.PI * 1.4, 0.1, 0.35, 0.6, 1.6, 0.8, 0x6fd3ff),
    ];

    return {
      step(dt, p) {
        if (dt <= 0) return;
        t += dt;
        const amp = Number(p.amp);
        const ox = bx, oy = by;
        const m = dragging ? 'pointer' : String(p.motion);
        let gx = tx, gy = ty, rate = 6;
        if (m === 'shake') { gx = Math.sin(t * 2.2) * amp; gy = Math.sin(t * 4.4) * 0.5; rate = 30; }
        else if (m === 'circle') { gx = Math.cos(t * 1.8) * amp; gy = Math.sin(t * 1.8) * amp * 0.6; rate = 30; }
        else if (m === 'stop') {
          // 一定速度で動いて急停止
          const ph = t % 3;
          const s = ph < 1 ? ph : 1;
          const dir = Math.floor(t / 3) % 2 ? -1 : 1;
          gx = dir * (s * 2 - 1) * amp;
          gy = 0;
          rate = 40;
        }
        bx += (gx - bx) * (1 - Math.exp(-dt * rate));
        by += (gy - by) * (1 - Math.exp(-dt * rate));
        bvx = (bx - ox) / dt;
        bvy = (by - oy) / dt;
        // 本体は進行方向へ少し傾く
        bAng += (-bvx * 0.03 - bAng) * (1 - Math.exp(-dt * 8));
        const stiff = Number(p.stiff), drag = Number(p.drag), grav = Number(p.gravity);
        for (const c of chains) {
          c.x[0] = c.px[0] = bx + Math.cos(c.rootAng + bAng) * 1.2;
          c.y[0] = c.py[0] = by + Math.sin(c.rootAng + bAng) * 1.2;
          let parentDir = c.restAng + bAng;
          for (let i = 1; i <= nj; i++) {
            // 本来の向き：親の向きに少し曲げを足したもの
            const restDir = parentDir + c.bend;
            const d = Math.min(0.95, drag * c.drag);
            let nx = c.x[i] + (c.x[i] - c.px[i]) * (1 - d);
            let ny = c.y[i] + (c.y[i] - c.py[i]) * (1 - d);
            nx += Math.cos(restDir) * stiff * c.k * dt;
            ny += Math.sin(restDir) * stiff * c.k * dt;
            ny -= grav * c.grav * dt;
            // 親からの長さを骨の長さへ
            const dx = nx - c.x[i - 1], dy = ny - c.y[i - 1];
            const l = Math.hypot(dx, dy) || 1e-6;
            nx = c.x[i - 1] + (dx / l) * c.len;
            ny = c.y[i - 1] + (dy / l) * c.len;
            c.px[i] = c.x[i];
            c.py[i] = c.y[i];
            c.x[i] = nx;
            c.y[i] = ny;
            parentDir = Math.atan2(dy, dx);
          }
          c.trail.push(c.x[nj], c.y[nj]);
        }
      },
      draw(g, p) {
        g.grid(1);
        for (const c of chains) {
          if (p.showTrails) g.polyline(c.trail.points(), c.color, { fade: true, alpha: 0.5 });
          // 本来の向き（各節の親の現在の向き基準）
          let dir = c.restAng + bAng;
          for (let i = 1; i <= nj; i++) {
            const rd = dir + c.bend;
            g.line(c.x[i - 1], c.y[i - 1], c.x[i - 1] + Math.cos(rd) * c.len, c.y[i - 1] + Math.sin(rd) * c.len, 0x8890c0, 0.35);
            dir = Math.atan2(c.y[i] - c.y[i - 1], c.x[i] - c.x[i - 1]);
          }
          for (let i = 1; i <= nj; i++) g.line(c.x[i - 1], c.y[i - 1], c.x[i], c.y[i], c.color);
          for (let i = 0; i <= nj; i++) g.circle(c.x[i], c.y[i], i === nj ? 0.22 : 0.12, c.color, { fill: true, segments: 8 });
        }
        g.circle(bx, by, 1.3, 0xd8def5, { fill: true });
        g.circle(bx + Math.cos(bAng + 0.3) * 0.5, by + Math.sin(bAng + 0.3) * 0.5 + 0.2, 0.15, 0x111111, { fill: true });
        g.arrow(bx, by, bvx * 0.15, bvy * 0.15, 0x7dff8a);
        if (p.motion === 'pointer' || dragging) g.circle(tx, ty, 0.3, 0xffffff);
      },
      pointer(x, y, down) {
        dragging = down;
        if (down) { tx = x; ty = y; }
      },
      status() {
        const tip = chains.map((c) => {
          const rest = c.restAng + bAng;
          const a = Math.atan2(c.y[nj] - c.y[0], c.x[nj] - c.x[0]);
          return Math.abs(((((a - rest) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI) * 57.3;
        });
        return `本来の向きからのずれ：髪 ${tip[0].toFixed(0)}° · 標準 ${tip[1].toFixed(0)}° · 尾 ${tip[2].toFixed(0)}° · 本体の速さ ${Math.hypot(bvx, bvy).toFixed(1)}${' · ドラッグで本体を動かす'}`;
      },
    };
  },
});
