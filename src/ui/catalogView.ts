import { TECH_LABELS, type CatalogEntry, type Tech } from '../data/catalog';
import { LIBRARY, MAIN_CATEGORIES, SUBCATEGORIES, matchesQuery, type LibraryEntry, type MainCategory } from '../data/library';
import { availability, AVAILABILITY_LABELS, getRegistryEntry, type Availability } from '../effects/registry';
import { favoritesStore } from './storage';
import { h } from './dom';
import type { PreviewManager } from './previewManager';

export interface CatalogFilter {
  query: string;
  category: number | 0;
  status: Availability | 'all' | 'playable';
  tech: Tech | '';
  favoritesOnly: boolean;
}

/** 検索語（日本語・番号・技術名）とフィルタに一致するか */
export function matches(e: CatalogEntry, f: CatalogFilter, isFavorite: (id: string) => boolean): boolean {
  if (f.category && e.category.index !== f.category) return false;
  const st = availability(e.id);
  if (f.status === 'playable' && st === 'planned') return false;
  if (f.status !== 'all' && f.status !== 'playable' && st !== f.status) return false;
  if (f.tech && !e.tech.includes(f.tech)) return false;
  if (f.favoritesOnly && !isFavorite(e.id)) return false;
  const q = f.query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    e.id,
    String(e.num),
    e.name,
    e.description,
    e.category.name,
    AVAILABILITY_LABELS[st],
    ...e.tech.map((t) => TECH_LABELS[t]),
    ...e.tech,
  ]
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((term) => hay.includes(term));
}

/** 4分野共通のフィルタ */
export interface LibraryFilter {
  query: string;
  main: MainCategory | 'all';
  /** サブカテゴリID（'' はすべて） */
  sub: string;
  status: Availability | 'all' | 'playable';
  tech: Tech | '';
  favoritesOnly: boolean;
}

export const DEFAULT_LIBRARY_FILTER: LibraryFilter = { query: '', main: 'all', sub: '', status: 'all', tech: '', favoritesOnly: false };

export function libraryMatches(e: LibraryEntry, f: LibraryFilter, isFavorite: (id: string) => boolean): boolean {
  if (f.main !== 'all' && e.mainCategory !== f.main) return false;
  if (f.sub && e.subcategory.id !== f.sub) return false;
  const st = availability(e.id);
  if (f.status === 'playable' && st === 'planned') return false;
  if (f.status !== 'all' && f.status !== 'playable' && st !== f.status) return false;
  if (f.tech && !(e.legacy && e.legacy.tech.includes(f.tech))) return false;
  if (f.favoritesOnly && !isFavorite(e.id)) return false;
  if (!f.query.trim()) return true;
  // 既存の検索（番号・技術キー・状況名）も引き続き使えるようにする
  const extra = [AVAILABILITY_LABELS[st], ...(e.legacy ? [String(e.legacy.num), ...e.legacy.tech] : [])].join(' ').toLowerCase();
  const words = f.query.trim().toLowerCase().split(/\s+/);
  return words.every((w) => matchesQuery(e, w) || extra.includes(w));
}

export class CatalogView {
  readonly root: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly count: HTMLElement;
  private readonly mainNav: HTMLElement;
  private readonly catNav: HTMLElement;
  private techSelect!: HTMLSelectElement;
  private filter: LibraryFilter = { ...DEFAULT_LIBRARY_FILTER };

  constructor(
    private readonly previews: PreviewManager,
    private readonly onOpen: (id: string) => void,
  ) {
    this.grid = h('div', { class: 'catalog' });
    this.count = h('span', { class: 'count' });
    this.mainNav = h('nav', { class: 'main-nav', 'aria-label': '分野' });
    this.catNav = h('nav', { class: 'cat-nav', 'aria-label': 'サブカテゴリ' });
    this.root = h('main', { class: 'catalog-page' }, this.mainNav, this.buildFilters(), this.catNav, this.grid);
    favoritesStore.subscribe(() => this.render());
    this.render();
  }

  /** テスト・外部からの絞り込み */
  setFilter(f: Partial<LibraryFilter>): void {
    this.filter = { ...this.filter, ...f };
    this.render();
  }

  get visibleIds(): string[] {
    return LIBRARY.filter((e) => libraryMatches(e, this.filter, favoritesStore.has)).map((e) => e.id);
  }

