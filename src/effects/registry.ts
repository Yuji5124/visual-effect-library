/**
 * 実装済み演出の登録表。
 * 各演出は動的 import で個別のチャンクとして読み込まれるため、
 * 1つのモジュールが壊れても他の演出の読み込みには影響しない。
 *
 * 新しい演出を追加する手順:
 *   1. src/effects/post または src/effects/source にモジュールを作る
 *   2. ここに { id, kind, status, load } を1行追加する
 *   （カタログ側 src/data/catalog.ts の記述はそのまま。実装状況は自動で切り替わる）
 */
import type { EffectModule, EffectStatus } from '../engine/types';

export interface RegistryEntry {
  id: string;
  kind: 'source' | 'post';
  status: EffectStatus;
  /** src/effects/ からの相対パス（拡張子なし） */
  file: string;
}

// 各演出ファイルを個別チャンクとして遅延読み込みする
const loaders = import.meta.glob<{ default: EffectModule }>(['./post/*.ts', './source/*.ts']);

export const REGISTRY: readonly RegistryEntry[] = [
  // 1. グリッチ・データ破壊
  { id: '003', kind: 'post', status: 'implemented', file: 'post/e003-rgb-split' },
  { id: '004', kind: 'post', status: 'implemented', file: 'post/e004-block-noise' },
  { id: '005', kind: 'post', status: 'implemented', file: 'post/e005-slice-glitch' },
  { id: '008', kind: 'post', status: 'implemented', file: 'post/e008-bit-crush' },
  // 2. 時間・残像
  { id: '016', kind: 'source', status: 'experimental', file: 'source/e016-loop-tunnel' },
  { id: '017', kind: 'post', status: 'implemented', file: 'post/e017-feedback' },
  // 3. ピクセル・レトロ
  { id: '021', kind: 'post', status: 'implemented', file: 'post/e021-pixelate' },
  { id: '022', kind: 'post', status: 'implemented', file: 'post/e022-ascii' },
  { id: '023', kind: 'post', status: 'implemented', file: 'post/e023-dither' },
  { id: '024', kind: 'post', status: 'implemented', file: 'post/e024-halftone' },
  { id: '028', kind: 'post', status: 'implemented', file: 'post/e028-crt' },
  // 4. 色彩・光
  { id: '031', kind: 'post', status: 'implemented', file: 'post/e031-bloom' },
  { id: '033', kind: 'post', status: 'implemented', file: 'post/e033-hue-rotate' },
  { id: '036', kind: 'post', status: 'implemented', file: 'post/e036-duotone' },
  // 5. 空間歪曲
  { id: '041', kind: 'post', status: 'implemented', file: 'post/e041-wave' },
  { id: '042', kind: 'post', status: 'implemented', file: 'post/e042-twist' },
  { id: '047', kind: 'post', status: 'implemented', file: 'post/e047-kaleidoscope' },
  // 6. 粒子・流体
  { id: '053', kind: 'source', status: 'implemented', file: 'source/e053-flow-field' },
  { id: '059', kind: 'source', status: 'implemented', file: 'source/e059-metaballs' },
  { id: '060', kind: 'source', status: 'implemented', file: 'source/e060-reaction-diffusion' },
  // 7. カメラ・レンズ
  { id: '067', kind: 'post', status: 'implemented', file: 'post/e067-chromatic-aberration' },
  // 8. 幾何学・生成アート
  { id: '071', kind: 'source', status: 'implemented', file: 'source/e071-fractal-zoom' },
  { id: '073', kind: 'source', status: 'implemented', file: 'source/e073-raymarching' },
  { id: '074', kind: 'source', status: 'implemented', file: 'source/e074-voronoi' },
  { id: '077', kind: 'source', status: 'implemented', file: 'source/e077-game-of-life' },
  { id: '080', kind: 'source', status: 'implemented', file: 'source/e080-strange-attractor' },
  // 9. アナログ・物質感
  { id: '081', kind: 'post', status: 'implemented', file: 'post/e081-vhs' },
  { id: '082', kind: 'post', status: 'implemented', file: 'post/e082-film-grain' },
  // 11. 錯視・知覚操作
  { id: '101', kind: 'source', status: 'implemented', file: 'source/e101-moire' },
  // 12. AI・機械視覚
  { id: '118', kind: 'post', status: 'implemented', file: 'post/e118-heatmap' },
  { id: '119', kind: 'post', status: 'implemented', file: 'post/e119-edge-detect' },
  // 14. 生命・群衆・成長
  { id: '131', kind: 'source', status: 'implemented', file: 'source/e131-boids' },
  // 15. 文字・情報視覚化
  { id: '144', kind: 'source', status: 'implemented', file: 'source/e144-code-rain' },
];

const byId = new Map(REGISTRY.map((r) => [r.id, r]));

export function getRegistryEntry(id: string): RegistryEntry | undefined {
  return byId.get(id);
}

export type Availability = EffectStatus | 'planned';

export function availability(id: string): Availability {
  return byId.get(id)?.status ?? 'planned';
}

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  implemented: '実装済み',
  experimental: '実験中',
  planned: '未実装',
};

const cache = new Map<string, Promise<EffectModule>>();

/** 演出モジュールを読み込む（失敗はPromiseのrejectとして呼び出し側に閉じ込める） */
export function loadEffect(id: string): Promise<EffectModule> {
  const entry = byId.get(id);
  if (!entry) return Promise.reject(new Error(`演出 ${id} は未実装です`));
  let p = cache.get(id);
  if (!p) {
    const loader = loaders[`./${entry.file}.ts`];
    if (!loader) return Promise.reject(new Error(`演出 ${id} のファイル ${entry.file} が見つかりません`));
    p = loader().then((m) => {
      const mod = m.default;
      if (!mod || mod.id !== id || mod.kind !== entry.kind) {
        throw new Error(`演出 ${id} のモジュール定義が登録内容と一致しません`);
      }
      return mod;
    });
    p.catch(() => cache.delete(id));
    cache.set(id, p);
  }
  return p;
}
