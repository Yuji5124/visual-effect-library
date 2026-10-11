/**
 * 一覧（4分野タブ・サブカテゴリ・検索・状況フィルタ）とビューア（解説・関連リンク・再生/停止・
 * 閉じて再度開く）のブラウザ検査。
 *   node scripts/library-ui-qa.mjs
 * 環境変数: QA_BASE_URL（既定 http://127.0.0.1:5173）, QA_OUTPUT_DIR, PLAYWRIGHT_MODULE_PATH, CHROMIUM_PATH
 */
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173';
const out = resolve(process.env.QA_OUTPUT_DIR ?? '/tmp/visual-effect-library-ui-qa');
await mkdir(out, { recursive: true });
const launch = { args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text().slice(0, 300)));
const checks = [];
const check = (name, ok, detail = '') => {
  checks.push({ name, ok });
  console.log(`${ok ? 'OK' : 'NG'} ${name}${detail ? ' — ' + detail : ''}`);
};
const cards = () => page.locator('.card').count();

await page.goto(base);
await page.waitForSelector('.card');
check('ALL で 366 件', (await cards()) === 366, String(await cards()));
const header = await page.locator('.stats').textContent();
check('ヘッダーに分野別件数', /GEOMETRY 50/.test(header) && /MOTION 50/.test(header) && /WORLD GENERATION 50/.test(header), header);

for (const [main, n] of [['visual', 216], ['geometry', 50], ['motion', 50], ['world', 50]]) {
  await page.click(`.main-tab[data-main="${main}"]`);
  const c = await cards();
  check(`タブ ${main} で ${n} 件`, c === n, String(c));
  const subs = await page.locator('.cat-nav .cat-chip').count();
  check(`タブ ${main} のサブカテゴリ表示`, subs === (main === 'visual' ? 22 : 5), String(subs));
}
await page.click('.main-tab[data-main="world"]');
await page.click('.cat-chip[data-sub="wrd-b"]');
check('サブカテゴリ WRD-B で 10 件', (await cards()) === 10);
await page.screenshot({ path: `${out}/catalog-world-b.png` });
await page.click('.main-tab[data-main="all"]');

await page.fill('.search', 'GEO-004');
check('検索 GEO-004', (await cards()) === 1);
await page.fill('.search', 'fabrik');
check('検索 fabrik（英語・大小無視）', (await page.locator('.card[data-id="MOT-023"]').count()) === 1);
await page.fill('.search', '');
await page.selectOption('.filters select >> nth=0', 'planned');
const planned = await cards();
const plannedBadges = await page.locator('.card .badge.status-planned').count();
check('未実装フィルタ', planned === plannedBadges, `${planned}`);
await page.selectOption('.filters select >> nth=0', 'implemented');
const impl = await cards();
check('実装済みフィルタ', impl === (await page.locator('.card .badge.status-implemented').count()), `${impl}`);
await page.selectOption('.filters select >> nth=0', 'all');

// 詳細：解説タブ・関連リンク・再生/停止・閉じて再度開く
const openId = async (id) => {
  await page.evaluate((id) => (location.hash = '#/fx/' + id), id);
  await page.waitForFunction((id) => document.querySelector('.viewer-title')?.textContent?.startsWith(id), id);
};
await openId('GEO-001');
await page.waitForTimeout(1500);
await page.click('.tab[data-tab="info"]');
const info = await page.locator('.info-tab').textContent();
check('解説に原理・実装・参考資料・関連', ['原理', 'このライブラリでの実装', '参考資料', '関連技術'].every((w) => info.includes(w)));
await page.screenshot({ path: `${out}/viewer-info.png` });
const rel = page.locator('.rel-list button.link').first();
if (await rel.count()) {
  const text = await rel.textContent();
  await rel.click();
  const relId = text.split(' ')[0];
  await page.waitForFunction((id) => document.querySelector('.viewer-title')?.textContent?.startsWith(id), relId);
  check('関連リンクで移動', true, relId);
}
await page.click('.tab[data-tab="params"]');
const pause = page.locator('.viewer-toolbar button[title^="一時停止"]');
await pause.click();
check('一時停止ボタン', (await pause.textContent()).includes('再生') && (await pause.getAttribute('class')).includes('active'));
await pause.click();
check('再生に戻る', (await pause.textContent()).includes('停止'));

for (const id of ['001', 'GEO-022', 'MOT-003', 'WRD-001', '013']) {
  for (let r = 0; r < 2; r++) {
    await openId(id);
    await page.waitForTimeout(700);
    const lost = await page.locator('.viewer-canvas').evaluate((c) => c.getContext('webgl2')?.isContextLost() ?? true);
    check(`${id} ${r ? '再オープン' : '初回'}で描画可能`, !lost);
    await page.evaluate(() => (location.hash = '#/'));
    await page.waitForTimeout(200);
  }
}
const plannedId = await page.evaluate(() => document.querySelector('.card.status-planned')?.dataset.id ?? null);
if (plannedId) {
  await openId(plannedId);
  const msg = await page.locator('.planned-msg').count();
  check(`未実装 ${plannedId} は偽プレビューなし`, msg === 1 && (await page.locator('.notice').textContent()) === '');
  await page.evaluate(() => (location.hash = '#/'));
}
check('コンソールエラーなし', errors.length === 0, errors.slice(0, 5).join(' | '));
await browser.close();
const ng = checks.filter((c) => !c.ok).length;
console.log(ng ? `FAILED ${ng}` : 'ALL OK');
process.exit(ng ? 1 : 0);
