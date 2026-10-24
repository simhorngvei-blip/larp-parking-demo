import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {BenchState} from './state.mjs';
import {createRuntimeServer} from './server.mjs';
import {prepareSimulationCpuLimit,readSerialPackets,setReferenceSimulationPaused} from '../wokwi-integrated/simulation-config.mjs';
const {chromium}=createRequire(new URL('../tools/mcp-node/package.json',import.meta.url))('playwright');
const benches=Object.fromEntries(await Promise.all(['flow','bay','bollard'].map(async role=>{const project=JSON.parse(await readFile(new URL(role==='bollard'?'../wokwi-bollard-bench/project.json':role+'/project.json',import.meta.url),'utf8'));return [role,new BenchState(role,project.url)];})));
const server=createRuntimeServer(benches),abort=new AbortController(),browsers=new Set();let stopping=false;
const sessions=new Map();let resourcePaused=false;
async function applyResourceMode(role,session){
 if(session.transition)return session.transition;
 session.transition=(async()=>{if(session.paused===resourcePaused)return;const paused=resourcePaused;
  await setReferenceSimulationPaused(session,paused);
  session.paused=paused;session.resumedAt=Date.now();benches[role].setPaused(paused);
 })().finally(()=>{session.transition=null;});return session.transition;
}
process.on('message',message=>{if(message?.type!=='resource-mode'||typeof message.paused!=='boolean')return;resourcePaused=message.paused;void Promise.all([...sessions].map(([role,session])=>applyResourceMode(role,session))).then(()=>process.send?.({type:'resource-mode-result',id:message.id}),error=>process.send?.({type:'resource-mode-result',id:message.id,error:error.message}));});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.CONTROLLER_PORT||4178),process.env.CONTROLLER_HOST||'127.0.0.1',resolve);});
console.log('Controller bench viewer listening; ESP32 compilation starts without opening any app page.');
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(timer);}}
async function worker(role,bench){
 while(!stopping){let browser;
  try{
   bench.begin();console.log(role+': starting isolated ESP32 session '+bench.instance);
   browser=await chromium.launch({headless:true,args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});browsers.add(browser);
   const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage();page.setDefaultTimeout(15000);
   await page.goto(bench.url,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>window.monaco?.editor.getModels().some(m=>m.uri.toString()==='vfs:sketch.ino')&&document.querySelector('#esp32'),null,{timeout:45000});
   if(process.env.WOKWI_SIM_CPU_MHZ)await prepareSimulationCpuLimit(page,Number(process.env.WOKWI_SIM_CPU_MHZ));
   await page.getByRole('button',{name:'Start the simulation',exact:true}).click();
   await page.waitForFunction(()=>document.body.innerText.split(/[\r\n]+/).some(line=>{try{const p=JSON.parse(line);return p.check==='BOOT'&&p.result==='PASS';}catch{return false;}}),null,{timeout:600000});
   await page.evaluate(()=>{const monitor=document.querySelector('[class*="serialMonitor__"]'),panel=monitor?.parentElement?.parentElement;if(panel){panel.style.height='160px';panel.style.minHeight='160px';panel.style.flex='0 0 160px';}});
   await page.locator('#esp32').click({force:true});await page.keyboard.press('Escape');await page.keyboard.press('f');
   const cdp=await context.newCDPSession(page);let nextImage=0;
   const session={page,cdp,paused:false,resumedAt:Date.now(),transition:null};sessions.set(role,session);
   console.log(role+': firmware booted; collecting real UART records and circuit frames.');
   while(!stopping){
    await applyResourceMode(role,session);
    if(session.paused){await delay(500,null,{signal:abort.signal});continue;}
    const packets=await bounded(page.evaluate(readSerialPackets,'role'),12000,'UART collection timed out');bench.observe(packets);
    if(Date.now()-Math.max(bench.lastSeenAt??bench.startedAt,session.resumedAt)>20000)throw Error('Firmware sequence stopped advancing; restarting isolated bench with a new instance');
    if(Date.now()>=nextImage){const shot=await bounded(cdp.send('Page.captureScreenshot',{format:'jpeg',quality:65,clip:{x:800,y:65,width:800,height:740,scale:1},captureBeyondViewport:false}),12000,'Circuit capture timed out');bench.capture(Buffer.from(shot.data,'base64'));nextImage=Date.now()+Number(process.env.CONTROLLER_CAPTURE_INTERVAL_MS||1200);}
    await delay(500,null,{signal:abort.signal});
   }
  }catch(error){if(!stopping){bench.fail(error.message);console.error(role+': '+error.message);}}
  finally{sessions.delete(role);if(browser){browsers.delete(browser);await browser.close().catch(()=>{});}}
  if(!stopping)await delay(15000,null,{signal:abort.signal}).catch(()=>{});
 }
}
const jobs=Object.entries(benches).map(([role,bench])=>worker(role,bench));
async function close(){if(stopping)return;stopping=true;abort.abort();await Promise.all([...browsers].map(b=>b.close().catch(()=>{})));await Promise.all(jobs);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>close().then(()=>process.exit(0)));
await Promise.all(jobs);

