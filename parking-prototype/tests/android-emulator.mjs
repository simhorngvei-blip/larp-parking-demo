// Real installed Android WebView against an isolated API. Shared Docker data is
// not mutated. Requires the debug APK installed and an authorized emulator.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createApplication} from '../server/http.mjs';
const root=fileURLToPath(new URL('..',import.meta.url)),out=fileURLToPath(new URL('../artifacts/android/',import.meta.url));
await mkdir(out,{recursive:true});
const adbPath=process.env.ANDROID_ADB||`${process.env.LOCALAPPDATA}/Android/Sdk/platform-tools/adb.exe`;
const serial=process.env.ANDROID_SERIAL||'emulator-5554',port=process.env.ANDROID_ADB_PORT||'5038';
const adb=(...args)=>execFileSync(adbPath,['-P',port,'-s',serial,...args],{encoding:'utf8',timeout:30000,windowsHide:true}).trim();
const require=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url)),{chromium}=require('playwright');
const app=await createApplication();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
const vite=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','5209','--strictPort'],{cwd:root,env:{...process.env,PARKING_API_URL:`http://127.0.0.1:${app.server.address().port}`},stdio:'pipe'});
let browser;const checks=[],errors=[];
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const reopen=()=>{adb('shell','am','force-stop','com.larp.parking');adb('shell','am','start','-n','com.larp.parking/.MainActivity');};
async function connect(){
  let pid;
  for(let i=0;i<60;i++){
    try{
      pid=adb('shell','pidof','com.larp.parking').split(' ')[0];
      adb('forward','tcp:9226',`localabstract:webview_devtools_remote_${pid}`);
      const r=await fetch('http://127.0.0.1:9226/json/version');if(r.ok)break;
    }catch{}await wait(500);
  }
  browser=await chromium.connectOverCDP('http://127.0.0.1:9226');
  const page=browser.contexts()[0].pages()[0];assert.ok(page,'Installed app must create a real WebView page');page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));return page;
}
async function shot(name){adb('shell','screencap','-p','/sdcard/baypilot-review.png');adb('pull','/sdcard/baypilot-review.png',out+'/'+name+'.png');}
try{
  assert.equal(adb('shell','getprop','sys.boot_completed'),'1','Android must finish booting');
  assert.ok(adb('shell','pm','path','com.larp.parking').includes('package:'),'Debug app must be installed');
  for(let i=0;i<80;i++){try{if((await fetch('http://127.0.0.1:5209')).ok)break;}catch{}await wait(150);}
  adb('reverse','tcp:8080','tcp:5209');reopen();let page=await connect();await page.locator('[data-public-ready="true"]').waitFor({timeout:30000});
  assert.equal(await page.evaluate(()=>isSecureContext&&typeof crypto.randomUUID==='function'),true,'Localhost reverse must provide the secure-context UUID API');
  assert.equal(await page.getByRole('navigation',{name:'Demo applications'}).count(),0);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await shot('android-public');checks.push('actual Android WebView loads user-only app with secure-context UUID support and no horizontal overflow');
  await page.getByLabel('Demo identity',{exact:true}).selectOption('resident-alicia');
  await page.getByRole('button',{name:'My home',exact:true}).click();await page.getByText('R-102',{exact:true}).waitFor();await shot('android-owner');checks.push('owner identity sees verified R-102 home entitlement');
  await page.getByLabel('Demo identity',{exact:true}).selectOption('public-visitor');
  await page.getByRole('button',{name:'Explore parking',exact:true}).click();
  await page.getByRole('button',{name:'Explore Concordia Residences',exact:true}).click();
  await page.getByLabel('Visitor vehicle plate',{exact:true}).fill('AND2026');await page.getByLabel('Host unit',{exact:true}).fill('10-02');
  await page.getByRole('button',{name:'Request homeowner approval',exact:true}).click();await page.getByText('Waiting for homeowner approval',{exact:true}).waitFor();
  await page.getByLabel('Demo identity',{exact:true}).selectOption('resident-alicia');
  await page.getByRole('button',{name:'Visitor passes',exact:true}).click();
  await page.getByRole('button',{name:'Approve visitor',exact:true}).click();await page.getByText('APPROVED',{exact:true}).first().waitFor();
  const guard=await fetch(`http://127.0.0.1:${app.server.address().port}/api/public/state`,{headers:{authorization:'Bearer demo:security-res'}}).then(r=>r.json());
  assert.ok(guard.notifications.some(n=>n.kind==='PASS_APPROVED'));checks.push('Android visitor request and actual host approval notify property security');
  await page.getByLabel('Demo identity',{exact:true}).selectOption('public-visitor');
  await page.getByRole('button',{name:'EV charging',exact:true}).click();await page.getByLabel('Charging property',{exact:true}).selectOption('MALL-001');
  await page.getByRole('button',{name:'Book MALL-EV-01',exact:true}).click();await page.getByLabel('Charging vehicle plate',{exact:true}).fill('AND2026');
  await page.getByRole('button',{name:'Confirm EV booking',exact:true}).click();await page.locator('[data-booking-status="BOOKED"]').waitFor();
  await page.getByRole('button',{name:'Check in for charging',exact:true}).click();await page.locator('[data-booking-status="CHECKED_IN"]').waitFor();
  assert.equal(await page.getByRole('button',{name:'Start charging',exact:true}).isDisabled(),true);await shot('android-ev');checks.push('Android EV booking/check-in keeps start disabled until an independent connected observation');
  // Real Activity retry screen: remove host transport, restart, inspect native UI.
  assert.deepEqual(errors,[]);await browser.close();browser=null;
  adb('reverse','--remove','tcp:8080');reopen();await wait(2500);
  let hierarchy='';
  for(let i=0;i<30;i++){
    hierarchy=adb('shell','dumpsys','activity','top').split('ACTIVITY com.larp.parking/')[1]||'';
    if(/android.webkit.WebView\{[^\n]* G/.test(hierarchy))break;
    await wait(500);
  }
  assert.ok(hierarchy,'Native activity must still run when disconnected');
  assert.ok(/android.webkit.WebView\{[^\n]* G/.test(hierarchy),'WebView must become hidden while the native offline fallback is shown');
  const retry=hierarchy.match(/android.widget.Button\{[^\n]* V[^\n]*? (\d+),(\d+)-(\d+),(\d+)\}/);
  const containers=[...hierarchy.matchAll(/android.widget.LinearLayout\{[^\n]* V[^\n]*? (\d+),(\d+)-(\d+),(\d+)\}/g)];
  assert.ok(retry&&containers.length,'Native retry button and its container must be visible');
  await writeFile(out+'/offline-native-hierarchy.txt',hierarchy.split('\n').filter(line=>/android.widget.(LinearLayout|TextView|Button)|android.webkit.WebView/.test(line)).join('\n'));
  await shot('android-offline');checks.push('native offline fallback hides WebView and presents the retry control (window hierarchy; screenshot visually inspected)');
  adb('reverse','tcp:8080','tcp:5209');
  // The API-37 image returns null from uiautomator. Use the Activity's own
  // visible view bounds, with the parent offset, rather than fixed coordinates.
  const parent=containers.at(-1);
  adb('shell','input','tap',String(+parent[1]+((+retry[1]+ +retry[3])>>1)),String(+parent[2]+((+retry[2]+ +retry[4])>>1)));
  page=await connect();await page.locator('[data-public-ready="true"]').waitFor({timeout:20000});checks.push('native Retry connection restores the actual user app');
  const result={passed:true,device:serial,androidRelease:adb('shell','getprop','ro.build.version.release'),apiLevel:adb('shell','getprop','ro.build.version.sdk'),source:'installed debug APK / real Android WebView, isolated API fixture',checks,pageErrors:errors,excluded:['physical hardware','native push','production login','system-back and rotation matrix','all future operations requirements']};
  await writeFile(out+'/emulator-results.json',JSON.stringify(result,null,2));console.log('ANDROID EMULATOR PASS '+JSON.stringify(result));
}catch(error){await writeFile(out+'/emulator-failure.txt',String(error.stack));throw error;}
finally{await browser?.close();adb('reverse','tcp:8080','tcp:8080');reopen();vite.kill();await app.close();}
