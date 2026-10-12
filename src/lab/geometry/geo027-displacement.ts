import * as THREE from 'three';
import { defineGeometryDemo, std } from '../framework/sceneLab';
import { makeNoise2, fbm2 } from '../framework/random';

/** GEO-027 ディスプレイスメント：Canvas2D で作った高さ画像を CPU でサンプリングし、法線方向へ押し出す */
const IMG = 256;

function blur(src: Float32Array, r: number): Float32Array {
  // 横・縦の箱型ぼかし（文字の縁を斜面にする）
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length);
  for (let pass = 0; pass < 2; pass++) {
    const a = pass ? tmp : src, b = pass ? out : tmp;
    for (let y = 0; y < IMG; y++)
      for (let x = 0; x < IMG; x++) {
        let s = 0, c = 0;
        for (let k = -r; k <= r; k++) {
          const xx = pass ? x : (x + k + IMG) % IMG, yy = pass ? Math.min(IMG - 1, Math.max(0, y + k)) : y;
          s += a[yy * IMG + xx];
          c++;
        }
        b[y * IMG + x] = s / c;
      }
  }
  return out;
}

/** 高さ画像を手続き生成して、表示用の canvas と 0..1 の高さ配列を返す */
function makeHeightImage(kind: string, seed: number): { canvas: HTMLCanvasElement; h: Float32Array } {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = IMG;
  const g = canvas.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, IMG, IMG);
  if (kind === 'text' || kind === 'mix') {
    g.fillStyle = '#fff';
    g.font = 'bold 92px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('VFX', IMG / 2, IMG / 2 - 30);
    g.font = 'bold 54px sans-serif';
    g.fillText('366', IMG / 2, IMG / 2 + 52);
  }
  const data = g.getImageData(0, 0, IMG, IMG).data;
  let h: Float32Array = new Float32Array(IMG * IMG);
  for (let i = 0; i < IMG * IMG; i++) h[i] = data[i * 4] / 255;
  if (kind === 'text' || kind === 'mix') h = blur(h, 3);
  const noise = makeNoise2(seed);
  for (let y = 0; y < IMG; y++)
    for (let x = 0; x < IMG; x++) {
      const i = y * IMG + x;
      if (kind === 'noise') h[i] = 0.5 + 0.5 * fbm2(noise, x / 40, y / 40, 5);
      else if (kind === 'mix') h[i] = h[i] * 0.85 + 0.15 * (0.5 + 0.5 * fbm2(noise, x / 18, y / 18, 4));
      else if (kind === 'rings') {
        const r = Math.hypot(x - IMG / 2, y - IMG / 2);
        h[i] = 0.5 + 0.5 * Math.cos(r * 0.25) * Math.cos((x / IMG) * Math.PI * 8);
      }
    }
  // 表示用 canvas に最終の高さを書き戻す
  const img = g.createImageData(IMG, IMG);
  for (let i = 0; i < IMG * IMG; i++) {
    const v = Math.max(0, Math.min(255, h[i] * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return { canvas, h };
}

/** 双線形補間（u は周期的、v は端で止める） */
function sample(h: Float32Array, u: number, v: number): number {
  u = ((u % 1) + 1) % 1;
  const fx = u * IMG, fy = Math.min(IMG - 1.001, Math.max(0, (1 - v) * (IMG - 1)));
  const x0 = Math.floor(fx) % IMG, y0 = Math.floor(fy);
  const x1 = (x0 + 1) % IMG, y1 = y0 + 1;
  const tx = fx - Math.floor(fx), ty = fy - y0;
  const a = h[y0 * IMG + x0] * (1 - tx) + h[y0 * IMG + x1] * tx;
  const b = h[y1 * IMG + x0] * (1 - tx) + h[y1 * IMG + x1] * tx;
  return a * (1 - ty) + b * ty;
}

export default defineGeometryDemo({
  id: 'GEO-027',
  notes: 'Canvas2D に文字・ノイズ・同心円の高さ画像を描き（右のパネル）、細分割した平面または球の各頂点で UV から明るさ h を双線形補間して、法線方向へ h×強さ だけ動かしてから法線を再計算する。分割数を下げると文字が崩れ、シルエットまで変わることを確認できる。',
  params: [
    { key: 'strength', label: '変位の強さ', type: 'number', min: -0.6, max: 0.6, step: 0.01, default: 0.35 },
    { key: 'segments', label: '分割数', type: 'number', min: 16, max: 256, step: 8, default: 160 },
    { key: 'image', label: '画像の種類', type: 'select', options: [{ value: 'mix', label: '文字＋ノイズ' }, { value: 'text', label: '文字' }, { value: 'noise', label: 'ノイズ（fBm）' }, { value: 'rings', label: '同心円の波' }], default: 'mix' },
    { key: 'surface', label: '面', type: 'select', options: [{ value: 'plane', label: '平面' }, { value: 'sphere', label: '球' }], default: 'plane' },
  ],
  distance: 8,
  elevation: 0.7,
  compareLabels: ['変位前', 'ディスプレイスメント'],
  build(p, env) {
    const seg = Math.min(Number(p.segments), env.quality === 'low' ? 128 : 256);
    const sphere = p.surface === 'sphere';
    const src = sphere ? new THREE.SphereGeometry(1.5, seg, Math.max(8, seg / 2)) : new THREE.PlaneGeometry(4, 4, seg, seg).rotateX(-Math.PI / 2);
    const { canvas, h } = makeHeightImage(String(p.image), 7);
    const geo = src.clone();
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const nrm = src.attributes.normal as THREE.BufferAttribute;
    const uv = src.attributes.uv as THREE.BufferAttribute;
    const k = Number(p.strength);
    const colors = new Float32Array(pos.count * 3);
    const lo = new THREE.Color(0x30335a), hi = new THREE.Color(0xffd08a), c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const u = uv.getX(i), v = uv.getY(i);
      let hh = sample(h, u, v);
      // 球の極は全頂点が1点に集まるので、近くで変位を弱めて裂け目を防ぐ
      if (sphere) hh *= THREE.MathUtils.smoothstep(Math.min(v, 1 - v), 0.02, 0.12);
      pos.setXYZ(i, pos.getX(i) + nrm.getX(i) * hh * k, pos.getY(i) + nrm.getY(i) * hh * k, pos.getZ(i) + nrm.getZ(i) * hh * k);
      c.copy(lo).lerp(hi, hh);
      colors.set([c.r, c.g, c.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new THREE.Mesh(geo, std(0xffffff, { vertexColors: true, roughness: 0.6 }));
    const before = new THREE.Mesh(src, std(0x8890b0));
    // 高さ画像のパネル（補助表示）
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
    panel.position.set(sphere ? 2.8 : 3.2, sphere ? 0 : 1.0, 0);
    if (!sphere) panel.rotation.y = -0.4;
    let mn = Infinity, mx = -Infinity;
    for (const v of h) {
      mn = Math.min(mn, v);
      mx = Math.max(mx, v);
    }
    return {
      object: mesh,
      before,
      helpers: panel,
      info: `画像 ${IMG}² · 高さ ${mn.toFixed(2)}〜${mx.toFixed(2)} · 最大変位 ${(Math.abs(k) * mx).toFixed(2)}`,
    };
  },
});
