import type { ParamValues } from '../../engine/types';
import { defineMotionDemo } from '../framework/motionLab';
import { hsl, smoothstep } from '../framework/crowdKit';

const HZ = 30;
const CLIP_SEC = 4;
const CLIP_NAMES = ['直進', '左折', '右折', '蛇行'];

/** 記録経路：各サンプルの前進速度 v と角速度 ω（ローカル座標での動き） */
interface Clip { v: Float32Array; w: Float32Array; hue: number }
interface Seg { clip: number; s0: number; len: number; dx: number; dy: number; dth: number; next: number[] }

function makeClips(rng: () => number): Clip[] {
  const n = HZ * CLIP_SEC;
  const mk = (fv: (t: number) => number, fw: (t: number) => number, hue: number): Clip => {
    const v = new Float32Array(n), w = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / HZ;
      // 記録らしさのため小さな揺らぎを足す
      v[i] = fv(t) + (rng() - 0.5) * 0.15;
      w[i] = fw(t) + (rng() - 0.5) * 0.08;
    }
    return { v, w, hue };
  };
  // 曲がる記録は「直進→曲がる→直進」の形にする（つなぎ目が直進同士で一致しやすい）
  const bend = (sign: number) => (t: number) => sign * 1.1 * Math.max(0, Math.sin(Math.min(1, Math.max(0, (t - 0.8) / 2.4)) * Math.PI));
  return [
    mk(() => 3.4, () => 0, 0.12),
    mk((t) => 3 - 0.6 * Math.sin((t / CLIP_SEC) * Math.PI), bend(1), 0.33),
    mk((t) => 3 - 0.6 * Math.sin((t / CLIP_SEC) * Math.PI), bend(-1), 0.58),
    mk(() => 3, (t) => 1.5 * Math.sin((t / 1.6) * Math.PI * 2), 0.85),
  ];
}

