import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {createApplication} from '../server/http.mjs';
const {chromium}=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url))('playwright');
const app=await createApplication();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const root=fileURLToPath(new URL('..',import.meta.url)),base='http://127.0.0.1:5227';
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5227','--strictPort'],{cwd:root,env:{...process.env,PARKING_API_URL:'http://127.0.0.1:'+app.server.address().port},stdio:'pipe'});
const out=new URL('../artifacts/design/',import.meta.url);await mkdir(out,{recursive:true});let browser;
try {
 for(let i=0;i<100;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
 browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
 await page.goto(base+'/website/index.html');await page.getByRole('heading',{name:'Every arrival. A better experience.',exact:true}).waitFor();
 await page.getByRole('button',{name:'Guard',exact:true}).click();await page.getByRole('heading',{name:'A clear next action.',exact:true}).waitFor();
 await page.getByRole('button',{name:'Preview bay R-102',exact:true}).click();await page.locator('#bay-detail').filter({hasText:'assigned bay'}).waitFor();
 await page.getByLabel('Number of bays',{exact:true}).fill('49');await page.locator('#capacity').filter({hasText:'9 bay controllers'}).waitFor();await page.locator('#capacity').filter({hasText:'2 flow controllers'}).waitFor();
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download pilot brief',exact:true}).click();assert.equal((await download).suggestedFilename(),'LARP-pilot-brief.md');
 await page.getByLabel('Demo server origin',{exact:true}).fill('javascript:alert(1)');await page.getByRole('button',{name:'Update demo links',exact:true}).click();await page.locator('#connection-note').filter({hasText:'valid HTTP(S)'}).waitFor();
 await page.getByLabel('Demo server origin',{exact:true}).fill('https://larp.example.test');await page.getByRole('button',{name:'Update demo links',exact:true}).click();assert.equal(await page.getByRole('link',{name:'Open driver app',exact:true}).getAttribute('href'),'https://larp.example.test/app');
 await page.evaluate(()=>scrollTo(0,0));await page.getByRole('heading',{name:'Every arrival. A better experience.',exact:true}).scrollIntoViewIfNeeded();await page.evaluate(()=>scrollTo(0,0));await page.screenshot({path:fileURLToPath(new URL('saas-desktop.png',out)),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.emulateMedia({reducedMotion:'reduce'});await page.getByRole('button',{name:'Open navigation',exact:true}).click();await page.getByRole('navigation',{name:'Mobile navigation',exact:true}).getByRole('link',{name:'Platform',exact:true}).click();assert.equal(await page.getByRole('navigation',{name:'Mobile navigation',exact:true}).count(),0);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await page.screenshot({path:fileURLToPath(new URL('saas-mobile.png',out)),fullPage:true});
 await page.setViewportSize({width:1440,height:1000});await page.goto(base+'/server-room');await page.getByRole('heading',{name:'System flow',exact:true}).waitFor();await page.locator('[data-device-graph]').waitFor();await page.getByRole('button',{name:'Inspect device BC-001',exact:true}).click();await page.getByRole('heading',{name:'BC-001 / internal schematic',exact:true}).waitFor();await page.getByRole('button',{name:'Close device console',exact:true}).click();await page.getByRole('button',{name:'Inspect device BC-008',exact:true}).click();await page.getByRole('heading',{name:'BC-008 / internal schematic',exact:true}).waitFor();
 await page.screenshot({path:fileURLToPath(new URL('server-room.png',out)),fullPage:true});assert.deepEqual(errors,[]);
 await writeFile(new URL('browser-results.json',out),JSON.stringify({passed:true,at:new Date().toISOString(),checks:['SaaS role preview','bay inspection','capacity calculation','pilot brief download','origin validation','mobile menu and overflow','reduced motion','React Flow node selection to internal schematic'],errors},null,2));console.log('LARP DESIGN BROWSER PASS');
} finally {await browser?.close();vite.kill();await app.close();}
