import { describe, expect, it } from 'vitest';
import { CATALOG } from '../src/data/catalog';
import { LIBRARY, MAIN_CATEGORIES, SUBCATEGORIES, getLibraryEntry, libraryStats } from '../src/data/library';
import { ALL_REGISTRY, REGISTRY, availability } from '../src/effects/registry';
import { LAB_REGISTRY } from '../src/lab/registry';
import { DEFAULT_LIBRARY_FILTER, libraryMatches, type LibraryFilter } from '../src/ui/catalogView';

const NEW_MAINS = ['geometry', 'motion', 'world'] as const;
const PREFIX = { geometry: 'GEO', motion: 'MOT', world: 'WRD' } as const;

describe('ライブラリ全体（366件）', () => {
  it('登録総数は366件、IDの重複なし', () => {
    expect(LIBRARY).toHaveLength(366);
    expect(new Set(LIBRARY.map((e) => e.id)).size).toBe(366);
  });

  it('分野ごとの件数：VISUAL 216 / GEOMETRY 50 / MOTION 50 / WORLD 50', () => {
    const count = (m: string) => LIBRARY.filter((e) => e.mainCategory === m).length;
    expect(count('visual')).toBe(216);
    for (const m of NEW_MAINS) expect(count(m)).toBe(50);
    expect(MAIN_CATEGORIES.map((m) => m.id)).toEqual(['visual', 'geometry', 'motion', 'world']);
  });

  it('既存の001〜216は順序・ID・名前・説明を変えずに取り込まれている', () => {
    const visual = LIBRARY.filter((e) => e.mainCategory === 'visual');
    expect(visual.map((e) => e.id)).toEqual(CATALOG.map((e) => e.id));
    visual.forEach((e, i) => {
      expect(e.nameJa).toBe(CATALOG[i].name);
      expect(e.description).toBe(CATALOG[i].description);
      expect(e.legacy).toBe(CATALOG[i]);
      expect(e.status).toBe(availability(e.id));
    });
  });

  it('新規150件は 接頭辞-001〜050 の連番で、各サブカテゴリにちょうど10件', () => {
    for (const m of NEW_MAINS) {
      const items = LIBRARY.filter((e) => e.mainCategory === m);
      items.forEach((e, i) => expect(e.id).toBe(`${PREFIX[m]}-${String(i + 1).padStart(3, '0')}`));
      const subs = SUBCATEGORIES.filter((s) => s.main === m);
      expect(subs).toHaveLength(5);
      subs.forEach((s, k) => {
        const inSub = items.filter((e) => e.subcategory.id === s.id);
        expect(inSub).toHaveLength(10);
        // A は 001〜010、B は 011〜020 …
        expect(inSub.map((e) => Number(e.id.slice(4)))).toEqual(Array.from({ length: 10 }, (_, j) => k * 10 + j + 1));
      });
    }
  });

  it('新規エントリは必須メタデータをすべて持つ', () => {
    for (const e of LIBRARY.filter((x) => x.mainCategory !== 'visual')) {
      for (const field of ['nameJa', 'nameEn', 'description', 'principle', 'implementation', 'updatedAt'] as const) {
        expect(e[field], `${e.id}.${field}`).toBeTruthy();
      }
      expect(e.referenceUrls.length, `${e.id} references`).toBeGreaterThan(0);
      for (const r of e.referenceUrls) {
        expect(() => new URL(r.url), `${e.id} ${r.url}`).not.toThrow();
        expect(r.license, `${e.id} license`).toBeTruthy();
      }
      expect(e.parameters.length, `${e.id} parameters`).toBeGreaterThan(0);
      expect(e.tags.length, `${e.id} tags`).toBeGreaterThan(0);
      expect(['light', 'medium', 'heavy']).toContain(e.performanceClass);
      expect(e.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('名前の重複がない（日本語名・英語名）', () => {
    const fresh = LIBRARY.filter((x) => x.mainCategory !== 'visual');
    expect(new Set(fresh.map((e) => e.nameJa)).size).toBe(fresh.length);
    expect(new Set(fresh.map((e) => e.nameEn)).size).toBe(fresh.length);
    const visualNames = new Set(CATALOG.map((e) => e.name));
    for (const e of fresh) expect(visualNames.has(e.nameJa), e.nameJa).toBe(false);
  });

  it('関連IDはすべて実在し、自分自身を指さない', () => {
    for (const e of LIBRARY) {
      for (const r of e.relatedIds) {
        expect(getLibraryEntry(r), `${e.id} → ${r}`).toBeDefined();
        expect(r).not.toBe(e.id);
      }
    }
  });

  it('集計は登録表と一致する', () => {
    const s = libraryStats();
    expect(s.total).toBe(366);
    expect(s.implemented + s.experimental + s.planned).toBe(366);
    const playable = ALL_REGISTRY.length;
    expect(s.implemented + s.experimental).toBe(playable);
  });
});

describe('実験場の登録表', () => {
  it('既存の登録表（REGISTRY）は変えず、別表として合成している', () => {
    expect(ALL_REGISTRY.slice(0, REGISTRY.length)).toEqual(REGISTRY);
    expect(ALL_REGISTRY.length).toBe(REGISTRY.length + LAB_REGISTRY.length);
  });

  it('ファイル名の番号とIDが一致し、ライブラリに存在する', () => {
    for (const r of LAB_REGISTRY) {
      const entry = getLibraryEntry(r.id);
      expect(entry, r.id).toBeDefined();
      const m = r.file.match(/^lab\/(geometry|motion|world)\/(geo|mot|wrd)(\d{3})-[a-z0-9-]+$/);
      expect(m, r.file).not.toBeNull();
      expect(`${m![2].toUpperCase()}-${m![3]}`).toBe(r.id);
      expect(entry!.mainCategory).toBe(m![1]);
      expect(r.kind).toBe('source');
    }
    expect(new Set(LAB_REGISTRY.map((r) => r.id)).size).toBe(LAB_REGISTRY.length);
  });

  it('エントリの状況は登録表から決まる', () => {
    for (const e of LIBRARY.filter((x) => x.mainCategory !== 'visual')) {
      const reg = LAB_REGISTRY.find((r) => r.id === e.id);
      expect(e.status).toBe(reg ? reg.status : 'planned');
    }
  });
});

describe('4分野の検索・絞り込み', () => {
  const none = () => false;
  const run = (f: Partial<LibraryFilter>) => LIBRARY.filter((e) => libraryMatches(e, { ...DEFAULT_LIBRARY_FILTER, ...f }, none));

  it('フィルタなしは366件', () => {
    expect(run({})).toHaveLength(366);
  });

  it('分野・サブカテゴリで絞り込める', () => {
    expect(run({ main: 'geometry' })).toHaveLength(50);
    expect(run({ main: 'visual' })).toHaveLength(216);
    expect(run({ main: 'world', sub: 'wrd-b' }).map((e) => e.id)).toEqual(Array.from({ length: 10 }, (_, i) => `WRD-${String(11 + i).padStart(3, '0')}`));
    expect(run({ main: 'visual', sub: 'vfx-06' })).toHaveLength(10);
  });

  it('ID・日本語名・英語名・原理・タグで検索できる（大文字小文字を区別しない）', () => {
    expect(run({ query: 'GEO-004' }).map((e) => e.id)).toEqual(['GEO-004']);
    expect(run({ query: 'mot-023' }).map((e) => e.id)).toEqual(['MOT-023']);
    expect(run({ query: 'fabrik' }).map((e) => e.id)).toContain('MOT-023');
    expect(run({ query: 'Wave Function Collapse' }).map((e) => e.id)).toContain('WRD-031');
    expect(run({ query: '迷路' }).every((e) => e.mainCategory === 'world' || (e.nameJa + e.description + e.principle + e.tags.join()).includes('迷路'))).toBe(true);
    expect(run({ query: '迷路' }).length).toBeGreaterThan(2);
  });

  it('既存の検索（番号・技術キー・状況名）も引き続き使える', () => {
    expect(run({ query: '073' }).map((e) => e.id)).toContain('073');
    expect(run({ query: 'GPGPU' }).every((e) => e.legacy?.tech.includes('gpgpu'))).toBe(true);
    expect(run({ query: 'ノイズ GLSL' }).length).toBeGreaterThan(0);
  });

  it('状況フィルタ（実装済み・実験中・未実装・動くもの）', () => {
    expect(run({ status: 'planned' }).every((e) => availability(e.id) === 'planned')).toBe(true);
    expect(run({ status: 'implemented' }).every((e) => availability(e.id) === 'implemented')).toBe(true);
    expect(run({ status: 'experimental' }).every((e) => availability(e.id) === 'experimental')).toBe(true);
    expect(run({ status: 'playable' })).toHaveLength(ALL_REGISTRY.length);
  });

  it('技術方式フィルタは VISUAL EFFECT のみに作用する', () => {
    const r = run({ tech: 'gpgpu' });
    expect(r.length).toBeGreaterThan(0);
    expect(r.every((e) => e.mainCategory === 'visual')).toBe(true);
  });

  it('お気に入りの絞り込み', () => {
    const fav = LIBRARY.filter((e) => libraryMatches(e, { ...DEFAULT_LIBRARY_FILTER, favoritesOnly: true }, (id) => id === 'GEO-001' || id === '003'));
    expect(fav.map((e) => e.id)).toEqual(['003', 'GEO-001']);
  });
});
