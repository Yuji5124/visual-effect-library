import { mkdir, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const base=process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173';
const out=resolve(process.env.QA_OUTPUT_DIR ?? '/tmp/visual-effect-library-qa');
await mkdir(out,{recursive:true});
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',args:['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:1100,height:760}});
const errors=[];const results=[];
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
try {
  await page.goto(base);
  await page.waitForSelector('.card');
  for(const id of ['001','002','010','013','014','015','016',...Array.from({length:16},(_,i)=>String(201+i))]) {
    // Exercise opening, closing and reopening the same Viewer instance.
    await page.evaluate(id=>{location.hash='#/fx/'+id;},id);
    await page.waitForSelector('.viewer-canvas');
    await page.waitForFunction(id=>document.querySelector('.viewer-title')?.textContent.startsWith(id),id);
    await page.waitForTimeout(800);
    const title=await page.locator('.viewer-title').textContent();
    if(!title.includes('実装済み'))throw new Error(id+' status not updated');
    const contextLost=await page.locator('.viewer-canvas').evaluate(c=>c.getContext('webgl2').isContextLost());
    if(contextLost)throw new Error(id+' reopened context is lost');
    if(Number(id)<=200) {
      const slider=page.locator('.viewer-panel input[type=range]').last();
      const original=await slider.inputValue(), min=await slider.getAttribute('min');
      await slider.fill(min);
      const display=await slider.evaluate(el=>el.closest('.param').querySelector('output').textContent);
      if(Number(display)!==Number(min))throw new Error(id+' slider label not updated');
      await slider.fill(original);
      // Let the renderer present the restored parameter value before capture.
      await page.waitForTimeout(250);
    }
    await page.screenshot({path:out+'/final-'+id+'.png'});
    await page.getByRole('button',{name:'← 一覧',exact:true}).click();
    await page.waitForFunction(()=>!document.querySelector('.viewer'));
    results.push({id,title,sliderChanged:Number(id)<=200,close:true,contextLost});
  }
  await page.waitForSelector('.card');
  const stats=await page.locator('.stats').textContent();
  // 366件化（GEOMETRY/MOTION/WORLD 追加）後は総数で整合を確認する。既存216件の状況は tests/extensions-protection.test.ts と registry テストで保護
  const num=(label)=>Number(stats.match(new RegExp(label+' (\\d+)'))?.[1]);
  if(!stats.includes('VISUAL EFFECT 216')||num('実装済み')+num('実験中')+num('未実装')!==366)throw new Error(stats);
  await writeFile(out+'/ui-results.json',JSON.stringify({results,stats,errors},null,2));
  console.log(JSON.stringify({results,stats,errors},null,2));
  if(errors.length)throw new Error('UI errors');
} finally {await browser.close();}
