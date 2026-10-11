// Run with Vite running and Playwright installed outside application dependencies.
// PLAYWRIGHT_MODULE_PATH may point to a supplied playwright-core/index.mjs.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE_PATH
  ? pathToFileURL(process.env.PLAYWRIGHT_MODULE_PATH).href : 'playwright');
const base = process.env.QA_BASE_URL ?? 'http://127.0.0.1:5173';
const out = resolve(process.env.QA_OUTPUT_DIR ?? '/tmp/visual-effect-library-qa');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/usr/bin/chromium',
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 } });
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
try {
  await page.goto(base);
  await page.waitForSelector('.card');
  await page.screenshot({ path: `${out}/catalog.png` });
  const gpu = await page.evaluate(async () => {
    const THREE = await import('/node_modules/.vite/deps/three.js');
    const { loadEffect, REGISTRY } = await import('/src/effects/registry.ts');
    const { defaultParams } = await import('/src/engine/types.ts');
    const { createTarget } = await import('/src/engine/fullscreen.ts');
    const { demoScene } = await import('/src/engine/demoScene.ts');
    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(128, 80);
    const shaderErrors = [];
    renderer.debug.onShaderError = (gl, p, vs, fs) => shaderErrors.push(gl.getProgramInfoLog(p)+gl.getShaderInfoLog(vs)+gl.getShaderInfoLog(fs));
    const data = new Uint8Array(128*80*4);
    const input = new THREE.DataTexture(data,128,80);
    input.minFilter = input.magFilter = THREE.NearestFilter;
    const output = createTarget(128,80);
    function paint(offset=0) {
      for(let y=0;y<80;y++)for(let x=0;x<128;x++) {
        const k=(y*128+x)*4, moving = ((x-offset+128)%128)<35 && y>15 && y<65;
        data[k]=moving?240:Math.floor(x/128*120); data[k+1]=moving?35:Math.floor(y/80*180); data[k+2]=moving?65:140;data[k+3]=255;
      }
      input.needsUpdate=true;
    }
    function read() { const p=new Uint8Array(128*80*4);renderer.readRenderTargetPixels(output,0,0,128,80,p);return p; }
    function diff(a,b) { let v=0;for(let i=0;i<a.length;i++)if(i%4!==3)v+=Math.abs(a[i]-b[i]);return v/(a.length*.75); }
    // Three.js allocates a renderer-owned shared texture on its first 3D draw.
    // Warm the existing demo, just as the application's selftest does.
    const warm = demoScene.create({renderer,width:128,height:80,quality:'low'});
    warm.render(output,defaultParams(demoScene.params),{time:0,dt:1/30,frame:0});warm.dispose();
    const metrics=[];
    for(const id of ['001','002','010']) {
      const mod=await loadEffect(id), params=defaultParams(mod.params);
      const before={...renderer.info.memory};
      const instance=mod.create({renderer,width:128,height:80,quality:'low'});
      const render=(f, overrides={})=>instance.render(input,output,{...params,...overrides},{time:f/30,dt:1/30,frame:f});
      paint(); render(0); const first=read();
      for(let f=1;f<=30;f++)render(f);
      const still=read();
      const row={id, firstInputDifference:diff(first,data),staticEvolution:diff(first,still)};
      if(id==='001') {
        for(let f=31;f<=60;f++){paint(f-30);render(f);}
        row.movingInputDifference=diff(read(),data);
        instance.resize(128,80);render(61);row.resizeResetDifference=diff(read(),data);
        render(62);render(150);row.iframeResetDifference=diff(read(),data);
        render(3);row.rewindResetDifference=diff(read(),data);
      } else {
        render(31,{amount:0});row.zeroDifference=diff(read(),data);
        render(32);const prior=read();
        for(let f=33;f<45;f++)render(f,{speed:0});
        row.stoppedDifference=diff(prior,read());
        // 002 time is sampled in its shader; set an identical time when comparing stopped state.
        if(id==='002'){render(0,{speed:0});const stopped=read();render(20,{speed:0});row.stoppedDifference=diff(stopped,read());}
        row.activeDifference=diff(read(),data);
        instance.resize(128,80);render(50);
      }
      instance.dispose();
      row.memoryAfter={...renderer.info.memory};row.memoryBefore=before;
      row.glError=renderer.getContext().getError();metrics.push(row);
    }
    const temporal=[];
    for(const id of ['013','014','015','016']) {
      const mod=await loadEffect(id), params=defaultParams(mod.params);
      const instance=mod.create({renderer,width:128,height:80,quality:'low'});
      const beforeFrame={...renderer.info.memory};
      const render=(f,overrides={})=>{
        const values={...params,...overrides}, frame={time:f/30,dt:1/30,frame:f};
        if(mod.kind==='post')instance.render(input,output,values,frame);else instance.render(output,values,frame);
      };
      paint();const row={id};
      if(id==='013') {
        for(let f=0;f<60;f++){paint(f);render(f);}
        row.timeSliceDifference=diff(read(),data);
        render(60,{depth:0});row.zeroDifference=diff(read(),data);
      } else if(id==='014') {
        render(0,{frozen:true,orbit:0});const frozen=read();
        for(let f=1;f<30;f++)render(f,{frozen:true,orbit:0});
        row.frozenDifference=diff(frozen,read());
        for(let f=30;f<60;f++)render(f,{frozen:false,orbit:0});
        row.resumedDifference=diff(frozen,read());
        const pose=read();for(let f=60;f<90;f++)render(f,{frozen:true,orbit:1});
        row.cameraDifference=diff(pose,read());
      } else if(id==='015') {
        for(let f=0;f<24;f++){data.fill(0);for(let k=0;k<data.length;k+=4){data[k]=30+f*6;data[k+3]=255;}input.needsUpdate=true;render(f,{smooth:false});}
        row.reverseSamples=[];
        for(let f=24;f<43;f++){render(f,{smooth:false});row.reverseSamples.push(read()[0]);}
        const prior=read();for(let f=43;f<48;f++)render(f,{speed:0});row.stoppedDifference=diff(prior,read());
        instance.resize(128,80);paint();render(0);row.resizeInputDifference=diff(read(),data);
      } else {
        render(0);const first=read();for(let f=1;f<30;f++)render(f);row.evolution=diff(first,read());
        render(30,{speed:0});const prior=read();for(let f=31;f<40;f++)render(f,{speed:0});row.stoppedDifference=diff(prior,read());
      }
      instance.resize?.(128,80);render(100);
      instance.dispose();row.glError=renderer.getContext().getError();row.memoryBefore=beforeFrame;row.memoryAfter={...renderer.info.memory};
      temporal.push(row);
    }
    // Existing categories one/two and protected extensions create, render and dispose.
    const compatibility=[];
    for(const reg of REGISTRY.filter(r=>Number(r.id)<=20 || Number(r.id)>200)) {
      const mod=await loadEffect(reg.id), before={...renderer.info.memory};
      const inst=mod.create({renderer,width:128,height:80,quality:'low'});
      const params=defaultParams(mod.params);
      for(let f=0;f<8;f++) {
        paint(f);
        const frame={time:f/30,dt:1/30,frame:f};
        if(mod.kind==='post')inst.render(input,output,params,frame);else inst.render(output,params,frame);
      }
      inst.dispose();
      compatibility.push({id:mod.id,glError:renderer.getContext().getError(),
        leakedTextures:renderer.info.memory.textures-before.textures,
        leakedGeometries:renderer.info.memory.geometries-before.geometries});
    }
    input.dispose();output.dispose();renderer.dispose();renderer.forceContextLoss();
    return {metrics,temporal,compatibility,shaderErrors};
  });
  await writeFile(`${out}/gpu-results.json`,JSON.stringify(gpu,null,2));
  console.log('GPU checks completed', JSON.stringify(gpu.metrics));
  for (const id of ['001','002','010','013','014','015','016','201','216']) {
    await page.goto(`${base}/#/fx/${id}`);
    await page.waitForSelector('.viewer-canvas');
    await page.waitForTimeout(1100);
    await page.screenshot({ path: `${out}/effect-${id}.png` });
    if (!await page.locator('.viewer-title').textContent()) throw new Error(`No viewer title: ${id}`);
  }
  await page.goto(`${base}/#/selftest`);
  await page.waitForFunction(() => window.__selftest, null, { timeout: 180000 });
  const selftest = await page.evaluate(() => window.__selftest);
  const result={gpu,selftest,errors};
  await writeFile(`${out}/results.json`,JSON.stringify(result,null,2));
  console.log(JSON.stringify({gpu,selftestSummary:{count:selftest.results.length,failed:selftest.results.filter(r=>!r.ok||r.leaked!==0),memory:selftest.memory},errors},null,2));
  const problems = gpu.compatibility.filter(r=>r.glError||r.leakedTextures||r.leakedGeometries);
  if(problems.length||gpu.shaderErrors.length||errors.length||selftest.results.some(r=>!r.ok||r.leaked!==0))throw new Error('GPU/compatibility/selftest errors');
  for(const row of gpu.metrics) {
    if(row.glError)throw new Error(`GL error ${row.id}`);
    if(row.id==='001' && (row.staticEvolution>.2||row.resizeResetDifference>.2||row.iframeResetDifference>.2||row.rewindResetDifference>.2||row.movingInputDifference<1))throw new Error('001 motion/reset regression');
    if(row.id!=='001' && (row.zeroDifference>.2||row.stoppedDifference>.2||row.activeDifference<1))throw new Error(`${row.id} control regression`);
  }
  for(const row of gpu.temporal) {
    if(row.glError)throw new Error(`GL error ${row.id}`);
    if(row.id==='013'&&(row.zeroDifference>.2||row.timeSliceDifference<1))throw new Error('013 time slice regression');
    if(row.id==='014'&&(row.frozenDifference>.2||row.resumedDifference<1||row.cameraDifference<1))throw new Error('014 freeze regression');
    if(row.id==='015'&&(row.stoppedDifference>.2||row.resizeInputDifference>.2||!row.reverseSamples.every((v,i,a)=>!i||v<a[i-1])))throw new Error('015 reverse order regression');
    if(row.id==='016'&&(row.stoppedDifference>.2||row.evolution<1))throw new Error('016 tunnel regression');
  }
} finally { await browser.close(); }
