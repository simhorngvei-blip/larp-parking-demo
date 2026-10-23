import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, cpSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';

// A hardcoded IPv4 loopback bind would make the configured IPv6 endpoint fail.
test('API entry point listens on the configured network interface', { timeout: 15000 }, async () => {
  const reservation = createServer();
  reservation.listen(0, '::1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const folder = mkdtempSync(path.join(tmpdir(), 'baypilot-container-'));
  cpSync(new URL('../server', import.meta.url), path.join(folder, 'server'), { recursive: true });
  const child = spawn(process.execPath, ['server/http.mjs'], {
    cwd: folder,
    env: { ...process.env, PARKING_HOST: '::1', PARKING_PORT: String(port), PARKING_DB: path.join(folder, 'parking.sqlite') },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let errors = '';
  child.stderr.on('data', chunk => { errors += chunk; });
  try {
    await Promise.race([
      once(child.stdout, 'data'),
      once(child, 'exit').then(([code]) => { throw new Error(`API exited ${code}: ${errors}`); }),
      new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('API startup timed out')), 8000); timer.unref(); }),
    ]);
    const response = await fetch(`http://[::1]:${port}/api/state`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).bays.length, 9);
  } finally {
    if (child.exitCode === null) { const closed=once(child, 'close'); child.kill(); await closed; }
    const target=path.resolve(folder);
    if(path.dirname(target)!==path.resolve(tmpdir())||!path.basename(target).startsWith('baypilot-container-'))throw new Error('Refusing cleanup outside the test temporary directory');
    // Exit precedes stdio closure. Async cleanup lets Windows finish releasing
    // child/pipe handles between retries while the full suite is running.
    await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
});
