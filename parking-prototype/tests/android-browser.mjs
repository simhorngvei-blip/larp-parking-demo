// A real WebView-facing route must keep the user focused on the user app.
// This catches exposing engineering navigation or a layout wider than a phone.
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createApplication} from '../server/http.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const require=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url));
const {chromium}=require('playwright');
const app=await createApplication();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5208','--strictPort'],{cwd:root,env:{...process.env,PARKING_API_URL:`http://127.0.0.1:${app.server.address().port}`},stdio:'pipe'});
let browser;
try{
  for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:5208')).ok)break;}catch{}await new Promise(r=>setTimeout(r,150));}
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:393,height:830}});
  await page.goto('http://127.0.0.1:5208/app?native=user');
  await page.locator('[data-public-ready="true"]').waitFor();
  assert.equal(await page.getByRole('navigation',{name:'Demo applications'}).count(),0,'Android user mode must omit cross-app engineering navigation');
  assert.equal(await page.getByRole('link',{name:'Original nine-bay circuit journey'}).count(),0,'Engineering links belong outside the mobile user experience');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Phone layout must fit its viewport');
  await page.getByLabel('Demo identity',{exact:true}).selectOption('resident-alicia');
  await page.getByRole('button',{name:'My home',exact:true}).click();
  await page.getByText('R-102',{exact:true}).waitFor();
  assert.equal(await page.getByRole('link',{name:'Original nine-bay circuit journey'}).count(),0);
  await page.goto('http://127.0.0.1:5208/app');
  await page.getByRole('navigation',{name:'Demo applications'}).waitFor();
  console.log('PASS Android user-mode navigation, owner entitlement, phone layout and retained desktop app navigation');
}finally{await browser?.close();vite.kill();await app.close();}
