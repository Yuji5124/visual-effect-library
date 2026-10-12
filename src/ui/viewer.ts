import * as THREE from 'three';
import { EffectPipeline, type Stage } from '../engine/pipeline';
import { demoScene } from '../engine/demoScene';
import type { EffectModule, Quality } from '../engine/types';
import { ALL_REGISTRY, REGISTRY, availability, AVAILABILITY_LABELS, getRegistryEntry, loadEffect } from '../effects/registry';
import { TECH_LABELS } from '../data/catalog';
import { LIBRARY, getLibraryEntry, mainCategoryInfoOf, type LibraryEntry } from '../data/library';
import { buildParamControls, randomizeParams } from './paramPanel';
import { buildCodeSections } from './codeExample';
import { parseStackConfig, sanitizeParams } from './configIO';
import { favoritesStore, presetStore, type StackConfig } from './storage';
import { copyText, downloadText, h, toast } from './dom';

type Tab = 'params' | 'info' | 'code';

const PLAYABLE = LIBRARY.filter((e) => availability(e.id) !== 'planned');

const PERF_LABELS = { light: '軽い', medium: '普通', heavy: '重い' } as const;
const MOBILE_LABELS = { good: '対応', reduced: '軽量化して対応', 'desktop-recommended': 'PC推奨', unverified: '未検証' } as const;

/** 表示名（ライブラリ全体の日本語名） */
function nameOf(id: string): string {
  return getLibraryEntry(id)?.nameJa ?? '';
}

async function loadModule(id: string): Promise<EffectModule> {
  return id === 'demo' ? demoScene : loadEffect(id);
}

/**
 * 全画面ビューア。専用のWebGLコンテキストを開く時に作り、閉じる時に完全に破棄する。
 */
export class Viewer {
  readonly root: HTMLElement;
  private readonly stage: HTMLElement;
  private canvas: HTMLCanvasElement;
  private readonly hud: HTMLElement;
  private readonly notice: HTMLElement;
  private readonly panel: HTMLElement;
  private readonly panelBody: HTMLElement;
  private readonly title: HTMLElement;
  private readonly favBtn: HTMLButtonElement;
  private readonly autoBtn: HTMLButtonElement;
  private readonly pauseBtn: HTMLButtonElement;
  private paused = false;
  private readonly touches = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;
  private renderer: THREE.WebGLRenderer | null = null;
  private pipeline: EffectPipeline | null = null;
  private readonly modules = new Map<string, EffectModule>();
  private raf = 0;
  private focusId = '';
  private tab: Tab = 'params';
  private time = 0;
  private frame = 0;
  private last = 0;
  private resScale = 1;
  private frameTimes: number[] = [];
  private resizeObs: ResizeObserver;
  private autoTimer = 0;
  private autoplay = false;
  private openToken = 0;
  private isOpen = false;
  private pointerDown = false;

  constructor(
    private quality: Quality,
    private readonly onClose: () => void,
    private readonly onNavigate: (id: string) => void,
  ) {
    this.canvas = h('canvas', { class: 'viewer-canvas', 'aria-label': '演出プレビュー' });
    this.hud = h('div', { class: 'hud' });
    this.notice = h('div', { class: 'notice', role: 'status' });
    this.stage = h('div', { class: 'viewer-stage' }, this.canvas, this.hud, this.notice);
    this.title = h('div', { class: 'viewer-title' });
    this.favBtn = h('button', { class: 'icon-btn', title: 'お気に入り', onclick: () => this.toggleFavorite() });
    this.autoBtn = h('button', {
      class: 'tool-btn',
      title: '一定時間ごとにランダムな演出へ切り替え',
      onclick: () => this.setAutoplay(!this.autoplay),
    });
    this.pauseBtn = h('button', { class: 'tool-btn', title: '一時停止／再生 (Space)', onclick: () => this.setPaused(!this.paused) });
    this.panelBody = h('div', { class: 'panel-body' });
    const tabs = h(
      'div',
      { class: 'tabs', role: 'tablist' },
      ...(['params', 'info', 'code'] as Tab[]).map((t) =>
        h('button', {
          class: 'tab',
          role: 'tab',
          'data-tab': t,
          text: { params: '調整・組み合わせ', info: '解説', code: '移植コード' }[t],
          onclick: () => this.setTab(t),
        }),
      ),
    );
    this.panel = h(
      'aside',
      { class: 'viewer-panel' },
      h('div', { class: 'panel-head' }, this.title, this.favBtn),
      tabs,
      this.panelBody,
    );
    const toolbar = h(
      'div',
      { class: 'viewer-toolbar' },
      h('button', { class: 'tool-btn', text: '← 一覧', title: '一覧に戻る (Esc)', onclick: () => this.onClose() }),
      h('button', { class: 'tool-btn', text: '◀', title: '前の演出 (←)', onclick: () => this.step(-1) }),
      h('button', { class: 'tool-btn', text: '▶', title: '次の演出 (→)', onclick: () => this.step(1) }),
      h('button', { class: 'tool-btn', text: '🎲 ランダム', title: 'ランダムな演出 (R)', onclick: () => this.randomEffect() }),
      h('button', {
        class: 'tool-btn',
        text: '🧪 ランダム合成',
        title: 'ソース＋複数ポストをランダムに組み合わせる',
        onclick: () => void this.randomCombo(),
      }),
      this.autoBtn,
      this.pauseBtn,
      h('button', { class: 'tool-btn', text: '⛶', title: '全画面表示 (F)', onclick: () => this.toggleFullscreen() }),
      h('button', {
        class: 'tool-btn',
        text: '☰',
        title: 'パネルの表示切替 (P)',
        onclick: () => this.root.classList.toggle('panel-hidden'),
      }),
    );
    this.root = h('div', { class: 'viewer', role: 'dialog', 'aria-modal': 'true' }, this.stage, toolbar, this.panel);
    this.resizeObs = new ResizeObserver(() => this.resize());
    this.bindPointer();
    this.updateAutoBtn();
    this.updatePauseBtn();
    window.addEventListener('keydown', (e) => this.onKey(e));
  }

