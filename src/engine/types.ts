import type * as THREE from 'three';

export type Quality = 'high' | 'low';

export type ParamDef =
  | { key: string; label: string; type: 'number'; min: number; max: number; step?: number; default: number }
  | { key: string; label: string; type: 'color'; default: string }
  | { key: string; label: string; type: 'bool'; default: boolean }
  | { key: string; label: string; type: 'select'; options: { value: string; label: string }[]; default: string };

export type ParamValue = number | string | boolean;
export type ParamValues = Record<string, ParamValue>;

export interface FrameInfo {
  /** 経過秒 */
  time: number;
  /** 前フレームからの秒（上限付き） */
  dt: number;
  frame: number;
}

export interface EffectContext {
  renderer: THREE.WebGLRenderer;
  /** 描画解像度（実ピクセル） */
  width: number;
  height: number;
  quality: Quality;
}

/**
 * 映像を生成する演出（3Dシーン、生成シェーダー、シミュレーション等）。
 * 出力は表示空間（sRGBエンコード済み）の値で target に書き込む。
 */
export interface SourceInstance {
  render(target: THREE.WebGLRenderTarget, params: ParamValues, frame: FrameInfo): void;
  resize?(width: number, height: number): void;
  /** 入力イベント（ポインタ座標 0..1, 左下原点）。任意 */
  pointer?(x: number, y: number, down: boolean): void;
  /** 利用者への案内（例: 「タップで音声開始」）。null なら非表示 */
  status?(): string | null;
  /** ホイール／ピンチによるズーム（正で遠ざかる）。任意 */
  wheel?(delta: number): void;
  /**
   * 操作ボタン（モジュールの actions）が押された。
   * パラメーターを書き換えたい場合は差分を返す（例: ランダムなシード）。
   */
  action?(key: string, params: ParamValues): Partial<ParamValues> | void;
  /** GLB/GLTF書き出しの対象。書き出せない演出は exportUnavailableReason を返す */
  exportObject?(): import('three').Object3D | null;
  exportUnavailableReason?(): string | null;
  dispose(): void;
}

/** ビューアに表示する操作ボタン（再生成・リセットなど） */
export interface ActionDef {
  key: string;
  label: string;
  title?: string;
}

/**
 * 入力映像を加工する演出（ポストプロセス）。
 * input/出力ともに表示空間（sRGBエンコード済み）の値。
 */
export interface PostInstance {
  render(input: THREE.Texture, target: THREE.WebGLRenderTarget, params: ParamValues, frame: FrameInfo): void;
  resize?(width: number, height: number): void;
  pointer?(x: number, y: number, down: boolean): void;
  status?(): string | null;
  dispose(): void;
}

export type EffectStatus = 'implemented' | 'experimental';

interface EffectModuleBase {
  /** カタログID（"003" 等） */
  id: string;
  status: EffectStatus;
  params: ParamDef[];
  /** 実装メモ（技術解説として表示） */
  notes?: string;
  /** Three.js EffectComposer / ShaderMaterial に直接移植できるシェーダー情報 */
  shader?: { fragment: string; extraUniforms?: string[] };
  /** ビューアに出す操作ボタン（GEOMETRY / MOTION / WORLD の実験場で使用） */
  actions?: ActionDef[];
  /** 3D操作（ドラッグ回転・ズーム）に対応するか。ビューアの案内表示に使う */
  interaction?: 'orbit' | 'pan-zoom' | 'pointer';
}

export interface SourceEffect extends EffectModuleBase {
  kind: 'source';
  create(ctx: EffectContext): SourceInstance;
}

export interface PostEffect extends EffectModuleBase {
  kind: 'post';
  create(ctx: EffectContext): PostInstance;
}

export type EffectModule = SourceEffect | PostEffect;

export function defaultParams(defs: ParamDef[]): ParamValues {
  const out: ParamValues = {};
  for (const d of defs) out[d.key] = d.default;
  return out;
}
