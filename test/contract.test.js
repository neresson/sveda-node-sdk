import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contractPath = resolve(root, 'contracts/sidecar.v1.json');

function loadContract() {
  return JSON.parse(readFileSync(contractPath, 'utf8'));
}

test('sidecar contract locks HTTP surface', () => {
  const contract = loadContract();
  assert.equal(contract.version, '1.0');
  assert.equal(contract.prefix, '/sveda');
  assert.equal(contract.accept.svedaStream, 'application/vnd.sveda.stream+json');
  assert.ok(contract.headers.inbound.includes('Authorization'));
  assert.ok(contract.headers.inbound.includes('X-Sveda-Embed-Token'));
  const paths = new Set(contract.routes.map((route) => `${route.method} ${route.path}`));
  for (const required of [
    'POST /sveda/stream',
    'POST /sveda/message',
    'GET /sveda/chat-histories',
    'POST /sveda/embed/token',
  ]) {
    assert.ok(paths.has(required), `missing route ${required}`);
  }
});
