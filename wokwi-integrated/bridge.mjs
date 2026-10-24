import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {createViewer} from './viewer.mjs';
import {createCommandDispatcher} from './command-dispatcher.mjs';
import {prepareSimulationCpuLimit,readSerialPackets,setSimulationTelemetryInterval} from './simulation-config.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const requireTools=createRequire(path.join(root,'../tools/mcp-node/package.json'));
const {chromium}=requireTools('playwright');
export const PROJECT_URL='https://wokwi.com/projects/478131710214850561';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function startBridge({base='http://127.0.0.1:4176',key,headless=false,record=false,appUrl='http://127.0.0.1:5175',viewerAppUrl=appUrl,viewerHost='127.0.0.1',viewerPort=0,projectUrl=PROJECT_URL,fit=false,captureIntervalMs=500,captureClip={x:850,y:80,width:850,height:720}}={}){
 key=key||readFileSync(path.join(root,'../parking-prototype/data/wokwi-bridge-key'),'utf8').trim();
 mkdirSync(path.join(root,'evidence'),{recursive:true});
 const browser=await chromium.launch({headless,args:['--disable-background-timer-throttling','--disable-backgrounding-occluded-windows','--disable-renderer-backgrounding']});
 const context=await browser.newContext({viewport:{width:1700,height:1000},...(record?{recordVideo:{dir:path.join(root,'evidence'),size:{width:1700,height:1000}}}:{})});
 const page=await context.newPage();const instance=randomUUID(),consumedAcks=new Set();let lastFrame=null,acks=[],stopped=false,transportError='';
 try{
  await page.goto(projectUrl,{waitUntil:'domcontentloaded'});
  // The SSR play button exists before its client handler is hydrated.
  await page.waitForFunction(()=>window.monaco?.editor.getModels().some(m=>m.uri.toString()==='vfs:sketch.ino')&&document.querySelector('#bayMotor'),null,{timeout:Number(process.env.WOKWI_HYDRATION_TIMEOUT_MS||30000)});
  if(process.env.WOKWI_SIM_CPU_MHZ)await prepareSimulationCpuLimit(page,Number(process.env.WOKWI_SIM_CPU_MHZ));
  if(process.env.WOKWI_TELEMETRY_INTERVAL_MS)await page.evaluate(setSimulationTelemetryInterval,Number(process.env.WOKWI_TELEMETRY_INTERVAL_MS));
  if(fit){await page.getByRole('button',{name:'Zoom, grid, and more',exact:true}).click();await page.getByText('Fit',{exact:true}).click();await page.keyboard.press('Escape');}
  await page.getByRole('button',{name:'Start the simulation',exact:true}).click({timeout:30000});
  // Public Wokwi builds can queue for several minutes before firmware starts.
  // Keep the circuit unavailable until actual telemetry, rather than restarting
  // the browser every two minutes and losing its place in the compile queue.
  const startupMs=Number(process.env.WOKWI_STARTUP_TIMEOUT_MS||600000);
  await page.waitForFunction(()=>document.body.innerText.includes('"kind":"telemetry"'),null,{timeout:Number.isFinite(startupMs)&&startupMs>=1000?startupMs:600000});
  if(fit){
   await page.evaluate(()=>{const monitor=document.querySelector('[class*="serialMonitor__"]');const panel=monitor?.parentElement?.parentElement;if(panel){panel.style.height='70px';panel.style.minHeight='70px';panel.style.flex='0 0 70px';}});
   // Fit the full lot after the serial panel has been compacted.
   await page.locator('#bayMotor').click({force:true});await page.keyboard.press('Escape');await page.keyboard.press('f');
  }
 }catch(error){writeFileSync(path.join(root,'evidence/bridge-start-failure.txt'),(await page.locator('body').innerText())+'\n'+error.message);await page.screenshot({path:path.join(root,'evidence/bridge-start-failure.png'),fullPage:true});await browser.close();throw error;}
 async function apply(command){
  if(command.op==='command'){
   const input=page.locator('input:not([type]), input[type=text]').last();
   await input.fill(`${command.id} ${command.verb} ${command.bayId??''} ${command.value??''}`,{timeout:3000});await input.press('Enter');
   // Pace UART requests by actual firmware acknowledgements. A burst can overrun
   // the AVR's 64-byte RX buffer while it is emitting full-lot telemetry.
   await page.waitForFunction(id=>document.querySelector('[class*="monitorContainer__"]')?.textContent.includes('"kind":"ack","id":"'+id+'"'),command.id,{timeout:4000});
  }else if(command.op==='distance'){
   const sensorId=command.bayId&&command.bayId!=='R-102'?'sensor'+command.bayId.replace('-',''):'baySensor';
   const range=page.locator('input[type=range]').first();
   if(await range.count()===0)await page.locator('#'+sensorId).click({force:true,timeout:3000});
   await range.evaluate((e,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(value));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},command.value,{timeout:3000});
   await page.locator('#'+sensorId).click({force:true,timeout:3000});
   acks.push({id:command.id,accepted:1});
  }else if(command.op==='jam'){
   const element=page.locator('#plant'+command.bayId.replace('-',''));await element.click({force:true,timeout:3000});
   await page.locator('input[type=range]').first().evaluate((e,value)=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,String(value));e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));},command.value,{timeout:3000});
   await element.click({force:true,timeout:3000});acks.push({id:command.id,accepted:1});
  }else if(['entryBeam','exitBeam','emergency'].includes(command.op)){
   const id=command.op;const desired=command.op==='emergency'?(command.active?1:0):(command.blocked?0:1);
   const element=page.locator('#'+id);const value=await element.evaluate(e=>Number(e.value));if(value!==desired)await element.click({force:true,timeout:3000});acks.push({id:command.id,accepted:1});
  }else throw new Error('Unsupported bridge operation '+command.op);
 }
 const commands=createCommandDispatcher(apply,error=>{transportError=error.message;writeFileSync(path.join(root,'evidence/bridge-status.json'),JSON.stringify({connected:false,error:transportError}));});
 async function tick(){
  const frames=await page.evaluate(readSerialPackets,'kind');
  for(const frame of frames){if(frame.kind==='telemetry'&&(!lastFrame||frame.seq>lastFrame.seq))lastFrame=frame;if(frame.kind==='ack'&&!consumedAcks.has(frame.id)){consumedAcks.add(frame.id);acks.push(frame);}}
  const sentAcks=acks.splice(0);
  let data;try{const response=await fetch(base+'/api/wokwi/poll',{method:'POST',headers:{'content-type':'application/json','x-demo-actor':'management','x-bridge-key':key},body:JSON.stringify({instance,frame:lastFrame,acks:sentAcks})});data=await response.json();if(!response.ok)throw new Error(data.error||'Bridge rejected');}catch(error){acks.unshift(...sentAcks);throw error;}
  commands.enqueue(data.commands);
  return lastFrame;
 }
 await tick();
 const loop=(async()=>{while(!stopped){try{await tick();transportError='';}catch(error){transportError=error.message;if(!browser.isConnected())stopped=true;writeFileSync(path.join(root,'evidence/bridge-status.json'),JSON.stringify({connected:false,error:transportError}));}if(!stopped)await sleep(200);}})();
 const appPage=await context.newPage(),journeyAppUrl=new URL(appUrl);journeyAppUrl.searchParams.set('view','journey');await appPage.goto(journeyAppUrl.href);await appPage.bringToFront();
 let viewer;
 try{viewer=await createViewer({port:viewerPort,host:viewerHost,appUrl:viewerAppUrl,state:async()=>{const response=await fetch(base+'/api/state');if(!response.ok)throw new Error('App API unavailable');return await response.json();}});}
 catch(error){stopped=true;await loop;await browser.close();throw error;}
 // Capture the circuit through Chromium directly: remote web fonts must not block live canvas frames.
 const captureSession=await context.newCDPSession(page);
 const captureLoop=(async()=>{while(!stopped){try{
  // Fixed engine viewport: capture its simulation pane, excluding the source editor.
  const shot=await captureSession.send('Page.captureScreenshot',{format:'jpeg',quality:70,clip:{...captureClip,scale:1},captureBeyondViewport:false});
  viewer.publish(Buffer.from(shot.data,'base64'));
 }catch(error){writeFileSync(path.join(root,'evidence/capture-error.json'),JSON.stringify({at:new Date().toISOString(),error:error.message}));if(!browser.isConnected())stopped=true;}if(!stopped)await sleep(captureIntervalMs);}})();
 return {browser,context,page,appPage,viewer,get frame(){return lastFrame;},get error(){return transportError;},close:async()=>{stopped=true;await Promise.all([loop,captureLoop,commands.close()]);await viewer.close();await context.close();await browser.close();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 process.env.WOKWI_HEADLESS='1';
 const bridge=await startBridge({headless:true,viewerPort:4177});console.log('Connected Wokwi circuit: '+PROJECT_URL);console.log('Control the tenant journey at http://127.0.0.1:5175 — Live journey');
 let display;
 console.log('App and live circuit together: '+bridge.viewer.url);
 if(process.env.WOKWI_SHOW_VIEWER==='1'){
  display=await chromium.launch({headless:false,args:['--start-maximized']});const displayContext=await display.newContext({viewport:null});const displayPage=await displayContext.newPage();await displayPage.goto(bridge.viewer.url);
 }
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await display?.close();await bridge.close();process.exit(0);});
}

