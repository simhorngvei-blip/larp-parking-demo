import test from 'node:test';
import {setTimeout as delay} from 'node:timers/promises';
import {createApplication} from '../server/http.mjs';
test('closing a live application drains worker feedback before closing its database',async()=>{
 for(let n=0;n<16;n++){const app=await createApplication();await new Promise(r=>app.server.listen(0,'127.0.0.1',r));await delay(240+n%4*3);await app.close();await delay(30);}
});
