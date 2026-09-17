import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SSE_DONE_LINE, StreamParser } from '../src/stream-parser.js';

test('parses stream events and skips done', async () => {
  const content = [
    ': connected',
    '',
    'data: {"type":"message.start"}',
    '',
    'data: {"type":"text.delta","delta":"Hello"}',
    '',
    'data: {"type":"message.end","finishReason":"stop"}',
    '',
    'data: [DONE]',
    '',
  ].join('\n');

  const events = [];
  for await (const event of new StreamParser().iterate(content)) {
    events.push(event);
  }

  assert.equal(SSE_DONE_LINE, 'data: [DONE]');
  assert.equal(events.length, 3);
  assert.equal(events[0].type, 'message.start');
  assert.equal(events[1].type, 'text.delta');
  assert.equal(events[1].delta, 'Hello');
  assert.equal(events[2].type, 'message.end');
});

test('ignores invalid lines', async () => {
  const events = [];
  for await (const event of new StreamParser().iterate(
    'event: ping\ndata: not-json\ndata: {"type":"unknown.event"}\n',
  )) {
    events.push(event);
  }

  assert.deepEqual(events, []);
});
