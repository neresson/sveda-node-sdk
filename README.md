# sveda-node-sdk

Node SDK for the [Sveda](https://sveda.dev) sidecar HTTP API and host MCP integration.

Docs: [sveda.dev/docs/hosts/node](https://sveda.dev/docs/hosts/node)

npm: `@sveda-ai/node-sdk`

## Install

```bash
npm install @sveda-ai/node-sdk
```

For the Express MCP router helper, install Express as well:

```bash
npm install express
```

## Sidecar client

```js
import { SvedaClient, startHostSession } from '@sveda-ai/node-sdk';

const host = new SvedaClient({
  baseUrl: 'https://sveda.example.com',
  hostApiKey: hostKey,
});
const token = await host.embed.createToken({ visitorId: 'user-1' });

const client = new SvedaClient({
  baseUrl: 'https://sveda.example.com',
  embedToken: token.token,
});
for await (const event of client.chat.createStreamed({
  messages: [{ role: 'user', content: 'Hello' }],
  chatId: 'chat-1',
})) {
  console.log(event.type);
}
```

## Host MCP integration

Register tools, expose `POST /mcp/sveda`, and mint MCP credentials when starting an embed session:

```js
import express from 'express';
import {
  HostManager,
  MODE_READ,
  MODE_WRITE,
  createHostMcpRouter,
  startHostSession,
} from '@sveda-ai/node-sdk';

const host = new HostManager({
  baseUrl: process.env.SVEDA_CLIENT_BASE_URL,
  hostApiKey: process.env.SVEDA_CLIENT_HOST_API_KEY,
  mcpPath: '/mcp/sveda',
  serverName: 'My App',
  instructions: 'Tools for the signed-in user.',
});

host.policyUsing((user) => (user.role === 'agent' ? 'agent' : 'reader'));

host.resolveToolsUsing((user) => [
  {
    name: 'search_posts',
    description: 'Search posts by title or body.',
    mode: MODE_READ,
    domain: 'posts',
    schema() {
      return {
        query: { type: 'string', description: 'Search text', required: true },
      };
    },
    handle({ query }) {
      return { success: true, data: { posts: [] } };
    },
  },
]);

const app = express();
app.use(express.json());
app.use('/mcp/sveda', express.json(), createHostMcpRouter(host));

app.post('/sveda/session', async (req, res) => {
  const session = await startHostSession({
    host,
    user: { id: req.user.id },
    requestOrigin: `${req.protocol}://${req.get('host')}`,
  });
  res.json(session);
});
```

`HostManager` mints in-memory MCP bearer tokens by default (`McpTokenStore`). Wire `verifyBearerTokenUsing` / `mintTokenUsing` when you use your own auth (JWT, API keys, etc.).

Lower-level pieces:

- `createHostMcpHandler(host)` — single Express handler
- `createAuthenticateHostMcpMiddleware(host)` — Bearer auth only
- `handleHostMcpRequest(host, body, { user, headers })` — framework-agnostic JSON-RPC

Embed token requests include `host_mcp_url` and `host_mcp_token` automatically when using `HostManager.startSession` or `startHostSession({ host, user, requestOrigin })`.

Manual session start:

```js
await startHostSession({
  baseUrl: 'https://sveda.example.com',
  hostApiKey: hostKey,
  visitorId: 'user-1',
  hostMcpUrl: 'https://app.example.com/mcp/sveda',
  mintMcpToken: async () => 'your-mcp-bearer-token',
});
```

## Agent introspection

Print the registered tool manifest as JSON (`sveda.host/v1`):

```bash
npx sveda-describe ./lib/sveda-host.js:host
```

`host.describe(user)` returns the same structure programmatically. With a logged-in dev session, playground apps expose `GET /sveda/tools`.

## License

GNU Affero General Public License v3.0. See [LICENSE](LICENSE).
