import { describe, expect, it } from 'vitest';
import { CATALOG, TECH_LABELS } from '../src/data/catalog';
import { CATEGORIES } from '../src/data/categories';
import { availability } from '../src/effects/registry';
import { matches, type CatalogFilter } from '../src/ui/catalogView';

describe('カタログ', () => {
  it('200件・ID連番・重複なし', () => {
    expect(CATALOG).toHaveLength(200);
    CATALOG.forEach((e, i) => {
      expect(e.num).toBe(i + 1);
      expect(e.id).toBe(String(i + 1).padStart(3, '0'));
    });
    expect(new Set(CATALOG.map((e) => e.name)).size).toBe(200);
  });

  it('20カテゴリ × 10件', () => {
    expect(CATEGORIES).toHaveLength(20);
    for (const c of CATEGORIES) {
      expect(CATALOG.filter((e) => e.category.index === c.index)).toHaveLength(10);
    }
  });

  it('全件に説明と既知の技術方式がある', () => {
    for (const e of CATALOG) {
      expect(e.description.length).toBeGreaterThan(8);
      expect(e.tech.length).toBeGreaterThan(0);
      for (const t of e.tech) expect(TECH_LABELS[t]).toBeTruthy();
    }
  });

  it('代表的な演出名が仕様どおり', () => {
    const byNum = (n: number) => CATALOG[n - 1];
    expect(byNum(1).name).toBe('データモッシュ');
    expect(byNum(78).name).toBe('レニア（Lenia）');
    expect(byNum(132).name).toBe('Physarum粘菌ネットワーク');
    expect(byNum(200).name).toBe('世界自己編集');
    expect(byNum(200).category.name).toBe('シュール・異常世界');
  });
});

describe('検索', () => {
  const base: CatalogFilter = { query: '', category: 0, status: 'all', tech: '', favoritesOnly: false };
  const none = () => false;
  const run = (f: Partial<CatalogFilter>) => CATALOG.filter((e) => matches(e, { ...base, ...f }, none));

  it('名前・番号・技術名で検索できる', () => {
    expect(run({ query: 'グリッチ' }).length).toBeGreaterThan(1);
    expect(run({ query: '073' }).map((e) => e.id)).toContain('073');
    expect(run({ query: 'GPGPU' }).every((e) => e.tech.includes('gpgpu'))).toBe(true);
  });

  it('スペース区切りはAND検索', () => {
    const r = run({ query: 'ノイズ GLSL' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => (e.name + e.description).includes('ノイズ'))).toBe(true);
  });

  it('状況フィルタ', () => {
    expect(run({ status: 'planned' }).every((e) => availability(e.id) === 'planned')).toBe(true);
    expect(run({ status: 'playable' }).every((e) => availability(e.id) !== 'planned')).toBe(true);
  });

  it('カテゴリ・お気に入りフィルタ', () => {
    expect(run({ category: 6 })).toHaveLength(10);
    const fav = CATALOG.filter((e) => matches(e, { ...base, favoritesOnly: true }, (id) => id === '003'));
    expect(fav.map((e) => e.id)).toEqual(['003']);
  });
});
