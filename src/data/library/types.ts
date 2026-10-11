/**
 * VISUAL EFFECT / GEOMETRY / MOTION / WORLD GENERATION の4分野を共通に扱うデータモデル。
 * 既存の 001〜216（src/data/catalog.ts）は変更せず、アダプターでこの型に変換して合成する。
 * 将来500件・1000件に増えても、分野とサブカテゴリを追加するだけで済むようにしている。
 */
import type { Availability } from '../../effects/registry';

export type MainCategory = 'visual' | 'geometry' | 'motion' | 'world';

export interface MainCategoryInfo {
  id: MainCategory;
  /** 表示名（英字。UIの切替タブ） */
  label: string;
  /** 日本語の説明 */
  nameJa: string;
  /** IDの接頭辞（visual は数字3桁） */
  prefix: string;
  color: string;
}

export interface Subcategory {
  /** 例: 'geo-a'、既存カテゴリは 'vfx-01' */
  id: string;
  main: MainCategory;
  /** 例: 'GEO-A' */
  code: string;
  name: string;
  color: string;
}

export interface Reference {
  label: string;
  url: string;
  /** 確認したライセンス（論文・解説記事など対象外なら '—'） */
  license: string;
  /** 採用理由・参照した内容 */
  note?: string;
}

export type PerformanceClass = 'light' | 'medium' | 'heavy';
export type MobileCompatibility = 'good' | 'reduced' | 'desktop-recommended' | 'unverified';

export interface LibraryEntry {
  id: string;
  nameJa: string;
  nameEn: string;
  mainCategory: MainCategory;
  subcategory: Subcategory;
  description: string;
  /** 動作原理 */
  principle: string;
  /** このライブラリでの実装方法 */
  implementation: string;
  /** 登録表から決まる実装状況（実装済み／実験中／未実装） */
  status: Availability;
  referenceUrls: Reference[];
  /** 主な操作パラメーター（表示用の名前。実際の定義はモジュール側） */
  parameters: string[];
  tags: string[];
  /** 関連するID（既存のVISUAL EFFECTも含む） */
  relatedIds: string[];
  performanceClass: PerformanceClass;
  mobileCompatibility: MobileCompatibility;
  /** YYYY-MM-DD */
  updatedAt: string;
}
