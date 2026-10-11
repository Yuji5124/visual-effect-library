/**
 * GEOMETRY / MOTION / WORLD GENERATION の実装済みデモの登録表。
 * 既存の src/effects/registry.ts（001〜216）とは別ファイルにして、既存の登録内容を一切変えない。
 * `npm run registry` が src/lab/{geometry,motion,world}/ のファイルから一覧を生成する。
 * ファイル名 geo001-xxx.ts → ID GEO-001。
 */
import type { EffectStatus } from '../engine/types';

export interface LabRegistryEntry {
  id: string;
  kind: 'source';
  status: EffectStatus;
  /** src/ からの相対パス（拡張子なし） */
  file: string;
}

export const LAB_REGISTRY: readonly LabRegistryEntry[] = [
  { id: 'GEO-022', kind: 'source', status: 'implemented', file: 'lab/geometry/geo022-twist' },
  { id: 'MOT-003', kind: 'source', status: 'implemented', file: 'lab/motion/mot003-damped-spring' },
  { id: 'WRD-001', kind: 'source', status: 'implemented', file: 'lab/world/wrd001-fbm-terrain' },
];
