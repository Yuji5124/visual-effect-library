/**
 * 実装済み演出の登録表。
 * 各演出は動的 import で個別のチャンクとして読み込まれるため、
 * 1つのモジュールが壊れても他の演出の読み込みには影響しない。
 *
 * 新しい演出を追加する手順:
 *   1. src/effects/post または src/effects/source にモジュールを作る
 *   2. `npm run registry` を実行（下の REGISTRY 一覧をファイルから自動生成する）
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
  { id: '001', kind: 'post', status: 'experimental', file: 'post/e001-datamosh' },
  { id: '003', kind: 'post', status: 'implemented', file: 'post/e003-rgb-split' },
  { id: '004', kind: 'post', status: 'implemented', file: 'post/e004-block-noise' },
  { id: '005', kind: 'post', status: 'implemented', file: 'post/e005-slice-glitch' },
  { id: '006', kind: 'post', status: 'implemented', file: 'post/e006-digital-tearing' },
  { id: '007', kind: 'post', status: 'implemented', file: 'post/e007-freeze-glitch' },
  { id: '008', kind: 'post', status: 'implemented', file: 'post/e008-bit-crush' },
  { id: '009', kind: 'post', status: 'implemented', file: 'post/e009-signal-loss' },
  // 2. 時間・残像
  { id: '011', kind: 'post', status: 'implemented', file: 'post/e011-stutter' },
  { id: '012', kind: 'post', status: 'implemented', file: 'post/e012-frame-echo' },
  { id: '016', kind: 'source', status: 'experimental', file: 'source/e016-loop-tunnel' },
  { id: '017', kind: 'post', status: 'implemented', file: 'post/e017-feedback' },
  { id: '018', kind: 'post', status: 'implemented', file: 'post/e018-slit-scan' },
  { id: '019', kind: 'post', status: 'implemented', file: 'post/e019-time-delay' },
  { id: '020', kind: 'post', status: 'implemented', file: 'post/e020-motion-strobe' },
  // 3. ピクセル・レトロ
  { id: '021', kind: 'post', status: 'implemented', file: 'post/e021-pixelate' },
  { id: '022', kind: 'post', status: 'implemented', file: 'post/e022-ascii' },
  { id: '023', kind: 'post', status: 'implemented', file: 'post/e023-dither' },
  { id: '024', kind: 'post', status: 'implemented', file: 'post/e024-halftone' },
  { id: '027', kind: 'post', status: 'implemented', file: 'post/e027-palette-limit' },
  { id: '028', kind: 'post', status: 'implemented', file: 'post/e028-crt' },
  { id: '029', kind: 'post', status: 'implemented', file: 'post/e029-dot-matrix' },
  { id: '030', kind: 'source', status: 'implemented', file: 'source/e030-wireframe' },
  // 4. 色彩・光
  { id: '031', kind: 'post', status: 'implemented', file: 'post/e031-bloom' },
  { id: '032', kind: 'post', status: 'implemented', file: 'post/e032-god-rays' },
  { id: '033', kind: 'post', status: 'implemented', file: 'post/e033-hue-rotate' },
  { id: '034', kind: 'post', status: 'implemented', file: 'post/e034-solarize' },
  { id: '035', kind: 'post', status: 'implemented', file: 'post/e035-invert' },
  { id: '036', kind: 'post', status: 'implemented', file: 'post/e036-duotone' },
  { id: '037', kind: 'post', status: 'implemented', file: 'post/e037-psychedelic' },
  { id: '038', kind: 'post', status: 'implemented', file: 'post/e038-edge-glow' },
  { id: '039', kind: 'post', status: 'implemented', file: 'post/e039-exposure-pulse' },
  // 5. 空間歪曲
  { id: '041', kind: 'post', status: 'implemented', file: 'post/e041-wave' },
  { id: '042', kind: 'post', status: 'implemented', file: 'post/e042-twist' },
  { id: '043', kind: 'post', status: 'implemented', file: 'post/e043-bulge' },
  { id: '044', kind: 'post', status: 'implemented', file: 'post/e044-pinch' },
  { id: '045', kind: 'post', status: 'implemented', file: 'post/e045-liquid-warp' },
  { id: '047', kind: 'post', status: 'implemented', file: 'post/e047-kaleidoscope' },
  { id: '048', kind: 'post', status: 'implemented', file: 'post/e048-mirror-world' },
  { id: '049', kind: 'post', status: 'implemented', file: 'post/e049-portal-warp' },
  // 6. 粒子・流体
  { id: '053', kind: 'source', status: 'implemented', file: 'source/e053-flow-field' },
  { id: '055', kind: 'source', status: 'implemented', file: 'source/e055-ink-diffusion' },
  { id: '056', kind: 'source', status: 'implemented', file: 'source/e056-smoke' },
  { id: '057', kind: 'post', status: 'implemented', file: 'post/e057-fluid-feedback' },
  { id: '058', kind: 'source', status: 'implemented', file: 'source/e058-falling-sand' },
  { id: '059', kind: 'source', status: 'implemented', file: 'source/e059-metaballs' },
  { id: '060', kind: 'source', status: 'implemented', file: 'source/e060-reaction-diffusion' },
  // 7. カメラ・レンズ
  { id: '061', kind: 'post', status: 'implemented', file: 'post/e061-fisheye' },
  { id: '062', kind: 'post', status: 'implemented', file: 'post/e062-tilt-shift' },
  { id: '065', kind: 'post', status: 'implemented', file: 'post/e065-rolling-shutter' },
  { id: '066', kind: 'post', status: 'implemented', file: 'post/e066-lens-flare' },
  { id: '067', kind: 'post', status: 'implemented', file: 'post/e067-chromatic-aberration' },
  // 8. 幾何学・生成アート
  { id: '071', kind: 'source', status: 'implemented', file: 'source/e071-fractal-zoom' },
  { id: '072', kind: 'source', status: 'implemented', file: 'source/e072-mandelbulb' },
  { id: '073', kind: 'source', status: 'implemented', file: 'source/e073-raymarching' },
  { id: '074', kind: 'source', status: 'implemented', file: 'source/e074-voronoi' },
  { id: '075', kind: 'source', status: 'implemented', file: 'source/e075-noise-terrain' },
  { id: '076', kind: 'source', status: 'implemented', file: 'source/e076-cellular-automaton' },
  { id: '077', kind: 'source', status: 'implemented', file: 'source/e077-game-of-life' },
  { id: '078', kind: 'source', status: 'implemented', file: 'source/e078-lenia' },
  { id: '080', kind: 'source', status: 'implemented', file: 'source/e080-strange-attractor' },
  // 9. アナログ・物質感
  { id: '081', kind: 'post', status: 'implemented', file: 'post/e081-vhs' },
  { id: '082', kind: 'post', status: 'implemented', file: 'post/e082-film-grain' },
  { id: '083', kind: 'post', status: 'implemented', file: 'post/e083-film-burn' },
  { id: '084', kind: 'post', status: 'implemented', file: 'post/e084-analog-tv' },
  { id: '088', kind: 'post', status: 'implemented', file: 'post/e088-lcd-damage' },
  // 10. 世界変容・実験表現
  { id: '093', kind: 'source', status: 'implemented', file: 'source/e093-infinite-mirror' },
  { id: '094', kind: 'source', status: 'implemented', file: 'source/e094-real-virtual' },
  { id: '097', kind: 'source', status: 'implemented', file: 'source/e097-scale-anomaly' },
  { id: '098', kind: 'source', status: 'implemented', file: 'source/e098-cross-section' },
  // 11. 錯視・知覚操作
  { id: '101', kind: 'source', status: 'implemented', file: 'source/e101-moire' },
  { id: '102', kind: 'source', status: 'implemented', file: 'source/e102-peripheral-drift' },
  { id: '103', kind: 'source', status: 'implemented', file: 'source/e103-afterimage' },
  { id: '109', kind: 'source', status: 'implemented', file: 'source/e109-figure-ground' },
  // 12. AI・機械視覚
  { id: '113', kind: 'source', status: 'implemented', file: 'source/e113-depth-map' },
  { id: '114', kind: 'source', status: 'implemented', file: 'source/e114-normal-map' },
  { id: '115', kind: 'source', status: 'implemented', file: 'source/e115-point-cloud' },
  { id: '117', kind: 'post', status: 'implemented', file: 'post/e117-optical-flow' },
  { id: '118', kind: 'post', status: 'implemented', file: 'post/e118-heatmap' },
  { id: '119', kind: 'post', status: 'implemented', file: 'post/e119-edge-detect' },
  // 13. 物理・破壊
  { id: '123', kind: 'source', status: 'implemented', file: 'source/e123-soft-body' },
  { id: '124', kind: 'source', status: 'implemented', file: 'source/e124-cloth' },
  { id: '125', kind: 'source', status: 'implemented', file: 'source/e125-wave-propagation' },
  { id: '130', kind: 'source', status: 'implemented', file: 'source/e130-domino-chain' },
  // 14. 生命・群衆・成長
  { id: '131', kind: 'source', status: 'implemented', file: 'source/e131-boids' },
  { id: '132', kind: 'source', status: 'implemented', file: 'source/e132-physarum' },
  { id: '133', kind: 'source', status: 'implemented', file: 'source/e133-branch-growth' },
  { id: '140', kind: 'source', status: 'implemented', file: 'source/e140-firefly-sync' },
  // 15. 文字・情報視覚化
  { id: '143', kind: 'source', status: 'implemented', file: 'source/e143-text-particles' },
  { id: '144', kind: 'source', status: 'implemented', file: 'source/e144-code-rain' },
  { id: '146', kind: 'source', status: 'implemented', file: 'source/e146-network-graph' },
  { id: '148', kind: 'source', status: 'implemented', file: 'source/e148-text-glitch' },
  // 16. 音響反応・同期
  { id: '151', kind: 'source', status: 'implemented', file: 'source/e151-waveform' },
  { id: '152', kind: 'source', status: 'implemented', file: 'source/e152-spectrum' },
  { id: '153', kind: 'post', status: 'implemented', file: 'post/e153-beat-pulse' },
  { id: '156', kind: 'source', status: 'implemented', file: 'source/e156-cymatics' },
  { id: '158', kind: 'post', status: 'implemented', file: 'post/e158-frequency-color' },
  { id: '159', kind: 'source', status: 'implemented', file: 'source/e159-sound-terrain' },
  // 17. 空間投影・AR
  { id: '164', kind: 'source', status: 'implemented', file: 'source/e164-spatial-portal' },
  { id: '168', kind: 'source', status: 'implemented', file: 'source/e168-ar-shadow' },
  { id: '170', kind: 'source', status: 'implemented', file: 'source/e170-spatial-scan' },
  // 18. トランジション・変身
  { id: '171', kind: 'post', status: 'implemented', file: 'post/e171-cross-dissolve' },
  { id: '172', kind: 'post', status: 'implemented', file: 'post/e172-wipe' },
  { id: '175', kind: 'post', status: 'implemented', file: 'post/e175-liquid-transition' },
  { id: '176', kind: 'post', status: 'implemented', file: 'post/e176-zoom-transition' },
  { id: '178', kind: 'post', status: 'implemented', file: 'post/e178-mask-growth' },
  // 19. 映画的・特殊撮影
  { id: '182', kind: 'post', status: 'implemented', file: 'post/e182-long-exposure' },
  { id: '183', kind: 'post', status: 'implemented', file: 'post/e183-double-exposure' },
  { id: '184', kind: 'post', status: 'implemented', file: 'post/e184-stop-motion' },
  { id: '185', kind: 'post', status: 'implemented', file: 'post/e185-rotoscope' },
  { id: '186', kind: 'post', status: 'implemented', file: 'post/e186-miniature' },
  { id: '189', kind: 'post', status: 'implemented', file: 'post/e189-silhouette' },
  // 20. シュール・異常世界
  { id: '191', kind: 'post', status: 'implemented', file: 'post/e191-world-recursion' },
  { id: '193', kind: 'source', status: 'implemented', file: 'source/e193-space-fold' },
  { id: '194', kind: 'source', status: 'implemented', file: 'source/e194-living-buildings' },
  { id: '195', kind: 'source', status: 'implemented', file: 'source/e195-rogue-shadow' },
  { id: '199', kind: 'source', status: 'implemented', file: 'source/e199-scale-chain' },
  // 21. 拡張：レンダリング技法
  { id: '201', kind: 'source', status: 'implemented', file: 'source/e201-ssao' },
  { id: '202', kind: 'source', status: 'implemented', file: 'source/e202-outline' },
  { id: '203', kind: 'post', status: 'implemented', file: 'post/e203-shockwave' },
  { id: '204', kind: 'post', status: 'implemented', file: 'post/e204-color-grading-lut' },
  { id: '205', kind: 'source', status: 'implemented', file: 'source/e205-anaglyph' },
  { id: '206', kind: 'source', status: 'implemented', file: 'source/e206-toon-shading' },
  { id: '207', kind: 'source', status: 'implemented', file: 'source/e207-thin-film' },
  { id: '208', kind: 'source', status: 'implemented', file: 'source/e208-decals' },
  // 22. 拡張：自然・空間・遷移
  { id: '209', kind: 'source', status: 'implemented', file: 'source/e209-ocean' },
  { id: '210', kind: 'source', status: 'implemented', file: 'source/e210-atmospheric-sky' },
  { id: '211', kind: 'source', status: 'implemented', file: 'source/e211-volume-clouds' },
  { id: '212', kind: 'source', status: 'implemented', file: 'source/e212-lava' },
  { id: '213', kind: 'source', status: 'implemented', file: 'source/e213-nbody' },
  { id: '214', kind: 'post', status: 'implemented', file: 'post/e214-page-curl' },
  { id: '215', kind: 'post', status: 'implemented', file: 'post/e215-screen-melt' },
  { id: '216', kind: 'post', status: 'implemented', file: 'post/e216-grid-flip' },
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
