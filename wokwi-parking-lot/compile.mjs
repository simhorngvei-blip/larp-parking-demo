import {spawnSync} from 'node:child_process';
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
import path from 'node:path';import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url)),compiler=path.resolve(root,'../tools/arduino-cli');
mkdirSync(path.join(root,'build'),{recursive:true});mkdirSync(path.join(root,'evidence'),{recursive:true});
const result=spawnSync(path.join(compiler,'arduino-cli.exe'),['compile','--fqbn','arduino:avr:mega','--warnings','all','--build-path',path.join(root,'build'),'--output-dir',path.join(root,'build'),path.join(root,'firmware/full_lot')],{encoding:'utf8',env:{...process.env,ARDUINO_DIRECTORIES_DATA:path.join(compiler,'data'),ARDUINO_DIRECTORIES_DOWNLOADS:path.join(compiler,'downloads'),ARDUINO_DIRECTORIES_USER:path.join(compiler,'sketchbook')}});
const log=(result.stdout||'')+(result.stderr||'');writeFileSync(path.join(root,'evidence/compile.log'),log);process.stdout.write(log);if(result.status!==0)process.exit(result.status||1);copyFileSync(path.join(root,'build/full_lot.ino.hex'),path.join(root,'evidence/full-lot.hex'));
