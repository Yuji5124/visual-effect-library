import { describe, expect, it } from 'vitest';
import { parseStackConfig, sanitizeParams } from '../src/ui/configIO';
import type { ParamDef } from '../src/engine/types';

const valid = {
  format: 'vfx200-stack',
  version: 1,
  source: { id: 'demo', params: { speed: 2 } },
  posts: [{ id: '003', enabled: true, params: { amount: 0.02, evil: { x: 1 } } }],
};

describe('設定JSONの読み込み', () => {
  it('正しい設定を受け付け、不正な値型は捨てる', () => {
    const c = parseStackConfig(valid);
    expect(c.posts[0].params).toEqual({ amount: 0.02 });
    expect(c.source.params).toEqual({ speed: 2 });
  });

  it('format / version の不一致を拒否', () => {
    expect(() => parseStackConfig({ ...valid, format: 'x' })).toThrow();
    expect(() => parseStackConfig({ ...valid, version: 2 })).toThrow();
    expect(() => parseStackConfig(null)).toThrow();
  });

  it('未実装・種類違いの演出を拒否', () => {
    expect(() => parseStackConfig({ ...valid, posts: [{ id: '001', params: {} }] })).toThrow('未実装');
    expect(() => parseStackConfig({ ...valid, posts: [{ id: '073', params: {} }] })).toThrow('ポスト演出ではありません');
    expect(() => parseStackConfig({ ...valid, source: { id: '003', params: {} } })).toThrow('ソース演出ではありません');
  });

  it('パラメータを定義に合わせて補正', () => {
    const defs: ParamDef[] = [
      { key: 'n', label: '', type: 'number', min: 0, max: 1, default: 0.5 },
      { key: 'c', label: '', type: 'color', default: '#ffffff' },
      { key: 's', label: '', type: 'select', options: [{ value: 'a', label: '' }], default: 'a' },
      { key: 'b', label: '', type: 'bool', default: true },
    ];
    expect(sanitizeParams(defs, { n: 5, c: 'red', s: 'zzz', b: false, extra: 1 })).toEqual({
      n: 1,
      c: '#ffffff',
      s: 'a',
      b: false,
    });
  });
});
