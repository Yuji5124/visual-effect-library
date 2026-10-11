import * as THREE from 'three';
import { defineWorldDemo } from '../framework/sceneLab';
import { BoxBatch } from '../framework/worldKit';

/** WRD-015 パラメトリック建築：基壇・中層（セットバック段）・頂部 → 階 → ベイ → 窓と壁、を数値だけから組み立てる */
const BAY = 0.42;

export default defineWorldDemo({
  id: 'WRD-015',
  notes: '建物を「基壇（高い階・大きな窓・庇）／中層（セットバックの段ごとに1ベイずつ後退）／頂部（コーニス・塔屋）」に分け、各段の各面を階×ベイの格子に分割して、柱（ベイ境界）・階ごとの帯（スラブ）・窓（ベイ幅×窓の比率）をインスタンスの箱として並べる。数値を変えると同じ規則から別の建物が即座に組み上がる。比較の左はファサードを付ける前のボリューム（マス）だけ。',
  params: [
    { key: 'floors', label: '階数', type: 'number', min: 3, max: 48, step: 1, default: 22 },
    { key: 'bays', label: 'ベイ数（間口）', type: 'number', min: 2, max: 12, step: 1, default: 7 },
    { key: 'win', label: '窓の比率', type: 'number', min: 0.15, max: 0.95, step: 0.01, default: 0.62 },
    { key: 'tiers', label: 'セットバック段', type: 'number', min: 0, max: 4, step: 1, default: 2 },
    { key: 'floorH', label: '階高', type: 'number', min: 0.08, max: 0.2, step: 0.005, default: 0.13 },
    { key: 'podium', label: '基壇の階数', type: 'number', min: 0, max: 4, step: 1, default: 2 },
    { key: 'penthouse', label: '屋上の塔屋', type: 'bool', default: true },
    { key: 'style', label: '外装', type: 'select', options: [{ value: 'stone', label: '石張り' }, { value: 'glass', label: 'ガラスとアルミ' }, { value: 'brick', label: 'れんが' }], default: 'stone' },
  ],
  distance: 9,
  elevation: 0.35,
  target: [0, 1.2, 0],
  compareLabels: ['ボリューム（マス）', 'ファサード'],
  build(p, env) {
    const rng = env.rng;
    const floors = Number(p.floors), bays = Number(p.bays), win = Number(p.win), fh = Number(p.floorH);
    const tiers = Number(p.tiers), podium = Math.min(Number(p.podium), floors - 1);
    const dBays = Math.max(2, Math.round(bays * 0.65));
    const style = String(p.style);
    const pal = style === 'glass' ? { wall: 0x2c3846, col: 0xb8c0c8, band: 0xa0a8b0, glass: 0x6fa3c8 } : style === 'brick' ? { wall: 0x8a4a36, col: 0x9c5a44, band: 0xd8cfc0, glass: 0x2c3a4c } : { wall: 0xcfc6b4, col: 0xe6dfd0, band: 0xbdb3a0, glass: 0x34506c };

    const core = new BoxBatch(), cols = new BoxBatch(), bands = new BoxBatch(), glass = new BoxBatch(), mass = new BoxBatch();
    // 段（セグメント）：基壇＋中層を tiers+1 段に分け、上ほど少ない階数にする
    const shaft = floors - podium;
    const weights = Array.from({ length: tiers + 1 }, (_, i) => tiers + 1 - i * 0.6);
    const wsum = weights.reduce((a, b) => a + b, 0);
    const segFloors = weights.map((w) => Math.max(0, Math.round((shaft * w) / wsum)));
    let diff = shaft - segFloors.reduce((a, b) => a + b, 0);
    for (let i = 0; diff !== 0 && i < 50; i++) {
      const k = i % segFloors.length;
      if (diff > 0) (segFloors[k]++, diff--);
      else if (segFloors[k] > 0) (segFloors[k]--, diff++);
    }
    interface Seg { wb: number; db: number; y0: number; n: number; h: number; podium: boolean }
    const segs: Seg[] = [];
    let y = 0.04;
    if (podium > 0) {
      segs.push({ wb: bays, db: dBays, y0: y, n: podium, h: fh * 1.45, podium: true });
      y += podium * fh * 1.45;
    }
    segFloors.forEach((n, i) => {
      if (n <= 0) return;
      const wb = Math.max(1, bays - 2 * i), db = Math.max(1, dBays - 2 * i);
      segs.push({ wb, db, y0: y, n, h: fh, podium: false });
      y += n * fh;
    });
    const top = y;
    const BAND = Math.min(0.035, fh * 0.25), COLW = 0.055;
    let nWin = 0;
    for (const s of segs) {
      const W = s.wb * BAY, D = s.db * BAY, H = s.n * s.h;
      mass.addOnGround(0, 0, W, H, D, 0xb7bcc6, s.y0);
      core.addOnGround(0, 0, W - 0.02, H, D - 0.02, pal.wall, s.y0);
      // コーニス（段の頂部）
      bands.addOnGround(0, 0, W + 0.08, 0.05, D + 0.08, pal.band, s.y0 + H);
      // 4面：(中心からの法線方向, 面の幅, ベイ数)
      const faces: [number, number, number, number, number][] = [
        [0, D / 2, W, s.wb, 0],
        [0, -D / 2, W, s.wb, Math.PI],
        [W / 2, 0, D, s.db, -Math.PI / 2],
        [-W / 2, 0, D, s.db, Math.PI / 2],
      ];
      for (const [fx, fz, fw, nb, ry] of faces) {
        const nx = Math.sign(fx), nz = Math.sign(fz);
        // 面に沿った単位ベクトル（ry 回転後の x 軸）
        const ux = Math.cos(ry), uz = -Math.sin(ry);
        const at = (u: number, out: number) => [fx + ux * u + nx * out, fz + uz * u + nz * out] as const;
        const bw = fw / nb;
        // 柱：ベイ境界ごとに1本、段の高さいっぱい
        for (let b = 0; b <= nb; b++) {
          const [x, z] = at(-fw / 2 + b * bw, 0.015);
          cols.addOnGround(x, z, COLW, H, 0.06, pal.col, s.y0, ry);
        }
        for (let f = 0; f < s.n; f++) {
          const fy = s.y0 + f * s.h;
          // 階の帯（スラブ）
          const [bx, bz] = at(0, 0.012);
          bands.addOnGround(bx, bz, fw + 0.02, BAND, 0.04, pal.band, fy, ry);
          for (let b = 0; b < nb; b++) {
            const isDoor = s.podium && f === 0 && nz > 0 && b === Math.floor(nb / 2);
            const ww = (bw - COLW) * (s.podium ? Math.max(win, 0.85) : win);
            const wh = isDoor ? s.h - BAND - 0.01 : (s.h - BAND) * (s.podium ? 0.82 : 0.35 + 0.55 * win);
            const wy = isDoor ? fy + BAND : fy + BAND + (s.h - BAND - wh) * (s.podium ? 0.4 : 0.55);
            const [x, z] = at(-fw / 2 + (b + 0.5) * bw, 0.004);
            const lit = rng() < 0.12;
            const c = isDoor ? 0x1a1a1a : lit ? 0xf3d98a : pal.glass;
            glass.addOnGround(x, z, ww, wh, 0.02, c, wy, ry);
            nWin++;
          }
        }
      }
      if (s.podium) {
        // 正面の庇
        bands.addOnGround(0, D / 2 + 0.12, W * 0.45, 0.03, 0.24, pal.col, s.y0 + s.h * 0.95);
      }
    }
    // 頂部：パラペットと塔屋
    const last = segs[segs.length - 1];
    if (p.penthouse && last) {
      const W = last.wb * BAY, D = last.db * BAY;
      core.addOnGround(0, 0, W * 0.45, fh * 1.6, D * 0.45, pal.wall, top + 0.05);
      bands.addOnGround(0, 0, W * 0.5, 0.04, D * 0.5, pal.band, top + 0.05 + fh * 1.6);
      cols.addOnGround(W * 0.12, 0, 0.025, fh * 4, 0.025, 0xd0d0d0, top + 0.09 + fh * 1.6);
      mass.addOnGround(0, 0, W * 0.45, fh * 1.6, D * 0.45, 0xb7bcc6, top + 0.05);
    }

    const object = new THREE.Group();
    const plaza = new BoxBatch();
    plaza.addOnGround(0, 0.4, bays * BAY + 1.6, 0.04, dBays * BAY + 2.4, 0x8d8a84);
    plaza.addOnGround(0, dBays * BAY / 2 + 1.25, bays * BAY + 3, 0.02, 0.7, 0x3a3d45);
    object.add(plaza.build(new THREE.MeshStandardMaterial({ roughness: 0.95 })));
    object.add(core.build(new THREE.MeshStandardMaterial({ roughness: 0.85 })));
    object.add(cols.build(new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: style === 'glass' ? 0.5 : 0.05 })));
    object.add(bands.build(new THREE.MeshStandardMaterial({ roughness: 0.7 })));
    object.add(glass.build(new THREE.MeshStandardMaterial({ roughness: 0.12, metalness: 0.6, emissive: 0x0b0f18 })));

    const before = new THREE.Group();
    const pl2 = new BoxBatch();
    pl2.addOnGround(0, 0.4, bays * BAY + 1.6, 0.04, dBays * BAY + 2.4, 0x8d8a84);
    before.add(pl2.build());
    before.add(mass.build(new THREE.MeshStandardMaterial({ roughness: 0.8, transparent: true, opacity: 0.9 })));

    return {
      object,
      before,
      info: `段 ${segs.length}（基壇 ${podium} 階 + ${segFloors.join('/')} 階） · 高さ ${top.toFixed(2)} · 窓 ${nWin} · 柱 ${cols.count} · 帯 ${bands.count}`,
    };
  },
});
