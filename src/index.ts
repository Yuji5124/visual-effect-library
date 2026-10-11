/**
 * 他の Three.js プロジェクト（MUTOPIA / GIANT CLIMB 等）へ移植する時の公開API。
 * src/engine と src/effects をフォルダごとコピーし、ここから import して使う。
 */
export { EffectPipeline } from './engine/pipeline';
export type { Stage, PipelineOptions } from './engine/pipeline';
export { SceneSource, disposeObject } from './engine/sceneSource';
export { defineShaderPost, defineShaderSource } from './engine/shaderEffect';
export { PingPong } from './engine/gpgpu';
export type * from './engine/types';
export { loadEffect, REGISTRY } from './effects/registry';
export { HistoryAtlas, historyExtra, GLSL_HISTORY } from './engine/history';
export { feedbackExtra, combineExtras } from './engine/feedback';
export { FluidSim } from './engine/fluid';
export { audioHub, AudioLink } from './engine/audio';
export { audioExtra, AUDIO_PARAMS, GLSL_AUDIO } from './engine/audioExtra';
export { planarShadowMatrix } from './engine/planarShadow';
export { injectWorldShader } from './engine/materialInject';
