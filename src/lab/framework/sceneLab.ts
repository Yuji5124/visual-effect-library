import * as THREE from 'three';
import type { ActionDef, EffectContext, EffectStatus, ParamDef, ParamValues, SourceEffect } from '../../engine/types';
import { clearGroup, countGeometry, createLabStage, setWireframe } from './stage';
import { makeRng } from './random';

export interface LabBuild {
  /** 結果（書き出し対象） */
  object: THREE.Object3D;
  /** 比較用の「処理前」。比較をオンにすると左に並べる */
  before?: THREE.Object3D;
  /** 制御点・補助線など（書き出し対象外） */
  helpers?: THREE.Object3D;
  /** ステータスに出す追加情報 */
  info?: string | (() => string);
  /** 毎フレームの更新（成長アニメーション・動的シミュレーションなど） */
  update?(dt: number, time: number, params: ParamValues): void;
  /** build が作ったGPU以外の資源の解放（任意） */
  dispose?(): void;
}

export interface BuildEnv {
  rng: () => number;
  seed: number;
  quality: 'high' | 'low';
}

export interface SceneLabDef {
  id: string;
  status?: EffectStatus;
  params: ParamDef[];
  notes: string;
  build(params: ParamValues, env: BuildEnv): LabBuild;
  /** 変更しても再生成しないパラメーター（update で読むだけのもの） */
  liveKeys?: string[];
  /** 書き出せない場合はその理由（文字列）。省略時は書き出し可能 */
  exportable?: true | string;
  distance?: number;
  elevation?: number;
  target?: [number, number, number];
  gridSize?: number;
  background?: number;
  /** 比較表示のラベル [左, 右] */
  compareLabels?: [string, string];
  /** 追加の操作ボタン。押されると build 結果の action が呼ばれる */
  extraActions?: ActionDef[];
  onAction?(key: string, params: ParamValues): Partial<ParamValues> | void;
}

export const COMMON_GEOMETRY_PARAMS: ParamDef[] = [
  { key: 'wireframe', label: 'ワイヤーフレーム', type: 'bool', default: false },
  { key: 'compare', label: '処理前と並べて比較', type: 'bool', default: false },
  { key: 'autoRotate', label: '自動回転', type: 'bool', default: true },
];

export const COMMON_WORLD_PARAMS: ParamDef[] = [
  { key: 'seed', label: 'シード（同じ値で同じ結果）', type: 'number', min: 1, max: 9999, step: 1, default: 1 },
  { key: 'compare', label: '生成前・生成後を並べて比較', type: 'bool', default: false },
  { key: 'wireframe', label: 'ワイヤーフレーム', type: 'bool', default: false },
  { key: 'autoRotate', label: '自動回転', type: 'bool', default: true },
];

const COMMON_KEYS = new Set(['wireframe', 'compare', 'autoRotate']);

/**
 * GEOMETRY / WORLD GENERATION 共通の3D実験場。
 * パラメーターが変わったときだけ build を呼び直し、古い生成物を確実に解放する。
 */
