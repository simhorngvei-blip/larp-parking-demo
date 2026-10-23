import {createRequire} from 'node:module';
const require=createRequire(new URL('../../tools/mcp-node/package.json',import.meta.url));
const {chromium}=require('playwright');
const browser=await chromium.launch();
try{const page=await browser.newPage();await page.goto('http://127.0.0.1:5175/?view=journey');await page.getByRole('button',{name:'1. Arrive at entrance',exact:true}).waitFor({timeout:4000});console.log('Journey deep link passed');}finally{await browser.close();}
