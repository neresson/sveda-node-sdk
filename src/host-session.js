import { HostManager } from './host/host-manager.js';

function trimBaseUrl(baseUrl) {
  return String(baseUrl ?? '').replace(/\/$/, '');
}

function present(value) {
  return value !== undefined && value !== null && String(value) !== '';
}

/**
 * @param {import('./host/host-manager.js').HostManager | Record<string, unknown>} options
 */
export async function startHostSession(options = {}) {
  const {
    host,
    user,
    baseUrl,
    hostApiKey,
    visitorId,
    hostMcpUrl,
    hostMcpToken,
    mintMcpToken,
    requestOrigin,
    fetch: fetchImpl,
  } = options;

  if (host instanceof HostManager) {
    const sessionUser = user ?? { id: visitorId ?? 'anonymous' };
    return host.startSession(sessionUser, { requestOrigin });
  }

  const origin = trimBaseUrl(baseUrl);
  const clientOptions = {
    baseUrl: origin,
    hostApiKey,
    fetch: fetchImpl,
  };

  let mcpUrl = hostMcpUrl;
  let mcpToken = hostMcpToken;

  if (typeof mintMcpToken === 'function' && !present(mcpToken)) {
    mcpToken = await mintMcpToken();
  }

  const payload = {};
  if (present(visitorId)) {
    payload.visitor_id = visitorId;
  }

  if (present(mcpUrl) && present(mcpToken)) {
    payload.host_mcp_url = mcpUrl;
    payload.host_mcp_token = mcpToken;
  }

  const { SvedaClient } = await import('./client.js');
  const client = new SvedaClient(clientOptions);
  const created = await client.embed.createToken({
    visitorId: payload.visitor_id,
    hostMcpUrl: payload.host_mcp_url,
    hostMcpToken: payload.host_mcp_token,
  });

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
