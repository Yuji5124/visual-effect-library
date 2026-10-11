import type { EffectModule, ParamValues } from '../engine/types';
import { paramToUniformValue, uniformName } from '../engine/shaderEffect';
import { getRegistryEntry } from '../effects/registry';
import { getLibraryEntry } from '../data/library';
import type { StackConfig } from './storage';

export interface CodeSection {
  title: string;
  description: string;
  language: string;
  code: string;
}

function varName(id: string, mod: EffectModule | undefined): string {
  const file = getRegistryEntry(id)?.file ?? `fx${id}`;
  const base = file.split('/').pop()!.replace(/^e\d+-/, '');
  const camel = base.replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
  return mod ? camel : `fx${id}`;
}

function literal(v: unknown): string {
  return typeof v === 'string' ? `'${v}'` : String(v);
}

function paramsLiteral(params: ParamValues, indent = ''): string {
  const entries = Object.entries(params);
  if (!entries.length) return '{}';
  return `{ ${entries.map(([k, v]) => `${k}: ${literal(v)}`).join(', ')} }`.replace(/^/, indent);
}

function uniformLiteral(v: unknown): string {
  if (v && typeof v === 'object' && 'x' in v && 'z' in v) {
    const o = v as { x: number; y: number; z: number };
    return `new THREE.Vector3(${o.x.toFixed(3)}, ${o.y.toFixed(3)}, ${o.z.toFixed(3)})`;
  }
  return String(v);
}

/** パイプラインAPIでそのまま再現するコード（どの演出でも使える） */
function pipelineSnippet(config: StackConfig, modules: Map<string, EffectModule>): string {
  const lines: string[] = [];
  const imports: string[] = [
    "import * as THREE from 'three';",
    "import { EffectPipeline, SceneSource } from './vfx'; // src/index.ts",
  ];
  const useGameScene = config.source.id === 'demo';
  if (!useGameScene) {
    const file = getRegistryEntry(config.source.id)?.file;
    imports.push(`import ${varName(config.source.id, modules.get(config.source.id))} from './vfx/effects/${file}';`);
  }
  for (const p of config.posts) {
    const file = getRegistryEntry(p.id)?.file;
    imports.push(`import ${varName(p.id, modules.get(p.id))} from './vfx/effects/${file}';`);
  }
  lines.push(...imports, '');
  lines.push(
    '// renderer / scene / camera はゲーム側の既存のものを使う',
    'const dpr = Math.min(window.devicePixelRatio, 2);',
    'const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);',
    "const fx = new EffectPipeline(renderer, { width: w, height: h, quality: 'high' });",
  );
  if (useGameScene) {
    lines.push(
      '',
      '// ゲームのシーンを入力にする（HDR描画 → トーンマップ → sRGB）',
      'const gameSource = new SceneSource(renderer, scene, camera, w, h);',
      'fx.useSourceInstance(gameSource);',
    );
  } else {
    lines.push(
      '',
      `// 生成系の演出を入力にする（${getLibraryEntry(config.source.id)?.nameJa ?? config.source.id}）`,
      `fx.setSource(${varName(config.source.id, modules.get(config.source.id))}, ${paramsLiteral(config.source.params)});`,
    );
  }
  if (config.posts.length) {
    lines.push('', '// ポストエフェクトを順に重ねる');
    for (const p of config.posts) {
      const v = varName(p.id, modules.get(p.id));
      lines.push(`const ${v}Stage = fx.addPost(${v}, ${paramsLiteral(p.params)});`);
      if (!p.enabled) lines.push(`${v}Stage.enabled = false;`);
    }
  }
  lines.push(
    '',
    '// ゲームループ（renderer.render(scene, camera) の代わりに呼ぶ）',
    'const clock = new THREE.Clock();',
    'let frame = 0;',
    'renderer.setAnimationLoop(() => {',
    '  const dt = Math.min(clock.getDelta(), 0.1);',
    '  fx.render({ time: clock.elapsedTime, dt, frame: frame++ }, true);',
    '});',
    '',
    '// パラメータは実行中に直接書き換えられる（例: ダメージ時に強くする）',
    config.posts.length
      ? `// ${varName(config.posts[0].id, modules.get(config.posts[0].id))}Stage.params.${Object.keys(config.posts[0].params)[0] ?? 'amount'} = ...;`
      : '// fx.source!.params.xxx = ...;',
    '',
    "addEventListener('resize', () => {",
    '  const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);',
    '  renderer.setSize(innerWidth, innerHeight);',
    '  fx.resize(w, h);',
    useGameScene ? '  gameSource.resize(w, h);' : '',
    '});',
    '',
    '// シーン切替やゲーム終了時は必ず解放する',
    '// fx.dispose();',
  );
  return lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n');
}

