import * as THREE from 'three';
import { COPY_FRAGMENT, FullscreenQuad, createTarget, makeShader } from './fullscreen';
import type {
  EffectContext,
  EffectModule,
  FrameInfo,
  ParamValues,
  PostInstance,
  Quality,
  SourceInstance,
} from './types';
import { defaultParams } from './types';

/**
 * シェーダーのコンパイル／リンク失敗を検知するための仕掛け。
 * Three.js は失敗しても例外を投げないため、debug.onShaderError で捕まえて
 * 「どの演出が失敗したか」をパイプライン側で判定できるようにする。
 */
class ShaderErrorTrap {
  private pending: string | null = null;

  constructor(renderer: THREE.WebGLRenderer) {
    renderer.debug.checkShaderErrors = true;
    renderer.debug.onShaderError = (gl, program, vs, fs) => {
      const log =
        [gl.getProgramInfoLog(program), gl.getShaderInfoLog(vs), gl.getShaderInfoLog(fs)]
          .filter((s) => s && s.trim())
          .join('\n') || 'shader compile/link error';
      console.error('[VFX] shader error\n' + log);
      this.pending = log;
    };
  }

  take(): string | null {
    const p = this.pending;
    this.pending = null;
    return p;
  }
}

const traps = new WeakMap<THREE.WebGLRenderer, ShaderErrorTrap>();
export function shaderTrap(renderer: THREE.WebGLRenderer): ShaderErrorTrap {
  let t = traps.get(renderer);
  if (!t) {
    t = new ShaderErrorTrap(renderer);
    traps.set(renderer, t);
  }
  return t;
}

let stageSeq = 0;

export interface Stage<I = SourceInstance | PostInstance> {
  uid: number;
  module: EffectModule;
  params: ParamValues;
  enabled: boolean;
  instance: I | null;
  error: string | null;
}

export interface PipelineOptions {
  width: number;
  height: number;
  quality: Quality;
  /** 演出の失敗通知。失敗した演出だけが無効化され、他は動き続ける */
  onError?: (stage: Stage, message: string) => void;
}

/**
 * ソース演出 1つ → ポスト演出 N個 を順に適用する描画パイプライン。
 * 各段は独立して生成・破棄され、1段が失敗しても残りは動作を続ける。
 */
export class EffectPipeline {
  readonly ctx: EffectContext;
  source: Stage<SourceInstance> | null = null;
  readonly posts: Stage<PostInstance>[] = [];

  private a: THREE.WebGLRenderTarget;
  private b: THREE.WebGLRenderTarget;
  private readonly quad = new FullscreenQuad();
  private readonly copy = makeShader(COPY_FRAGMENT, { tDiffuse: { value: null } });
  private readonly trap: ShaderErrorTrap;
  private disposed = false;

  constructor(
    readonly renderer: THREE.WebGLRenderer,
    private readonly opts: PipelineOptions,
  ) {
    this.ctx = { renderer, width: opts.width, height: opts.height, quality: opts.quality };
    // 3Dシーンを直接描く演出のために深度バッファも持たせる
    this.a = createTarget(opts.width, opts.height, { depth: true });
    this.b = createTarget(opts.width, opts.height, { depth: true });
    this.trap = shaderTrap(renderer);
  }

  get output(): THREE.Texture {
    return this.a.texture;
  }

  private fail(stage: Stage, err: unknown): void {
    const message = err instanceof Error ? err.message : String(err);
    stage.error = message;
    try {
      stage.instance?.dispose();
    } catch {
      /* 破棄失敗は無視（既に壊れている） */
    }
    stage.instance = null;
    console.error(`[VFX] effect ${stage.module.id} failed:`, err);
    this.opts.onError?.(stage, message);
  }

  private instantiate<I>(stage: Stage<I>): void {
    try {
      this.trap.take();
      stage.instance = stage.module.create(this.ctx) as I;
    } catch (e) {
      this.fail(stage as Stage, e);
    }
  }

  setSource(module: EffectModule, params?: ParamValues): Stage<SourceInstance> {
    if (module.kind !== 'source') throw new Error(`${module.id} is not a source effect`);
    if (this.source) this.disposeStage(this.source);
    const stage: Stage<SourceInstance> = {
      uid: ++stageSeq,
      module,
      params: { ...defaultParams(module.params), ...params },
      enabled: true,
      instance: null,
      error: null,
    };
    this.source = stage;
    this.instantiate(stage);
    return stage;
  }

