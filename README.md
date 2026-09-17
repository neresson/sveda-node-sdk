# sveda-node-sdk

Node SDK for the [Sveda AI](https://github.com/neresson/sveda) sidecar HTTP API.

npm: `@sveda-ai/node-sdk`

## Install

```bash
npm install @sveda-ai/node-sdk
```

## Usage

```js
import { SvedaClient, startHostSession } from '@sveda-ai/node-sdk'

const host = new SvedaClient({
  baseUrl: 'https://sveda.example.com',
  hostApiKey: hostKey,
})
const token = await host.embed.createToken({ visitorId: 'user-1' })

const client = new SvedaClient({
  baseUrl: 'https://sveda.example.com',
  embedToken: token.token,
})
for await (const event of client.chat.createStreamed({
  messages: [{ role: 'user', content: 'Hello' }],
  chatId: 'chat-1',
})) {
  console.log(event.type)
}

const session = await startHostSession({
  baseUrl: 'https://sveda.example.com',
  hostApiKey: hostKey,
  visitorId: 'user-1',
})
```

## License

MIT
