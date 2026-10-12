import { defineMotionDemo } from '../framework/motionLab';
import { Trail } from '../framework/draw2d';
import { clamp, fan, wrapAngle } from '../framework/crowdKit';

const DEG = Math.PI / 180;

/** MOT-027 視線追従：目→首→上体の順に可動範囲の中で回転を分担する */
export default defineMotionDemo({
  id: 'MOT-027',
  notes: '上から見た上体・首・目。目標方向との角度差を、まず目が可動範囲いっぱいまで、残りを首、さらに残りを上体が受け持つ（各関節は角度制限付き）。目は速く、首は中くらい、上体はゆっくり追うので、目が先に飛んでから頭が追いつき目が中央へ戻る。扇形は各関節の可動範囲。クリックで目標を置く。',
  params: [
    { key: 'eyeLim', label: '目の可動範囲（±度）', type: 'number', min: 0, max: 60, step: 1, default: 35 },
    { key: 'neckLim', label: '首の可動範囲（±度）', type: 'number', min: 0, max: 100, step: 1, default: 70 },
    { key: 'torsoLim', label: '上体の可動範囲（±度）', type: 'number', min: 0, max: 90, step: 1, default: 45 },
    { key: 'speed', label: '追従の速さ', type: 'number', min: 0.2, max: 4, step: 0.05, default: 1 },
    { key: 'autoMove', label: '目標を自動で動かす', type: 'bool', default: true },
  ],
  create(env) {
    const FWD = Math.PI / 2;
    let torso = 0, neck = 0, eye = 0;
    let tx = 5, ty = 4;
    let t = 0, jumpT = 0;
    const trail = new Trail(240);
    const gazeTrail = new Trail(240);
    const headPos = () => {
      const a = FWD + torso;
      return [Math.cos(a) * 1.2, -3 + Math.sin(a) * 1.2] as const;
    };
    return {
      step(dt, p) {
        t += dt;
        if (p.autoMove) {
          jumpT -= dt;
          if (jumpT <= 0) {
            // ときどき目標が跳ぶ（サッカードの誘発）
            jumpT = 1.2 + env.rng() * 1.6;
            const a = (env.rng() * 2 - 1) * Math.PI * 0.95 + FWD;
            const r = 4 + env.rng() * 5;
            tx = Math.cos(a) * r;
            ty = -3 + Math.sin(a) * r;
          }
        }
        const [hx, hy] = headPos();
        const want = wrapAngle(Math.atan2(ty - hy, tx - hx) - FWD);
        const eL = Number(p.eyeLim) * DEG, nL = Number(p.neckLim) * DEG, tL = Number(p.torsoLim) * DEG;
        const sp = Number(p.speed);
        // 目標角度の分担：上体は「目と首で足りない分」、首は「上体の残り」、目は最後の残り
        const torsoGoal = clamp(want - clamp(want, -(eL + nL), eL + nL) * 0.55, -tL, tL);
        const neckGoal = clamp(want - torso, -nL, nL);
        const eyeGoal = clamp(want - torso - neck, -eL, eL);
        const k = (rate: number) => 1 - Math.exp(-rate * sp * dt);
        torso += (torsoGoal - torso) * k(1.6);
        neck += (neckGoal - neck) * k(5);
        eye += (eyeGoal - eye) * k(30);
        const g = FWD + torso + neck + eye;
        gazeTrail.push(hx + Math.cos(g) * 6, hy + Math.sin(g) * 6);
        trail.push(tx, ty);
      },
      draw(g, p) {
        g.grid(1);
        const eL = Number(p.eyeLim) * DEG, nL = Number(p.neckLim) * DEG, tL = Number(p.torsoLim) * DEG;
        const cx = 0, cy = -3;
        // 上体の可動範囲と向き
        fan(g, cx, cy, 7.5, FWD - tL, FWD + tL, 0x2a2440, 1);
        const ta = FWD + torso;
        const sx = Math.cos(ta - FWD) * 2.2, sy = Math.sin(ta - FWD) * 2.2;
        g.line(cx - sx, cy - sy, cx + sx, cy + sy, 0xb48cff);
        g.circle(cx - sx, cy - sy, 0.4, 0xb48cff, { fill: true });
        g.circle(cx + sx, cy + sy, 0.4, 0xb48cff, { fill: true });
        g.arrow(cx, cy, Math.cos(ta) * 2.5, Math.sin(ta) * 2.5, 0xb48cff);
        // 首（上体基準）の可動範囲
        const [hx, hy] = headPos();
        g.line(cx, cy, hx, hy, 0x8c90b8);
        fan(g, hx, hy, 5, ta - nL, ta + nL, 0x1d3348, 1);
        const na = ta + neck;
        g.circle(hx, hy, 0.9, 0x6fd3ff, { fill: true });
        g.tri(hx + Math.cos(na) * 1.35, hy + Math.sin(na) * 1.35, hx + Math.cos(na + 0.5) * 0.85, hy + Math.sin(na + 0.5) * 0.85, hx + Math.cos(na - 0.5) * 0.85, hy + Math.sin(na - 0.5) * 0.85, 0x6fd3ff);
        // 目（頭基準）の可動範囲
        fan(g, hx, hy, 3.2, na - eL, na + eL, 0x3b3a20, 0.9);
        const ga = na + eye;
        for (const side of [-1, 1]) {
          const ex = hx + Math.cos(na + side * 0.45) * 0.7, ey = hy + Math.sin(na + side * 0.45) * 0.7;
          g.circle(ex, ey, 0.22, 0xffffff, { fill: true });
          g.circle(ex + Math.cos(ga) * 0.11, ey + Math.sin(ga) * 0.11, 0.1, 0x111111, { fill: true });
          g.line(ex, ey, ex + Math.cos(ga) * 12, ey + Math.sin(ga) * 12, 0xffd166, 0.35);
        }
        // 向きの矢印（首・視線）
        g.arrow(hx, hy, Math.cos(na) * 3, Math.sin(na) * 3, 0x6fd3ff);
        g.arrow(hx, hy, Math.cos(ga) * 4.2, Math.sin(ga) * 4.2, 0xffd166);
        if (p.showTrails) {
          g.polyline(trail.points(), 0xff6b8a, { fade: true, alpha: 0.6 });
          g.polyline(gazeTrail.points(), 0xffd166, { fade: true, alpha: 0.5 });
        }
        g.circle(tx, ty, 0.35, 0xff6b8a, { fill: true });
        g.circle(tx, ty, 0.6, 0xff6b8a);
      },
      pointer(x, y, down) {
        if (down) {
          tx = x;
          ty = y;
          jumpT = 4;
        }
      },
      status() {
        const [hx, hy] = headPos();
        const want = wrapAngle(Math.atan2(ty - hy, tx - hx) - FWD);
        const err = wrapAngle(want - torso - neck - eye);
        return `上体 ${(torso / DEG).toFixed(0)}° · 首 ${(neck / DEG).toFixed(0)}° · 目 ${(eye / DEG).toFixed(0)}° · 残りの誤差 ${(err / DEG).toFixed(1)}° · クリックで目標`;
      },
    };
  },
});
