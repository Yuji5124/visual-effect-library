import { availability } from '../../effects/registry';
import { subcategoryByCode } from './categories';
import type { LibraryEntry, MainCategory, MobileCompatibility, PerformanceClass, Reference } from './types';

/** 新規エントリの記述用（status は登録表から自動で決まるので書かない） */
export interface EntrySpec {
  id: string;
  nameJa: string;
  nameEn: string;
  sub: string;
  description: string;
  principle: string;
  implementation: string;
  refs: Reference[];
  parameters: string[];
  tags: string[];
  related?: string[];
  perf?: PerformanceClass;
  mobile?: MobileCompatibility;
  updatedAt?: string;
}

export const UPDATED = '2026-10-11';

export function defineEntries(main: MainCategory, specs: EntrySpec[]): LibraryEntry[] {
  return specs.map((s) => {
    const subcategory = subcategoryByCode(s.sub);
    if (subcategory.main !== main) throw new Error(`${s.id}: サブカテゴリ ${s.sub} は ${main} に属しません`);
    return {
      id: s.id,
      nameJa: s.nameJa,
      nameEn: s.nameEn,
      mainCategory: main,
      subcategory,
      description: s.description,
      principle: s.principle,
      implementation: s.implementation,
      status: availability(s.id),
      referenceUrls: s.refs,
      parameters: s.parameters,
      tags: s.tags,
      relatedIds: s.related ?? [],
      performanceClass: s.perf ?? 'medium',
      mobileCompatibility: s.mobile ?? 'unverified',
      updatedAt: s.updatedAt ?? UPDATED,
    };
  });
}
