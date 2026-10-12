/**
 * GEOMETRY / MOTION / WORLD デモのブラウザ検査。
 *   node scripts/lab-qa.mjs GEO-001 GEO-002 ...   （ID を列挙）
 *   node scripts/lab-qa.mjs --prefix WRD-00       （接頭辞で一括）
 * 各IDについて：ビューアで開く → 数秒描画 → 操作ボタンをすべて押す → 比較・ワイヤーフレームを切替
 * → 一覧へ戻って同じIDを再度開く（canvas再利用の不具合の再発確認）→ スクリーンショット。
 * 最後にセルフテスト（生成→描画→破棄・リソース残存）を対象IDだけ実行する。
 *
 * 環境変数: QA_BASE_URL（既定 http://127.0.0.1:5173）, QA_OUTPUT_DIR, PLAYWRIGHT_MODULE_PATH, CHROMIUM_PATH, QA_WAIT
 */
import { mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173';
const out = resolve(process.env.QA_OUTPUT_DIR ?? '/tmp/visual-effect-library-lab-qa');
const wait = Number(process.env.QA_WAIT ?? 2500);
await mkdir(out, { recursive: true });

const args = process.argv.slice(2);
let ids = args.filter((a) => !a.startsWith('--'));
const prefixArg = args.indexOf('--prefix');
const prefix = prefixArg >= 0 ? args[prefixArg + 1] : null;
if (prefix) ids = ids.filter((a) => a !== prefix);

const launch = { args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
if (process.env.CHROMIUM_PATH) launch.executablePath = process.env.CHROMIUM_PATH;
const browser = await chromium.launch(launch);
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(`PAGEERROR ${e.message}`));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(m.text().slice(0, 400));
});

await page.goto(base);
await page.waitForSelector('.card');
if (prefix) {
  ids = await page.evaluate((p) => [...document.querySelectorAll('.card')].map((c) => c.dataset.id).filter((id) => id && id.startsWith(p)), prefix);
}

let failed = 0;
// 開発サーバーで他のファイルが更新されるとページが再読み込みされることがある。その場合は同じIDをやり直す
const isReload = (e) => /Execution context was destroyed|navigation|Target closed|frame was detached/i.test(String(e?.message ?? e));
const reloadBase = async () => {
  await page.goto(base);
  await page.waitForSelector('.card');
};

async function checkOne(id) {
  const before = errors.length;
  const problems = [];
  for (let round = 0; round < 2; round++) {
    await page.evaluate((id) => (location.hash = '#/fx/' + id), id);
    await page.waitForFunction((id) => document.querySelector('.viewer-title')?.textContent?.startsWith(id), id, { timeout: 15000 });
    await page.waitForTimeout(round === 0 ? wait : 900);
    const lost = await page.locator('.viewer-canvas').evaluate((c) => c.getContext('webgl2')?.isContextLost() ?? true);
    if (lost) problems.push(`round ${round}: context lost`);
    if (round === 0) {
      // 操作ボタン（GLB書き出しはダウンロードが発生するので除外）
      const actions = await page.locator('.action-btn:not([data-action="export-glb"])').all();
      for (const a of actions) {
        await a.click();
        await page.waitForTimeout(250);
      }
      // 比較・ワイヤーフレームの切替
      for (const label of ['比較', 'ワイヤーフレーム']) {
        const box = page.locator('.viewer-panel .param-bool', { hasText: label }).locator('input[type=checkbox]').first();
        if (await box.count()) {
          await box.click();
          await page.waitForTimeout(400);
        }
      }
      // ドラッグとホイール
      const canvas = page.locator('.viewer-canvas');
      const bb = await canvas.boundingBox();
      if (bb) {
        await page.mouse.move(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(bb.x + bb.width * 0.62, bb.y + bb.height * 0.45, { steps: 6 });
        await page.mouse.up();
        await page.mouse.wheel(0, -200);
      }
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${out}/${id}.png` });
      const notice = await page.locator('.notice').textContent();
      if (notice && /エラー|error/i.test(notice)) problems.push(`notice: ${notice}`);
      // パイプラインが演出を停止した場合（例外・シェーダーエラー）はパネルにエラー表示が出る
      const stageErr = await page.locator('.stage-error pre').first().textContent().catch(() => null);
      if (stageErr) problems.push(`stage error: ${stageErr.slice(0, 300)}`);
    }
    await page.evaluate(() => (location.hash = '#/'));
    await page.waitForTimeout(250);
  }
  const errs = errors.slice(before).filter((e) => !/\[vite\]|Failed to fetch dynamically imported module/.test(e));
  if (errs.length) problems.push(...errs);
  return problems;
}

for (const id of ids) {
  let problems = null;
  for (let attempt = 0; attempt < 4 && !problems; attempt++) {
    try {
      problems = await checkOne(id);
    } catch (e) {
      if (!isReload(e) || attempt === 3) problems = [`exception: ${String(e?.message ?? e).split('\n')[0]}`];
      else await reloadBase().catch(() => {});
    }
  }
  if (problems.length) failed++;
  console.log(`${id} ${problems.length ? 'NG' : 'OK'}${problems.length ? '\n  ' + problems.join('\n  ') : ''}`);
}

// セルフテスト（対象IDだけ）
let st = null;
for (let attempt = 0; attempt < 4 && !st; attempt++) {
  try {
    await page.goto(`${base}/#/selftest?ids=${encodeURIComponent(ids.join(','))}`);
    await page.waitForFunction(() => window.__selftest, null, { timeout: 300000 });
    st = await page.evaluate(() => window.__selftest);
  } catch (e) {
    if (!isReload(e) || attempt === 3) throw e;
  }
}
for (const r of st.results.filter((r) => ids.includes(r.id))) {
  const bad = !r.ok || r.leaked > 0;
  if (bad) failed++;
  console.log(`selftest ${r.id} ${r.ok ? 'OK' : 'NG ' + r.message} leak=${r.leaked} ${Math.round(r.ms)}ms`);
}
console.log(`screenshots: ${out}`);
console.log(failed ? `FAILED ${failed}` : 'ALL OK');
await browser.close();
process.exit(failed ? 1 : 0);
