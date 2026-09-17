import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SvedaAuthenticationError, SvedaClient, startHostSession } from '../src/index.js';

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('issues embed tokens with host credentials', async () => {
  /** @type {Array<{url: string, options: RequestInit}>} */
  const requests = [];

  const client = new SvedaClient({
    baseUrl: 'https://sveda.test',
    hostApiKey: 'host-secret',
    fetch: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      return jsonResponse({
        token: 'sveda_embed_test',
        visitor_id: 'visitor-1',
        expires_in: 3600,
      });
    },
  });

  const response = await client.embed.createToken({
    visitorId: 'visitor-1',
    hostMcpUrl: 'https://app.test/mcp/sveda',
    hostMcpToken: 'mcp-token',
  });

  assert.equal(response.token, 'sveda_embed_test');
  assert.equal(response.visitorId, 'visitor-1');
  assert.equal(response.expiresIn, 3600);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].url, 'https://sveda.test/sveda/embed/token');
  assert.equal(requests[0].options.headers.Authorization, 'Bearer host-secret');
  assert.equal(requests[0].options.headers.Accept, 'application/json');
  assert.deepEqual(JSON.parse(String(requests[0].options.body)), {
    visitor_id: 'visitor-1',
    host_mcp_url: 'https://app.test/mcp/sveda',
    host_mcp_token: 'mcp-token',
  });
});

test('streams chat events and skips done', async () => {
  /** @type {Array<{url: string, options: RequestInit}>} */
  const requests = [];
  const client = new SvedaClient({
    baseUrl: 'https://sveda.test',
    embedToken: 'embed-token',
    fetch: async (url, options = {}) => {
      requests.push({ url: String(url), options });
      return new Response(
        'data: {"type":"message.start"}\n\ndata: {"type":"text.delta","delta":"Hi"}\n\ndata: [DONE]\n\n',
        {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        },
      );
    },
  });

  const events = [];
  for await (const event of client.chat.createStreamed({
    messages: [{ role: 'user', content: 'Hello' }],
    chatId: 'chat-1',
  })) {
    events.push(event);
  }

  assert.equal(events.length, 2);
  assert.equal(events[0].type, 'message.start');
  assert.equal(events[1].type, 'text.delta');
  assert.equal(events[1].delta, 'Hi');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].url, 'https://sveda.test/sveda/stream');
  assert.equal(requests[0].options.headers.Accept, 'application/vnd.sveda.stream+json');
  assert.equal(requests[0].options.headers['X-Sveda-Embed-Token'], 'embed-token');
  assert.deepEqual(JSON.parse(String(requests[0].options.body)), {
    messages: [{ role: 'user', content: 'Hello' }],
    chatId: 'chat-1',
  });
});

test('fetches message and histories', async () => {
  const client = new SvedaClient({
    baseUrl: 'https://sveda.test',
    embedToken: 'embed-token',
    fetch: async (url, options = {}) => {
      const path = String(url).replace('https://sveda.test', '');
      const method = options.method;

      if (method === 'POST' && path === '/sveda/message') {
        return jsonResponse({
          explanation: 'Hello',
          tokens_used: 12,
          chat_id: 'chat-1',
        });
      }

      if (method === 'GET' && path === '/sveda/chat-histories') {
        return jsonResponse({ histories: [] });
      }

      if (method === 'PATCH' && path === '/sveda/chat-histories/chat-1') {
        return jsonResponse({ success: true });
      }

      if (method === 'DELETE' && path === '/sveda/chat-histories/chat-1') {
        return jsonResponse({ success: true });
      }

      return jsonResponse({});
    },
  });

  const message = await client.chat.create({
    messages: [{ role: 'user', content: 'Hello' }],
    chatId: 'chat-1',
  });

  assert.equal(message.explanation(), 'Hello');
  assert.equal(message.tokensUsed(), 12);
  assert.equal(message.chatId(), 'chat-1');

  const histories = await client.histories.list();
  assert.ok('histories' in histories);

  const renamed = await client.histories.rename('chat-1', 'New title');
  assert.equal(renamed.success, true);

  const deleted = await client.histories.delete('chat-1');
  assert.equal(deleted.success, true);
});

test('startHostSession returns origin token expires_in appearance', async () => {
  const session = await startHostSession({
    baseUrl: 'https://sveda.test/',
    hostApiKey: 'host-secret',
    visitorId: 'express-playground',
    fetch: async (url, options = {}) => {
      assert.equal(String(url), 'https://sveda.test/sveda/embed/token');
      assert.equal(options.headers.Authorization, 'Bearer host-secret');
      assert.deepEqual(JSON.parse(String(options.body)), {
        visitor_id: 'express-playground',
      });
      return jsonResponse({
        token: 'sveda_embed_test',
        visitor_id: 'express-playground',
        expires_in: 3600,
        appearance: { accent: 'teal' },
      });
    },
  });

  assert.deepEqual(session, {
    origin: 'https://sveda.test',
    token: 'sveda_embed_test',
    expires_in: 3600,
    appearance: { accent: 'teal' },
  });
});

test('maps 401 to authentication error', async () => {
  const client = new SvedaClient({
    baseUrl: 'https://sveda.test',
    hostApiKey: 'bad',
    fetch: async () => jsonResponse({ message: 'nope' }, 401),
  });

  await assert.rejects(
    () => client.embed.createToken({ visitorId: 'visitor-1' }),
    (error) => {
      assert.equal(error instanceof SvedaAuthenticationError, true);
      assert.match(error.message, /401/);
      return true;
    },
  );
});
