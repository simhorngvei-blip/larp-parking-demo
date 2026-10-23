import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {createApplication} from '../server/http.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=new URL('../artifacts/residential/',import.meta.url);await mkdir(out,{recursive:true});
const require=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url)),{chromium}=require('playwright');
const app=await createApplication();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const api=`http://127.0.0.1:${app.server.address().port}`;
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5211','--strictPort'],{cwd:root,env:{...process.env,PARKING_API_URL:api},stdio:'pipe'});
let browser;const errors=[];
try{
 for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:5211')).ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
 browser=await chromium.launch();const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.setDefaultTimeout(7000);page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:5211/app?identity=resident-alicia');await page.locator('[data-public-ready="true"]').waitFor();
 await page.getByRole('button',{name:'Lower my bollard',exact:true}).waitFor();
 await page.getByLabel('Guest account',{exact:true}).selectOption('public-visitor');await page.getByLabel('Guest vehicle plate',{exact:true}).fill('GRILL2026');
 await page.getByRole('button',{name:'Invite guest with parking',exact:true}).click();await page.getByRole('status').filter({hasText:'allocated'}).waitFor();
 await page.screenshot({path:fileURLToPath(new URL('owner.png',out)),fullPage:true});
 await page.route('**/api/public/state',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Injected API outage'})}));await page.getByText(/Offline \/ unconfirmed/).waitFor();assert.equal(await page.getByRole('button',{name:'Lower my bollard',exact:true}).isDisabled(),true);await page.unroute('**/api/public/state');await page.waitForFunction(()=>document.querySelector('.p-connection-strip')?.textContent?.startsWith('Connected'));assert.equal(await page.getByRole('alert').count(),0);
 await page.goto('http://127.0.0.1:5211/app?identity=public-visitor');await page.getByRole('button',{name:'Visitor passes',exact:true}).click();await page.getByText('Allocated parking: V-01',{exact:true}).waitFor();
 await page.goto('http://127.0.0.1:5211/security');await page.getByRole('heading',{name:'Residential device fleet',exact:true}).waitFor();await page.getByRole('heading',{name:'Diagnostic path',exact:true}).waitFor();await page.screenshot({path:fileURLToPath(new URL('security.png',out)),fullPage:true});
 await page.goto('http://127.0.0.1:5211/developer.html');await page.getByLabel('Creator key',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'Replay trusted handover fixture',exact:true}).count(),0);
 await page.getByLabel('Creator key',{exact:true}).fill(app.creatorKey);await page.getByRole('button',{name:'Unlock creator console',exact:true}).click();await page.getByRole('heading',{name:'Residential failure rehearsal',exact:true}).waitFor();
 await page.screenshot({path:fileURLToPath(new URL('creator.png',out)),fullPage:true});await page.setViewportSize({width:393,height:830});await page.goto('http://127.0.0.1:5211/app?identity=resident-alicia&native=user');await page.getByRole('button',{name:'Lower my bollard',exact:true}).waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.deepEqual(errors,[]);await writeFile(new URL('browser-results.json',out),JSON.stringify({passed:true,checks:['owner-first controls','homeowner invitation with exclusive parking','visitor allocation visibility','security fleet and diagnostic path','private creator unlock','phone width'],pageErrors:errors},null,2));console.log('RESIDENTIAL BROWSER PASS');
}finally{await browser?.close();vite.kill();await app.close();}
