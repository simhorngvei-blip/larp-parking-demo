import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Controller } from '../server/controller.mjs';

test('an unlock is preparing until physical movement completes', () => {
  const device = new Controller('V-01');
  assert.equal(device.unlock('c1', 600000).accepted, true);
  assert.equal(device.snapshot().position, 'MOVING_DOWN');
  device.tick(2000);
  assert.equal(device.snapshot().position, 'DOWN');
});
test('a car returns during clearance and prevents relocking', () => {
  const device = new Controller('V-01'); device.unlock('c1', 600000); device.tick(2000);
  device.observe(30); device.tick(3000); device.observe(250); device.tick(9000);
  device.observe(30); device.tick(15000);
  assert.equal(device.snapshot().position, 'DOWN');
  assert.equal(device.snapshot().occupancy, 'PRESENT');
});
test('uncertain sensor values cannot authorize raising', () => {
  for (const distance of [50, 150, null]) {
    const device = new Controller('V-01'); device.unlock('c1', 1000); device.tick(2000);
    device.observe(distance); device.tick(20000);
    assert.equal(device.snapshot().position, 'DOWN');
    assert.equal(device.snapshot().occupancy, 'UNCERTAIN');
  }
});
test('a vacant bay relocks locally after bounded hold expiry', () => {
  const device = new Controller('V-01'); assert.equal(device.unlock('c1', 1000).accepted, true); device.tick(2500);
  assert.equal(device.snapshot().position, 'DOWN'); device.tick(11500);
  assert.equal(device.snapshot().position, 'UP');
  assert.equal(device.snapshot().state, 'LOCKED_VACANT');
});
test('duplicate command does not renew its local hold', () => {
  const device = new Controller('V-01'); assert.equal(device.unlock('c1', 1000).accepted, true); device.tick(2500);
  device.unlock('c1', 600000); device.tick(12000);
  assert.equal(device.snapshot().position, 'UP');
});
test('a jam is a fault rather than successful unlock', () => {
  const device = new Controller('V-01'); device.setFault('jam'); device.unlock('c1', 1000); device.tick(6000);
  assert.equal(device.snapshot().position, 'UP');
  assert.equal(device.snapshot().health, 'MOTOR_FAULT');
});
test('emergency reset never raises an occupied bay', () => {
  const device = new Controller('V-01'); device.emergency(true); device.tick(2000);
  device.observe(30); device.tick(3000); device.emergency(false); device.tick(15000);
  assert.equal(device.snapshot().position, 'DOWN');
  assert.equal(device.snapshot().mode, 'RECOVERY_REQUIRED');
});
test('an obstruction during raising stops movement', () => {
  const device = new Controller('V-01'); device.unlock('c1', 1000); device.tick(12000);
  device.observe(30); device.tick(1000);
  assert.equal(device.snapshot().position, 'UNKNOWN');
  assert.equal(device.snapshot().health, 'SENSOR_FAULT');
});
test('maintenance recovery preserves actual vehicle presence', () => {
  const device = new Controller('V-01'); device.emergency(true); device.tick(2000);
  device.observe(30); device.tick(3000); device.emergency(false); device.setFault('clear'); device.tick(15000);
  assert.equal(device.snapshot().position, 'DOWN');
  assert.equal(device.snapshot().occupancy, 'PRESENT');
});
test('a clear bay recovers from emergency through the usual clearance interval', () => {
  const device=new Controller('V-01');device.emergency(true);device.tick(2000);device.emergency(false);device.setFault('clear');device.tick(12000);
  assert.equal(device.snapshot().position,'UP');
});
test('sensor fault recovery requires a valid observation', () => {
  const device=new Controller('V-01');device.setFault('sensor');device.setFault('clear');
  assert.equal(device.snapshot().health,'SENSOR_FAULT');
  device.observe(250);device.setFault('clear');
  assert.equal(device.snapshot().health,'HEALTHY');
});
