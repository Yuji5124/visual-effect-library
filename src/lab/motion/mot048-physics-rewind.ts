import { defineMotionDemo } from '../framework/motionLab';
import { hsl } from '../framework/crowdKit';
import { PointerTracker } from '../framework/steerKit';

const H = 1 / 60;

/** MOT-048 物理の巻き戻し：固定ステップの衝突シミュレーションの状態を毎ステップ保存し、履歴をさかのぼる */
export default defineMotionDemo({
  id: 'MOT-048',
  notes: '円盤の衝突シミュレーションを 1/60 秒の固定ステップで進め、各ステップの位置・速度をリングバッファに保存する。巻き戻し中は保存した状態を逆順に表示し、再開するとその時点から計算し直す。何もしなければ再計算した未来は保存していた未来と完全に一致し（status の差 0）、クリックで粒子を押すと別の未来に分岐する（薄い線が元の未来）。下の帯が履歴と現在位置。自動モードでは周期的に巻き戻しと分岐を繰り返す。',
  params: [
    { key: 'history', label: '履歴の長さ（秒）', type: 'number', min: 1, max: 20, step: 0.5, default: 8 },
    { key: 'rewindSpeed', label: '巻き戻し速度', type: 'number', min: 0.25, max: 4, step: 0.05, default: 1.5 },
    { key: 'count', label: '粒子数', type: 'number', min: 5, max: 80, step: 1, default: 30 },
    { key: 'auto', label: '自動で巻き戻し・分岐', type: 'bool', default: true },
  ],
  resetKeys: ['history', 'count'],
  create(env, p0) {
    const n = Math.round(Number(p0.count));
    const cap = Math.round(Number(p0.history) / H);
    const S = n * 4;
    const ring = new Float64Array(cap * S);
    const st = new Float64Array(S);
    const rad = new Float64Array(n);
    // 箱の大きさは画面に依らず固定（決定性のため）。表示側で縮める
    const BW = 12, BH = 7.6, BY = 1.2;
    let k = 1;
    const X = (x: number) => x * k, Y = (y: number) => BY + (y - BY) * k;
    for (let i = 0; i < n; i++) {
      rad[i] = 0.3 + env.rng() * 0.35;
      st[i * 4] = (env.rng() * 2 - 1) * (BW - 1);
      st[i * 4 + 1] = BY + (env.rng() * 2 - 1) * (BH - 1);
      st[i * 4 + 2] = (env.rng() * 2 - 1) * 6;
      st[i * 4 + 3] = (env.rng() * 2 - 1) * 6;
    }
    let oldest = 0, newest = 0, cur = 0;
    ring.set(st, 0);
    const slot = (f: number) => (f % cap) * S;
    /** 決定的な1ステップ（同じ入力から常に同じ出力） */
    const physics = (s: Float64Array) => {
      for (let i = 0; i < n; i++) {
        const o = i * 4;
        s[o + 3] -= 5 * H;
        s[o] += s[o + 2] * H;
        s[o + 1] += s[o + 3] * H;
        const r = rad[i];
        if (s[o] < -BW + r) { s[o] = -BW + r; s[o + 2] = Math.abs(s[o + 2]); }
        if (s[o] > BW - r) { s[o] = BW - r; s[o + 2] = -Math.abs(s[o + 2]); }
        if (s[o + 1] < BY - BH + r) { s[o + 1] = BY - BH + r; s[o + 3] = Math.abs(s[o + 3]); }
        if (s[o + 1] > BY + BH - r) { s[o + 1] = BY + BH - r; s[o + 3] = -Math.abs(s[o + 3]); }
      }
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const a = i * 4, b = j * 4;
        const dx = s[b] - s[a], dy = s[b + 1] - s[a + 1], rr = rad[i] + rad[j];
        const d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 1e-12) continue;
        const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
        const ma = rad[i] * rad[i], mb = rad[j] * rad[j];
        const ov = rr - d;
        s[a] -= nx * ov * mb / (ma + mb); s[a + 1] -= ny * ov * mb / (ma + mb);
        s[b] += nx * ov * ma / (ma + mb); s[b + 1] += ny * ov * ma / (ma + mb);
        const rel = (s[a + 2] - s[b + 2]) * nx + (s[a + 3] - s[b + 3]) * ny;
        if (rel > 0) {
          const jmp = (2 * rel) / (ma + mb);
          s[a + 2] -= jmp * mb * nx; s[a + 3] -= jmp * mb * ny;
          s[b + 2] += jmp * ma * nx; s[b + 3] += jmp * ma * ny;
        }
      }
    };
    let mode: 'play' | 'rewind' = 'play';
    const pt = new PointerTracker();
    let acc = 0, rwAcc = 0, autoT = 0, autoCycle = 0;
    let compareUntil = -1, maxDiff = 0, branched = false, compared = 0;
    // 元の未来（巻き戻した時点より先の保存軌跡）
    let GSTEP = 3;
    let ghost = new Float32Array(0), ghostLen = 0;
    const kick = (x: number, y: number) => {
      const o = slot(cur);
      for (let i = 0; i < n; i++) {
        const dx = ring[o + i * 4] - x, dy = ring[o + i * 4 + 1] - y, d = Math.hypot(dx, dy);
        if (d < 3) {
          const f = (3 - d) * 4 / (d || 1);
          ring[o + i * 4 + 2] += dx * f;
          ring[o + i * 4 + 3] += dy * f;
        }
      }
      if (cur < compareUntil) branched = true;
    };
    const resume = () => {
      if (mode !== 'rewind') return;
      mode = 'play';
      // 保存されていた未来を薄い線として残す
      GSTEP = Math.max(2, Math.ceil((newest - cur) / 60));
      ghostLen = Math.floor((newest - cur) / GSTEP) + 1;
      ghost = new Float32Array(ghostLen * n * 2);
      for (let k = 0; k < ghostLen; k++) {
        const o = slot(cur + k * GSTEP);
        for (let i = 0; i < n; i++) { ghost[(k * n + i) * 2] = ring[o + i * 4]; ghost[(k * n + i) * 2 + 1] = ring[o + i * 4 + 1]; }
      }
      compareUntil = newest;
      maxDiff = 0;
      compared = 0;
      branched = false;
    };
    const startRewind = () => {
      mode = 'rewind';
      rwAcc = 0;
    };
    return {
      step(dt, p) {
        if (dt <= 0) return;
        if (p.auto) {
          autoT += dt;
          if (mode === 'play' && autoT > 4) { startRewind(); autoT = 0; }
          else if (mode === 'rewind' && autoT > 1.6) {
            resume();
            autoT = 0;
            // 2回に1回は分岐させる
            if (autoCycle++ % 2 === 1) {
              const i = Math.floor(env.rng() * n), o = slot(cur);
              kick(ring[o + i * 4] + 0.5, ring[o + i * 4 + 1] - 0.5);
            }
          }
        }
        if (mode === 'rewind') {
          rwAcc += dt * Number(p.rewindSpeed) / H;
          while (rwAcc >= 1 && cur > oldest) { cur--; rwAcc -= 1; }
          if (cur <= oldest) rwAcc = 0;
          return;
        }
        acc += dt;
        let guard = 0;
        while (acc >= H && guard++ < 4) {
          acc -= H;
          st.set(ring.subarray(slot(cur), slot(cur) + S));
          physics(st);
          const f = cur + 1, o = slot(f);
          if (f <= compareUntil) {
            // 保存していた未来と比較してから上書き
            let d = 0;
            for (let k = 0; k < S; k++) d = Math.max(d, Math.abs(st[k] - ring[o + k]));
            maxDiff = Math.max(maxDiff, d);
            compared++;
          }
          ring.set(st, o);
          cur = newest = f;
          if (newest - oldest + 1 > cap) oldest = newest - cap + 1;
        }
      },
      draw(g, p) {
        const { w, h } = env.bounds();
        k = Math.min(1, (w - 0.4) / BW, (h - 1.2 - BY) / BH);
        g.rect(X(-BW), Y(BY - BH), BW * 2 * k, BH * 2 * k, mode === 'rewind' ? 0x5ab8ff : 0x555a80);
        // 元の未来（分岐前の保存軌跡）
        if (ghostLen > 1 && cur <= compareUntil + 120) {
          for (let i = 0; i < n; i++) {
            for (let j = 1; j < ghostLen; j++) {
              const a = ((j - 1) * n + i) * 2, b = (j * n + i) * 2;
              g.line(X(ghost[a]), Y(ghost[a + 1]), X(ghost[b]), Y(ghost[b + 1]), branched ? 0xff8a5a : 0x8890c0, branched ? 0.35 : 0.2);
            }
          }
        }
        const o = slot(cur);
        for (let i = 0; i < n; i++) {
          const col = hsl(i / n, 0.7, 0.6);
          if (p.showTrails) {
            let px = ring[o + i * 4], py = ring[o + i * 4 + 1];
            for (let j = 2; j <= 40 && cur - j >= oldest; j += 2) {
              const q = slot(cur - j), qx = ring[q + i * 4], qy = ring[q + i * 4 + 1];
              g.line(X(px), Y(py), X(qx), Y(qy), col, 0.7 * (1 - j / 42));
              px = qx; py = qy;
            }
          }
          g.circle(X(ring[o + i * 4]), Y(ring[o + i * 4 + 1]), rad[i] * k, col, { fill: true, segments: 14 });
        }
        // 履歴のタイムライン
        const x0 = -w + 0.6, tw = 2 * w - 1.2, y0 = -h + 0.3;
        const base = newest - cap + 1;
        g.rect(x0, y0, tw, 0.5, 0x2a2f50);
        g.rect(x0 + ((oldest - base) / cap) * tw, y0, ((newest - oldest + 1) / cap) * tw, 0.5, 0x3a4a80, { fill: true });
        const cx = x0 + ((cur - base) / cap) * tw;
        g.rect(x0 + ((oldest - base) / cap) * tw, y0, cx - (x0 + ((oldest - base) / cap) * tw), 0.5, mode === 'rewind' ? 0x5ab8ff : 0x7dff8a, { fill: true, alpha: 0.6 });
        g.line(cx, y0 - 0.2, cx, y0 + 0.7, 0xffffff);
      },
      pointer(x, y, down) {
        if (pt.update(down) !== 'press') return;
        if (mode === 'rewind') resume();
        kick(x / k, BY + (y - BY) / k);
      },
      action(key) {
        if (key === 'rewind') { if (mode === 'rewind') resume(); else startRewind(); }
      },
      status() {
        const back = (newest - cur) * H;
        const det = compareUntil >= 0 && compared > 0
          ? (branched ? `分岐（元の未来との差 ${maxDiff.toFixed(2)}）` : `再計算 ${compared} 歩の差 ${maxDiff.toExponential(1)}${maxDiff === 0 ? '（完全一致）' : ''}`)
          : '';
        return `${mode === 'rewind' ? '⏪ 巻き戻し中' : '▶ 再生'} · 時刻 ${(cur * H).toFixed(2)}s · 最新から ${back.toFixed(2)}s 前 · 履歴 ${((newest - oldest) * H).toFixed(1)}/${(cap * H).toFixed(1)}s · ${det} · クリックで粒子を押す`;
      },
    };
  },
  extraActions: [{ key: 'rewind', label: '⏪ 巻き戻し／再開' }],
});
