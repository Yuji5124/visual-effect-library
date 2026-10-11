import * as THREE from 'three';
import { FullscreenQuad, makeShader } from '../../engine/fullscreen';
import type { SourceEffect } from '../../engine/types';

const DISPLAY = /* glsl */ `
uniform sampler2D tGrid;
varying vec2 vUv;
void main() { gl_FragColor = vec4(texture2D(tGrid, vUv).rgb, 1.0); }
`;

const EMPTY = 0;
const WALL = 1;
const SAND = 2;

const effect: SourceEffect = {
  id: '058',
  kind: 'source',
  status: 'implemented',
  params: [
    { key: 'flow', label: '注ぐ量', type: 'number', min: 0, max: 30, step: 1, default: 10 },
    { key: 'slide', label: '崩れやすさ', type: 'number', min: 0, max: 1, step: 0.01, default: 0.9 },
    { key: 'hueSpeed', label: '色の移り変わり', type: 'number', min: 0, max: 1, step: 0.01, default: 0.15 },
    { key: 'cell', label: '粒の大きさ(px)', type: 'number', min: 2, max: 8, step: 1, default: 4 },
  ],
  notes:
    '各セルが「空・壁・砂」を持つセルオートマトン。砂は下が空なら落ち、ふさがっていれば斜め下へ滑る（左右はランダム順で偏りを防ぐ）。下の行から順に1回ずつ更新し、結果をデータテクスチャとしてGPUへ送る。底がいっぱいになると排水してループする。ドラッグで砂を注げる。',
  create(ctx) {
    let cell = 4;
    let W = 0;
    let H = 0;
    let grid = new Uint8Array(0);
    let color = new Uint8Array(0);
    let moved = new Uint8Array(0);
    let tex: THREE.DataTexture | null = null;
    let pixels = new Uint8Array(0);
    const quad = new FullscreenQuad();
    const display = makeShader(DISPLAY, { tGrid: { value: null } });
    const c = new THREE.Color();
    let hue = Math.random();
    let drain = 0;

    const alloc = () => {
      W = Math.max(40, Math.floor(ctx.width / cell));
      H = Math.max(30, Math.floor(ctx.height / cell));
      grid = new Uint8Array(W * H);
      color = new Uint8Array(W * H * 3);
      moved = new Uint8Array(W * H);
      pixels = new Uint8Array(W * H * 4);
      // 斜めの棚（壁）をいくつか置く
      for (let k = 0; k < 5; k++) {
        const cx = Math.floor(W * (0.15 + Math.random() * 0.7));
        const cy = Math.floor(H * (0.25 + k * 0.12));
        const len = Math.floor(W * (0.08 + Math.random() * 0.12));
        const dir = Math.random() < 0.5 ? -1 : 1;
        for (let i = 0; i < len; i++) {
          const x = cx + i;
          const y = cy + Math.floor(i * 0.5) * dir;
          if (x >= 0 && x < W && y >= 0 && y < H) {
            grid[y * W + x] = WALL;
            if (y + 1 < H) grid[(y + 1) * W + x] = WALL;
          }
        }
      }
      tex?.dispose();
      tex = new THREE.DataTexture(pixels, W, H, THREE.RGBAFormat);
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      display.uniforms.tGrid.value = tex;
    };
    alloc();
    const ptr = { x: 0, y: 0, down: false };
    const pour = (x: number, y: number, n: number, spread: number) => {
      for (let i = 0; i < n; i++) {
        const px = Math.round(x + (Math.random() - 0.5) * spread);
        const py = Math.round(y - Math.random() * 2);
        if (px < 0 || px >= W || py < 0 || py >= H) continue;
        const idx = py * W + px;
        if (grid[idx] !== EMPTY) continue;
        grid[idx] = SAND;
        c.setHSL((hue + Math.random() * 0.05) % 1, 0.75, 0.45 + Math.random() * 0.2);
        color[idx * 3] = c.r * 255;
        color[idx * 3 + 1] = c.g * 255;
        color[idx * 3 + 2] = c.b * 255;
      }
    };
    const move = (from: number, to: number) => {
      grid[to] = SAND;
      grid[from] = EMPTY;
      color[to * 3] = color[from * 3];
      color[to * 3 + 1] = color[from * 3 + 1];
      color[to * 3 + 2] = color[from * 3 + 2];
      moved[to] = 1;
    };

    return {
      render(target, params, frame) {
        const cs = Math.round(Number(params.cell));
        if (cs !== cell) {
          cell = cs;
          alloc();
        }
        hue = (hue + frame.dt * Number(params.hueSpeed) * 0.2) % 1;
        // 配列の行0を「画面の下」とする
        const top = H - 2;
        const flow = Number(params.flow);
        pour(W * (0.5 + Math.sin(frame.time * 0.4) * 0.3), top, flow, 3);
        if (ptr.down) pour(ptr.x * W, ptr.y * H, 12, 5);
        const slide = Number(params.slide);
        moved.fill(0);
        for (let y = 1; y < H; y++) {
          const ltr = Math.random() < 0.5;
          for (let i = 0; i < W; i++) {
            const x = ltr ? i : W - 1 - i;
            const idx = y * W + x;
            if (grid[idx] !== SAND || moved[idx]) continue;
            const below = idx - W;
            if (grid[below] === EMPTY) {
              move(idx, below);
              continue;
            }
            if (Math.random() > slide) continue;
            const d = Math.random() < 0.5 ? -1 : 1;
            for (const dx of [d, -d]) {
              const nx = x + dx;
              if (nx < 0 || nx >= W) continue;
              if (grid[below + dx] === EMPTY && grid[idx + dx] === EMPTY) {
                move(idx, below + dx);
                break;
              }
            }
          }
        }
        // 底の行が埋まってきたら排水してループさせる
        let filled = 0;
        for (let x = 0; x < W; x++) if (grid[W * Math.floor(H * 0.6) + x] === SAND) filled++;
        if (filled > W * 0.5) drain = 2;
        if (drain > 0) {
          drain -= frame.dt;
          for (let x = 0; x < W; x++) if (grid[x] === SAND) grid[x] = EMPTY;
        }
        for (let i = 0; i < W * H; i++) {
          const g = grid[i];
          const o = i * 4;
          if (g === SAND) {
            pixels[o] = color[i * 3];
            pixels[o + 1] = color[i * 3 + 1];
            pixels[o + 2] = color[i * 3 + 2];
          } else if (g === WALL) {
            pixels[o] = 90;
            pixels[o + 1] = 80;
            pixels[o + 2] = 110;
          } else {
            pixels[o] = 10;
            pixels[o + 1] = 9;
            pixels[o + 2] = 20;
          }
          pixels[o + 3] = 255;
        }
        tex!.needsUpdate = true;
        quad.render(ctx.renderer, display, target);
      },
      resize() {
        alloc();
      },
      pointer(x, y, down) {
        ptr.x = x;
        ptr.y = y;
        ptr.down = down;
      },
      dispose() {
        tex?.dispose();
        display.dispose();
        quad.dispose();
      },
    };
  },
};

export default effect;
