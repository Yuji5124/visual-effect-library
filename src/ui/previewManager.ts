import * as THREE from 'three';
import { EffectPipeline } from '../engine/pipeline';
import { demoScene } from '../engine/demoScene';
import type { Quality } from '../engine/types';
import { loadEffect } from '../effects/registry';

interface PreviewSlot {
  id: string;
  canvas: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  visible: boolean;
  pipeline: EffectPipeline | null;
  kind: 'source' | 'post' | null;
  loading: boolean;
  failed: boolean;
  lastTime: number;
  time: number;
  frame: number;
  onState: (state: 'loading' | 'live' | 'error', message?: string) => void;
}

/**
 * カタログのライブプレビューを1つのWebGLコンテキストで描画する管理クラス。
 * ブラウザのWebGLコンテキスト数上限（iPadでは特に少ない）を避けるため、
 * 共有レンダラーで描画 → 各カードの2Dキャンバスへ drawImage で転写する。
 * 画面内に見えているカードだけを生成し、見えなくなったら即座に破棄する。
 */
export class PreviewManager {
  private renderer: THREE.WebGLRenderer | null = null;
  private readonly slots = new Map<HTMLCanvasElement, PreviewSlot>();
  private readonly observer: IntersectionObserver;
  private demo: EffectPipeline | null = null;
  private demoTime = 0;
  private raf = 0;
  private cursor = 0;
  private last = performance.now();
  private paused = false;
  private enabled = true;
  private contextLost = false;
  readonly width: number;
  readonly height: number;
  private readonly perTick: number;
  private readonly maxLive: number;

  constructor(quality: Quality) {
    this.width = quality === 'high' ? 320 : 240;
    this.height = Math.round((this.width * 9) / 16);
    this.perTick = quality === 'high' ? 5 : 2;
    this.maxLive = quality === 'high' ? 18 : 8;
    this.observer = new IntersectionObserver((entries) => this.onIntersect(entries), {
      rootMargin: '100px 0px',
    });
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.start()));
  }

  private ensureRenderer(): THREE.WebGLRenderer | null {
    if (this.renderer || this.contextLost) return this.renderer;
    try {
      const canvas = document.createElement('canvas');
      const r = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
      r.setPixelRatio(1);
      r.setSize(this.width, this.height, false);
      canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.contextLost = true;
        this.resetAll();
      });
      canvas.addEventListener('webglcontextrestored', () => {
        this.contextLost = false;
      });
      this.renderer = r;
    } catch (e) {
      console.error('[VFX] preview renderer unavailable', e);
      for (const s of this.slots.values()) s.onState('error', 'WebGLを初期化できません');
      this.enabled = false;
    }
    return this.renderer;
  }

  register(
    id: string,
    canvas: HTMLCanvasElement,
    onState: PreviewSlot['onState'],
  ): void {
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;
    this.slots.set(canvas, {
      id,
      canvas,
      ctx2d,
      visible: false,
      pipeline: null,
      kind: null,
      loading: false,
      failed: false,
      lastTime: 0,
      time: Math.random() * 10,
      frame: 0,
      onState,
    });
    this.observer.observe(canvas);
  }

  /** カタログの再描画前に呼び、全スロットを破棄する */
  clear(): void {
    this.observer.disconnect();
    for (const s of this.slots.values()) this.release(s);
    this.slots.clear();
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    for (const e of entries) {
      const slot = this.slots.get(e.target as HTMLCanvasElement);
      if (!slot) continue;
      slot.visible = e.isIntersecting;
      if (!slot.visible) this.release(slot);
    }
  }

  private release(slot: PreviewSlot): void {
    slot.pipeline?.dispose();
    slot.pipeline = null;
  }

  private resetAll(): void {
    for (const s of this.slots.values()) this.release(s);
    this.demo?.dispose();
    this.demo = null;
    this.renderer?.dispose();
    this.renderer = null;
  }

  private async activate(slot: PreviewSlot): Promise<void> {
    const renderer = this.ensureRenderer();
    if (!renderer || slot.loading || slot.failed) return;
    slot.loading = true;
    slot.onState('loading');
    try {
      const mod = await loadEffect(slot.id);
      if (!slot.visible || !this.slots.has(slot.canvas) || renderer !== this.renderer) return;
      const p = new EffectPipeline(renderer, {
        width: this.width,
        height: this.height,
        quality: 'low',
        onError: (_stage, msg) => {
          slot.failed = true;
          slot.onState('error', msg);
          this.release(slot);
        },
      });
      if (mod.kind === 'source') p.setSource(mod);
      else p.addPost(mod);
      if (slot.failed) {
        p.dispose();
        return;
      }
      slot.pipeline = p;
      slot.kind = mod.kind;
      slot.onState('live');
    } catch (e) {
      slot.failed = true;
      slot.onState('error', e instanceof Error ? e.message : String(e));
    } finally {
      slot.loading = false;
    }
  }

  setPaused(p: boolean): void {
    this.paused = p;
    if (p) this.resetAll();
    else this.start();
  }

  setEnabled(v: boolean): void {
    this.enabled = v;
    if (!v) this.resetAll();
    else this.start();
  }

  start(): void {
    if (this.raf || document.hidden) return;
    this.last = performance.now();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.tick();
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private tick(): void {
    if (this.paused || !this.enabled || this.contextLost) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 0.1);
    this.last = now;

    const visible = [...this.slots.values()].filter((s) => s.visible && !s.failed);
    // 生成数の上限を守りつつ、見えているカードを順に起動
    let live = visible.filter((s) => s.pipeline).length;
    for (const s of visible) {
      if (live >= this.maxLive) break;
      if (!s.pipeline && !s.loading) {
        void this.activate(s);
        live++;
      }
    }
    const ready = visible.filter((s) => s.pipeline);
    if (!ready.length || !this.renderer) return;

    const renderer = this.renderer;
    let demoTex: THREE.Texture | undefined;
    if (ready.some((s) => s.kind === 'post')) {
      if (!this.demo) {
        this.demo = new EffectPipeline(renderer, { width: this.width, height: this.height, quality: 'low' });
        this.demo.setSource(demoScene);
      }
      this.demoTime += dt;
      demoTex = this.demo.render({ time: this.demoTime, dt, frame: 0 }, false);
    }

    const n = Math.min(this.perTick, ready.length);
    for (let i = 0; i < n; i++) {
      const slot = ready[(this.cursor + i) % ready.length];
      const sdt = slot.lastTime ? Math.min((now - slot.lastTime) / 1000, 0.1) : 1 / 60;
      slot.lastTime = now;
      slot.time += sdt;
      slot.pipeline!.render(
        { time: slot.time, dt: sdt, frame: slot.frame++ },
        true,
        slot.kind === 'post' ? demoTex : undefined,
      );
      // 同じタスク内で転写すれば preserveDrawingBuffer は不要
      slot.ctx2d.drawImage(renderer.domElement, 0, 0);
    }
    this.cursor = (this.cursor + n) % Math.max(1, ready.length);
  }
}
