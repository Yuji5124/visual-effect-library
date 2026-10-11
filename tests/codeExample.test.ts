import { describe, expect, it } from 'vitest';
import { buildCodeSections } from '../src/ui/codeExample';
import { loadEffect } from '../src/effects/registry';
import type { EffectModule } from '../src/engine/types';
import type { StackConfig } from '../src/ui/storage';

async function sectionsFor(postId: string) {
  const mod = await loadEffect(postId);
  const modules = new Map<string, EffectModule>([[postId, mod]]);
  const config: StackConfig = {
    format: 'vfx200-stack',
    version: 1,
    source: { id: 'demo', params: {} },
    posts: [{ id: postId, enabled: true, params: { amount: 0.02 } }],
  };
  return buildCodeSections(config, modules);
}

describe('移植コード', () => {
  it('1パスのシェーダーは ShaderPass 用の単体コードを出す', async () => {
    const s = await sectionsFor('003');
    expect(s.map((x) => x.title).some((t) => t.includes('ShaderPass'))).toBe(true);
    const pass = s.find((x) => x.title.includes('ShaderPass'))!;
    expect(pass.code).toContain('uAmount: { value: 0.02 }');
    expect(pass.code).toContain('void main');
  });

  it('履歴バッファが必要な演出は単体シェーダーを出さず、パイプラインAPIを案内する', async () => {
    const s = await sectionsFor('018');
    expect(s.some((x) => x.title.includes('ShaderPass'))).toBe(false);
    expect(s.some((x) => x.description.includes('履歴バッファ'))).toBe(true);
    expect(s[0].code).toContain("from './vfx/effects/post/e018-slit-scan'");
  });

  it('最後に設定JSONを含む', async () => {
    const s = await sectionsFor('003');
    const json = JSON.parse(s[s.length - 1].code);
    expect(json.format).toBe('vfx200-stack');
  });
});
