import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createApplication} from '../server/http.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const require=createRequire(path.join(root,'../tools/mcp-node/package.json'));const {chromium}=require('playwright');
const artifacts=path.join(root,'artifacts/scale');await mkdir(artifacts,{recursive:true});
const temp=await mkdtemp(path.join(tmpdir(),'baypilot-scale-browser-'));
const app=await createApplication({autoTick:false,scaleFile:path.join(temp,'scaled.sqlite')});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const api=`http://127.0.0.1:${app.server.address().port}`;
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5198','--strictPort'],{cwd:root,env:{...process.env,PARKING_API_URL:api},stdio:'pipe'});let log='';vite.stdout.on('data',d=>log+=d);vite.stderr.on('data',d=>log+=d);
let browser;
try{
 for(let n=0;n<80;n++){try{if((await fetch('http://127.0.0.1:5198')).ok)break;}catch{}if(n===79)throw Error(log);await new Promise(r=>setTimeout(r,150));}
 browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1100}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(key=>sessionStorage.setItem('baypilot-creator-key',key),app.creatorKey);await page.goto('http://127.0.0.1:5198/?view=overview');await page.getByRole('link',{name:'Scale lab',exact:true}).click();await page.getByRole('heading',{name:'See the system scale.'}).waitFor();await page.locator('.sd-canvas canvas').waitFor();
 await page.getByLabel('Scale scenario').selectOption('1');await page.getByRole('button',{name:'Load scenario',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sd-stats')?.textContent?.includes('500'));
 await page.getByLabel('Level',{exact:true}).selectOption('9');await page.getByLabel('Assigned bay',{exact:true}).selectOption('B-0451');
 await page.getByLabel('Vehicle plate',{exact:true}).fill('TEAM2026');await page.getByRole('button',{name:'Authorize arrival',exact:true}).click();await page.getByText('TEAM2026',{exact:true}).waitFor();
 for(const name of ['Advance 10 s','Enter lane','Advance 10 s','Park vehicle','Leave bay','Use exit','Advance 10 s','Advance 10 s']){await page.getByRole('button',{name,exact:true}).click();await page.waitForFunction(()=>!document.querySelector('button.sd-primary')?.disabled);}
 await page.waitForFunction(()=>document.querySelector('.sd-tablewrap')?.textContent?.includes('complete'));assert.equal(await page.getByRole('alert').count(),0);
 await page.getByRole('button',{name:'Run 20 vehicles',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('button.sd-primary')?.disabled);assert.equal(await page.getByRole('alert').count(),0);assert.equal((await(await page.request.get(api+'/api/scale/state')).json()).summary.reserved,20);
 for(let n=0;n<30;n++)await page.request.post(api+'/api/scale/advance',{headers:{'x-creator-key':app.creatorKey,'x-demo-actor':'management'},data:{milliseconds:1000}});
 await page.screenshot({path:path.join(artifacts,'building-500.png'),fullPage:true});
 // Finish traffic before changing inventory; then verify shrinking while the selected site disappears.
 for(let n=0;n<120;n++)await page.request.post(api+'/api/scale/advance',{headers:{'x-creator-key':app.creatorKey,'x-demo-actor':'management'},data:{milliseconds:1000}});
 await page.getByLabel('Scale scenario').selectOption('3');await page.getByRole('button',{name:'Load scenario',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.sd-stats')?.textContent?.includes('50,000'));
 await page.getByLabel('Site',{exact:true}).selectOption('SITE-100');await page.getByLabel('Level',{exact:true}).selectOption('9');await page.getByLabel('Assigned bay',{exact:true}).selectOption('B-0451');
 await page.screenshot({path:path.join(artifacts,'portfolio-50000.png'),fullPage:true});
 await page.getByLabel('Scale scenario').selectOption('0');await page.getByRole('button',{name:'Load scenario',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('.sd-scope select')?.value==='SITE-001');assert.equal(await page.getByRole('alert').count(),0,'Shrinking inventory must reset selection before refreshing');
 await page.getByRole('button',{name:'Bay map',exact:true}).click();assert.equal(await page.locator('.sd-bay').count(),25);
 await page.getByRole('button',{name:'Disconnect zone',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.sd-bay.fault').length===5);await page.getByRole('button',{name:'Restore zone',exact:true}).click();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Mobile view must fit screen');
 assert.deepEqual(errors,[]);await writeFile(path.join(artifacts,'browser-results.json'),JSON.stringify({passed:true,scenarios:['500-bay level-9 manual trip','20 concurrent auto journeys','50000-bay site selection','shrink inventory from selected site 100','five-node outage isolation','mobile layout'],pageErrors:errors},null,2));console.log('Scaled browser journeys passed');
}finally{await browser?.close();vite.kill();await app.close();assert.ok(path.resolve(temp).startsWith(path.resolve(tmpdir())+path.sep));await rm(temp,{recursive:true,force:true});}
