import { handleHostMcpRequest } from './host-mcp-handler.js';
import { MCP_PROTOCOL_VERSION } from './constants.js';

function readBearerToken(req) {
  const header = req.headers?.authorization ?? req.headers?.Authorization;
  if (!header || typeof header !== 'string') {
    return null;
  }

  const match = header.match(/^Bearer\s+(.+)$/i);
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
 * @param {import('./host-manager.js').HostManager} host
 */
export function createAuthenticateHostMcpMiddleware(host) {
  return async function authenticateHostMcp(req, res, next) {
    const plain = readBearerToken(req);
    if (!plain) {
      return res.status(401).end();
    }

    const auth = await host.authenticateBearerToken(plain);
    if (!auth?.user) {
      return res.status(401).end();
    }

    if (!host.authorize(auth.user)) {
      return res.status(403).end();
    }

    await host.afterAuthenticate(auth.user);
    req.svedaUser = auth.user;
    req.svedaAuth = auth;
    return next();
  };
}

/**
 * @param {import('./host-manager.js').HostManager} host
 */
export function createHostMcpHandler(host) {
  const authenticate = createAuthenticateHostMcpMiddleware(host);

  return async function hostMcpHandler(req, res) {
    await authenticate(req, res, async () => {
      res.setHeader('mcp-protocol-version', MCP_PROTOCOL_VERSION);

      const outcome = await handleHostMcpRequest(host, req.body, {
        user: req.svedaUser,
        headers: normalizeHeaders(req.headers),
      });

      if (outcome.sessionId) {
        res.setHeader('mcp-session-id', outcome.sessionId);
      }

      if (outcome.body === null) {
        return res.status(outcome.status).end();
      }

      return res.status(outcome.status).json(outcome.body);
    });
  };
}

/**
 * Express-free middleware for `app.use(mcpPath, express.json(), createHostMcpRouter(host))`.
 * Avoids resolving the `express` package from the SDK path (breaks with `file:` links).
 *
 * @param {import('./host-manager.js').HostManager} host
 */
export function createHostMcpRouter(host) {
  const handler = createHostMcpHandler(host);

  return function hostMcpRouter(req, res, next) {
    if (req.method !== 'POST') {
      if (typeof next === 'function') {
        return next();
      }
      return res.status(405).end();
    }

    return handler(req, res, next);
  };
}
