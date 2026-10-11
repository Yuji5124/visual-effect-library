import * as THREE from 'three';
import { FullscreenQuad, makeShader } from './fullscreen';
import type {
  EffectContext,
  EffectStatus,
  FrameInfo,
  ParamDef,
  ParamValues,
  PostEffect,
  SourceEffect,
} from './types';

/** パラメータキー → GLSL uniform名（例: amount → uAmount） */
export function uniformName(key: string): string {
  return 'u' + key.charAt(0).toUpperCase() + key.slice(1);
}

/** "#rrggbb" を表示空間のRGB(0..1)として読む（色管理による線形変換をかけない） */
export function hexToVec3(hex: string, out = new THREE.Vector3()): THREE.Vector3 {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16) || 0;
  return out.set(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function glslType(def: ParamDef): string {
  return def.type === 'color' ? 'vec3' : 'float';
}

export function paramToUniformValue(def: ParamDef, value: unknown, prev?: unknown): unknown {
  switch (def.type) {
    case 'number':
      return typeof value === 'number' ? value : def.default;
    case 'bool':
      return value === true || (value === undefined && def.default) ? 1 : 0;
    case 'select': {
      const idx = def.options.findIndex((o) => o.value === value);
      return idx >= 0 ? idx : Math.max(0, def.options.findIndex((o) => o.value === def.default));
    }
    case 'color':
      return hexToVec3(typeof value === 'string' ? value : def.default, prev instanceof THREE.Vector3 ? prev : undefined);
  }
}

interface ExtraResources {
  uniforms: Record<string, THREE.IUniform>;
  update?(frame: FrameInfo, params: ParamValues): void;
  pointer?(x: number, y: number, down: boolean): void;
  status?(): string | null;
  /** 入力映像（ポスト演出のみ）を受け取って内部バッファを更新する（例: 履歴バッファ） */
  beforeRender?(input: THREE.Texture | null): void;
  afterRender?(input: THREE.Texture | null, output: THREE.WebGLRenderTarget): void;
  resize?(w: number, h: number): void;
  dispose(): void;
}

interface ShaderDefBase {
  id: string;
  status?: EffectStatus;
  params: ParamDef[];
  notes?: string;
  /** 本体のGLSL（uniform宣言は自動付与。vUv / uTime / uResolution / u<Param> が使える） */
  body: string;
  /** 追加uniform宣言（例: "uniform sampler2D tGlyphs;"） */
  extraDecl?: string;
  extra?(ctx: EffectContext): ExtraResources;
}

function buildFragment(isPost: boolean, params: ParamDef[], extraDecl: string | undefined, body: string): string {
  const lines = [
    isPost ? 'uniform sampler2D tDiffuse;' : '',
    'uniform vec2 uResolution;',
    'uniform float uTime;',
    'uniform float uQuality; // 1.0 = high, 0.0 = low（iPad等）',
    ...params.map((p) => `uniform ${glslType(p)} ${uniformName(p.key)};`),
    extraDecl ?? '',
    'varying vec2 vUv;',
  ].filter(Boolean);
  return lines.join('\n') + '\n' + body.trim() + '\n';
}

function makeInstanceParts(def: ShaderDefBase, fragment: string, ctx: EffectContext, isPost: boolean) {
  const uniforms: Record<string, THREE.IUniform> = {
    uResolution: { value: new THREE.Vector2(ctx.width, ctx.height) },
    uTime: { value: 0 },
    uQuality: { value: ctx.quality === 'high' ? 1 : 0 },
  };
  if (isPost) uniforms.tDiffuse = { value: null };
  for (const p of def.params) uniforms[uniformName(p.key)] = { value: paramToUniformValue(p, p.default) };
  const extra = def.extra?.(ctx);
  if (extra) Object.assign(uniforms, extra.uniforms);
  const material = makeShader(fragment, uniforms);
  const quad = new FullscreenQuad();
  const bind = (params: ParamValues, frame: FrameInfo) => {
    uniforms.uTime.value = frame.time;
    for (const p of def.params) {
      const u = uniforms[uniformName(p.key)];
      u.value = paramToUniformValue(p, params[p.key], u.value);
    }
    extra?.update?.(frame, params);
  };
  return {
    uniforms,
    material,
    quad,
    bind,
    extra,
    resize(w: number, h: number) {
      (uniforms.uResolution.value as THREE.Vector2).set(w, h);
      extra?.resize?.(w, h);
    },
    dispose() {
      material.dispose();
      quad.dispose();
      extra?.dispose();
    },
  };
}

/** 1パスのGLSLポストプロセス演出を定義する */
export function defineShaderPost(def: ShaderDefBase): PostEffect {
  const fragment = buildFragment(true, def.params, def.extraDecl, def.body);
  return {
    id: def.id,
    kind: 'post',
    status: def.status ?? 'implemented',
    params: def.params,
    notes: def.notes,
    shader: { fragment },
    create(ctx) {
      const parts = makeInstanceParts(def, fragment, ctx, true);
      return {
        render(input, target, params, frame) {
          parts.uniforms.tDiffuse.value = input;
          parts.bind(params, frame);
          parts.extra?.beforeRender?.(input);
          parts.quad.render(ctx.renderer, parts.material, target);
          parts.extra?.afterRender?.(input, target);
        },
        resize: parts.resize,
        pointer: parts.extra?.pointer,
        status: parts.extra?.status,
        dispose: parts.dispose,
      };
    },
  };
}

/** フルスクリーンGLSLで映像を生成する演出を定義する */
export function defineShaderSource(def: ShaderDefBase): SourceEffect {
  const fragment = buildFragment(false, def.params, def.extraDecl, def.body);
  return {
    id: def.id,
    kind: 'source',
    status: def.status ?? 'implemented',
    params: def.params,
    notes: def.notes,
    shader: { fragment },
    create(ctx) {
      const parts = makeInstanceParts(def, fragment, ctx, false);
      return {
        render(target, params, frame) {
          parts.bind(params, frame);
          parts.extra?.beforeRender?.(null);
          parts.quad.render(ctx.renderer, parts.material, target);
          parts.extra?.afterRender?.(null, target);
        },
        resize: parts.resize,
        pointer: parts.extra?.pointer,
        status: parts.extra?.status,
        dispose: parts.dispose,
      };
    },
  };
}
