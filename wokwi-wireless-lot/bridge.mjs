import {fileURLToPath} from 'node:url';import {startBridge} from '../wokwi-integrated/bridge.mjs';
export const PROJECT_URL='https://wokwi.com/projects/478327634016887809';
export const startWirelessBridge=options=>startBridge({headless:true,projectUrl:PROJECT_URL,fit:true,captureClip:{x:850,y:80,width:850,height:840},...options});
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const bridge=await startWirelessBridge({viewerPort:4177});console.log('Wireless packet-model circuit: '+PROJECT_URL);console.log('App + circuit: '+bridge.viewer.url);
 for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{await bridge.close();process.exit(0);});
}
