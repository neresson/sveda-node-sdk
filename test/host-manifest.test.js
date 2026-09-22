import assert from 'node:assert/strict';
import test from 'node:test';

import { HostManager } from '../src/host/host-manager.js';
import { handleHostMcpRequest } from '../src/host/host-mcp-handler.js';
import { HOST_MANIFEST_SCHEMA } from '../src/host/manifest.js';

class EchoHostTool {
  name() {
    return 'echo_message';
  }

  description() {
    return 'Echo a message back.';
  }

  schema() {
    return {
      message: { type: 'string', description: 'Message to echo', required: true },
    };
  }

  mode() {
    return 'read';
  }

  domain() {
    return 'demo';
  }

  async handle() {
    return { success: true };
  }
}

test('describe matches MCP tools/list payloads', async () => {
  const host = new HostManager();
  host.resolveToolsUsing(() => [new EchoHostTool()]);
  const user = { id: 'user-1' };

  const manifest = host.describe(user);
  assert.equal(manifest.schema, HOST_MANIFEST_SCHEMA);
  assert.equal(manifest.subject.authenticated, true);
  assert.equal(manifest.hooks.resolve_tools, true);

  const listed = await handleHostMcpRequest(
    host,
    { jsonrpc: '2.0', id: 1, method: 'tools/list', params: { per_page: 250 } },
    { user, headers: {} },
  );
  const byName = Object.fromEntries(listed.body.result.tools.map((tool) => [tool.name, tool]));

  for (const tool of manifest.tools) {
    assert.equal(byName[tool.name].description, tool.description);
    assert.deepEqual(byName[tool.name]._meta, tool._meta);
  }
});
