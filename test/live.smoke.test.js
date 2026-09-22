import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { SvedaClient } from '../src/client.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const contract = JSON.parse(readFileSync(resolve(root, 'contracts/sidecar.v1.json'), 'utf8'));

function liveEnv() {
  const baseUrl = (process.env.SVEDA_BASE_URL ?? '').replace(/\/$/, '');
  const hostKey = (process.env.SVEDA_HOST_KEY ?? '').trim();
  if (!baseUrl || !hostKey) {
    return null;
  }
  return { baseUrl, hostKey };
}

test('live smoke: health, message, stream, histories', async (t) => {
  const env = liveEnv();
  if (!env) {
    t.skip('SVEDA_BASE_URL and SVEDA_HOST_KEY are required for live smoke tests');
    return;
  }

  const health = await fetch(`${env.baseUrl}/sveda/health`);
  assert.equal(health.ok, true);
  const ready = await fetch(`${env.baseUrl}/sveda/ready`);
  assert.equal(ready.ok, true);

  const host = new SvedaClient({ baseUrl: env.baseUrl, hostApiKey: env.hostKey });
  const token = await host.embed.createToken({ visitorId: 'sdk-compat-node' });
  assert.match(token.token, /^sveda_embed_/);

  const embed = new SvedaClient({ baseUrl: env.baseUrl, embedToken: token.token });
  const chatId = 'sdk-compat-node';
  const types = [];
  for await (const event of embed.chat.createStreamed({
    prompt: 'compat stream',
    chatId,
    messages: [{ id: 'm1', role: 'user', content: 'compat stream' }],
  })) {
    types.push(event.type);
  }
  assert.ok(types.length > 0);
  assert.ok(types.some((type) => contract.streamEvents.includes(type)));

  const message = await embed.chat.create({
    prompt: 'compat smoke',
    chatId: `${chatId}-json`,
    messages: [{ id: 'm2', role: 'user', content: 'compat smoke' }],
  });
  for (const key of contract.message.responseRequired) {
    assert.ok(message.payload[key] !== undefined, `missing ${key}`);
  }

  const histories = await embed.histories.list();
  assert.ok(histories[contract.histories.listKey] !== undefined);
});