/** MOT-046 モーションの再利用：記録経路を区間に切り、似たつなぎ目同士で遷移するグラフを作って組み替える */
export default defineMotionDemo({
  id: 'MOT-046',
  notes: '4本の記録経路（直進・左折・右折・蛇行、左上に縮小表示）を「区間の長さ」で切り、区間の終わりと別区間の始まりの（速さ, 角速度）が近いものを遷移グラフの辺にする。再生は各区間のローカルな速度を現在の位置と向きに貼り付ける剛体変換で行い、つなぎ目ではブレンド時間だけ前の記録の続きと新しい区間の速度を混ぜる。白い点がつなぎ目。クリックで目標を置くと、目標に近づく区間を選ぶ。',
  params: [
    { key: 'segLen', label: '区間の長さ（秒）', type: 'number', min: 0.3, max: 2, step: 0.1, default: 0.8 },
    { key: 'blend', label: 'ブレンド時間（秒）', type: 'number', min: 0, max: 1, step: 0.05, default: 0.3 },
    {
      key: 'policy', label: '選択方針', type: 'select', default: 'goal',
      options: [{ value: 'goal', label: '目標に近づく区間' }, { value: 'random', label: 'ランダム' }],
    },
    { key: 'tolerance', label: 'つなぎ目の許容差', type: 'number', min: 0.1, max: 3, step: 0.05, default: 0.8 },
  ],
  resetKeys: ['segLen', 'tolerance'],
  create(env, p0) {
    const clips = makeClips(env.rng);
    const segLenN = Math.max(3, Math.round(Number(p0.segLen) * HZ));
    const tol = Number(p0.tolerance);
    const segs: Seg[] = [];
    clips.forEach((c, ci) => {
      for (let s0 = 0; s0 + segLenN <= c.v.length; s0 += segLenN) {
        let x = 0, y = 0, th = 0;
        for (let k = 0; k < segLenN; k++) { th += c.w[s0 + k] / HZ; x += Math.cos(th) * c.v[s0 + k] / HZ; y += Math.sin(th) * c.v[s0 + k] / HZ; }
        segs.push({ clip: ci, s0, len: segLenN, dx: x, dy: y, dth: th, next: [] });
      }
    });
    // 遷移グラフ：終わりと始まりの状態が近い区間へ辺を張る（同じ記録の次の区間は常につながる）
    let edges = 0;
    for (let a = 0; a < segs.length; a++) {
      const A = segs[a], ca = clips[A.clip], e = A.s0 + A.len - 1;
      for (let b = 0; b < segs.length; b++) {
        const B = segs[b], cb = clips[B.clip];
        const natural = B.clip === A.clip && B.s0 === A.s0 + A.len;
        const d = Math.abs(ca.v[e] - cb.v[B.s0]) / 1 + Math.abs(ca.w[e] - cb.w[B.s0]) / 0.5;
        if (natural || (b !== a && d < tol)) { A.next.push(b); edges++; }
      }
      if (!A.next.length) A.next.push(segs.findIndex((s) => s.clip === 0));
    }
    let cur = 0, u = 0;
    let x = 0, y = 0, th = 0;
    let oldClip = -1, oldIdx = 0, blendT = 1e9;
    let gx = 6, gy = 3, reached = 0, seamsTotal = 0;
    const TR = 900;
    const trX = new Float32Array(TR), trY = new Float32Array(TR), trC = new Int8Array(TR);
    let trN = 0, trHead = 0;
    const seams: number[] = [];
    const pickGoal = () => {
      const { w, h } = env.bounds();
      gx = (env.rng() * 2 - 1) * (w - 3);
      gy = (env.rng() * 2 - 1) * (h - 3);
    };
    const choose = (p: ParamValues) => {
      const S = segs[cur];
      const { w, h } = env.bounds();
      const far = Math.abs(x) > w - 2 || Math.abs(y) > h - 2;
      const useGoal = p.policy === 'goal' || far;
      const tx = p.policy === 'goal' ? gx : 0, ty = p.policy === 'goal' ? gy : 0;
      let best = S.next[0];
      if (useGoal) {
        let bd = Infinity;
        for (const b of S.next) {
          const B = segs[b];
          const ex = x + Math.cos(th) * B.dx - Math.sin(th) * B.dy, ey = y + Math.sin(th) * B.dx + Math.cos(th) * B.dy;
          // 終点の距離＋終わりの向きが目標を向いているか
          const hx = Math.cos(th + B.dth), hy = Math.sin(th + B.dth);
          const dd = Math.hypot(tx - ex, ty - ey);
          const score = dd - ((tx - ex) * hx + (ty - ey) * hy) / (dd || 1) * 0.8 + env.rng() * 0.3;
          if (score < bd) { bd = score; best = b; }
        }
      } else best = S.next[Math.floor(env.rng() * S.next.length)];
      // 前の記録の続きをブレンド用に保持
      oldClip = S.clip;
      oldIdx = S.s0 + S.len;
      blendT = 0;
      cur = best;
      u = 0;
      seams.push(x, y);
      if (seams.length > 80) seams.splice(0, 2);
      seamsTotal++;
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        const S = segs[cur], C = clips[S.clip];
        u += dt * HZ;
        if (u >= S.len) { choose(p); return; }
        const k = Math.min(S.len - 1, Math.floor(u));
        let v = C.v[S.s0 + k], w = C.w[S.s0 + k];
        const bl = Number(p.blend);
        if (oldClip >= 0 && blendT < bl) {
          const O = clips[oldClip], oi = Math.min(O.v.length - 1, Math.floor(oldIdx));
          const a = smoothstep(0, 1, blendT / bl);
          v = O.v[oi] + (v - O.v[oi]) * a;
          w = O.w[oi] + (w - O.w[oi]) * a;
          oldIdx += dt * HZ;
        }
        blendT += dt;
        th += w * dt;
        x += Math.cos(th) * v * dt;
        y += Math.sin(th) * v * dt;
        trX[trHead] = x; trY[trHead] = y; trC[trHead] = S.clip;
        trHead = (trHead + 1) % TR;
        trN = Math.min(TR, trN + 1);
        if (Math.hypot(gx - x, gy - y) < 1.2) { reached++; pickGoal(); }
      },
      draw(g, p) {
        g.grid(1);
        const { w, h } = env.bounds();
        // 左上：記録経路のライブラリと区間の切れ目
        clips.forEach((c, ci) => {
          let lx = -w + 1, ly = h - 1.5 - ci * 2.3, lth = 0;
          const sc = 0.3;
          const col = hsl(c.hue, 0.7, 0.6);
          for (let i = 0; i < c.v.length; i++) {
            lth += c.w[i] / HZ;
            const nx = lx + Math.cos(lth) * c.v[i] / HZ * sc, ny = ly + Math.sin(lth) * c.v[i] / HZ * sc;
            g.line(lx, ly, nx, ny, col, segs[cur].clip === ci && i >= segs[cur].s0 && i < segs[cur].s0 + segs[cur].len ? 1 : 0.5);
            if (i % segLenN === 0) g.circle(lx, ly, 0.06, 0xffffff, { fill: true, segments: 6 });
            lx = nx; ly = ny;
          }
        });
        if (p.showTrails) {
          for (let k = 1; k < trN; k++) {
            const a = (trHead - trN + k - 1 + TR) % TR, b = (trHead - trN + k + TR) % TR;
            g.line(trX[a], trY[a], trX[b], trY[b], hsl(clips[trC[b]].hue, 0.7, 0.6), 0.25 + 0.75 * (k / trN));
          }
          for (let i = 0; i < seams.length; i += 2) g.circle(seams[i], seams[i + 1], 0.1, 0xffffff, { fill: true, segments: 6, alpha: 0.8 });
        }
        if (p.policy === 'goal') { g.circle(gx, gy, 0.35, 0xffd166); g.circle(gx, gy, 1.2, 0xffd166, { alpha: 0.3 }); }
        // 次の候補区間の予測終点
        for (const b of segs[cur].next) {
          const B = segs[b];
          g.circle(x + Math.cos(th) * B.dx - Math.sin(th) * B.dy, y + Math.sin(th) * B.dx + Math.cos(th) * B.dy, 0.08, hsl(clips[B.clip].hue, 0.6, 0.5), { segments: 6 });
        }
        g.agent(x, y, th, 0.45, blendT < Number(p.blend) ? 0xffffff : hsl(clips[segs[cur].clip].hue, 0.8, 0.65));
      },
      pointer(px, py, down) {
        if (down) { gx = px; gy = py; }
      },
      status(p) {
        const S = segs[cur];
        return `区間 ${segs.length} · 遷移の辺 ${edges} · 再生中：${CLIP_NAMES[S.clip]} #${S.s0 / segLenN} · ${blendT < Number(p.blend) ? 'ブレンド中 · ' : ''}つなぎ目 ${seamsTotal} · 目標到達 ${reached} · クリックで目標`;
      },
    };
  },
});
