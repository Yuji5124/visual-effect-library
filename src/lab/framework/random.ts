/** シード付き乱数とノイズ（WORLD GENERATION の再現性のため、すべてシードから決定的に生成する） */

/** mulberry32：32bitシードから再現可能な一様乱数 [0,1) */
export function makeRng(seed: number): () => number {
  let a = (Math.floor(seed) * 2654435761) >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Noise2 = (x: number, y: number) => number;
export type Noise3 = (x: number, y: number, z: number) => number;

/** シード付き2Dグラディエントノイズ（パーリン型、出力はおおよそ -1..1） */
export function makeNoise2(seed: number): Noise2 {
  const rnd = makeRng(seed);
  const perm = new Uint8Array(512);
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256), gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = rnd() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const X = xi & 255, Y = yi & 255;
    const g = (ix: number, iy: number, dx: number, dy: number) => {
      const h = perm[perm[(X + ix) & 255] + ((Y + iy) & 255)];
      return gx[h] * dx + gy[h] * dy;
    };
    const u = fade(xf), v = fade(yf);
    const a = g(0, 0, xf, yf) + u * (g(1, 0, xf - 1, yf) - g(0, 0, xf, yf));
    const b = g(0, 1, xf, yf - 1) + u * (g(1, 1, xf - 1, yf - 1) - g(0, 1, xf, yf - 1));
    return (a + v * (b - a)) * 1.414;
  };
}

/** シード付き3Dバリューノイズ（洞窟・雲など、出力 0..1） */
export function makeNoise3(seed: number): Noise3 {
  const s = Math.floor(seed) * 1013904223;
  const hash = (x: number, y: number, z: number) => {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177 + s) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967295;
  };
  const f = (t: number) => t * t * (3 - 2 * t);
  return (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const u = f(x - xi), v = f(y - yi), w = f(z - zi);
    const l = (a: number, b: number, t: number) => a + (b - a) * t;
    return l(
      l(l(hash(xi, yi, zi), hash(xi + 1, yi, zi), u), l(hash(xi, yi + 1, zi), hash(xi + 1, yi + 1, zi), u), v),
      l(l(hash(xi, yi, zi + 1), hash(xi + 1, yi, zi + 1), u), l(hash(xi, yi + 1, zi + 1), hash(xi + 1, yi + 1, zi + 1), u), v),
      w,
    );
  };
}

/** 2Dノイズのフラクタル和（fBm） */
export function fbm2(noise: Noise2, x: number, y: number, octaves = 5, lacunarity = 2, gain = 0.5): number {
  let sum = 0, amp = 1, norm = 0, fx = x, fy = y;
  for (let i = 0; i < octaves; i++) {
    sum += noise(fx, fy) * amp;
    norm += amp;
    amp *= gain;
    fx *= lacunarity;
    fy *= lacunarity;
  }
  return sum / norm;
}
