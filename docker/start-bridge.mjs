import {readFile} from 'node:fs/promises';
import {startFullLotBridge} from '../wokwi-parking-lot/bridge.mjs';

// A fresh API and circuit must start together. Do not silently retry a new
// circuit instance against a partially completed journey.
const key=(await readFile(new URL('../parking-prototype/data/wokwi-bridge-key',import.meta.url),'utf8')).trim();
const bridge=await startFullLotBridge({
 ...(process.env.WOKWI_PROJECT_URL?{projectUrl:process.env.WOKWI_PROJECT_URL}:{}),
 base:process.env.PARKING_API_URL||'http://api:4176',key,
 appUrl:process.env.PARKING_APP_URL||'http://web',
 viewerAppUrl:process.env.PARKING_PUBLIC_URL||'http://localhost:8080',
 viewerHost:'0.0.0.0',viewerPort:4177
});
console.log('Nine-bay Wokwi bridge ready; open '+(process.env.PARKING_PUBLIC_URL||'http://localhost:8080')+'/circuit/');
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await bridge.close();process.exit(0);});
