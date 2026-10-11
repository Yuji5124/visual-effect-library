import { describe, expect, it } from 'vitest';
import { BASE_CATALOG, CATALOG, EXTENSION_CATALOG, TECH_LABELS } from '../src/data/catalog';
import { CATEGORIES } from '../src/data/categories';
import { availability } from '../src/effects/registry';
import { matches, type CatalogFilter } from '../src/ui/catalogView';

describe('カタログ', () => {
  it('基本200件・ID連番・重複なし', () => {
    expect(BASE_CATALOG).toHaveLength(200);
    BASE_CATALOG.forEach((e, i) => {
      expect(e.num).toBe(i + 1);
      expect(e.id).toBe(String(i + 1).padStart(3, '0'));
    });
  });

  it('基本は20カテゴリ × 10件', () => {
    const base = CATEGORIES.filter((c) => !c.extension);
    expect(base).toHaveLength(20);
    for (const c of base) {
      expect(BASE_CATALOG.filter((e) => e.category.index === c.index)).toHaveLength(10);
    }
  });

  it('拡張演出は201からの連番で、拡張カテゴリに属し、名前が基本200種と重複しない', () => {
    expect(EXTENSION_CATALOG.length).toBeGreaterThan(0);
    EXTENSION_CATALOG.forEach((e, i) => {
      expect(e.num).toBe(201 + i);
      expect(e.category.extension).toBe(true);
    });
    expect(new Set(CATALOG.map((e) => e.id)).size).toBe(CATALOG.length);
    expect(new Set(CATALOG.map((e) => e.name)).size).toBe(CATALOG.length);
  });

  it('拡張演出は着想元と、商用利用できるライセンスを記録している', () => {
    for (const e of EXTENSION_CATALOG) {
      expect(e.reference?.url).toMatch(/^https:\/\/github\.com\//);
      expect(['MIT', 'Zlib', 'Apache-2.0', 'BSD-3-Clause']).toContain(e.reference?.license);
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
