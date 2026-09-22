import { SvedaClient } from '../client.js';
import { DEFAULT_MCP_ABILITY, DEFAULT_MCP_PATH } from './constants.js';
import { buildHostManifest } from './manifest.js';
import { McpTokenStore } from './mcp-token-store.js';

function trimSlash(value) {
  return String(value ?? '').replace(/\/$/, '');
}

function present(value) {
  return value !== undefined && value !== null && String(value) !== '';
}

export class HostManager {
  constructor(options = {}) {
    this.baseUrl = trimSlash(options.baseUrl ?? options.base_url ?? '');
    this.hostApiKey = String(options.hostApiKey ?? options.host_api_key ?? '').trim();
    this.timeout = Number(options.timeout ?? 30);
    this.mcpPath = String(options.mcpPath ?? options.mcp?.path ?? DEFAULT_MCP_PATH);
    this.mcpUrl = trimSlash(options.mcpUrl ?? options.mcp?.url ?? '');
    this.serverName = String(options.serverName ?? options.mcp?.serverName ?? 'Host Application');
    this.serverVersion = String(options.serverVersion ?? options.mcp?.serverVersion ?? '0.1.0');
    this.instructions = String(options.instructions ?? options.mcp?.instructions ?? '');
    this.mcpAbility = String(options.mcpAbility ?? options.mcp?.ability ?? DEFAULT_MCP_ABILITY);
    this.tokenTtlSeconds = Math.max(
      60,
      Number(options.tokenTtlSeconds ?? options.mcp?.tokenTtlSeconds ?? 3600),
    );
    this.visitorPrefix = String(options.visitorPrefix ?? options.session?.visitorPrefix ?? 'host');
    this.fetchImpl = options.fetch ?? null;

    /** @type {import('./mcp-token-store.js').McpTokenStore | null} */
    this.tokenStore = options.tokenStore ?? new McpTokenStore();

    this._authorizeUsing = options.authorizeUsing ?? null;
    this._afterAuthenticateUsing = options.afterAuthenticateUsing ?? null;
    this._resolveToolsUsing = options.resolveToolsUsing ?? null;
    this._policyUsing = options.policyUsing ?? null;
    this._visitorIdUsing = options.visitorIdUsing ?? null;
    this._mintTokenUsing = options.mintTokenUsing ?? null;
    this._verifyBearerTokenUsing = options.verifyBearerTokenUsing ?? null;
  }

  authorizeUsing(callback) {
    this._authorizeUsing = callback;
    return this;
  }

  afterAuthenticateUsing(callback) {
    this._afterAuthenticateUsing = callback;
    return this;
  }

  resolveToolsUsing(callback) {
    this._resolveToolsUsing = callback;
    return this;
  }

  policyUsing(callback) {
    this._policyUsing = callback;
    return this;
  }

  visitorIdUsing(callback) {
    this._visitorIdUsing = callback;
    return this;
  }

  mintTokenUsing(callback) {
    this._mintTokenUsing = callback;
    return this;
  }

  verifyBearerTokenUsing(callback) {
    this._verifyBearerTokenUsing = callback;
    return this;
  }

  authorize(user) {
    if (this._authorizeUsing === null) {
      return true;
    }

    return Boolean(this._authorizeUsing(user));
  }

  async afterAuthenticate(user) {
    if (this._afterAuthenticateUsing !== null) {
      await this._afterAuthenticateUsing(user);
    }
  }

  describe(user) {
    return buildHostManifest(this, user);
  }

  resolveTools(user) {
    if (this._resolveToolsUsing === null) {
      return [];
    }

    const tools =
      user === undefined || user === null
        ? this._resolveToolsUsing()
        : this._resolveToolsUsing(user);
    if (!Array.isArray(tools)) {
      return [];
    }

    return tools.filter(
      (tool) => tool && (typeof tool.name === 'function' || typeof tool.name === 'string'),
    );
  }

  policyFor(user) {
    if (this._policyUsing === null) {
      return null;
    }

    const value = this._policyUsing(user);
    if (!present(value)) {
      return null;
    }

    return String(value).trim();
  }

  visitorId(user) {
    if (this._visitorIdUsing !== null) {
      return String(this._visitorIdUsing(user));
    }

    const id =
      user && typeof user === 'object' && user !== null && 'id' in user
        ? user.id
        : user;

    return `${this.visitorPrefix}-${id}`;
  }

  async mintMcpToken(user) {
    if (this._mintTokenUsing !== null) {
      return String(await this._mintTokenUsing(user));
    }

    return this.defaultMintMcpToken(user);
  }

  defaultMintMcpToken(user) {
    const userId =
      user && typeof user === 'object' && user !== null && 'id' in user
        ? user.id
        : 'anonymous';

    this.tokenStore?.revokeForUser(String(userId));
    return this.tokenStore?.mint(String(userId), {
      ability: this.mcpAbility,
      ttlSeconds: this.tokenTtlSeconds,
    });
  }

  mcpPublicUrl(requestOrigin) {
    if (this.mcpUrl !== '') {
      return this.mcpUrl;
    }

    const origin = trimSlash(requestOrigin ?? '');
    if (origin === '') {
      return this.mcpPath;
    }

    const path = this.mcpPath.startsWith('/') ? this.mcpPath : `/${this.mcpPath}`;
    return `${origin}${path}`;
  }

  isConfigured() {
    return this.baseUrl !== '' && this.hostApiKey !== '';
  }

  hostClient() {
    return new SvedaClient({
      baseUrl: this.baseUrl,
      hostApiKey: this.hostApiKey,
      timeout: this.timeout,
      fetch: this.fetchImpl ?? undefined,
    });
  }

  /**
   * @param {unknown} user
   * @param {{ requestOrigin?: string }} [options]
   */
  async startSession(user, options = {}) {
    if (!this.isConfigured()) {
      const error = new Error('Sveda host is not configured.');
      error.status = 404;
      throw error;
    }

    const mcpToken = await this.mintMcpToken(user);
    const visitorId = this.visitorId(user);
    const hostMcpUrl = this.mcpPublicUrl(options.requestOrigin);

    let created;
    try {
      const policy = this.policyFor(user);
      created = await this.hostClient().embed.createToken({
        visitorId,
        hostMcpUrl,
        hostMcpToken: mcpToken,
        policy,
      });
    } catch (error) {
      const wrapped = new Error(
        error instanceof Error ? error.message : 'Failed to create Sveda embed token.',
      );
      wrapped.status = 502;
      throw wrapped;
    }

    if (created.token === '') {
      const error = new Error('Sidecar returned an empty embed token.');
      error.status = 502;
      throw error;
    }

    return {
      origin: this.baseUrl,
      token: created.token,
      expires_in: created.expiresIn,
      appearance: created.appearance,
    };
  }

  /**
   * @param {string} plainToken
   */
  async authenticateBearerToken(plainToken) {
    if (!present(plainToken)) {
      return null;
    }

    if (this._verifyBearerTokenUsing !== null) {
      const verified = await this._verifyBearerTokenUsing(plainToken);
      return verified;
    }

    const record = this.tokenStore?.verify(plainToken, this.mcpAbility);
    if (!record) {
      return null;
    }

    return {
      user: { id: record.userId },
    };
  }
}
