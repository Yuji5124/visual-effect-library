import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { makeNoise2 } from '../framework/random';
import { clamp, lerp } from '../framework/crowdKit';

/** 2ボーンIK（余弦定理）。腰 h から足先 f へ、膝を進行方向 dir 側へ曲げる。膝の位置を返す */
function twoBone(hx: number, hy: number, fx: number, fy: number, l1: number, l2: number, dir: number): [number, number, number, number] {
  let dx = fx - hx, dy = fy - hy;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 1e-4;
  if (d > maxD) {
    // 届かない時は脚を伸ばし切り、足先をその先端へ
    dx *= maxD / d;
    dy *= maxD / d;
    d = maxD;
  }
  d = Math.max(d, Math.abs(l1 - l2) + 1e-4);
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx);
  const ang = base + a * dir;
  const kx = hx + Math.cos(ang) * l1, ky = hy + Math.sin(ang) * l1;
  return [kx, ky, hx + dx, hy + dy];
}

/** MOT-026 足接地補正：起伏のある地形で足先を地面へ合わせ、腰を下げる */
export default defineMotionDemo({
  id: 'MOT-026',
  notes: '横から見た2足キャラクター。歩行サイクルで決めた足先の真下へレイを落として地面の高さを求め（縦の点線）、足先をそこへ合わせて膝を2ボーンIKで解き、両足の低い方の地面へ腰を下げる。補正を切ると平地前提のアニメーションのまま足が浮く・埋まる（薄い脚が反対の設定）。クリックした位置へ歩いていく。',
  params: [
    { key: 'correct', label: '接地補正', type: 'bool', default: true },
    { key: 'rough', label: '地形の起伏', type: 'number', min: 0, max: 3, step: 0.01, default: 1.4 },
    { key: 'speed', label: '歩く速さ', type: 'number', min: 0.5, max: 6, step: 0.1, default: 2.5 },
    { key: 'stride', label: '歩幅', type: 'number', min: 0.8, max: 3, step: 0.05, default: 1.8 },
    { key: 'ghost', label: '反対の設定を薄く重ねる', type: 'bool', default: true },
  ],
  create(env) {
    const noise = makeNoise2(Math.floor(env.rng() * 1e6));
    const L1 = 2.2, L2 = 2.2, HIP = 3.8;
    let x = 0, v = 0;
    let target = env.bounds().w * 0.7;
    let auto = true;
    let phase = 0;
    let hipSmooth = 0;
    let errOn = 0, errOff = 0;
    const footTrail = [new Trail(200), new Trail(200)];
    const ground = (wx: number, rough: number) => -4 + rough * (noise(wx * 0.22, 0.37) * 1.6 + noise(wx * 0.6, 3.1) * 0.5);

    // 片足の足先（補正あり/なし）と腰の高さを計算
    const pose = (p: Record<string, unknown>, correct: boolean) => {
      const rough = Number(p.rough), stride = Number(p.stride);
      const lift = 0.7 * Math.min(1, Math.abs(v) / 1.2);
      const g0 = ground(x, rough);
      const feet = [0, 0.5].map((off) => {
        const ph = (((phase + off) % 1) + 1) % 1;
        const stance = ph < 0.5;
        const rel = stance ? stride * (0.25 - ph) : stride * (ph - 0.75);
        const fx = x + rel;
        const up = stance ? 0 : Math.sin(((ph - 0.5) / 0.5) * Math.PI) * lift;
        const gy = ground(fx, rough);
        const fy = correct ? gy + up : g0 + up;
        return { fx, fy, gy, stance };
      });
      const hipY = correct ? Math.min(feet[0].gy, feet[1].gy) + HIP - 0.15 : g0 + HIP;
      return { feet, hipY };
    };

    return {
      step(dt, p) {
        const sp = Number(p.speed);
        const { w } = env.bounds();
        if (auto && Math.abs(target - x) < 0.3) target = target > 0 ? -w * 0.7 : w * 0.7;
        const want = clamp((target - x) * 1.5, -sp, sp);
        v += clamp(want - v, -6 * dt, 6 * dt);
        x += v * dt;
        phase += (v * dt) / Number(p.stride);
        const cur = pose(p, !!p.correct);
        hipSmooth = hipSmooth === 0 ? cur.hipY : lerp(hipSmooth, cur.hipY, 1 - Math.exp(-dt * 12));
        // 立脚の足先と地面のずれ（浮き/埋まり）を両方式で計測
        const on = pose(p, true), off = pose(p, false);
        const e = (q: typeof on) => q.feet.filter((f) => f.stance).reduce((s, f) => s + Math.abs(f.fy - f.gy), 0);
        errOn = lerp(errOn, e(on), 0.05);
        errOff = lerp(errOff, e(off), 0.05);
        cur.feet.forEach((f, i) => footTrail[i].push(f.fx, f.fy));
      },
      draw(g, p) {
        const { w } = env.bounds();
        g.grid(1, 0x151a2c);
        const rough = Number(p.rough);
        // 地形
        let px = -w - 1, py = ground(px, rough);
        for (let gx = -w - 1; gx <= w + 1; gx += 0.2) {
          const gy = ground(gx, rough);
          g.tri(px, py, gx, gy, gx, -11, 0x2a3350);
          g.tri(px, py, gx, -11, px, -11, 0x2a3350);
          g.line(px, py, gx, gy, 0x7d8bb8);
          px = gx;
          py = gy;
        }
        g.line(target, ground(target, rough), target, ground(target, rough) + 1.2, 0xffd166);
        g.circle(target, ground(target, rough) + 1.3, 0.15, 0xffd166, { fill: true });

        const drawBody = (correct: boolean, alpha: number) => {
          const q = pose(p, correct);
          const hipY = correct === !!p.correct ? hipSmooth : q.hipY;
          const dir = v >= 0 ? 1 : -1;
          // 胴体と頭
          g.line(x, hipY, x + dir * 0.2, hipY + 2.4, 0xd8def5, alpha);
          g.circle(x + dir * 0.3, hipY + 3.1, 0.6, 0xd8def5, { alpha });
          q.feet.forEach((f, i) => {
            const col = i === 0 ? 0xff7a90 : 0x6fd3ff;
            const [kx, ky, ex, ey] = twoBone(x, hipY, f.fx, f.fy, L1, L2, dir);
            g.line(x, hipY, kx, ky, col, alpha);
            g.line(kx, ky, ex, ey, col, alpha);
            g.circle(kx, ky, 0.12, col, { fill: true, alpha });
            // 足の甲は地面の傾きに合わせる
            const slope = correct ? Math.atan2(ground(ex + 0.3, rough) - ground(ex - 0.3, rough), 0.6) : 0;
            g.line(ex - Math.cos(slope) * 0.2 * dir, ey - Math.sin(slope) * 0.2 * dir, ex + Math.cos(slope) * 0.7 * dir, ey + Math.sin(slope) * 0.7 * dir, col, alpha);
            if (alpha === 1) {
              // 足先からのレイと地面との交点
              for (let yy = hipY; yy > f.gy; yy -= 0.4) g.line(f.fx, yy, f.fx, Math.max(f.gy, yy - 0.2), 0x9fe870, 0.5);
              g.circle(f.fx, f.gy, 0.12, 0x9fe870, { fill: true });
              const gap = ey - f.gy;
              if (f.stance && Math.abs(gap) > 0.08) g.line(ex, ey, ex, f.gy, gap > 0 ? 0xffb020 : 0xff3355);
            }
          });
          g.circle(x, hipY, 0.18, 0xffffff, { fill: true, alpha });
        };
        if (p.ghost) drawBody(!p.correct, 0.3);
        drawBody(!!p.correct, 1);
        if (p.showTrails) footTrail.forEach((t, i) => g.polyline(t.points(), i === 0 ? 0xff7a90 : 0x6fd3ff, { fade: true, alpha: 0.6 }));
      },
      pointer(px, _py, down) {
        if (down) {
          const { w } = env.bounds();
          target = clamp(px, -w + 1, w - 1);
          auto = false;
        }
      },
      action(key) {
        if (key === 'auto') auto = true;
      },
      status(p) {
        return `立脚の足と地面のずれ：補正あり ${errOn.toFixed(2)} / 補正なし ${errOff.toFixed(2)} · 現在 ${p.correct ? '補正あり' : '補正なし'} · 速さ ${Math.abs(v).toFixed(2)} · クリックで目的地`;
      },
    };
  },
  extraActions: [{ key: 'auto', label: '↔ 自動で往復' }],
});
