import { CATALOG, TECH_LABELS, type CatalogEntry, type Tech } from '../data/catalog';
import { CATEGORIES } from '../data/categories';
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

export class CatalogView {
  readonly root: HTMLElement;
  private readonly grid: HTMLElement;
  private readonly count: HTMLElement;
  private readonly catNav: HTMLElement;
  private filter: CatalogFilter = { query: '', category: 0, status: 'all', tech: '', favoritesOnly: false };

  constructor(
    private readonly previews: PreviewManager,
    private readonly onOpen: (id: string) => void,
  ) {
    this.grid = h('div', { class: 'catalog' });
    this.count = h('span', { class: 'count' });
    this.catNav = h('nav', { class: 'cat-nav', 'aria-label': 'カテゴリ' });
    this.root = h('main', { class: 'catalog-page' }, this.buildFilters(), this.catNav, this.grid);
    favoritesStore.subscribe(() => this.render());
    this.render();
  }

  private buildFilters(): HTMLElement {
    const search = h('input', {
      type: 'search',
      class: 'search',
      placeholder: '演出名・番号・技術で検索（例: グリッチ / 073 / GPGPU）',
      'aria-label': '検索',
    });
    search.addEventListener('input', () => {
      this.filter.query = search.value;
      this.render();
    });
    const status = h('select', { 'aria-label': '実装状況' });
    for (const [v, label] of [
      ['all', 'すべての状況'],
      ['playable', '動く演出のみ'],
      ['implemented', '実装済み'],
      ['experimental', '実験中'],
      ['planned', '未実装'],
    ]) {
      status.append(h('option', { value: v, text: label }));
    }
    status.addEventListener('change', () => {
      this.filter.status = status.value as CatalogFilter['status'];
      this.render();
    });
    const tech = h('select', { 'aria-label': '技術方式' });
    tech.append(h('option', { value: '', text: 'すべての技術' }));
    for (const [k, label] of Object.entries(TECH_LABELS)) tech.append(h('option', { value: k, text: label }));
    tech.addEventListener('change', () => {
      this.filter.tech = tech.value as Tech | '';
      this.render();
    });
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

  private renderCatNav(visibleCats: Set<number>): void {
    this.catNav.innerHTML = '';
    const all = h('button', { class: `chip ${this.filter.category === 0 ? 'active' : ''}`, text: 'すべて' });
    all.addEventListener('click', () => {
      this.filter.category = 0;
      this.render();
    });
    this.catNav.append(all);
    for (const c of CATEGORIES) {
      const inCat = CATALOG.filter((e) => e.category.index === c.index);
      const playable = inCat.filter((e) => availability(e.id) !== 'planned').length;
      const b = h(
        'button',
        {
          class: `chip cat-chip ${this.filter.category === c.index ? 'active' : ''} ${visibleCats.has(c.index) ? '' : 'dim'}`,
          style: `--cat:${c.color}`,
          title: `${c.name}（動作 ${playable}/${inCat.length}）`,
        },
        h('span', { class: 'dot' }),
        `${c.index}. ${c.name}`,
        playable ? h('span', { class: 'chip-count', text: String(playable) }) : null,
      );
      b.addEventListener('click', () => {
        this.filter.category = this.filter.category === c.index ? 0 : c.index;
        this.render();
      });
      this.catNav.append(b);
    }
  }

  render(): void {
    this.previews.clear();
    this.grid.innerHTML = '';
    const list = CATALOG.filter((e) => matches(e, this.filter, favoritesStore.has));
    const playable = list.filter((e) => availability(e.id) !== 'planned').length;
    this.count.textContent = `${list.length}件（動作 ${playable}件）`;
    this.renderCatNav(new Set(list.map((e) => e.category.index)));
    if (!list.length) {
      this.grid.append(h('p', { class: 'empty', text: '条件に一致する演出はありません。' }));
      return;
    }
    for (const c of CATEGORIES) {
      const items = list.filter((e) => e.category.index === c.index);
      if (!items.length) continue;
      const section = h(
        'section',
        { class: 'cat-section', style: `--cat:${c.color}`, id: `cat-${c.slug}` },
        h('h2', {}, h('span', { class: 'cat-index', text: String(c.index).padStart(2, '0') }), c.name),
      );
      const cards = h('div', { class: 'cards' });
      for (const e of items) cards.append(this.card(e));
      section.append(cards);
      this.grid.append(section);
    }
  }

  private card(e: CatalogEntry): HTMLElement {
    const st = availability(e.id);
    const reg = getRegistryEntry(e.id);
    const fav = favoritesStore.has(e.id);
    const favBtn = h('button', {
      class: `fav ${fav ? 'active' : ''}`,
      text: fav ? '★' : '☆',
      title: 'お気に入り',
      'aria-label': `${e.name}をお気に入りに${fav ? '解除' : '追加'}`,
      'aria-pressed': String(fav),
    });
    favBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      favoritesStore.toggle(e.id);
    });

    let media: HTMLElement;
    if (st === 'planned') {
      // 未実装演出には偽のプレビューを出さない：技術方式だけを文字で示す
      media = h(
        'div',
        { class: 'media planned' },
        h('span', { class: 'planned-label', text: '未実装' }),
        h('span', { class: 'planned-tech', text: e.tech.map((t) => TECH_LABELS[t]).join(' / ') }),
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

    const card = h(
      'article',
      {
        class: `card status-${st}`,
        tabindex: 0,
        role: 'button',
        'aria-label': `${e.id} ${e.name}（${AVAILABILITY_LABELS[st]}）を開く`,
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
          reg ? h('span', { class: 'kind', text: reg.kind === 'post' ? 'POST' : 'SOURCE' }) : null,
          e.category.extension ? h('span', { class: 'kind ext', text: '拡張' }) : null,
          favBtn,
        ),
        h('h3', { text: e.name }),
        e.reference ? h('p', { class: 'ref', text: `着想: ${e.reference.repo}（${e.reference.license}）· 実装は独自` }) : null,
        h('p', { class: 'desc', text: e.description }),
        h('div', { class: 'tags' }, ...e.tech.map((t) => h('span', { class: 'tag', text: TECH_LABELS[t] }))),
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