  setQuality(q: Quality): void {
    this.quality = q;
  }

  get opened(): boolean {
    return this.isOpen;
  }

  get currentId(): string {
    return this.focusId;
  }

  private ensureRenderer(): THREE.WebGLRenderer {
    if (this.renderer) return this.renderer;
    const r = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    r.setPixelRatio(1);
    this.canvas.addEventListener('webglcontextlost', this.onContextLost);
    this.canvas.addEventListener('webglcontextrestored', this.onContextRestored);
    this.renderer = r;
    return r;
  }

  private onContextLost = (e: Event) => {
    e.preventDefault();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.hud.textContent = 'GPUコンテキストが失われました。復帰を待っています…';
  };

  private onContextRestored = () => {
    const cfg = this.exportConfig();
    this.pipeline?.dispose();
    this.pipeline = null;
    if (cfg) void this.applyConfig(cfg, this.focusId);
  };

  private createPipeline(): EffectPipeline {
    const renderer = this.ensureRenderer();
    const { w, h: hh } = this.targetSize();
    renderer.setSize(w, hh, false);
    return new EffectPipeline(renderer, {
      width: w,
      height: hh,
      quality: this.quality,
      onError: (stage, msg) => {
        toast(`演出 ${stage.module.id} でエラー: 他の演出は継続します`);
        console.warn(msg);
        if (this.tab === 'params') this.renderPanel();
      },
    });
  }

  /** 1つの演出を開く。ポスト系はデモシーンの上に、生成系は単独で表示する */
  async open(id: string): Promise<void> {
    const entry = getLibraryEntry(id);
    if (!entry) return;
    this.show();
    if (availability(id) === 'planned') {
      this.focusId = id;
      this.disposePipeline();
      this.renderTitle();
      this.hud.innerHTML = '';
      this.hud.append(
        h('div', { class: 'planned-msg' }, h('strong', { text: 'この項目は未実装です' }), h('p', { text: '偽のプレビューは表示しません。解説タブで原理と実装方針を確認できます。' })),
      );
      this.setTab('info');
      return;
    }
    const reg = getRegistryEntry(id)!;
    const config: StackConfig =
      reg.kind === 'source'
        ? { format: 'vfx200-stack', version: 1, source: { id, params: {} }, posts: [] }
        : { format: 'vfx200-stack', version: 1, source: { id: 'demo', params: {} }, posts: [{ id, enabled: true, params: {} }] };
    await this.applyConfig(config, id);
  }