  private buildFilters(): HTMLElement {
    const search = h('input', {
      type: 'search',
      class: 'search',
      placeholder: '名前・ID・原理・タグで検索（例: グリッチ / GEO-004 / 迷路 / IK）',
      'aria-label': '検索',
    });
    search.addEventListener('input', () => {
      this.filter.query = search.value;
      this.render();
    });
    const status = h('select', { 'aria-label': '実装状況' });
    for (const [v, label] of [
      ['all', 'すべての状況'],
      ['playable', '動くもののみ'],
      ['implemented', '実装済み'],
      ['experimental', '実験中'],
      ['planned', '未実装'],
    ]) {
      status.append(h('option', { value: v, text: label }));
    }
    status.addEventListener('change', () => {
      this.filter.status = status.value as LibraryFilter['status'];
      this.render();
    });
    const tech = h('select', { 'aria-label': '技術方式（VISUAL EFFECT）' });
    tech.append(h('option', { value: '', text: 'すべての技術' }));
    for (const [k, label] of Object.entries(TECH_LABELS)) tech.append(h('option', { value: k, text: label }));
    tech.addEventListener('change', () => {
      this.filter.tech = tech.value as Tech | '';
      this.render();
    });
    this.techSelect = tech;
    const fav = h('button', { class: 'chip', text: '★ お気に入り', 'aria-pressed': 'false' });
    fav.addEventListener('click', () => {
      this.filter.favoritesOnly = !this.filter.favoritesOnly;
      fav.classList.toggle('active', this.filter.favoritesOnly);
      fav.setAttribute('aria-pressed', String(this.filter.favoritesOnly));
      this.render();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== search && !document.body.classList.contains('viewer-open')) {
        e.preventDefault();
        search.focus();
      }
    });
    return h('div', { class: 'filters' }, search, status, tech, fav, this.count);
  }

  private renderMainNav(): void {
    this.mainNav.innerHTML = '';
    const tabs: { id: MainCategory | 'all'; label: string; sub: string; color: string }[] = [
      { id: 'all', label: 'ALL', sub: 'すべて', color: '#e8e8ff' },
      ...MAIN_CATEGORIES.map((m) => ({ id: m.id, label: m.label, sub: m.nameJa, color: m.color })),
    ];
    for (const t of tabs) {
      const items = t.id === 'all' ? LIBRARY : LIBRARY.filter((e) => e.mainCategory === t.id);
      const playable = items.filter((e) => availability(e.id) !== 'planned').length;
      const b = h(
        'button',
        {
          class: `main-tab ${this.filter.main === t.id ? 'active' : ''}`,
          style: `--cat:${t.color}`,
          'aria-pressed': String(this.filter.main === t.id),
          'data-main': t.id,
        },
        h('span', { class: 'main-label', text: t.label }),
        h('span', { class: 'main-sub', text: `${t.sub} · ${playable}/${items.length}` }),
      );
      b.addEventListener('click', () => {
        this.filter.main = t.id;
        this.filter.sub = '';
        if (t.id !== 'all' && t.id !== 'visual') {
          this.filter.tech = '';
          this.techSelect.value = '';
        }
        this.render();
      });
      this.mainNav.append(b);
    }
    this.techSelect.disabled = this.filter.main !== 'all' && this.filter.main !== 'visual';
  }

  private renderCatNav(visibleSubs: Set<string>): void {
    this.catNav.innerHTML = '';
    if (this.filter.main === 'all') {
      this.catNav.hidden = true;
      return;
    }
    this.catNav.hidden = false;
    const all = h('button', { class: `chip ${this.filter.sub === '' ? 'active' : ''}`, text: 'すべて' });
    all.addEventListener('click', () => {
      this.filter.sub = '';
      this.render();
    });
    this.catNav.append(all);
    for (const s of SUBCATEGORIES.filter((x) => x.main === this.filter.main)) {
      const inSub = LIBRARY.filter((e) => e.subcategory.id === s.id);
      const playable = inSub.filter((e) => availability(e.id) !== 'planned').length;
      const b = h(
        'button',
        {
          class: `chip cat-chip ${this.filter.sub === s.id ? 'active' : ''} ${visibleSubs.has(s.id) ? '' : 'dim'}`,
          style: `--cat:${s.color}`,
          title: `${s.name}（動作 ${playable}/${inSub.length}）`,
          'data-sub': s.id,
        },
        h('span', { class: 'dot' }),
        `${s.code}. ${s.name}`,
        playable ? h('span', { class: 'chip-count', text: String(playable) }) : null,
      );
      b.addEventListener('click', () => {
        this.filter.sub = this.filter.sub === s.id ? '' : s.id;
        this.render();
      });
      this.catNav.append(b);
    }
  }

  render(): void {
    this.previews.clear();
    this.grid.innerHTML = '';
    const list = LIBRARY.filter((e) => libraryMatches(e, this.filter, favoritesStore.has));
    const playable = list.filter((e) => availability(e.id) !== 'planned').length;
    this.count.textContent = `${list.length}件（動作 ${playable}件）`;
    this.renderMainNav();
    this.renderCatNav(new Set(list.map((e) => e.subcategory.id)));
    if (!list.length) {
      this.grid.append(h('p', { class: 'empty', text: '条件に一致する項目はありません。' }));
      return;
    }
    for (const s of SUBCATEGORIES) {
      const items = list.filter((e) => e.subcategory.id === s.id);
      if (!items.length) continue;
      const main = MAIN_CATEGORIES.find((m) => m.id === s.main)!;
      const section = h(
        'section',
        { class: 'cat-section', style: `--cat:${s.color}`, id: `cat-${s.id}` },
        h('h2', {}, h('span', { class: 'cat-index', text: s.main === 'visual' ? s.code : s.code }), s.name, h('span', { class: 'cat-main', text: main.label })),
      );
      const cards = h('div', { class: 'cards' });
      for (const e of items) cards.append(this.card(e));
      section.append(cards);
      this.grid.append(section);
    }
  }

  private card(e: LibraryEntry): HTMLElement {
    const st = availability(e.id);
    const reg = getRegistryEntry(e.id);
    const fav = favoritesStore.has(e.id);
    const favBtn = h('button', {
      class: `fav ${fav ? 'active' : ''}`,
      text: fav ? '★' : '☆',
      title: 'お気に入り',
      'aria-label': `${e.nameJa}をお気に入りに${fav ? '解除' : '追加'}`,
      'aria-pressed': String(fav),
    });
    favBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      favoritesStore.toggle(e.id);
    });

    let media: HTMLElement;
    if (st === 'planned') {
      // 未実装には偽のプレビューを出さない：方式だけを文字で示す
      media = h(
        'div',
        { class: 'media planned' },
        h('span', { class: 'planned-label', text: '未実装' }),
        h('span', { class: 'planned-tech', text: e.legacy ? e.legacy.tech.map((t) => TECH_LABELS[t]).join(' / ') : e.tags.join(' / ') }),
      );
    } else {
      const canvas = h('canvas', { class: 'preview', 'aria-hidden': 'true' });
      const overlay = h('span', { class: 'media-state', text: '待機中' });
      media = h('div', { class: 'media' }, canvas, overlay);
      this.previews.register(e.id, canvas, (state, msg) => {
        overlay.className = `media-state state-${state}`;
        overlay.textContent = state === 'loading' ? '読み込み中' : state === 'error' ? 'エラー' : '';
        if (msg) overlay.title = msg;
      });
    }

    const legacy = e.legacy;
    const card = h(
      'article',
      {
        class: `card status-${st} main-${e.mainCategory}`,
        style: `--cat:${e.subcategory.color}`,
        tabindex: 0,
        role: 'button',
        'data-id': e.id,
        'aria-label': `${e.id} ${e.nameJa}（${AVAILABILITY_LABELS[st]}）を開く`,
      },
      media,
      h(
        'div',
        { class: 'card-body' },
        h(
          'div',
          { class: 'card-top' },
          h('span', { class: 'num', text: e.id }),
          h('span', { class: `badge status-${st}`, text: AVAILABILITY_LABELS[st] }),
          legacy ? (reg ? h('span', { class: 'kind', text: reg.kind === 'post' ? 'POST' : 'SOURCE' }) : null) : h('span', { class: 'kind sub', text: e.subcategory.code }),
          legacy?.category.extension ? h('span', { class: 'kind ext', text: '拡張' }) : null,
          favBtn,
        ),
        h('h3', { text: e.nameJa }),
        e.nameEn ? h('p', { class: 'name-en', text: e.nameEn }) : null,
        legacy?.reference ? h('p', { class: 'ref', text: `着想: ${legacy.reference.repo}（${legacy.reference.license}）· 実装は独自` }) : null,
        h('p', { class: 'desc', text: e.description }),
        h('div', { class: 'tags' }, ...e.tags.slice(0, 4).map((t) => h('span', { class: 'tag', text: t }))),
      ),
    );
    const open = () => this.onOpen(e.id);
    card.addEventListener('click', open);
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        ev.preventDefault();
        open();
      }
    });
    return card;
  }
}
