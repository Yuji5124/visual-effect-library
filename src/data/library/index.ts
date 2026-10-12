/**
 * 4分野（VISUAL EFFECT / GEOMETRY / MOTION / WORLD GENERATION）を合成したライブラリ全体。
 * 既存の 001〜216 は src/data/catalog.ts を変更せずにアダプターで LibraryEntry へ変換する。
 */
import { CATALOG, TECH_LABELS, type CatalogEntry } from '../catalog';
import { availability } from '../../effects/registry';
import { MAIN_CATEGORIES, SUBCATEGORIES, mainCategoryInfo, subcategoryById } from './categories';
import { GEOMETRY_ENTRIES } from './geometry';
import { MOTION_ENTRIES } from './motion';
import { WORLD_ENTRIES } from './world';
import type { LibraryEntry, MainCategory } from './types';

export * from './types';
export { MAIN_CATEGORIES, SUBCATEGORIES, subcategoryById, mainCategoryInfo as mainCategoryInfoOf };

/** 既存の演出は 2026-07 時点の記録（更新日は保持していないため、作業記録上の取り込み日を入れる） */
const VISUAL_UPDATED = '2026-07-01';

export function adaptCatalogEntry(e: CatalogEntry): LibraryEntry {
  const sub = subcategoryById(`vfx-${String(e.category.index).padStart(2, '0')}`)!;
  const techs = e.tech.map((t) => TECH_LABELS[t]);
  return {
    id: e.id,
    nameJa: e.name,
    nameEn: '',
    mainCategory: 'visual',
    subcategory: sub,
    description: e.description,
    principle: e.description,
    implementation: techs.join(' / '),
    status: availability(e.id),
    referenceUrls: e.reference ? [{ label: `${e.reference.repo}（${e.reference.item}）`, url: e.reference.url, license: e.reference.license, note: '着想元。実装は独自' }] : [],
    parameters: [],
    tags: techs,
    relatedIds: [],
    performanceClass: e.tech.includes('gpgpu') || e.tech.includes('physics') ? 'heavy' : 'medium',
    mobileCompatibility: 'unverified',
    updatedAt: VISUAL_UPDATED,
    legacy: e,
  };
}

export const VISUAL_ENTRIES: readonly LibraryEntry[] = CATALOG.map(adaptCatalogEntry);

export const LIBRARY: readonly LibraryEntry[] = [...VISUAL_ENTRIES, ...GEOMETRY_ENTRIES, ...MOTION_ENTRIES, ...WORLD_ENTRIES];

const byId = new Map(LIBRARY.map((e) => [e.id, e]));

export function getLibraryEntry(id: string): LibraryEntry | undefined {
  return byId.get(id);
}

export function entriesOf(main: MainCategory): LibraryEntry[] {
  return LIBRARY.filter((e) => e.mainCategory === main);
}

/** 検索：ID・日英名・説明・原理・タグ・サブカテゴリ名を対象（空白区切りでAND） */
export function matchesQuery(e: LibraryEntry, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [e.id, e.nameJa, e.nameEn, e.description, e.principle, e.subcategory.name, e.subcategory.code, ...e.tags].join(' ').toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function libraryStats(): { total: number; implemented: number; experimental: number; planned: number } {
  let implemented = 0;
  let experimental = 0;
  for (const e of LIBRARY) {
    const s = availability(e.id);
    if (s === 'implemented') implemented++;
    else if (s === 'experimental') experimental++;
  }
  return { total: LIBRARY.length, implemented, experimental, planned: LIBRARY.length - implemented - experimental };
}

