import * as THREE from 'three';
import { COPY_FRAGMENT, FullscreenQuad, createTarget, makeShader } from './fullscreen';

/**
 * defineShaderPost / defineShaderSource の extra に渡す「前フレームの自分の出力」。
 * シェーダーからは uniform sampler2D tPrev として読める（初回は黒）。
 * 半精度で保持するので、長時間の減衰でも色が段々に潰れにくい。
 */
export function feedbackExtra() {
  return (ctx: { renderer: THREE.WebGLRenderer; width: number; height: number }) => {
    const prev = createTarget(ctx.width, ctx.height, { float: true });
    const quad = new FullscreenQuad();
    const copy = makeShader(COPY_FRAGMENT, { tDiffuse: { value: null } });
    const clear = () => {
      const r = ctx.renderer;
      r.setRenderTarget(prev);
      r.setClearColor(0x000000, 1);
      r.clear();
    };
    clear();
    return {
      uniforms: { tPrev: { value: prev.texture as THREE.Texture } },
      afterRender(_input: THREE.Texture | null, output: THREE.WebGLRenderTarget) {
        copy.uniforms.tDiffuse.value = output.texture;
        quad.render(ctx.renderer, copy, prev);
      },
      resize(w: number, h: number) {
        prev.setSize(w, h);
        clear();
      },
      dispose() {
        prev.dispose();
        copy.dispose();
        quad.dispose();
      },
    };
  };
}

/** 複数の extra を1つにまとめる（履歴＋フィードバックなど） */
export function combineExtras<C>(...makers: ((ctx: C) => ExtraLike)[]) {
  return (ctx: C): ExtraLike => {
    const parts = makers.map((m) => m(ctx));
    return {
      uniforms: Object.assign({}, ...parts.map((p) => p.uniforms)),
      beforeRender: (i) => parts.forEach((p) => p.beforeRender?.(i)),
      afterRender: (i, o) => parts.forEach((p) => p.afterRender?.(i, o)),
      resize: (w, h) => parts.forEach((p) => p.resize?.(w, h)),
      pointer: (x, y, d) => parts.forEach((p) => p.pointer?.(x, y, d)),
      dispose: () => parts.forEach((p) => p.dispose()),
    };
  };
}

export interface ExtraLike {
  uniforms: Record<string, THREE.IUniform>;
  beforeRender?(input: THREE.Texture | null): void;
  afterRender?(input: THREE.Texture | null, output: THREE.WebGLRenderTarget): void;
  resize?(w: number, h: number): void;
  pointer?(x: number, y: number, down: boolean): void;
  dispose(): void;
}
