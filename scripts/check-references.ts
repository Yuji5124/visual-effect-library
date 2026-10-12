/**
 * GEOMETRY / MOTION / WORLD の参考資料URLが到達可能かを確認し、docs/reference-check.json に記録する。
 *   npx vite-node scripts/check-references.ts
 * 到達確認（HTTPステータス）だけを行う。内容を読んだことの証明ではない。
 * DOI は doi.org の解決（302 リダイレクト）を確認する。出版社側はボット対策で 403 を返すことがあるため追わない。
 */
import { writeFileSync } from 'node:fs';
import { LIBRARY } from '../src/data/library';

interface Row { url: string; ids: string[]; status: number | string; ok: boolean }

async function probe(url: string): Promise<number | string> {
  const isDoi = url.startsWith('https://doi.org/');
  for (const method of ['HEAD', 'GET']) {
    try {
      const res = await fetch(url, { method, redirect: isDoi ? 'manual' : 'follow', signal: AbortSignal.timeout(20000), headers: { 'user-agent': 'visual-effect-library reference check' } });
      if (method === 'HEAD' && (res.status === 405 || res.status === 403 || res.status === 404)) continue;
      return res.status;
    } catch (e) {
      if (method === 'GET') return e instanceof Error ? e.message : String(e);
    }
  }
  return 'unknown';
}

const byUrl = new Map<string, string[]>();
for (const e of LIBRARY.filter((x) => x.mainCategory !== 'visual')) {
  for (const r of e.referenceUrls) byUrl.set(r.url, [...(byUrl.get(r.url) ?? []), e.id]);
}
const urls = [...byUrl.keys()];
const rows: Row[] = [];
const queue = [...urls];
await Promise.all(
  Array.from({ length: 6 }, async () => {
    for (let u = queue.shift(); u; u = queue.shift()) {
      const status = await probe(u);
      const ok = typeof status === 'number' && status >= 200 && status < 400;
      rows.push({ url: u, ids: byUrl.get(u)!, status, ok });
    }
  }),
);
rows.sort((a, b) => a.url.localeCompare(b.url));
const okCount = rows.filter((r) => r.ok).length;
writeFileSync('docs/reference-check.json', JSON.stringify({ checkedAt: new Date().toISOString(), total: rows.length, reachable: okCount, rows }, null, 2) + '\n');
console.log(`${okCount}/${rows.length} reachable`);
for (const r of rows.filter((x) => !x.ok)) console.log('NG', r.status, r.url, r.ids.join(','));
