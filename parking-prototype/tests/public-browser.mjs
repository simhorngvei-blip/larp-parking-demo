import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createApplication} from '../server/http.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=new URL('../artifacts/public/',import.meta.url);
await mkdir(out,{recursive:true});
const require=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url)),{chromium}=require('playwright');
const app=await createApplication();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const api=`http://127.0.0.1:${app.server.address().port}`;
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5207','--strictPort'],{cwd:root,env:{...process.env,PARKING_API_URL:api},stdio:'pipe'});let log='';vite.stdout.on('data',v=>log+=v);vite.stderr.on('data',v=>log+=v);
let browser,context;const errors=[],checks=[];
try{
  for(let n=0;n<80;n++){try{if((await fetch('http://127.0.0.1:5207')).ok)break;}catch{}if(n===79)throw Error(log);await new Promise(r=>setTimeout(r,150));}
  browser=await chromium.launch({headless:true});context=await browser.newContext({viewport:{width:1440,height:1000}});
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto('http://127.0.0.1:5207/?app=user');
  await page.getByRole('heading',{name:'Parking for every destination.',exact:true}).waitFor({timeout:6000});
  await page.getByRole('button',{name:'Explore Concordia Residences',exact:true}).click();
  await page.getByLabel('Visitor vehicle plate',{exact:true}).fill('VIS2026');await page.getByLabel('Host unit',{exact:true}).fill('10-02');
  await page.getByRole('button',{name:'Request homeowner approval',exact:true}).click();await page.getByText('Waiting for homeowner approval',{exact:true}).waitFor();
  const host=await context.newPage();host.on('pageerror',e=>errors.push(e.message));await host.goto('http://127.0.0.1:5207/?app=user&identity=resident-alicia');
  await host.getByRole('button',{name:'Visitor passes',exact:true}).click();await host.getByRole('button',{name:'Approve visitor',exact:true}).click();
  const guard=await context.newPage();guard.on('pageerror',e=>errors.push(e.message));await guard.goto('http://127.0.0.1:5207/?app=security');
  await guard.getByRole('button',{name:'Record manual check-in',exact:true}).click();checks.push('visitor request, actual homeowner approval, scoped security notification and entry');
  await page.getByRole('button',{name:'EV charging',exact:true}).click();await page.getByLabel('Charging property',{exact:true}).selectOption('MALL-001');
  await page.getByRole('button',{name:'Book MALL-EV-01',exact:true}).click();await page.getByLabel('Charging vehicle plate',{exact:true}).fill('DEMO2026');await page.getByRole('button',{name:'Confirm EV booking',exact:true}).click();
  await page.getByRole('button',{name:'Check in for charging',exact:true}).click();
  const dev=await context.newPage();dev.on('pageerror',e=>errors.push(e.message));await dev.goto('http://127.0.0.1:5207/developer.html');
  await dev.getByLabel('Creator key',{exact:true}).fill(app.creatorKey);await dev.getByRole('button',{name:'Unlock creator console',exact:true}).click();
  await dev.getByRole('button',{name:'Connect vehicle MALL-EV-01',exact:true}).click();await page.getByRole('button',{name:'Start charging',exact:true}).click();
  await page.locator('[data-booking-status="CHARGING"]').waitFor();await page.getByText(/40%/).first().waitFor();await page.screenshot({path:fileURLToPath(new URL('user-charging.png',out))});
  await page.getByRole('button',{name:'Request security assistance',exact:true}).click();
  await guard.getByLabel('Demo identity',{exact:true}).selectOption('security-mall');await guard.getByLabel('Owner is present',{exact:true}).check();
  await guard.waitForFunction(()=>{const b=Array.from(document.querySelectorAll('button')).find(x=>x.textContent==='Record unplug assistance');return b&&!b.disabled;});
  await guard.getByRole('button',{name:'Record unplug assistance',exact:true}).click();await guard.getByText('ASSISTED',{exact:true}).waitFor();await guard.screenshot({path:fileURLToPath(new URL('security-assistance.png',out))});
  await dev.getByRole('button',{name:'Observe departure MALL-EV-01',exact:true}).click();await page.locator('[data-booking-status="COMPLETE"]').waitFor();checks.push('exclusive EV booking, checked-in vehicle, observed charging, consent-based security assistance and observed departure');
  const handoverResponse=dev.waitForResponse(r=>r.url().endsWith('/api/public/developer/handover-fixture')&&r.request().method()==='POST');
  await dev.getByRole('button',{name:'Replay trusted handover fixture',exact:true}).click();const handover=await(await handoverResponse).json();assert.ok(handover.activationCode);
  const newcomer=await context.newPage();await newcomer.goto('http://127.0.0.1:5207/?app=user&identity='+handover.userId);
  await newcomer.getByRole('button',{name:'My home',exact:true}).click();await newcomer.getByLabel('Homeowner activation code',{exact:true}).fill(handover.activationCode);await newcomer.getByRole('button',{name:'Activate homeowner account',exact:true}).click();await newcomer.getByText('R-201',{exact:true}).waitFor();checks.push('trusted handover provision and bound homeowner activation');
  await dev.screenshot({path:fileURLToPath(new URL('developer-console.png',out))});
  await page.getByRole('button',{name:'Explore parking',exact:true}).click();await page.screenshot({path:fileURLToPath(new URL('user-portfolio.png',out))});
  await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await page.screenshot({path:fileURLToPath(new URL('user-mobile.png',out)),fullPage:true});checks.push('desktop and mobile layout');
  const legacy=await context.newPage();await legacy.goto('http://127.0.0.1:5207/?view=three');await legacy.locator('.three-canvas[data-ready="true"]').waitFor();checks.push('original 3D route still renders');
  assert.deepEqual(errors,[]);await writeFile(new URL('results.json',out),JSON.stringify({passed:true,checks,pageErrors:errors},null,2));console.log('PUBLIC BROWSER PASS: '+JSON.stringify(checks));
}catch(e){await writeFile(new URL('failure.txt',out),String(e.stack));for(const [i,page]of (context?.pages()||[]).entries())await page.screenshot({path:fileURLToPath(new URL('failure-'+i+'.png',out))}).catch(()=>{});throw e;}
finally{await context?.close();await browser?.close();vite.kill();await app.close();}
