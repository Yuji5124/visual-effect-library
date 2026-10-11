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
