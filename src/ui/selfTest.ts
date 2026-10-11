import * as THREE from 'three';
import { EffectPipeline } from '../engine/pipeline';
import { demoScene } from '../engine/demoScene';
import { REGISTRY, loadEffect } from '../effects/registry';
import { getEntry } from '../data/catalog';
import { h } from './dom';

export interface SelfTestResult {
  id: string;
  ok: boolean;
  ms: number;
  message?: string;
  /** 破棄後に残ったGPUリソース数（0以外はリーク） */
  leaked: number;
}

/**
 * 実装済みの全演出を順番に生成・数フレーム描画・破棄して、
 * シェーダーエラーや例外が出ないかを確認するページ（#/selftest）。
 * 開発PCだけでなく iPad 実機でもそのまま実行できる。
 */
export async function runSelfTest(container: HTMLElement): Promise<SelfTestResult[]> {
  const table = h('tbody');
  const summary = h('p', { class: 'selftest-summary', text: '実行中…' });
  container.append(
    h('h2', { text: 'セルフテスト' }),
    h('p', { class: 'muted', text: '実装済みの全演出を生成→8フレーム描画→破棄し、エラーを検出します。' }),
    summary,
    h('table', { class: 'selftest' }, h('thead', {}, h('tr', {}, h('th', { text: 'ID' }), h('th', { text: '名前' }), h('th', { text: '結果' }), h('th', { text: '時間' }))), table),
  );
  const canvas = h('canvas', { width: 256, height: 144 });
  container.append(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(1);
  renderer.setSize(256, 144, false);
  const results: SelfTestResult[] = [];
  // Three.js 内部で1度だけ確保される共有リソースをリーク判定から除外するための予熱
  {
    const warm = new EffectPipeline(renderer, { width: 256, height: 144, quality: 'low' });
    warm.setSource(demoScene);
    warm.render({ time: 0, dt: 1 / 30, frame: 0 }, true);
    warm.dispose();
  }
  for (const reg of REGISTRY) {
    const t0 = performance.now();
    const before = renderer.info.memory.textures + renderer.info.memory.geometries;
    let error: string | undefined;
    try {
      const mod = await loadEffect(reg.id);
      const p = new EffectPipeline(renderer, {
        width: 256,
        height: 144,
        quality: 'low',
        onError: (_s, msg) => (error ??= msg),
      });
      if (mod.kind === 'source') p.setSource(mod);
      else {
        p.setSource(demoScene);
        p.addPost(mod);
      }
      for (let f = 0; f < 8 && !error; f++) p.render({ time: f / 30, dt: 1 / 30, frame: f }, true);
      const gl = renderer.getContext();
      const glErr = gl.getError();
      if (!error && glErr !== gl.NO_ERROR && glErr !== gl.CONTEXT_LOST_WEBGL) error = `WebGL error 0x${glErr.toString(16)}`;
      p.dispose();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const ms = performance.now() - t0;
    const leaked = renderer.info.memory.textures + renderer.info.memory.geometries - before;
    const r: SelfTestResult = { id: reg.id, ok: !error, ms, message: error, leaked };
    results.push(r);
    table.append(
      h(
        'tr',
        { class: r.ok ? 'ok' : 'ng' },
        h('td', { text: reg.id }),
        h('td', { text: getEntry(reg.id)?.name ?? '' }),
        h('td', { text: (r.ok ? 'OK' : `NG: ${error!.slice(0, 200)}`) + (leaked > 0 ? ` / リソース残存 ${leaked}` : '') }),
        h('td', { text: `${ms.toFixed(0)} ms` }),
      ),
    );
  }
  const info = renderer.info.memory;
  renderer.dispose();
  renderer.forceContextLoss();
  const ng = results.filter((r) => !r.ok).length;
  summary.textContent = `${results.length}件中 ${results.length - ng}件OK / ${ng}件NG（破棄後の残存: geometries ${info.geometries}, textures ${info.textures}）`;
  (window as unknown as { __selftest: unknown }).__selftest = { results, memory: { ...info } };
  return results;
}
