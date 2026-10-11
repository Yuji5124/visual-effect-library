import { describe, expect, it } from 'vitest';
import { REGISTRY, availability, loadEffect } from '../src/effects/registry';
import { CATALOG, getEntry } from '../src/data/catalog';

const PLANNED = CATALOG.find((e) => availability(e.id) === 'planned')!.id;

describe('実装レジストリ', () => {
  it('20件以上が実装済み・IDはカタログに存在し重複なし', () => {
    expect(REGISTRY.filter((r) => r.status === 'implemented').length).toBeGreaterThanOrEqual(20);
    expect(new Set(REGISTRY.map((r) => r.id)).size).toBe(REGISTRY.length);
    for (const r of REGISTRY) expect(getEntry(r.id)).toBeTruthy();
  });

  it('未登録の演出は「未実装」扱い', () => {
    expect(availability(PLANNED)).toBe('planned');
    expect(availability('003')).toBe('implemented');
  });

  it.each(REGISTRY.map((r) => [r.id, r]))('%s: モジュール定義が登録内容と一致', async (_id, r) => {
    const mod = await loadEffect(r.id);
    expect(mod.id).toBe(r.id);
    expect(mod.kind).toBe(r.kind);
    expect(mod.status).toBe(r.status);
    const keys = mod.params.map((p) => p.key);
    expect(new Set(keys).size).toBe(keys.length);
    for (const p of mod.params) {
      if (p.type === 'number') {
        expect(p.default).toBeGreaterThanOrEqual(p.min);
        expect(p.default).toBeLessThanOrEqual(p.max);
      }
      if (p.type === 'select') expect(p.options.some((o) => o.value === p.default)).toBe(true);
      if (p.type === 'color') expect(p.default).toMatch(/^#[0-9a-f]{6}$/i);
    }
    if (mod.shader) expect(mod.shader.fragment).toContain('void main');
  });

  it('未実装IDの読み込みは失敗として閉じ込められる', async () => {
    await expect(loadEffect(PLANNED)).rejects.toThrow('未実装');
  });
});
