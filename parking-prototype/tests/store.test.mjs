import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../server/store.mjs';

const devices = ['R-102','V-01','V-02','V-03','V-04','T-01'].map(id => ({id,position:'UP',occupancy:'CLEAR',health:'HEALTHY',mode:'NORMAL'}));
test('two simultaneous assignments cannot share a bay', async () => {
  const store = new Store(':memory:'); store.setDevices(devices);
  const a = store.register('guard', {name:'Guest A',plate:'AAA 1234',unit:'10-02'});
  const b = store.register('guard', {name:'Guest B',plate:'BBB 1234',unit:'10-02'});
  const assignments = await Promise.all([Promise.resolve().then(() => store.assign('guard', a.id)), Promise.resolve().then(() => store.assign('guard', b.id))]);
  assert.deepEqual(assignments.map(item => item.bayId).sort(), ['V-01','V-02']);
  store.close();
});
test('resident cannot allocate visitor parking', () => {
  const store = new Store(':memory:'); store.setDevices(devices);
  assert.throws(() => store.register('resident',{name:'Guest',plate:'ABC 1234',unit:'10-02'}), /guard/i);
  store.close();
});
test('published policy applies only to new visits and requires host approval', () => {
  const store = new Store(':memory:'); store.setDevices(devices);
  const oldVisit = store.register('guard',{name:'Old guest',plate:'OLD 1234',unit:'10-02'});
  store.publish('management',{requireHost:true,eligible:['V-02','V-03'],arrivalMinutes:5,visitMinutes:60});
  const newVisit = store.register('guard',{name:'New guest',plate:'NEW 1234',unit:'10-02'});
  assert.equal(store.assign('guard',oldVisit.id).bayId,'V-01');
  assert.throws(() => store.assign('guard',newVisit.id), /host approval/i);
  store.approve('guard',newVisit.id);
  assert.equal(store.assign('guard',newVisit.id).bayId,'V-02');
  store.close();
});
test('visitor policy cannot expose a resident bay', () => {
  const store = new Store(':memory:');
  assert.throws(() => store.publish('management',{requireHost:false,eligible:['R-102'],arrivalMinutes:5,visitMinutes:60}), /visitor bays/i);
  store.close();
});
test('duplicate assignment reuses reservation instead of claiming another bay', () => {
  const store = new Store(':memory:'); store.setDevices(devices);
  const visit = store.register('guard',{name:'Guest',plate:'ABC 1234',unit:'10-02'});
  const original = store.assign('guard',visit.id);
  assert.equal(original.bayId,'V-01');
  assert.equal(store.assign('guard',visit.id).id,original.id);
  store.close();
});
test('offline or occupied bays are never considered available', () => {
  const store = new Store(':memory:');
  store.setDevices(devices.map(device => ({...device,health:device.id==='V-01'?'OFFLINE':device.health,occupancy:device.id==='V-02'?'PRESENT':'CLEAR'})));
  const visit = store.register('guard',{name:'Guest',plate:'ABC 1234',unit:'10-02'});
  assert.equal(store.assign('guard',visit.id).bayId,'V-03'); store.close();
});
test('a client draft version cannot overwrite the server publication version', () => {
  const store=new Store(':memory:');
  const result=store.publish('management',{...store.policy(),requireHost:true});
  assert.equal(result.version,2);
  assert.equal(store.policy().version,2);
  store.close();
});
