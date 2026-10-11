import { describe, expect, it } from 'vitest';
import snapshot from './fixtures/extensions-protection.json';
import { EXTENSION_CATALOG } from '../src/data/catalog';
import { REGISTRY } from '../src/effects/registry';
import registrySource from '../src/effects/registry.ts?raw';

const sources = import.meta.glob<string>(['../src/data/*.ts', '../src/effects/post/e2*.ts', '../src/effects/source/e2*.ts'], { query: '?raw', import: 'default', eager: true });

describe('追加16種類の保護', () => {
  it('カタログ・カテゴリ・順序・登録状態を保持する', async () => {
    expect(EXTENSION_CATALOG.map(e => e.id)).toEqual(snapshot.ids);
    for (const [path, hash] of Object.entries(snapshot.files)) {
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(sources['../' + path]));
      const actual = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
      expect(actual, path).toBe(hash);
    }
    const lines = registrySource.split('\n').filter(l => /id: '2\d\d'/.test(l));
    expect(lines).toEqual(snapshot.registry);
    expect(REGISTRY.filter(e => Number(e.id) > 200)).toHaveLength(16);
  });
});
