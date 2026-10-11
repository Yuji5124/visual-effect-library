export interface Category {
  /** 1〜20 */
  index: number;
  slug: string;
  name: string;
  /** カテゴリのテーマカラー（UIのアクセント用） */
  color: string;
}

export const CATEGORIES: readonly Category[] = [
  { index: 1, slug: 'glitch', name: 'グリッチ・データ破壊', color: '#ff3b6b' },
  { index: 2, slug: 'time', name: '時間・残像', color: '#ff8a3d' },
  { index: 3, slug: 'retro', name: 'ピクセル・レトロ', color: '#ffd23d' },
  { index: 4, slug: 'light', name: '色彩・光', color: '#f6ff5c' },
  { index: 5, slug: 'distort', name: '空間歪曲', color: '#a6ff4d' },
  { index: 6, slug: 'particle', name: '粒子・流体', color: '#3dffa8' },
  { index: 7, slug: 'lens', name: 'カメラ・レンズ', color: '#3dfff0' },
  { index: 8, slug: 'generative', name: '幾何学・生成アート', color: '#3dc3ff' },
  { index: 9, slug: 'analog', name: 'アナログ・物質感', color: '#4d8bff' },
  { index: 10, slug: 'world', name: '世界変容・実験表現', color: '#7a5cff' },
  { index: 11, slug: 'illusion', name: '錯視・知覚操作', color: '#b45cff' },
  { index: 12, slug: 'machine', name: 'AI・機械視覚', color: '#e45cff' },
  { index: 13, slug: 'physics', name: '物理・破壊', color: '#ff5cc8' },
  { index: 14, slug: 'life', name: '生命・群衆・成長', color: '#5cff6a' },
  { index: 15, slug: 'type', name: '文字・情報視覚化', color: '#c8ff5c' },
  { index: 16, slug: 'audio', name: '音響反応・同期', color: '#ffb05c' },
  { index: 17, slug: 'ar', name: '空間投影・AR', color: '#5cffd6' },
  { index: 18, slug: 'transition', name: 'トランジション・変身', color: '#5c9dff' },
  { index: 19, slug: 'cinema', name: '映画的・特殊撮影', color: '#ffe0a8' },
  { index: 20, slug: 'surreal', name: 'シュール・異常世界', color: '#ff7a7a' },
];

export function categoryByIndex(index: number): Category {
  const c = CATEGORIES[index - 1];
  if (!c) throw new Error(`Unknown category index: ${index}`);
  return c;
}
