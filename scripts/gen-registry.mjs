// src/effects/post・source のファイルから src/effects/registry.ts の REGISTRY 一覧を再生成する。
// 使い方: npm run registry
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const CATS = ['グリッチ・データ破壊', '時間・残像', 'ピクセル・レトロ', '色彩・光', '空間歪曲', '粒子・流体', 'カメラ・レンズ', '幾何学・生成アート', 'アナログ・物質感', '世界変容・実験表現', '錯視・知覚操作', 'AI・機械視覚', '物理・破壊', '生命・群衆・成長', '文字・情報視覚化', '音響反応・同期', '空間投影・AR', 'トランジション・変身', '映画的・特殊撮影', 'シュール・異常世界'];
const root = join(import.meta.dirname, '..', 'src', 'effects');
const entries = [];
for (const kind of ['post', 'source']) {
  for (const f of readdirSync(join(root, kind)).sort()) {
    const m = /^e(\d{3})-.*\.ts$/.exec(f);
    if (!m) continue;
    const src = readFileSync(join(root, kind, f), 'utf8');
    const status = src.includes("status: 'experimental'") ? 'experimental' : 'implemented';
    entries.push({ id: m[1], kind, status, file: `${kind}/${f.slice(0, -3)}` });
  }
}
entries.sort((a, b) => a.id.localeCompare(b.id));
const ids = new Set();
const lines = [];
let cat = -1;
for (const e of entries) {
  if (ids.has(e.id)) throw new Error(`ID が重複しています: ${e.id}`);
  ids.add(e.id);
  const c = Math.floor((Number(e.id) - 1) / 10);
  if (c !== cat) {
    cat = c;
    lines.push(`  // ${c + 1}. ${CATS[c]}`);
  }
  lines.push(`  { id: '${e.id}', kind: '${e.kind}', status: '${e.status}', file: '${e.file}' },`);
}
const path = join(root, 'registry.ts');
const s = readFileSync(path, 'utf8');
const head = 'export const REGISTRY: readonly RegistryEntry[] = [';
const a = s.indexOf(head) + head.length;
const b = s.indexOf('];', a);
writeFileSync(path, s.slice(0, a) + '\n' + lines.join('\n') + '\n' + s.slice(b));
console.log(`${entries.length} 件を登録（実験中 ${entries.filter((e) => e.status === 'experimental').length} 件）`);
