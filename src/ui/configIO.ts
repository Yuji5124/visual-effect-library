import type { ParamDef, ParamValues } from '../engine/types';
import { getRegistryEntry } from '../effects/registry';
import type { StackConfig } from './storage';

/** 外部から読み込んだJSONを検証し、安全な StackConfig に変換する（不正なら例外） */
export function parseStackConfig(input: unknown): StackConfig {
  if (!input || typeof input !== 'object') throw new Error('JSONの形式が正しくありません');
  const o = input as Record<string, unknown>;
  if (o.format !== 'vfx200-stack') throw new Error('VFX200の設定ファイルではありません（format が一致しません）');
  if (o.version !== 1) throw new Error(`未対応のバージョンです: ${String(o.version)}`);
  const src = o.source as Record<string, unknown> | undefined;
  if (!src || typeof src.id !== 'string') throw new Error('source.id がありません');
  if (src.id !== 'demo') {
    const reg = getRegistryEntry(src.id);
    if (!reg) throw new Error(`ソース演出 ${src.id} は未実装です`);
    if (reg.kind !== 'source') throw new Error(`${src.id} はソース演出ではありません`);
  }
  const postsRaw = Array.isArray(o.posts) ? o.posts : [];
  if (postsRaw.length > 16) throw new Error('ポスト演出は16個までです');
  const posts = postsRaw.map((p, i) => {
    const r = p as Record<string, unknown>;
    if (typeof r.id !== 'string') throw new Error(`posts[${i}].id がありません`);
    const reg = getRegistryEntry(r.id);
    if (!reg) throw new Error(`演出 ${r.id} は未実装です`);
    if (reg.kind !== 'post') throw new Error(`${r.id} はポスト演出ではありません`);
    return { id: r.id, enabled: r.enabled !== false, params: plainParams(r.params) };
  });
  return {
    format: 'vfx200-stack',
    version: 1,
    source: { id: src.id, params: plainParams(src.params) },
    posts,
  };
}

function plainParams(v: unknown): ParamValues {
  const out: ParamValues = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
    if (typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean') out[k] = val;
  }
  return out;
}

/** パラメータ定義に照らして値を補正（未知のキーは捨て、範囲外はクランプ） */
export function sanitizeParams(defs: ParamDef[], params: ParamValues): ParamValues {
  const out: ParamValues = {};
  for (const d of defs) {
    const v = params[d.key];
    switch (d.type) {
      case 'number':
        out[d.key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(d.max, Math.max(d.min, v)) : d.default;
        break;
      case 'bool':
        out[d.key] = typeof v === 'boolean' ? v : d.default;
        break;
      case 'color':
        out[d.key] = typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d.default;
        break;
      case 'select':
        out[d.key] = typeof v === 'string' && d.options.some((o) => o.value === v) ? v : d.default;
        break;
    }
  }
  return out;
}
