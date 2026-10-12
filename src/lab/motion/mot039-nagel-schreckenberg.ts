import { defineMotionDemo } from '../framework/motionLab';
import { heat } from '../framework/crowdKit';

/** MOT-039 Nagel–Schreckenberg：環状道路のセルオートマトンと時空図 */
export default defineMotionDemo({
  id: 'MOT-039',
  notes: '環状道路をセルに分け、各車を毎ステップ (1) v←min(v+1, 最高速) (2) v←min(v, 前の車までの空きセル数) (3) 確率 p で v←max(v−1, 0) (4) v セル進む、の順に同時更新する。左が環状道路（色=速度、赤=停止）、右が時空図（横=位置、下ほど新しい時刻）。渋滞の帯が車の進行と逆向き（左下がり）に伝わる。道路をクリックすると近くの車を数ステップ止めて渋滞を起こせる。',
  params: [
    { key: 'density', label: '密度（車/セル）', type: 'number', min: 0.02, max: 0.8, step: 0.01, default: 0.18 },
    { key: 'pBrake', label: 'ブレーキ確率 p', type: 'number', min: 0, max: 0.8, step: 0.01, default: 0.2 },
    { key: 'vmax', label: '最高速（セル/ステップ）', type: 'number', min: 1, max: 9, step: 1, default: 5 },
    { key: 'rate', label: 'ステップ／秒', type: 'number', min: 1, max: 30, step: 1, default: 10 },
    { key: 'cells', label: 'セル数', type: 'number', min: 60, max: 300, step: 10, default: 200 },
  ],
  resetKeys: ['density', 'cells'],
  create(env, p0) {
    const L = Math.round(Number(p0.cells));
    const nc = Math.max(1, Math.round(Number(p0.density) * L));
    // 車の位置（昇順）と速度
    const pos = new Int32Array(nc), vel = new Int32Array(nc), hold = new Int32Array(nc);
    const used = new Uint8Array(L);
    for (let i = 0; i < nc; i++) {
      let c = Math.floor(env.rng() * L);
      while (used[c]) c = (c + 1) % L;
      used[c] = 1;
    }
    for (let c = 0, k = 0; c < L; c++) if (used[c]) pos[k++] = c;
    const ROWS = 140;
    // 時空図：各行に「その時の各セルの速度+1（0=空）」
    const hist: Uint8Array[] = [];
    let acc = 0, steps = 0, flowAcc = 0, flowN = 0, lastFlow = 0, stopped = 0;
    const record = () => {
      const row = new Uint8Array(L);
      for (let i = 0; i < nc; i++) row[pos[i]] = vel[i] + 1;
      hist.unshift(row);
      if (hist.length > ROWS) hist.pop();
    };
    record();
    const stepCA = (vmax: number, pb: number) => {
      let moved = 0;
      stopped = 0;
      for (let i = 0; i < nc; i++) {
        const gap = (pos[(i + 1) % nc] - pos[i] - 1 + L) % L;
        let v = Math.min(vel[i] + 1, vmax);
        v = Math.min(v, nc === 1 ? vmax : gap);
        if (v > 0 && env.rng() < pb) v--;
        if (hold[i] > 0) { hold[i]--; v = 0; }
        vel[i] = v;
      }
      for (let i = 0; i < nc; i++) { pos[i] = (pos[i] + vel[i]) % L; moved += vel[i]; if (vel[i] === 0) stopped++; }
      // 先頭が 0 をまたいだら並びを回して昇順を保つ
      let minI = 0;
      for (let i = 1; i < nc; i++) if (pos[i] < pos[minI]) minI = i;
      if (minI !== 0) {
        const rp = Array.from(pos), rv = Array.from(vel), rh = Array.from(hold);
        for (let i = 0; i < nc; i++) { pos[i] = rp[(i + minI) % nc]; vel[i] = rv[(i + minI) % nc]; hold[i] = rh[(i + minI) % nc]; }
      }
      steps++;
      flowAcc += moved / L;
      flowN++;
      if (flowN >= 20) { lastFlow = flowAcc / flowN; flowAcc = 0; flowN = 0; }
      record();
    };
    const ring = () => {
      const { w } = env.bounds();
      const cx = -w * 0.5, R = Math.min(8, w * 0.42);
      return { cx, cy: 0, R };
    };
    return {
      step(dt, p) {
        acc += dt * Number(p.rate);
        let guard = 0;
        while (acc >= 1 && guard++ < 5) { acc -= 1; stepCA(Math.round(Number(p.vmax)), Number(p.pBrake)); }
      },
      draw(g, p) {
        g.grid(1, 0x131726);
        const { w } = env.bounds();
        const { cx, cy, R } = ring();
        const vmax = Math.round(Number(p.vmax));
        g.circle(cx, cy, R + 0.5, 0x3a4060, { segments: 96 });
        g.circle(cx, cy, R - 0.5, 0x3a4060, { segments: 96 });
        const ang = (c: number) => Math.PI / 2 - (c / L) * Math.PI * 2;
        for (let i = 0; i < nc; i++) {
          const a = ang(pos[i]);
          const col = vel[i] === 0 ? 0xff3355 : heat(1 - vel[i] / vmax);
          g.agent(cx + Math.cos(a) * R, cy + Math.sin(a) * R, a - Math.PI / 2, 0.22, col);
          if (hold[i] > 0) g.circle(cx + Math.cos(a) * R, cy + Math.sin(a) * R, 0.45, 0xffffff);
        }
        g.arrow(cx + R + 1.3, cy - 1, 0, 2, 0x8890c0);
        // 時空図
        const x0 = 0.6, x1 = w - 0.6, y0 = 9, y1 = -9;
        const cw = (x1 - x0) / L, rh = (y0 - y1) / ROWS;
        g.rect(x0, y1, x1 - x0, y0 - y1, 0x2a2f50);
        const tail = p.showTrails ? hist.length : Math.min(hist.length, 12);
        for (let r = 0; r < tail; r++) {
          const row = hist[r];
          const y = y1 + r * rh;
          for (let c = 0; c < L; c++) {
            const v = row[c];
            if (!v) continue;
            g.rect(x0 + c * cw, y, Math.max(cw, 0.06), rh, v === 1 ? 0xff3355 : heat(1 - (v - 1) / vmax), { fill: true });
          }
        }
      },
      pointer(x, y, down) {
        if (!down) return;
        const { cx, cy, R } = ring();
        const d = Math.hypot(x - cx, y - cy);
        if (Math.abs(d - R) > 2.5) return;
        let a = Math.PI / 2 - Math.atan2(y - cy, x - cx);
        a = ((a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const cell = (a / (Math.PI * 2)) * L;
        let best = 0, bd = Infinity;
        for (let i = 0; i < nc; i++) {
          const dd = Math.min(Math.abs(pos[i] - cell), L - Math.abs(pos[i] - cell));
          if (dd < bd) { bd = dd; best = i; }
        }
        hold[best] = 8;
      },
      action(key) {
        if (key === 'jam') hold[Math.floor(env.rng() * nc)] = 10;
      },
      status() {
        return `${nc} 台 / ${L} セル（密度 ${(nc / L).toFixed(2)}）· 流量 ${lastFlow.toFixed(3)} 台/ステップ · 停止中 ${stopped} 台 · ステップ ${steps} · 道路クリックで車を止める`;
      },
    };
  },
  extraActions: [{ key: 'jam', label: '⛔ 1台を止める' }],
});
