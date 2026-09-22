import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  HostManager,
  MODE_READ,
  executeHostMcpRequest,
  handleHostMcpRequest,
  startHostSession,
} from '../src/index.js';

const echoHostTool = {
  name: 'echo_message',
  description: 'Echo a message back.',
  mode: MODE_READ,
  domain: 'demo',
  schema() {
    return {
      message: { type: 'string', description: 'Message to echo', required: true },
    };
  },
  handle(arguments_) {
    return {
      success: true,
      data: { message: String(arguments_.message ?? '') },
    };
  },
};

function mcpRequest(host, token, method, params = {}, id = 1) {
  const headers = {};
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  return handleHostMcpRequest(
    host,
    {
      jsonrpc: '2.0',
      id,
      method,
      params,
    },
    {
      user: { id: 'user-1' },
      headers,
    },
  );
}

test('unauthenticated MCP tools/list is rejected at middleware layer', async () => {
  const host = new HostManager({
    baseUrl: 'https://sveda.test',
    hostApiKey: 'host-secret',
  });
  host.resolveToolsUsing(() => [echoHostTool]);

  const auth = await host.authenticateBearerToken('');
  assert.equal(auth, null);
});

test('initialize reports configured name and instructions', async () => {
  const host = new HostManager({
    serverName: 'Playground Feed',
    instructions: 'Feed tools for the current user.',
  });
  host.resolveToolsUsing(() => [echoHostTool]);

  const token = host.defaultMintMcpToken({ id: 'user-1' });
  const response = await mcpRequest(host, token, 'initialize', {
    protocolVersion: '2025-11-25',
    capabilities: {},
    clientInfo: { name: 'sveda-test', version: '0.1.0' },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.result.serverInfo.name, 'Playground Feed');
  assert.equal(response.body.result.instructions, 'Feed tools for the current user.');
});

test('authenticated user can list and call tools', async () => {
  const host = new HostManager();
  host.resolveToolsUsing(() => [echoHostTool]);
  const token = host.defaultMintMcpToken({ id: 'user-1' });

  const list = await mcpRequest(host, token, 'tools/list', { per_page: 250 });
  assert.equal(list.status, 200);

  const names = list.body.result.tools.map((tool) => tool.name);
  assert.ok(names.includes('echo_message'));

  const tool = list.body.result.tools.find((entry) => entry.name === 'echo_message');
  assert.equal(tool._meta.domain, 'demo');
  assert.equal(tool._meta.mode, 'read');

  const call = await mcpRequest(
    host,
    token,
    'tools/call',
    { name: 'echo_message', arguments: { message: 'hello' } },
    2,
  );
  assert.equal(call.status, 200);
  assert.equal(call.body.result.isError, false);

  const text = call.body.result.content[0].text;
  const decoded = JSON.parse(text);
  assert.equal(decoded.data.message, 'hello');
});

test('HostManager startSession sends MCP credentials to sidecar', async () => {
  /** @type {Array<Record<string, unknown>>} */
  const bodies = [];

  const host = new HostManager({
    baseUrl: 'http://127.0.0.1:8787',
    hostApiKey: 'host-secret',
    mcpUrl: 'https://app.test/mcp/sveda',
    fetch: async (_url, options = {}) => {
      bodies.push(JSON.parse(String(options.body)));
      return new Response(
        JSON.stringify({
          token: 'sveda_embed_test.token',
          visitor_id: 'host-1',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });
  host.resolveToolsUsing(() => [echoHostTool]);

  const session = await host.startSession({ id: 1 });

  assert.equal(session.origin, 'http://127.0.0.1:8787');
  assert.equal(session.token, 'sveda_embed_test.token');
  assert.equal(session.expires_in, 3600);
  assert.equal(bodies.length, 1);
  assert.equal(bodies[0].visitor_id, 'host-1');
  assert.equal(bodies[0].host_mcp_url, 'https://app.test/mcp/sveda');
  assert.equal(typeof bodies[0].host_mcp_token, 'string');
  assert.notEqual(bodies[0].host_mcp_token, '');
});

test('startHostSession accepts hostMcpUrl and mintMcpToken', async () => {
  const session = await startHostSession({
    baseUrl: 'https://sveda.test',
    hostApiKey: 'host-secret',
    visitorId: 'express-playground',
    hostMcpUrl: 'https://app.test/mcp/sveda',
    mintMcpToken: async () => 'minted-mcp-token',
    fetch: async (url, options = {}) => {
      assert.equal(String(url), 'https://sveda.test/sveda/embed/token');
      assert.deepEqual(JSON.parse(String(options.body)), {
        visitor_id: 'express-playground',
        host_mcp_url: 'https://app.test/mcp/sveda',
        host_mcp_token: 'minted-mcp-token',
      });
      return new Response(
        JSON.stringify({
          token: 'embed',
          visitor_id: 'express-playground',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });

  assert.equal(session.token, 'embed');
});

test('startHostSession delegates to HostManager', async () => {
  const host = new HostManager({
    baseUrl: 'https://sveda.test',
    hostApiKey: 'host-secret',
    mcpUrl: 'https://app.test/mcp/sveda',
    fetch: async () =>
      new Response(
        JSON.stringify({ token: 'embed', expires_in: 3600 }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  });

  const session = await startHostSession({
    host,
    user: { id: 'nestjs-playground' },
  });

  assert.equal(session.token, 'embed');
});

test('executeHostMcpRequest authenticates and dispatches JSON-RPC', async () => {
  const host = new HostManager();
  host.resolveToolsUsing(() => [echoHostTool]);
  const token = host.defaultMintMcpToken({ id: 'user-1' });

  const denied = await executeHostMcpRequest(host, {
    authorization: null,
    body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
  });
  assert.equal(denied.status, 401);

  const list = await executeHostMcpRequest(host, {
    authorization: `Bearer ${token}`,
    body: { jsonrpc: '2.0', id: 2, method: 'tools/list', params: { per_page: 250 } },
  });
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body.result.tools));
});

test('HostManager startSession sends policy on embed token mint', async () => {
  /** @type {Array<Record<string, unknown>>} */
  const bodies = [];

  const host = new HostManager({
    baseUrl: 'http://127.0.0.1:8787',
    hostApiKey: 'host-secret',
    mcpUrl: 'https://app.test/mcp/sveda',
    fetch: async (_url, options = {}) => {
      bodies.push(JSON.parse(String(options.body)));
      return new Response(
        JSON.stringify({
          token: 'sveda_embed_test.token',
          visitor_id: 'host-1',
          expires_in: 3600,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    },
  });
  host.resolveToolsUsing(() => [echoHostTool]);
  host.policyUsing(() => 'reader');

  const session = await host.startSession({ id: 1 });
  assert.equal(session.token, 'sveda_embed_test.token');
  assert.equal(bodies[0].policy, 'reader');
});

test('resolveTools receives user and tools/call rejects unknown tools for that user', async () => {
  const host = new HostManager();
  /** @type {unknown[]} */
  const seen = [];
  host.resolveToolsUsing((user) => {
    seen.push(user);
    if (user && typeof user === 'object' && user.id === 'user-1') {
      return [echoHostTool];
    }
    return [];
  });

  const list = await handleHostMcpRequest(
    host,
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { per_page: 250 } },
    { user: { id: 'user-1' }, headers: {} },
  );
  assert.deepEqual(seen[0], { id: 'user-1' });
  assert.equal(list.body.result.tools[0].name, 'echo_message');

  const denied = await handleHostMcpRequest(
    host,
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'echo_message', arguments: { message: 'nope' } },
    },
    { user: { id: 'other' }, headers: {} },
  );
  assert.equal(denied.body.result.isError, true);
  assert.match(denied.body.result.content[0].text, /Unknown tool/);
});

test('zero-parameter resolveToolsUsing callback still works', async () => {
  const host = new HostManager();
  host.resolveToolsUsing(() => [echoHostTool]);

  const list = await handleHostMcpRequest(
    host,
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { per_page: 250 } },
    { user: { id: 'user-1' }, headers: {} },
  );
  assert.equal(list.body.result.tools[0].name, 'echo_message');

  const call = await handleHostMcpRequest(
    host,
    {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'echo_message', arguments: { message: 'hello' } },
    },
    { user: { id: 'user-1' }, headers: {} },
  );
  assert.equal(call.body.result.isError, false);
});
