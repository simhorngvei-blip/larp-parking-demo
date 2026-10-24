import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {BenchState,ReferenceDemand} from './state.mjs';
import {createRuntimeServer} from './server.mjs';
import {prepareSimulationCpuLimit,readSerialPackets} from '../wokwi-integrated/simulation-config.mjs';
const {chromium}=createRequire(new URL('../tools/mcp-node/package.json',import.meta.url))('playwright');
const benches=Object.fromEntries(await Promise.all(['flow','bay','bollard'].map(async role=>{const project=JSON.parse(await readFile(new URL(role==='bollard'?'../wokwi-bollard-bench/project.json':role+'/project.json',import.meta.url),'utf8'));const b=new BenchState(role,project.url);b.sleep();return [role,b];})));
const demand=new ReferenceDemand(),browsers=new Map(),abort=new AbortController();let stopping=false,resourcePaused=false;
const wait=ms=>delay(ms,null,{signal:abort.signal}).catch(()=>{});
const server=createRuntimeServer(benches,{onView:role=>demand.touch(role)});
process.on('message',message=>{if(message?.type!=='resource-mode'||typeof message.paused!=='boolean')return;resourcePaused=message.paused;
 void (async()=>{if(resourcePaused){for(const [role,b]of Object.entries(benches)){b.sleep();b.setPaused(demand.active(role));}await Promise.all([...browsers.values()].map(b=>b.close()));}else for(const b of Object.values(benches))b.setPaused(false);
 process.send?.({type:'resource-mode-result',id:message.id});})().catch(error=>process.send?.({type:'resource-mode-result',id:message.id,error:error.message}));});
await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(Number(process.env.CONTROLLER_PORT||4178),process.env.CONTROLLER_HOST||'127.0.0.1',resolve);});
console.log('Reference viewer ready. ESP32 benches start only while their component is viewed; idle browsers close after 45 seconds.');
async function bounded(promise,ms,label){let timer;try{return await Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error(label)),ms);})]);}finally{clearTimeout(timer);}}
async function worker(role,bench){
 while(!stopping){
  if(resourcePaused||!demand.active(role)){bench.setPaused(resourcePaused&&demand.active(role));await wait(500);continue;}
  let browser,watchdog,failed=false;
  try{
   bench.begin();console.log(role+': viewer requested ESP32 session '+bench.instance);
   browser=await chromium.launch({headless:true,args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});browsers.set(role,browser);
   if(stopping||resourcePaused||!demand.active(role))throw Error('Reference yielded before startup');
   let closing=false;watchdog=setInterval(()=>{if(!closing&&(stopping||resourcePaused||!demand.active(role))){closing=true;bench.sleep();bench.setPaused(resourcePaused&&demand.active(role));void browser.close().catch(()=>{});}},1000);
   const context=await browser.newContext({viewport:{width:1600,height:1000}}),page=await context.newPage();page.setDefaultTimeout(15000);
   await page.goto(bench.url,{waitUntil:'domcontentloaded',timeout:45000});
   await page.waitForFunction(()=>window.monaco?.editor.getModels().some(m=>m.uri.toString()==='vfs:sketch.ino')&&document.querySelector('#esp32'),null,{timeout:45000});
   if(process.env.WOKWI_SIM_CPU_MHZ)await prepareSimulationCpuLimit(page,Number(process.env.WOKWI_SIM_CPU_MHZ));
   await page.getByRole('button',{name:'Start the simulation',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('[class*="monitorContainer__"]')?.textContent.split(/[\r\n]+/).some(line=>{try{const p=JSON.parse(line);return p.check==='BOOT'&&p.result==='PASS';}catch{return false;}}),null,{timeout:600000});
   await page.evaluate(()=>{const monitor=document.querySelector('[class*="serialMonitor__"]'),panel=monitor?.parentElement?.parentElement;if(panel){panel.style.height='160px';panel.style.minHeight='160px';panel.style.flex='0 0 160px';}});
   await page.locator('#esp32').click({force:true});await page.keyboard.press('Escape');await page.keyboard.press('f');
   const cdp=await context.newCDPSession(page);let nextImage=0;
   console.log(role+': firmware booted; collecting real UART records.');
   while(!stopping&&!resourcePaused&&demand.active(role)){
    bench.observe(await bounded(page.evaluate(readSerialPackets,'role'),12000,'UART collection timed out'));
    if(Date.now()-(bench.lastSeenAt??bench.startedAt)>20000)throw Error('Firmware sequence stopped advancing');
    if(demand.captureActive(role)&&Date.now()>=nextImage){const shot=await bounded(cdp.send('Page.captureScreenshot',{format:'jpeg',quality:65,clip:{x:800,y:65,width:800,height:740,scale:1},captureBeyondViewport:false}),12000,'Circuit capture timed out');bench.capture(Buffer.from(shot.data,'base64'));nextImage=Date.now()+Number(process.env.CONTROLLER_CAPTURE_INTERVAL_MS||2500);}
    await wait(500);
   }
  }catch(error){if(!stopping&&!resourcePaused&&demand.active(role)){failed=true;bench.fail(error.message);console.error(role+': '+error.message);}}
  finally{clearInterval(watchdog);browsers.delete(role);await browser?.close().catch(()=>{});if(!failed){bench.sleep();bench.setPaused(resourcePaused&&demand.active(role));console.log(role+': reference browser closed; historical UART retained.');}}
  await wait(failed?15000:500);
 }
}
const jobs=Object.entries(benches).map(([role,bench])=>worker(role,bench));
async function close(){if(stopping)return;stopping=true;abort.abort();await Promise.all([...browsers.values()].map(b=>b.close().catch(()=>{})));await Promise.all(jobs);server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>close().then(()=>process.exit(0)));
await Promise.all(jobs);
