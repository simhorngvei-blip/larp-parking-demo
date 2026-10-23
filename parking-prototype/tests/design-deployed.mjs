import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url))('playwright');
const base=process.env.LARP_TEST_URL||'http://127.0.0.1:8080',out=new URL('../artifacts/design/',import.meta.url);await mkdir(out,{recursive:true});
const browser=await chromium.launch(),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto(base+'/saas');await page.getByRole('heading',{name:'Every arrival. A better experience.',exact:true}).waitFor();await page.getByRole('button',{name:'Server room',exact:true}).click();await page.getByRole('heading',{name:'See the signal. Follow the evidence.',exact:true}).waitFor();
 await page.goto(base+'/server-room');await page.locator('[data-device-graph]').waitFor();await page.getByRole('button',{name:'Inspect device BC-001',exact:true}).click();await page.getByRole('heading',{name:'BC-001 / internal schematic',exact:true}).waitFor();await page.getByRole('button',{name:'Close device console',exact:true}).click();await page.getByLabel('Device inspection selector',{exact:true}).selectOption('BC-008');await page.getByRole('heading',{name:'BC-008 / internal schematic',exact:true}).waitFor();
 await page.route('**/api/public/state',route=>route.abort());await page.getByText('API connection lost. Results below are cached; do not treat them as live pass/fail checks.',{exact:true}).waitFor();await page.unroute('**/api/public/state');await page.getByRole('button',{name:'Close device console',exact:true}).click();
 await page.screenshot({path:fileURLToPath(new URL('deployed-server-room.png',out)),fullPage:true});
 const state=await(await fetch(base+'/api/public/state',{headers:{authorization:'Bearer demo:security-res'}})).json();assert.equal(state.profile.role,'security');
 await page.setViewportSize({width:390,height:844});for(const path of ['/app','/guard','/server-room']){await page.goto(base+path);await page.locator('[data-public-ready="true"]').waitFor();assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile overflow: '+path);}
 await page.goto('http://127.0.0.1:8081/');await page.getByRole('heading',{name:'Private test console.',exact:true}).waitFor();assert.equal((await fetch('http://127.0.0.1:8081/app')).status,404);assert.deepEqual(errors,[]);
 await writeFile(new URL('deployed-results.json',out),JSON.stringify({passed:true,checks:['Docker serves new SaaS build','server-room React Flow selection','real API supplies assigned security state','mobile user/guard/server-room layouts','separate locked developer app'],errors,at:new Date().toISOString()},null,2));console.log('LARP DEPLOYED DESIGN PASS');
}finally{await browser.close();}
