// src/effects/post・source のファイルから src/effects/registry.ts の REGISTRY 一覧を再生成する。
// 使い方: npm run registry
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';

// 内容が変わらない時は書き込まない（開発サーバーの不要な再読み込みを避ける）
function writeIfChanged(file, text) {
  if (readFileSync(file, 'utf8') !== text) writeFileSync(file, text);
}
import { join } from 'node:path';

const CATS = ['グリッチ・データ破壊', '時間・残像', 'ピクセル・レトロ', '色彩・光', '空間歪曲', '粒子・流体', 'カメラ・レンズ', '幾何学・生成アート', 'アナログ・物質感', '世界変容・実験表現', '錯視・知覚操作', 'AI・機械視覚', '物理・破壊', '生命・群衆・成長', '文字・情報視覚化', '音響反応・同期', '空間投影・AR', 'トランジション・変身', '映画的・特殊撮影', 'シュール・異常世界', '拡張：レンダリング技法', '拡張：自然・空間・遷移'];
const root = join(import.meta.dirname, '..', 'src', 'effects');
// 拡張演出（201〜）のカテゴリは catalog.ts の EXT_ROWS「[番号, カテゴリ, ...」から読む
const catalogSrc = readFileSync(join(import.meta.dirname, '..', 'src', 'data', 'catalog.ts'), 'utf8');
const extCategory = new Map([...catalogSrc.matchAll(/^\s*\[(2\d\d), (\d+), '/gm)].map((m) => [Number(m[1]), Number(m[2])]));
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
  const n = Number(e.id);
  const ext = extCategory.get(n);
  if (n > 200 && !ext) throw new Error(`拡張演出 ${e.id} が catalog.ts にありません`);
  const c = n <= 200 ? Math.floor((n - 1) / 10) : ext - 1;
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
writeIfChanged(path, s.slice(0, a) + '\n' + lines.join('\n') + '\n' + s.slice(b));
console.log(`${entries.length} 件を登録（実験中 ${entries.filter((e) => e.status === 'experimental').length} 件）`);

// ---- GEOMETRY / MOTION / WORLD GENERATION（src/lab）----
const labRoot = join(import.meta.dirname, '..', 'src', 'lab');
const PREFIX = { geometry: 'GEO', motion: 'MOT', world: 'WRD' };
const labEntries = [];
for (const dir of ['geometry', 'motion', 'world']) {
  for (const f of readdirSync(join(labRoot, dir)).sort()) {
    const m = /^(geo|mot|wrd)(\d{3})-.*\.ts$/.exec(f);
    if (!m) continue;
    if (m[1].toUpperCase() !== PREFIX[dir]) throw new Error(`${dir}/${f} の接頭辞が分野と一致しません`);
    const src = readFileSync(join(labRoot, dir, f), 'utf8');
    const status = src.includes("status: 'experimental'") ? 'experimental' : 'implemented';
    labEntries.push({ id: `${PREFIX[dir]}-${m[2]}`, status, file: `lab/${dir}/${f.slice(0, -3)}` });
  }
}
const labIds = new Set();
for (const e of labEntries) {
  if (labIds.has(e.id)) throw new Error(`ID が重複しています: ${e.id}`);
  labIds.add(e.id);
}
const labPath = join(labRoot, 'registry.ts');
const ls = readFileSync(labPath, 'utf8');
const lhead = 'export const LAB_REGISTRY: readonly LabRegistryEntry[] = [';
const la = ls.indexOf(lhead) + lhead.length;
const lb = ls.indexOf('];', la);
const labLines = labEntries.map((e) => `  { id: '${e.id}', kind: 'source', status: '${e.status}', file: '${e.file}' },`);
writeIfChanged(labPath, ls.slice(0, la) + '\n' + labLines.join('\n') + (labLines.length ? '\n' : '') + ls.slice(lb));
console.log(`GEOMETRY/MOTION/WORLD: ${labEntries.length} 件を登録（実験中 ${labEntries.filter((e) => e.status === 'experimental').length} 件）`);
