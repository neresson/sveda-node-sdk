import { SvedaClient } from './client.js';

export async function startHostSession({
  baseUrl,
  hostApiKey,
  visitorId,
  fetch: fetchImpl,
} = {}) {
  const origin = String(baseUrl ?? '').replace(/\/$/, '');
  const client = new SvedaClient({
    baseUrl: origin,
    hostApiKey,
    fetch: fetchImpl,
  });
  const created = await client.embed.createToken({ visitorId });

  if (created.token === '') {
    throw new Error('Sidecar returned an empty embed token.');
  }

  return {
    origin,
    token: created.token,
    expires_in: created.expiresIn,
    appearance: created.appearance,
  };
}
