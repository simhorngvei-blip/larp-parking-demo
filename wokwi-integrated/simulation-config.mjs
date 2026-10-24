// Executed inside the Wokwi page. This caps emulated instruction throughput;
// it does not change the firmware or peripheral timing. Fail closed on bad input.
export function setSimulationCpuLimit(mhz){
 if(typeof mhz!=='number'||!Number.isFinite(mhz)||mhz<0.25||mhz>8)throw Error('Simulation CPU limit must be 0.25 through 8 MHz');
 const model=globalThis.monaco?.editor.getModels().find(m=>m.uri.toString()==='vfs:diagram.json');
 if(!model)throw Error('Wokwi diagram model is not available');
 const diagram=JSON.parse(model.getValue());
 const boards=(diagram.parts||[]).filter(p=>/^board-esp32|^wokwi-esp32/.test(p.type));
 if(!boards.length)throw Error('No ESP32 processor found in circuit');
 for(const board of boards)board.attrs={...board.attrs,cpuFrequency:String(mhz)};
 model.setValue(JSON.stringify(diagram,null,2));return {mhz,boards:boards.length};
}
export async function prepareSimulationCpuLimit(page,mhz){
 await page.getByText('diagram.json',{exact:true}).click();
 await page.waitForFunction(()=>globalThis.monaco?.editor.getModels().some(m=>m.uri.toString()==='vfs:diagram.json'));
 return page.evaluate(setSimulationCpuLimit,mhz);
}
// Pausing firmware alone leaves editor/diagram animation work running. Freeze
// only the independent reference page, after its simulator accepted Pause.
export async function setReferenceSimulationPaused({page,cdp},paused){
 if(!paused)await cdp.send('Page.setWebLifecycleState',{state:'active'});
 await page.getByRole('button',{name:paused?'Pause':'Resume',exact:true}).click({timeout:12000});
 if(paused)await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
}
// textContent avoids the forced layout caused by document.body.innerText.
// Keep complete recent lines; a partially emitted packet is ignored until complete.
export function readSerialPackets(key){
 const text=globalThis.document.querySelector('[class*="monitorContainer__"]')?.textContent||'';
 return text.split(/[\r\n]+/).slice(-250).filter(line=>line.startsWith('{"'+key+'":')).flatMap(line=>{try{return [JSON.parse(line)];}catch{return [];}});
}
export function setSimulationTelemetryInterval(interval){
 if(!Number.isInteger(interval)||interval<100||interval>1000)throw Error('Telemetry interval must be 100 through 1000 milliseconds');
 const model=globalThis.monaco?.editor.getModels().find(m=>m.uri.toString()==='vfs:sketch.ino');
 if(!model)throw Error('Master sketch model is not available');
 const source=model.getValue(),marker='nowMs-lastOutput<1000||usb.queued()>128';
 if(!source.includes(marker))throw Error('Expected master heartbeat source was not found; inspect upstream firmware');
 model.setValue(source.replace(marker,'nowMs-lastOutput<'+interval+'||usb.queued()>128'));
 return {intervalMs:interval};
}
