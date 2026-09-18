import { MCP_PROTOCOL_VERSION } from './constants.js';
import { handleHostMcpRequest } from './host-mcp-handler.js';

function readBearerToken(authorization) {
  if (!authorization || typeof authorization !== 'string') {
    return null;
  }

  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function normalizeHeaders(headers) {
  const normalized = {};
  for (const [key, value] of Object.entries(headers ?? {})) {
    normalized[key.toLowerCase()] = value;
  }
  return normalized;
}

/**
 * Framework-agnostic MCP POST handler (Fetch, Next.js Route Handlers, etc.).
 *
 * @param {import('./host-manager.js').HostManager} host
 * @param {{ authorization?: string | null, headers?: Record<string, string>, body: unknown }} input
 */
export async function executeHostMcpRequest(host, input) {
  const plain = readBearerToken(input.authorization ?? null);
  const auth = await host.authenticateBearerToken(plain ?? '');
  if (!auth?.user) {
    return { status: 401, body: null, headers: {} };
  }

  if (!host.authorize(auth.user)) {
    return { status: 403, body: null, headers: {} };
  }

  await host.afterAuthenticate(auth.user);

  const outcome = await handleHostMcpRequest(host, input.body, {
    user: auth.user,
    headers: normalizeHeaders(input.headers),
  });

  /** @type {Record<string, string>} */
  const headers = {
    'mcp-protocol-version': MCP_PROTOCOL_VERSION,
  };

  if (outcome.sessionId) {
    headers['mcp-session-id'] = outcome.sessionId;
  }

  return {
    status: outcome.status,
    body: outcome.body,
    headers,
  };
}