  /** 設定（StackConfig）からパイプラインを組み立てる */
  async applyConfig(config: StackConfig, focusId?: string): Promise<void> {
    const token = ++this.openToken;
    this.show();
    this.focusId = focusId ?? config.posts[config.posts.length - 1]?.id ?? config.source.id;
    this.renderTitle();
    this.hud.textContent = '読み込み中…';
    const ids = [config.source.id, ...config.posts.map((p) => p.id)];
    const results = await Promise.allSettled(ids.map((id) => loadModule(id)));
    if (token !== this.openToken || !this.isOpen) return;
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') this.modules.set(ids[i], r.value);
      else toast(`演出 ${ids[i]} を読み込めませんでした`);
    });
    this.disposePipeline();
    const p = this.createPipeline();
    this.pipeline = p;
    const src = this.modules.get(config.source.id) ?? demoScene;
    p.setSource(src, sanitizeParams(src.params, config.source.params));
    for (const post of config.posts) {
      const mod = this.modules.get(post.id);
      if (!mod) continue;
      const stage = p.addPost(mod, sanitizeParams(mod.params, post.params));
      stage.enabled = post.enabled;
    }
    this.hud.textContent = '';
    this.notice.textContent = '';
    this.time = 0;
    this.frame = 0;
    this.resScale = 1;
    this.setPaused(false);
    this.renderPanel();
    this.start();
  }

  exportConfig(): StackConfig | null {
    const p = this.pipeline;
    if (!p?.source) return null;
    return {
      format: 'vfx200-stack',
      version: 1,
      source: { id: p.source.module.id, params: { ...p.source.params } },
      posts: p.posts.map((s) => ({ id: s.module.id, enabled: s.enabled, params: { ...s.params } })),
    };
  }

  private show(): void {
    if (this.isOpen) return;
    this.isOpen = true;
    document.body.append(this.root);
    document.body.classList.add('viewer-open');
    this.resizeObs.observe(this.stage);
  }

  close(): void {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.openToken++;
    this.setAutoplay(false);
    this.disposePipeline();
    if (this.renderer) {
      this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
      this.canvas.removeEventListener('webglcontextrestored', this.onContextRestored);
      this.renderer.dispose();
      // コンテキストを即座にブラウザへ返す（iPadでの上限対策）
      this.renderer.forceContextLoss();
      this.renderer = null;
      // A deliberately lost WebGL context belongs to its canvas. A new renderer
      // on that same canvas would receive the lost context again on reopening.
      const canvas = h('canvas', { class: 'viewer-canvas', 'aria-label': '演出プレビュー' });
      this.canvas.replaceWith(canvas);
      this.canvas = canvas;
      this.pointerDown = false;
      this.touches.clear();
      this.bindPointer();
    }
    this.resizeObs.disconnect();
    this.root.remove();
    document.body.classList.remove('viewer-open');
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  }

  private disposePipeline(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.pipeline?.dispose();
    this.pipeline = null;
  }

  private targetSize(): { w: number; h: number } {
    const rect = this.stage.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality === 'high' ? 2 : 1.5);
    let w = Math.max(1, rect.width * dpr * this.resScale);
    let hh = Math.max(1, rect.height * dpr * this.resScale);
    const maxPixels = this.quality === 'high' ? 2_400_000 : 1_000_000;
    const k = Math.sqrt(maxPixels / (w * hh));
    if (k < 1) {
      w *= k;
      hh *= k;
    }
    return { w: Math.floor(w), h: Math.floor(hh) };
  }

  private resize(): void {
    if (!this.renderer || !this.pipeline) return;
    const { w, h: hh } = this.targetSize();
    this.renderer.setSize(w, hh, false);
    this.pipeline.resize(w, hh);
  }

  private start(): void {
    if (this.raf) return;
    this.last = performance.now();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.tick();
    };
    this.raf = requestAnimationFrame(loop);
  }

  private tick(): void {
    const p = this.pipeline;
    if (!p || document.hidden) return;
    const now = performance.now();
    const raw = (now - this.last) / 1000;
    // 一時停止中も描画は続ける（カメラ操作を反映するため）。時間だけを止める
    const dt = this.paused ? 0 : Math.min(raw, 0.1);
    this.last = now;
    this.time += dt;
    p.render({ time: this.time, dt, frame: this.frame++ }, true);
    if (this.frame % 15 === 0) this.updateNotice();
    this.adaptResolution(raw * 1000);
  }

  private updateNotice(): void {
    const p = this.pipeline;
    const stages = p ? [p.source, ...p.posts] : [];
    let msg = '';
    for (const s of stages) {
      const m = s?.enabled ? s.instance?.status?.() : null;
      if (m) {
        msg = m;
        break;
      }
    }
    if (this.notice.textContent !== msg) this.notice.textContent = msg;
  }

  /** 実測フレーム時間から描画解像度を自動調整（iPad等で滑らかさを優先） */
  private adaptResolution(ms: number): void {
    this.frameTimes.push(ms);
    if (this.frameTimes.length < 45) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    this.frameTimes.length = 0;
    const before = this.resScale;
    if (median > 24 && this.resScale > 0.45) this.resScale = Math.max(0.45, this.resScale * 0.85);
    else if (median < 15 && this.resScale < 1) this.resScale = Math.min(1, this.resScale * 1.1);
    if (before !== this.resScale) this.resize();
    const ctx = this.pipeline?.ctx;
    if (ctx && !this.hud.querySelector('.planned-msg')) {
      this.hud.textContent = `${Math.round(1000 / median)} fps · ${ctx.width}×${ctx.height}${this.resScale < 1 ? ' (自動縮小)' : ''}`;
    }
  }

  private sendWheel(delta: number): void {
    const p = this.pipeline;
    if (!p) return;
    for (const s of [p.source, ...p.posts]) {
      const inst = s?.instance as { wheel?: (d: number) => void } | null | undefined;
      inst?.wheel?.(delta);
    }
  }

  private bindPointer(): void {
    const canvas = this.canvas;
    const send = (e: PointerEvent, down: boolean) => {
      const p = this.pipeline;
      if (!p) return;
      const r = canvas.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = 1 - (e.clientY - r.top) / r.height;
      for (const s of [p.source, ...p.posts]) s?.instance?.pointer?.(x, y, down);
    };
    const pinch = () => {
      const [a, b] = [...this.touches.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    };
    canvas.addEventListener('pointerdown', (e) => {
      this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      canvas.setPointerCapture(e.pointerId);
      if (this.touches.size === 2) {
        // 2本指はピンチズーム。回転のドラッグは一旦離す
        this.pinchDist = pinch();
        this.pointerDown = false;
        send(e, false);
        return;
      }
      if (this.touches.size > 2) return;
      this.pointerDown = true;
      send(e, true);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (this.touches.has(e.pointerId)) this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.touches.size >= 2) {
        const d = pinch();
        if (this.pinchDist > 0 && d > 0) this.sendWheel(-(d - this.pinchDist) * 4);
        this.pinchDist = d;
        return;
      }
      send(e, this.pointerDown);
    });
    const up = (e: PointerEvent) => {
      this.touches.delete(e.pointerId);
      if (this.touches.size >= 1) {
        this.pinchDist = 0;
        return;
      }
      this.pointerDown = false;
      send(e, false);
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.pipeline) return;
        e.preventDefault();
        this.sendWheel(e.deltaMode === 1 ? e.deltaY * 30 : e.deltaY);
      },
      { passive: false },
    );
  }

  private setPaused(on: boolean): void {
    this.paused = on;
    this.updatePauseBtn();
  }

  private updatePauseBtn(): void {
    this.pauseBtn.textContent = this.paused ? '▶ 再生' : '⏸ 停止';
    this.pauseBtn.classList.toggle('active', this.paused);
  }

  private onKey(e: KeyboardEvent): void {
    if (!this.isOpen) return;
    const t = e.target as HTMLElement;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
    if (e.key === 'Escape') this.onClose();
    else if (e.key === 'ArrowRight') this.step(1);
    else if (e.key === 'ArrowLeft') this.step(-1);
    else if (e.key === 'r' || e.key === 'R') this.randomEffect();
    else if (e.key === 'f' || e.key === 'F') this.toggleFullscreen();
    else if (e.key === 'p' || e.key === 'P') this.root.classList.toggle('panel-hidden');
    else if (e.key === ' ') {
      e.preventDefault();
      this.setPaused(!this.paused);
    }
  }

  private step(dir: number): void {
    const main = getLibraryEntry(this.focusId)?.mainCategory;
    const list = PLAYABLE.filter((e) => !main || e.mainCategory === main);
    const i = list.findIndex((e) => e.id === this.focusId);
    const next = list[(i + dir + list.length) % list.length];
    this.onNavigate(next.id);
  }

  randomEffect(): void {
    const options = PLAYABLE.filter((e) => e.id !== this.focusId);
    this.onNavigate(options[Math.floor(Math.random() * options.length)].id);
  }

  async randomCombo(): Promise<void> {
    const sources = REGISTRY.filter((r) => r.kind === 'source');
    const posts = REGISTRY.filter((r) => r.kind === 'post');
    const useDemo = Math.random() < 0.4;
    const src = useDemo ? 'demo' : sources[Math.floor(Math.random() * sources.length)].id;
    const n = 1 + Math.floor(Math.random() * 3);
    const picked = [...posts].sort(() => Math.random() - 0.5).slice(0, n);
    const config: StackConfig = {
      format: 'vfx200-stack',
      version: 1,
      source: { id: src, params: {} },
      posts: picked.map((p) => ({ id: p.id, enabled: true, params: {} })),
    };
    // パラメータもランダム化（ソースは既定値のまま見やすさを保つ）
    const mods = await Promise.allSettled(picked.map((p) => loadEffect(p.id)));
    mods.forEach((m, i) => {
      if (m.status === 'fulfilled') randomizeParams(m.value.params, config.posts[i].params);
    });
    await this.applyConfig(config, picked[picked.length - 1]?.id ?? src);
    history.replaceState(null, '', `#/fx/${this.focusId}`);
    toast('ランダムな組み合わせを生成しました');
  }

  private setAutoplay(on: boolean): void {
    this.autoplay = on;
    clearInterval(this.autoTimer);
    if (on) this.autoTimer = window.setInterval(() => this.randomEffect(), 9000);
    this.updateAutoBtn();
  }

  startAutoplay(): void {
    this.setAutoplay(true);
  }

  private updateAutoBtn(): void {
    this.autoBtn.textContent = this.autoplay ? '⏸ 自動再生中' : '▶ 自動再生';
    this.autoBtn.classList.toggle('active', this.autoplay);
  }

  private toggleFullscreen(): void {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void this.root.requestFullscreen?.().catch(() => toast('この端末では全画面APIを使えません'));
  }

  private toggleFavorite(): void {
    favoritesStore.toggle(this.focusId);
    this.renderTitle();
  }

  private renderTitle(): void {
    const e = getLibraryEntry(this.focusId);
    const status = availability(this.focusId);
    this.title.innerHTML = '';
    if (e) {
      this.title.append(
        h('span', { class: 'num', text: e.id }),
        h('span', { class: 'name', text: e.nameJa }),
        h('span', { class: `badge status-${status}`, text: AVAILABILITY_LABELS[status] }),
        h('span', { class: 'cat', style: `--cat:${e.subcategory.color}`, text: `${e.mainCategory === 'visual' ? '' : e.subcategory.code + ' '}${e.subcategory.name}` }),
      );
    }
    const fav = favoritesStore.has(this.focusId);
    this.favBtn.textContent = fav ? '★' : '☆';
    this.favBtn.classList.toggle('active', fav);
    this.favBtn.setAttribute('aria-pressed', String(fav));
  }

  private setTab(t: Tab): void {
    this.tab = t;
    this.renderPanel();
  }

  private renderPanel(): void {
    this.panel.querySelectorAll<HTMLElement>('.tab').forEach((b) => {
      b.classList.toggle('active', b.dataset.tab === this.tab);
      b.setAttribute('aria-selected', String(b.dataset.tab === this.tab));
    });
    this.panelBody.innerHTML = '';
    if (this.tab === 'params') this.panelBody.append(this.renderParamsTab());
    else if (this.tab === 'info') this.panelBody.append(this.renderInfoTab());
    else this.panelBody.append(this.renderCodeTab());
  }

  private stageBlock(stage: Stage, kind: 'source' | 'post'): HTMLElement {
    const p = this.pipeline!;
    const name = stage.module.id === 'demo' ? 'デモシーン（Three.js）' : `${stage.module.id} ${nameOf(stage.module.id)}`;
    const head = h('div', { class: 'stage-head' }, h('span', { class: 'stage-name', text: name }));
    if (kind === 'post') {
      const enabled = h('input', { type: 'checkbox', title: '有効／無効' });
      enabled.checked = stage.enabled;
      enabled.addEventListener('change', () => (stage.enabled = enabled.checked));
      head.prepend(enabled);
      head.append(
        h('button', { class: 'mini', text: '↑', title: '前へ', onclick: () => (p.movePost(stage, -1), this.renderPanel()) }),
        h('button', { class: 'mini', text: '↓', title: '後へ', onclick: () => (p.movePost(stage, 1), this.renderPanel()) }),
        h('button', { class: 'mini danger', text: '✕', title: '削除', onclick: () => (p.removePost(stage), this.renderPanel()) }),
      );
    }
    head.append(
      h('button', {
        class: 'mini',
        text: '↺',
        title: 'パラメータを既定値に戻す',
        onclick: () => {
          for (const d of stage.module.params) stage.params[d.key] = d.default;
          this.renderPanel();
        },
      }),
    );
    const block = h('div', { class: `stage-block ${stage.error ? 'has-error' : ''}` }, head);
    if (stage.error) {
      block.append(
        h(
          'div',
          { class: 'stage-error' },
          h('strong', { text: 'この演出は停止しました（他の演出は動作中）' }),
          h('pre', { text: stage.error.slice(0, 600) }),
          h('button', { class: 'mini', text: '再試行', onclick: () => (p.retry(stage), this.renderPanel()) }),
        ),
      );
    }
    if (kind === 'source') block.append(...this.actionControls(stage));
    block.append(buildParamControls(stage.module.params, stage.params));
    return block;
  }

  private renderParamsTab(): HTMLElement {
    const root = h('div', { class: 'params-tab' });
    const p = this.pipeline;
    if (!p) {
      root.append(h('p', { class: 'muted', text: 'この演出は未実装のため調整できません。' }));
      return root;
    }
    // ソース選択
    const srcSelect = h('select', { 'aria-label': '入力ソース' });
    srcSelect.append(h('option', { value: 'demo', text: 'デモシーン（Three.js）' }));
    // 既存の演出と、GEOMETRY / MOTION / WORLD の実験場（どれもポストを重ねられる）
    const groups: [string, (id: string) => boolean][] = [
      ['VISUAL EFFECT', (id) => /^\d{3}$/.test(id)],
      ['GEOMETRY', (id) => id.startsWith('GEO-')],
      ['MOTION', (id) => id.startsWith('MOT-')],
      ['WORLD GENERATION', (id) => id.startsWith('WRD-')],
    ];
    for (const [label, test] of groups) {
      const items = ALL_REGISTRY.filter((r) => r.kind === 'source' && test(r.id));
      if (!items.length) continue;
      const og = h('optgroup', { label });
      for (const r of items) og.append(h('option', { value: r.id, text: `${r.id} ${nameOf(r.id)}` }));
      srcSelect.append(og);
    }
    srcSelect.value = p.source?.module.id ?? 'demo';
    srcSelect.addEventListener('change', async () => {
      const cfg = this.exportConfig();
      if (!cfg) return;
      cfg.source = { id: srcSelect.value, params: {} };
      await this.applyConfig(cfg, this.focusId);
    });
    root.append(h('h3', { text: '入力ソース' }), srcSelect);
    if (p.source) root.append(this.stageBlock(p.source, 'source'));

    root.append(h('h3', { text: `ポストエフェクト（${p.posts.length}）` }));
    if (!p.posts.length) root.append(h('p', { class: 'muted small', text: '下から追加すると、上から順に重ねて適用されます。' }));
    for (const s of p.posts) root.append(this.stageBlock(s, 'post'));

    const addSelect = h('select', { 'aria-label': 'ポストエフェクトを追加' });
    addSelect.append(h('option', { value: '', text: '＋ ポストエフェクトを追加…' }));
    for (const r of REGISTRY.filter((r) => r.kind === 'post')) {
      addSelect.append(h('option', { value: r.id, text: `${r.id} ${nameOf(r.id)}` }));
    }
    addSelect.addEventListener('change', async () => {
      const id = addSelect.value;
      if (!id || !this.pipeline) return;
      try {
        const mod = await loadEffect(id);
        this.modules.set(id, mod);
        this.pipeline?.addPost(mod);
        this.renderPanel();
      } catch (e) {
        toast(`追加できませんでした: ${e instanceof Error ? e.message : e}`);
      }
    });
    root.append(addSelect);

    // プリセット保存・JSON
    const presetName = h('input', { type: 'text', placeholder: 'プリセット名', maxlength: 40 });
    const presetList = h('div', { class: 'preset-list' });
    const renderPresets = () => {
      presetList.innerHTML = '';
      const all = presetStore.all();
      if (!all.length) presetList.append(h('p', { class: 'muted small', text: '保存したプリセットはこの端末のブラウザに残ります。' }));
      for (const pr of all) {
        presetList.append(
          h(
            'div',
            { class: 'preset' },
            h('button', {
              class: 'link',
              text: pr.name,
              title: new Date(pr.savedAt).toLocaleString(),
              onclick: () => void this.applyConfig(parseStackConfig(pr.config)).catch((e) => toast(String(e))),
            }),
            h('button', {
              class: 'mini danger',
              text: '✕',
              title: '削除',
              onclick: () => {
                presetStore.remove(pr.name);
                renderPresets();
              },
            }),
          ),
        );
      }
    };
    renderPresets();
    const fileInput = h('input', { type: 'file', accept: 'application/json,.json', hidden: true });
    fileInput.addEventListener('change', async () => {
      const f = fileInput.files?.[0];
      if (!f) return;
      try {
        const cfg = parseStackConfig(JSON.parse(await f.text()));
        await this.applyConfig(cfg);
        toast('JSONを読み込みました');
      } catch (e) {
        toast(`読み込み失敗: ${e instanceof Error ? e.message : e}`);
      }
      fileInput.value = '';
    });
    root.append(
      h('h3', { text: 'プリセット・書き出し' }),
      h(
        'div',
        { class: 'row' },
        presetName,
        h('button', {
          class: 'btn',
          text: '保存',
          onclick: () => {
            const cfg = this.exportConfig();
            const name = presetName.value.trim() || `${nameOf(this.focusId) || 'preset'} ${new Date().toLocaleTimeString()}`;
            if (!cfg) return;
            presetStore.save(name, cfg);
            presetName.value = '';
            renderPresets();
            toast(`「${name}」を保存しました`);
          },
        }),
      ),
      presetList,
      h(
        'div',
        { class: 'row' },
        h('button', {
          class: 'btn',
          text: 'JSON書き出し',
          onclick: () => {
            const cfg = this.exportConfig();
            if (cfg) downloadText(`vfx200-${this.focusId}.json`, JSON.stringify(cfg, null, 2));
          },
        }),
        h('button', {
          class: 'btn',
          text: 'JSONをコピー',
          onclick: async () => {
            const cfg = this.exportConfig();
            if (cfg) toast((await copyText(JSON.stringify(cfg, null, 2))) ? 'コピーしました' : 'コピーできませんでした');
          },
        }),
        h('button', { class: 'btn', text: 'JSON読込', onclick: () => fileInput.click() }),
        fileInput,
      ),
    );
    return root;
  }

  private renderInfoTab(): HTMLElement {
    const le = getLibraryEntry(this.focusId);
    if (le && !le.legacy) return this.renderLabInfo(le);
    const e = le?.legacy;
    const root = h('div', { class: 'info-tab' });
    if (!e) return root;
    const status = availability(e.id);
    const mod = this.modules.get(e.id);
    root.append(
      h('p', { class: 'lead', text: e.description }),
      ...(e.reference
        ? [
            h('h3', { text: '着想元（GitHub調査）' }),
            h(
              'p',
              { class: 'small' },
              h('a', { href: e.reference.url, target: '_blank', rel: 'noopener noreferrer', text: e.reference.repo }),
              ` の ${e.reference.item}（${e.reference.license} ライセンス）。コードは複製せず、技法だけを参考に独自実装しています。`,
            ),
          ]
        : []),
      h('h3', { text: '技術方式' }),
      h('ul', { class: 'tech-list' }, ...e.tech.map((t) => h('li', { text: TECH_LABELS[t] }))),
      h('h3', { text: '実装状況' }),
      h('p', {}, h('span', { class: `badge status-${status}`, text: AVAILABILITY_LABELS[status] })),
    );
    if (mod) {
      root.append(
        h('p', { class: 'small muted', text: `種類: ${mod.kind === 'source' ? '映像を生成するソース演出' : '入力映像を加工するポスト演出（他と組み合わせ可）'}` }),
      );
      if (mod.notes) root.append(h('h3', { text: '実装メモ' }), h('p', { text: mod.notes }));
      const stage = [this.pipeline?.source, ...(this.pipeline?.posts ?? [])].find((s) => s?.module.id === mod.id);
      if (stage?.instance?.pointer) {
        root.append(h('p', { class: 'hint', text: '画面をドラッグすると演出に干渉できます。' }));
      }
    } else if (status === 'planned') {
      root.append(
        h('p', {
          class: 'muted',
          text: 'Phase 2以降で実装予定です。上記の技術方式で実装する想定で、カタログ側のメタデータのみ登録されています。',
        }),
      );
    }
    return root;
  }

  /** 操作ボタン（再生成・リセット等）と GLB 書き出し */
  private actionControls(stage: Stage): HTMLElement[] {
    const mod = stage.module;
    const inst = stage.instance as import('../engine/types').SourceInstance | null;
    const out: HTMLElement[] = [];
    const buttons: HTMLElement[] = [];
    for (const a of mod.actions ?? []) {
      buttons.push(
        h('button', {
          class: 'btn action-btn',
          text: a.label,
          title: a.title ?? a.label,
          'data-action': a.key,
          onclick: () => {
            const patch = inst?.action?.(a.key, stage.params);
            if (patch) Object.assign(stage.params, patch);
            if (patch) this.renderPanel();
          },
        }),
      );
    }
    if (inst?.exportObject || inst?.exportUnavailableReason) {
      buttons.push(
        h('button', {
          class: 'btn action-btn',
          text: '⬇ GLB書き出し',
          title: 'glTF バイナリ（.glb）として保存',
          'data-action': 'export-glb',
          onclick: () => void this.exportGlb(stage),
        }),
      );
    }
    if (buttons.length) out.push(h('div', { class: 'row action-row' }, ...buttons));
    if (mod.interaction === 'orbit') out.push(h('p', { class: 'hint small', text: 'ドラッグで回転、ホイール／ピンチでズーム。' }));
    else if (mod.interaction === 'pan-zoom') out.push(h('p', { class: 'hint small', text: 'ホイール／ピンチでズーム。クリック・ドラッグで操作できます。' }));
    return out;
  }

  private async exportGlb(stage: Stage): Promise<void> {
    const inst = stage.instance as import('../engine/types').SourceInstance | null;
    const reason = inst?.exportUnavailableReason?.() ?? null;
    const obj = reason ? null : (inst?.exportObject?.() ?? null);
    if (!obj) {
      toast(reason ?? 'この状態では書き出せる形状がありません');
      return;
    }
    try {
      const { GLTFExporter } = await import('three/examples/jsm/exporters/GLTFExporter.js');
      const result = await new GLTFExporter().parseAsync(obj, { binary: true, onlyVisible: true });
      const blob = new Blob([result as ArrayBuffer], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      const a = h('a', { href: url, download: `${stage.module.id}.glb` });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast(`${stage.module.id}.glb を書き出しました`);
    } catch (e) {
      toast(`書き出しに失敗しました: ${e instanceof Error ? e.message : e}`);
    }
  }

  /** GEOMETRY / MOTION / WORLD の解説（原理・実装・参考資料・関連） */
  private renderLabInfo(e: LibraryEntry): HTMLElement {
    const status = availability(e.id);
    const mod = this.modules.get(e.id);
    const main = mainCategoryInfoOf(e.mainCategory);
    const relLink = (id: string) => {
      const r = getLibraryEntry(id);
      return h('li', {}, h('button', { class: 'link', text: `${id} ${r?.nameJa ?? ''}`, onclick: () => this.onNavigate(id) }), r ? h('span', { class: `badge status-${availability(id)}`, text: AVAILABILITY_LABELS[availability(id)] }) : null);
    };
    const root = h(
      'div',
      { class: 'info-tab' },
      h('p', { class: 'small muted', text: `${main.label} › ${e.subcategory.code} ${e.subcategory.name} · ${e.nameEn}` }),
      h('p', { class: 'lead', text: e.description }),
      h('h3', { text: '原理' }),
      h('p', { text: e.principle }),
      h('h3', { text: 'このライブラリでの実装' }),
      h('p', { text: e.implementation }),
    );
    if (mod?.notes) root.append(h('h3', { text: '実装メモ（デモ）' }), h('p', { text: mod.notes }));
    root.append(
      h('h3', { text: '主なパラメーター' }),
      h('ul', { class: 'tech-list' }, ...e.parameters.map((t) => h('li', { text: t }))),
      h('h3', { text: '参考資料' }),
      h(
        'ul',
        { class: 'ref-list' },
        ...e.referenceUrls.map((r) =>
          h('li', {}, h('a', { href: r.url, target: '_blank', rel: 'noopener noreferrer', text: r.label }), h('span', { class: 'small muted', text: ` — ${r.license}` })),
        ),
      ),
      h('p', { class: 'small muted', text: 'コードの複製はしていません（ライセンス表記は参考資料自体のもの）。' }),
    );
    if (e.relatedIds.length) root.append(h('h3', { text: '関連技術' }), h('ul', { class: 'rel-list' }, ...e.relatedIds.map(relLink)));
    root.append(
      h('h3', { text: '実装状況' }),
      h(
        'p',
        {},
        h('span', { class: `badge status-${status}`, text: AVAILABILITY_LABELS[status] }),
        ` 負荷: ${PERF_LABELS[e.performanceClass]} · モバイル: ${MOBILE_LABELS[e.mobileCompatibility]} · 更新: ${e.updatedAt}`,
      ),
      h('div', { class: 'tags' }, ...e.tags.map((t) => h('span', { class: 'tag', text: t }))),
    );
    if (status === 'planned') root.append(h('p', { class: 'muted', text: 'デモは未実装です。原理と実装方針のみ登録しています。' }));
    return root;
  }

  private renderCodeTab(): HTMLElement {
    const root = h('div', { class: 'code-tab' });
    const cfg = this.exportConfig();
    if (!cfg) {
      root.append(h('p', { class: 'muted', text: '未実装の演出にはコード例がありません。' }));
      return root;
    }
    for (const s of buildCodeSections(cfg, this.modules)) {
      const pre = h('pre', { class: `code lang-${s.language}` }, h('code', { text: s.code }));
      root.append(
        h(
          'section',
          { class: 'code-section' },
          h(
            'div',
            { class: 'code-head' },
            h('h3', { text: s.title }),
            h('button', {
              class: 'mini',
              text: 'コピー',
              onclick: async () => toast((await copyText(s.code)) ? 'コピーしました' : 'コピーできませんでした'),
            }),
          ),
          h('p', { class: 'small muted', text: s.description }),
          pre,
        ),
      );
    }
    return root;
  }
}