  /**
   * 既に生成済みのソース（例: ゲーム側の SceneSource）を入力として使う。
   * 他のThree.jsゲームへ移植する時の基本的な使い方。
   */
  useSourceInstance(instance: SourceInstance, id = 'custom'): Stage<SourceInstance> {
    if (this.source) this.disposeStage(this.source);
    const stage: Stage<SourceInstance> = {
      uid: ++stageSeq,
      module: { id, kind: 'source', status: 'implemented', params: [], create: () => instance },
      params: {},
      enabled: true,
      instance,
      error: null,
    };
    this.source = stage;
    return stage;
  }

  addPost(module: EffectModule, params?: ParamValues, index = this.posts.length): Stage<PostInstance> {
    if (module.kind !== 'post') throw new Error(`${module.id} is not a post effect`);
    const stage: Stage<PostInstance> = {
      uid: ++stageSeq,
      module,
      params: { ...defaultParams(module.params), ...params },
      enabled: true,
      instance: null,
      error: null,
    };
    this.posts.splice(index, 0, stage);
    this.instantiate(stage);
    return stage;
  }

  removePost(stage: Stage): void {
    const i = this.posts.indexOf(stage as Stage<PostInstance>);
    if (i >= 0) {
      this.posts.splice(i, 1);
      this.disposeStage(stage);
    }
  }

  movePost(stage: Stage, delta: number): void {
    const i = this.posts.indexOf(stage as Stage<PostInstance>);
    const j = i + delta;
    if (i < 0 || j < 0 || j >= this.posts.length) return;
    const [s] = this.posts.splice(i, 1);
    this.posts.splice(j, 0, s);
  }

  clearPosts(): void {
    for (const s of this.posts.splice(0)) this.disposeStage(s);
  }

  /** 失敗した段を作り直す */
  retry(stage: Stage): void {
    if (stage.instance) return;
    stage.error = null;
    this.instantiate(stage);
  }

  resize(width: number, height: number): void {
    width = Math.max(1, Math.floor(width));
    height = Math.max(1, Math.floor(height));
    if (width === this.ctx.width && height === this.ctx.height) return;
    this.ctx.width = width;
    this.ctx.height = height;
    this.a.setSize(width, height);
    this.b.setSize(width, height);
    const all: Stage[] = [...(this.source ? [this.source] : []), ...this.posts];
    for (const s of all) {
      try {
        s.instance?.resize?.(width, height);
      } catch (e) {
        this.fail(s, e);
      }
    }
  }

  /**
   * 1フレーム描画する。
   * @param toScreen true なら最終結果を現在のビューポート（canvas）へ書き出す
   * @param input ソースの代わりに使う入力テクスチャ（プレビューでデモシーンを共有する時など）
   */
  render(frame: FrameInfo, toScreen: boolean, input?: THREE.Texture): THREE.Texture {
    if (this.disposed) return this.a.texture;
    const r = this.renderer;
    let current: THREE.Texture;

    if (input) {
      current = input;
    } else {
      const src = this.source;
      if (src?.instance && src.enabled) {
        try {
          this.trap.take();
          src.instance.render(this.a, src.params, frame);
          const err = this.trap.take();
          if (err) throw new Error(err);
        } catch (e) {
          this.fail(src, e);
        }
      }
      if (!src?.instance) {
        r.setRenderTarget(this.a);
        r.setClearColor(0x000000, 1);
        r.clear();
      }
      current = this.a.texture;
    }

    let write = this.a.texture === current ? this.b : this.a;
    for (const stage of this.posts) {
      if (!stage.enabled || !stage.instance) continue;
      try {
        this.trap.take();
        stage.instance.render(current, write, stage.params, frame);
        const err = this.trap.take();
        if (err) throw new Error(err);
        current = write.texture;
        write = write === this.a ? this.b : this.a;
      } catch (e) {
        this.fail(stage, e);
      }
    }

    if (toScreen) {
      this.copy.uniforms.tDiffuse.value = current;
      this.quad.render(r, this.copy, null);
    }
    return current;
  }

  private disposeStage(stage: Stage): void {
    try {
      stage.instance?.dispose();
    } catch (e) {
      console.warn('[VFX] dispose failed', e);
    }
    stage.instance = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.source) this.disposeStage(this.source);
    this.clearPosts();
    this.a.dispose();
    this.b.dispose();
    this.copy.dispose();
    this.quad.dispose();
  }
}
