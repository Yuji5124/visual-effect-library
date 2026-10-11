import type * as THREE from 'three';

/**
 * three.js の標準マテリアルにワールド座標 vWPos と独自のGLSLを差し込む。
 *   early: フラグメントの冒頭（discard で領域を切り抜く等）
 *   late : 最終色が決まった直後（gl_FragColor を加工する等）
 * 同じ key のマテリアルはシェーダープログラムを共有する。
 */
export function injectWorldShader(
  material: THREE.Material,
  opts: { key: string; uniforms: Record<string, THREE.IUniform>; head?: string; early?: string; late?: string },
): void {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, opts.uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
#ifdef USE_INSTANCING
  vWPos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
#else
  vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWPos;\n${opts.head ?? ''}`)
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>\n${opts.early ?? ''}`)
      .replace('#include <dithering_fragment>', `${opts.late ?? ''}\n#include <dithering_fragment>`);
  };
  material.customProgramCacheKey = () => opts.key;
  material.needsUpdate = true;
}