const VERTEX = `varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

/** 単体シェーダーとして切り出せない（補助バッファが必要な）演出か */
function needsHelperBuffers(mod: EffectModule): string | null {
  const f = mod.shader?.fragment ?? '';
  if (f.includes('tHistory')) return '過去フレームの履歴バッファ（engine/history.ts）';
  if (f.includes('tPrev')) return '前フレームの出力バッファ（engine/feedback.ts）';
  if (f.includes('tAudio')) return '音声解析テクスチャ（engine/audio.ts）';
  return null;
}

function extraUniformLines(mod: EffectModule): string[] {
  const f = mod.shader?.fragment ?? '';
  const out: string[] = [];
  if (f.includes('tGlyphs')) out.push('    tGlyphs: { value: glyphTexture }, // 文字アトラス（元ファイルの生成関数を参照）');
  if (f.includes('uCenter')) out.push('    uCenter: { value: new THREE.Vector2(0.5, 0.5) }, // 効果の中心（0〜1）');
  return out;
}

/** EffectComposer の ShaderPass にそのまま渡せる定義（1パスのGLSLポスト演出のみ） */
function shaderPassSnippet(mod: EffectModule, params: ParamValues): string | null {
  if (mod.kind !== 'post' || !mod.shader || needsHelperBuffers(mod)) return null;
  const name = `${varName(mod.id, mod).replace(/^./, (c) => c.toUpperCase())}Shader`;
  const uniforms = [
    '    tDiffuse: { value: null },',
    '    uTime: { value: 0 },',
    '    uQuality: { value: 1 },',
    '    uResolution: { value: new THREE.Vector2(innerWidth * devicePixelRatio, innerHeight * devicePixelRatio) },',
    ...mod.params.map(
      (p) => `    ${uniformName(p.key)}: { value: ${uniformLiteral(paramToUniformValue(p, params[p.key]))} }, // ${p.label}`,
    ),
  ];
  uniforms.push(...extraUniformLines(mod));
  return [
    "import * as THREE from 'three';",
    "import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';",
    "import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';",
    "import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';",
    "import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';",
    '',
    `export const ${name} = {`,
    '  uniforms: {',
    ...uniforms,
    '  },',
    `  vertexShader: /* glsl */ \`\n${VERTEX}\`,`,
    `  fragmentShader: /* glsl */ \`\n${mod.shader.fragment}\`,`,
    '};',
    '',
    'const composer = new EffectComposer(renderer);',
    'composer.addPass(new RenderPass(scene, camera));',
    'composer.addPass(new OutputPass()); // 本ライブラリの演出は表示空間（sRGB）の値を前提にしている',
    `const pass = new ShaderPass(${name});`,
    'composer.addPass(pass);',
    '',
    '// ループ内',
    'pass.uniforms.uTime.value = clock.getElapsedTime();',
    'composer.render();',
  ].join('\n');
}

/** フルスクリーン生成シェーダーを ShaderMaterial として任意のメッシュに貼るコード */
function shaderMaterialSnippet(mod: EffectModule, params: ParamValues): string | null {
  if (mod.kind !== 'source' || !mod.shader || needsHelperBuffers(mod)) return null;
  const uniforms = [
    '    uTime: { value: 0 },',
    '    uQuality: { value: 1 },',
    '    uResolution: { value: new THREE.Vector2(1024, 1024) }, // 貼り付ける面の想定解像度',
    ...mod.params.map(
      (p) => `    ${uniformName(p.key)}: { value: ${uniformLiteral(paramToUniformValue(p, params[p.key]))} }, // ${p.label}`,
    ),
  ];
  uniforms.push(...extraUniformLines(mod));
  return [
    "import * as THREE from 'three';",
    '',
    'const material = new THREE.ShaderMaterial({',
    '  uniforms: {',
    ...uniforms,
    '  },',
    `  vertexShader: /* glsl */ \`\n${VERTEX}\`,`,
    `  fragmentShader: /* glsl */ \`\n${mod.shader.fragment}\`,`,
    '});',
    '',
    '// 例: ゲーム内のモニター・ポータル・空の板に貼る',
    'const screen = new THREE.Mesh(new THREE.PlaneGeometry(4, 2.25), material);',
    'scene.add(screen);',
    '',
    '// ループ内',
    'material.uniforms.uTime.value = clock.getElapsedTime();',
  ].join('\n');
}

export function buildCodeSections(config: StackConfig, modules: Map<string, EffectModule>): CodeSection[] {
  const sections: CodeSection[] = [
    {
      title: 'パイプラインAPI（推奨）',
      description:
        'src/engine と src/effects、src/index.ts を「vfx」フォルダとしてゲームにコピーすると、この設定をそのまま再現できます。演出ごとの解放処理・失敗時の切り離しも含まれます。',
      language: 'ts',
      code: pipelineSnippet(config, modules),
    },
  ];
  const focus = [config.source.id, ...config.posts.map((p) => p.id)];
  for (const id of focus) {
    const mod = modules.get(id);
    if (!mod) continue;
    const params = id === config.source.id ? config.source.params : config.posts.find((p) => p.id === id)!.params;
    const pass = shaderPassSnippet(mod, params);
    const name = getLibraryEntry(id)?.nameJa ?? id;
    if (pass) {
      sections.push({
        title: `${id} ${name} — EffectComposer / ShaderPass`,
        description: '既に three/examples の EffectComposer を使っているプロジェクト向け。依存ファイルなしの単体シェーダーです。',
        language: 'ts',
        code: pass,
      });
    }
    const helper = needsHelperBuffers(mod);
    if (helper) {
      sections.push({
        title: `${id} ${name} — 単体シェーダーについて`,
        description: `この演出は${helper}を使うため、単体のシェーダーだけでは動きません。上の「パイプラインAPI」の方法で移植してください（必要な補助バッファも一緒に生成・解放されます）。`,
        language: 'text',
        code: `必要なファイル: src/engine/（${helper.replace(/.*（|）/g, '')} を含む）と src/effects/${getRegistryEntry(id)?.file ?? ''}.ts`,
      });
    }
    const matSnippet = shaderMaterialSnippet(mod, params);
    if (matSnippet) {
      sections.push({
        title: `${id} ${name} — ShaderMaterial`,
        description: '生成シェーダーを任意のメッシュの表面に貼る単体コードです。',
        language: 'ts',
        code: matSnippet,
      });
    }
  }
  sections.push({
    title: '設定JSON',
    description: 'このJSONを「JSON読込」で読み込むと同じ状態を再現できます。ゲーム側でも params の値をそのまま使えます。',
    language: 'json',
    code: JSON.stringify(config, null, 2),
  });
  return sections;
}
