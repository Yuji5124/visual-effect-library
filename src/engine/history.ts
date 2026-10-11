import * as THREE from 'three';
import { COPY_FRAGMENT, FullscreenQuad, createTarget, makeShader } from './fullscreen';

/**
 * 過去フレームを縮小して1枚のテクスチャにタイル状に保存するリングバッファ。
 * 1枚のサンプラーで任意の「n フレーム前」を参照できるので、
 * GLSL ES 1.0 でも行ごと・画素ごとに違う時刻を読める（スリットスキャン、時間差など）。
 */
export class HistoryAtlas {
  readonly cols: number;
  readonly rows: number;
  readonly count: number;
  readonly target: THREE.WebGLRenderTarget;
  private head = -1;
  private filled = 0;
  private tileW = 1;
  private tileH = 1;
  private readonly quad = new FullscreenQuad();
  private readonly copy = makeShader(COPY_FRAGMENT, { tDiffuse: { value: null } });

  /** シェーダーにそのまま渡せる uniform 群 */
  readonly uniforms = {
    tHistory: { value: null as THREE.Texture | null },
    uHistGrid: { value: new THREE.Vector2() },
    uHistHead: { value: 0 },
    uHistCount: { value: 0 },
    uHistFilled: { value: 0 },
    uHistTexel: { value: new THREE.Vector2() },
  };

  constructor(
    width: number,
    height: number,
    opts: { frames?: number; scale?: number } = {},
  ) {
    const frames = opts.frames ?? 32;
    this.cols = Math.ceil(Math.sqrt(frames * 1.5));
    this.rows = Math.ceil(frames / this.cols);
    this.count = this.cols * this.rows;
    this.target = createTarget(1, 1);
    this.scale = opts.scale ?? 0.25;
    this.resize(width, height);
    this.uniforms.tHistory.value = this.target.texture;
    this.uniforms.uHistGrid.value.set(this.cols, this.rows);
    this.uniforms.uHistCount.value = this.count;
  }

  private scale: number;

  resize(width: number, height: number): void {
    // GPUのテクスチャ上限(4096)を超えないようにタイルサイズを決める
    const maxTile = Math.floor(4096 / Math.max(this.cols, this.rows));
    this.tileW = Math.max(16, Math.min(maxTile, Math.floor(width * this.scale)));
    this.tileH = Math.max(16, Math.min(maxTile, Math.floor(height * this.scale)));
    this.target.setSize(this.tileW * this.cols, this.tileH * this.rows);
    this.uniforms.uHistTexel.value.set(1 / (this.tileW * this.cols), 1 / (this.tileH * this.rows));
    this.filled = 0;
    this.uniforms.uHistFilled.value = 0;
  }

  /** 現在のフレームを書き込む */
  push(renderer: THREE.WebGLRenderer, texture: THREE.Texture): void {
    this.head = (this.head + 1) % this.count;
    this.filled = Math.min(this.count, this.filled + 1);
    const col = this.head % this.cols;
    const row = Math.floor(this.head / this.cols);
    const t = this.target;
    t.viewport.set(col * this.tileW, row * this.tileH, this.tileW, this.tileH);
    t.scissor.set(col * this.tileW, row * this.tileH, this.tileW, this.tileH);
    t.scissorTest = true;
    this.copy.uniforms.tDiffuse.value = texture;
    this.quad.render(renderer, this.copy, t);
    t.scissorTest = false;
    t.viewport.set(0, 0, t.width, t.height);
    t.scissor.set(0, 0, t.width, t.height);
    this.uniforms.uHistHead.value = this.head;
    this.uniforms.uHistFilled.value = this.filled;
  }

  dispose(): void {
    this.target.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}

/** HistoryAtlas を読むためのGLSL（historyAt(uv, 何フレーム前)） */
export const GLSL_HISTORY = /* glsl */ `
uniform sampler2D tHistory;
uniform vec2 uHistGrid;
uniform float uHistHead;
uniform float uHistCount;
uniform float uHistFilled;
uniform vec2 uHistTexel;
vec3 historyAt(vec2 uv, float age) {
  age = clamp(floor(age), 0.0, max(uHistFilled - 1.0, 0.0));
  float idx = mod(uHistHead - age + uHistCount, uHistCount);
  vec2 tile = vec2(mod(idx, uHistGrid.x), floor(idx / uHistGrid.x));
  vec2 margin = uHistTexel * uHistGrid; // タイル境界のにじみ防止（タイル内座標で1テクセル）
  vec2 inner = clamp(uv, margin, 1.0 - margin);
  return texture2D(tHistory, (tile + inner) / uHistGrid).rgb;
}
`;

/** defineShaderPost の extra に渡す、履歴バッファ付きリソース */
export function historyExtra(opts: { frames?: number; scale?: number } = {}) {
  return (ctx: { renderer: THREE.WebGLRenderer; width: number; height: number; quality: string }) => {
    const atlas = new HistoryAtlas(ctx.width, ctx.height, {
      frames: opts.frames,
      scale: (opts.scale ?? 0.25) * (ctx.quality === 'low' ? 0.75 : 1),
    });
    return {
      uniforms: atlas.uniforms,
      beforeRender(input: THREE.Texture | null) {
        if (input) atlas.push(ctx.renderer, input);
      },
      resize: (w: number, h: number) => atlas.resize(w, h),
      dispose: () => atlas.dispose(),
    };
  };
}
