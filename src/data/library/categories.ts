import { CATEGORIES } from '../categories';
import type { MainCategory, MainCategoryInfo, Subcategory } from './types';

export const MAIN_CATEGORIES: readonly MainCategoryInfo[] = [
  { id: 'visual', label: 'VISUAL EFFECT', nameJa: '映像を変える', prefix: '', color: '#ff3b6b' },
  { id: 'geometry', label: 'GEOMETRY', nameJa: '形を作る', prefix: 'GEO', color: '#5ab8ff' },
  { id: 'motion', label: 'MOTION', nameJa: '動きを作る', prefix: 'MOT', color: '#7dff8a' },
  { id: 'world', label: 'WORLD GENERATION', nameJa: '世界を作る', prefix: 'WRD', color: '#ffb84d' },
];

/** 既存の22カテゴリ（基本20＋拡張2）をそのままVISUAL EFFECTのサブカテゴリとして扱う */
const VISUAL_SUBS: Subcategory[] = CATEGORIES.map((c) => ({
  id: `vfx-${String(c.index).padStart(2, '0')}`,
  main: 'visual' as MainCategory,
  code: c.extension ? `EXT-${c.index - 20}` : String(c.index).padStart(2, '0'),
  name: c.name,
  color: c.color,
}));

const sub = (main: MainCategory, code: string, name: string, color: string): Subcategory => ({
  id: code.toLowerCase(),
  main,
  code,
  name,
  color,
});

export const SUBCATEGORIES: readonly Subcategory[] = [
  ...VISUAL_SUBS,
  sub('geometry', 'GEO-A', '基本形状・多面体', '#5ab8ff'),
  sub('geometry', 'GEO-B', '曲線・曲面', '#5ad8ff'),
  sub('geometry', 'GEO-C', '形状変形', '#5affe8'),
  sub('geometry', 'GEO-D', 'メッシュ・立体演算', '#7a9dff'),
  sub('geometry', 'GEO-E', '生成構造・数学形状', '#9a7aff'),
  sub('motion', 'MOT-A', '基本運動・補間', '#7dff8a'),
  sub('motion', 'MOT-B', '軌道・追従', '#b8ff5a'),
  sub('motion', 'MOT-C', '関節・身体運動', '#5affb0'),
  sub('motion', 'MOT-D', '群れ・複数物体運動', '#d8ff5a'),
  sub('motion', 'MOT-E', '特殊運動・時間制御', '#5affd8'),
  sub('world', 'WRD-A', '地形生成', '#ffb84d'),
  sub('world', 'WRD-B', '都市・建築生成', '#ff8a4d'),
  sub('world', 'WRD-C', '自然・生態環境生成', '#c8e05a'),
  sub('world', 'WRD-D', '迷宮・空間生成', '#e0a05a'),
  sub('world', 'WRD-E', '動的世界・ルール生成', '#ff6a6a'),
];

const byCode = new Map(SUBCATEGORIES.map((s) => [s.code, s]));
const byId = new Map(SUBCATEGORIES.map((s) => [s.id, s]));

export function subcategoryByCode(code: string): Subcategory {
  const s = byCode.get(code);
  if (!s) throw new Error(`Unknown subcategory: ${code}`);
  return s;
}

export function subcategoryById(id: string): Subcategory | undefined {
  return byId.get(id);
}

export function mainCategoryInfo(id: MainCategory): MainCategoryInfo {
  return MAIN_CATEGORIES.find((m) => m.id === id)!;
}
