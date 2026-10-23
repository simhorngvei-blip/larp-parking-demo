import {spawnSync} from 'node:child_process';
import {copyFile,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
const build=spawnSync(process.execPath,['node_modules/vite/bin/vite.js','build','--config','vite.saas.config.ts'],{cwd:root,stdio:'inherit'});
if(build.status!==0)process.exit(build.status||1);
await copyFile(new URL('../artifacts/saas-site/website/index.html',import.meta.url),new URL('../artifacts/saas-site/index.html',import.meta.url));
await cp(new URL('../public/licenses/',import.meta.url),new URL('../artifacts/saas-site/licenses/',import.meta.url),{recursive:true});
console.log('Standalone SaaS export: artifacts/saas-site (demo links default to localhost:8080).');