export function defineSceneLab(def: SceneLabDef, kind: 'geometry' | 'world'): SourceEffect {
  const common = kind === 'world' ? COMMON_WORLD_PARAMS : COMMON_GEOMETRY_PARAMS;
  const params = [...def.params, ...common];
  const actions: ActionDef[] = [
    ...(kind === 'world'
      ? [
          { key: 'regenerate', label: '🎲 ランダム生成', title: '新しいシードで生成し直す' },
          { key: 'rebuild', label: '↻ 同じシードで再生成', title: 'シードを変えずに作り直す（結果が同じになることを確認できる）' },
        ]
      : [{ key: 'rebuild', label: '↻ 再生成' }]),
    ...(def.extraActions ?? []),
    { key: 'resetView', label: '⌖ 視点リセット' },
  ];
  const liveKeys = new Set([...(def.liveKeys ?? []), ...COMMON_KEYS]);
  return {
    id: def.id,
    kind: 'source',
    status: def.status ?? 'implemented',
    params,
    notes: def.notes,
    actions,
    interaction: 'orbit',
    create(ctx: EffectContext) {
      let current: LabBuild | null = null;
      let key = '';
      let forceRebuild = false;
      let time = 0;
      let lastCompare = false;
      let lastWire = false;
      let error: string | null = null;
      const stage = createLabStage(ctx, {
        distance: def.distance ?? 8,
        elevation: def.elevation,
        target: def.target ? new THREE.Vector3(...def.target) : undefined,
        gridSize: def.gridSize,
        background: def.background,
        onUpdate: (frame, p) => {
          stage.rig.autoRotate = Boolean(p.autoRotate);
          const k = JSON.stringify(Object.entries(p).filter(([name]) => !liveKeys.has(name)));
          if (k !== key || forceRebuild) {
            key = k;
            forceRebuild = false;
            rebuild(p);
          }
          if (!current) return;
          time += frame.dt;
          current.update?.(frame.dt, time, p);
          const compare = Boolean(p.compare) && !!current.before;
          const wire = Boolean(p.wireframe);
          if (compare !== lastCompare || wire !== lastWire) layout(compare, wire);
        },
      });
      const afterGroup = new THREE.Group();
      const beforeGroup = new THREE.Group();
      stage.root.add(beforeGroup, afterGroup);

      const layout = (compare: boolean, wire: boolean) => {
        lastCompare = compare;
        lastWire = wire;
        beforeGroup.visible = compare;
        if (compare && current) {
          const box = new THREE.Box3().setFromObject(current.object);
          const w = Math.max(1, box.max.x - box.min.x);
          afterGroup.position.x = w * 0.6;
          beforeGroup.position.x = -w * 0.6;
        } else {
          afterGroup.position.x = 0;
          beforeGroup.position.x = 0;
        }
        setWireframe(stage.root, wire);
      };

      const rebuild = (p: ParamValues) => {
        current?.dispose?.();
        clearGroup(afterGroup);
        clearGroup(beforeGroup);
        current = null;
        time = 0;
        try {
          const seed = Number(p.seed ?? 1);
          const res = def.build(p, { rng: makeRng(seed), seed, quality: ctx.quality });
          afterGroup.add(res.object);
          if (res.helpers) afterGroup.add(res.helpers);
          if (res.before) beforeGroup.add(res.before);
          current = res;
          error = null;
        } catch (e) {
          // 生成に失敗してもビューア全体は止めず、理由を表示する
          error = e instanceof Error ? e.message : String(e);
          console.error(`[LAB] ${def.id} build failed`, e);
        }
        layout(Boolean(p.compare) && !!current?.before, Boolean(p.wireframe));
      };

      return {
        render: (target, p, frame) => stage.source.render(target, p, frame),
        resize: (w, h) => stage.source.resize(w, h),
        pointer: (x, y, down) => stage.rig.pointer(x, y, down),
        wheel: (d) => stage.rig.wheel(d),
        action(k, p) {
          if (k === 'resetView') {
            stage.rig.reset();
            return;
          }
          if (k === 'rebuild') {
            forceRebuild = true;
            return;
          }
          if (k === 'regenerate') return { seed: 1 + Math.floor(Math.random() * 9998) };
          return def.onAction?.(k, p);
        },
        status() {
          if (error) return `生成エラー: ${error}`;
          if (!current) return null;
          const { vertices, triangles } = countGeometry(current.object);
          const extra = typeof current.info === 'function' ? current.info() : current.info;
          const cmp = lastCompare ? `比較: 左=${def.compareLabels?.[0] ?? '処理前'} / 右=${def.compareLabels?.[1] ?? '処理後'} · ` : '';
          return `${cmp}頂点 ${vertices.toLocaleString()} · 三角形 ${triangles.toLocaleString()}${extra ? ' · ' + extra : ''}`;
        },
        exportObject: () => (def.exportable === undefined || def.exportable === true ? current?.object ?? null : null),
        exportUnavailableReason: () => (typeof def.exportable === 'string' ? def.exportable : null),
        dispose() {
          current?.dispose?.();
          stage.dispose();
        },
      };
    },
  };
}

export const defineGeometryDemo = (def: SceneLabDef) => defineSceneLab(def, 'geometry');
export const defineWorldDemo = (def: SceneLabDef) => defineSceneLab(def, 'world');

/** よく使う標準マテリアル */
export function std(color: THREE.ColorRepresentation, opts: Partial<THREE.MeshStandardMaterialParameters> = {}): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.1, ...opts });
}
