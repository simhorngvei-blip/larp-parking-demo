import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url))('playwright');
const base=process.env.LARP_TEST_URL||'http://127.0.0.1:8080',out=new URL('../artifacts/single-bay-workbench/',import.meta.url),checks=[];
await mkdir(out,{recursive:true});const browser=await chromium.launch();
try{const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/server-room');await page.getByLabel('Device inspection selector',{exact:true}).selectOption('R-102');
 const dialog=page.getByRole('dialog',{name:'Device console R-102',exact:true});await dialog.getByRole('heading',{name:'Single-bay background workbench',exact:true}).waitFor();assert.equal(await dialog.locator('iframe').count(),0);
 await dialog.getByRole('heading',{name:'Background ESP32: LIVE',exact:true}).waitFor({timeout:90000});const img=dialog.getByRole('img',{name:'Live bollard controller Wokwi circuit',exact:true});await img.waitFor();await page.waitForFunction(()=>[...document.images].some(i=>i.alt==='Live bollard controller Wokwi circuit'&&i.naturalWidth>0));
 assert.ok((await dialog.getByLabel('Background bench UART output').innerText()).includes('TELEMETRY'));checks.push('Bay popup displays a real background circuit capture and UART without embedding the Wokwi editor');
 const first=await(await page.request.get(base+'/controller-runtime/bollard/status')).json();assert.equal(first.status,'LIVE');await dialog.screenshot({path:fileURLToPath(new URL('background-popup.png',out))});await page.getByRole('button',{name:'Close device console',exact:true}).click();await page.waitForTimeout(3500);
 const next=await(await page.request.get(base+'/controller-runtime/bollard/status')).json();assert.equal(next.instance,first.instance);assert.ok(next.sequence>first.sequence);checks.push('Closing the popup leaves the same firmware instance running and advancing');
 await page.getByLabel('Device inspection selector',{exact:true}).selectOption('R-103');const reopened=page.getByRole('dialog',{name:'Device console R-103',exact:true});await reopened.getByRole('heading',{name:'Background ESP32: LIVE',exact:true}).waitFor();assert.ok((await reopened.innerText()).includes('One shared reference bench'));assert.equal((await(await page.request.get(base+'/controller-runtime/bollard/status')).json()).instance,first.instance);checks.push('Another bay reuses the clearly labelled independent template instead of claiming to be its physical controller');
 await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert.deepEqual(errors,[]);
 await writeFile(new URL('background-results.json',out),JSON.stringify({passed:true,at:new Date().toISOString(),checks,instance:first.instance,sequences:[first.sequence,next.sequence],errors,source:'Actual Docker background Wokwi; read-only verification, no movement commands'},null,2));console.log(checks);
}finally{await browser.close()}
