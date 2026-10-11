import type { ParamDef } from '../../engine/types';

/** トランジション演出で共通のパラメータ（自動往復 / 手動進行度 / 周期） */
export const TRANSITION_PARAMS: ParamDef[] = [
  { key: 'auto', label: '自動で往復', type: 'bool', default: true },
  { key: 'cycle', label: '周期(秒)', type: 'number', min: 1, max: 10, step: 0.1, default: 3.5 },
  { key: 'progress', label: '進行度（手動時）', type: 'number', min: 0, max: 1, step: 0.001, default: 0.5 },
];

export const TRANSITION_NOTE = '切替先（B）は手続き生成の夕景ワールド。ゲームでは B に別シーンの描画結果テクスチャを渡せばよい。';
