import { SvedaAuthenticationError, SvedaError } from './errors.js';
import { StreamParser } from './stream-parser.js';

const JSON_ACCEPT = 'application/json';
const STREAM_ACCEPT = 'application/vnd.sveda.stream+json';

function trimBaseUrl(baseUrl) {
  return String(baseUrl ?? '').replace(/\/$/, '');
}

function present(value) {
  return value !== undefined && value !== null && String(value) !== '';
}

export class MessageResponse {
  constructor(payload) {
    this.payload = payload ?? {};
  }

  explanation() {
    return String(this.payload.explanation ?? '');
  }

  tokensUsed() {
    return Number(this.payload.tokens_used ?? 0);
  }

  chatId() {
    return String(this.payload.chat_id ?? '');
  }
}

class Embed {
  constructor(client) {
    this.client = client;
  }

  async createToken(params = {}) {
    const payload = {};

    if (present(params.visitorId ?? params.visitor_id)) {
      payload.visitor_id = params.visitorId ?? params.visitor_id;
    }

    const hostMcpUrl = params.hostMcpUrl ?? params.host_mcp_url;
    const hostMcpToken = params.hostMcpToken ?? params.host_mcp_token;
    if (present(hostMcpUrl) && present(hostMcpToken)) {
      payload.host_mcp_url = hostMcpUrl;
      payload.host_mcp_token = hostMcpToken;
    }

    const policy = params.policy;
    if (present(policy)) {
      payload.policy = policy;
    }

    const grants = params.grants;
    if (grants !== undefined && grants !== null && typeof grants === 'object') {
      payload.grants = grants;
    }

    const response = await this.client.requestJson('POST', '/sveda/embed/token', payload);

    return {
      token: String(response.token ?? ''),
      visitorId: String(response.visitor_id ?? ''),
      expiresIn: Math.max(60, Number(response.expires_in ?? 3600)),
      appearance:
        response.appearance !== null &&
        typeof response.appearance === 'object' &&
        !Array.isArray(response.appearance)
          ? response.appearance
          : null,
    };
  }

  config() {
    return this.client.requestJson('GET', '/sveda/embed/config');
  }
}

class Chat {
  constructor(client) {
    this.client = client;
  }

  async create(params) {
    const response = await this.client.requestJson('POST', '/sveda/message', params);
    return new MessageResponse(response);
  }

  async *createStreamed(params) {
    const stream = await this.client.requestStream('POST', '/sveda/stream', params);
    yield* new StreamParser().iterate(stream);
  }
}

class Histories {
  constructor(client) {
    this.client = client;
  }

  list() {
    return this.client.requestJson('GET', '/sveda/chat-histories');
  }

  get(chatId) {
    return this.client.requestJson('GET', `/sveda/chat-histories/${encodeURIComponent(chatId)}`);
  }

  rename(chatId, title) {
    return this.client.requestJson('PATCH', `/sveda/chat-histories/${encodeURIComponent(chatId)}`, {
      title,
    });
  }

  delete(chatId) {
    return this.client.requestJson('DELETE', `/sveda/chat-histories/${encodeURIComponent(chatId)}`);
  }
}

export class SvedaClient {
  constructor({
    baseUrl,
    hostApiKey,
    embedToken,
    timeout = 30,
    fetch: fetchImpl,
  } = {}) {
    this.baseUrl = trimBaseUrl(baseUrl);
    this.hostApiKey = present(hostApiKey) ? hostApiKey : null;
    this.embedToken = present(embedToken) ? embedToken : null;
    this.timeout = timeout;
    this.fetchImpl = fetchImpl;
    this.embed = new Embed(this);
    this.chat = new Chat(this);
    this.histories = new Histories(this);
  }

  resolveUri(uri) {
    if (String(uri).startsWith('http://') || String(uri).startsWith('https://')) {
      return uri;
    }

    return `${this.baseUrl}/${String(uri).replace(/^\//, '')}`;
  }

  authHeaders() {
    const headers = {};

    if (this.hostApiKey !== null) {
      headers.Authorization = `Bearer ${this.hostApiKey}`;
    }

    if (this.embedToken !== null) {
      headers['X-Sveda-Embed-Token'] = this.embedToken;
    }

    return headers;
  }

  fetch(input, init) {
    const fetchImpl = this.fetchImpl ?? globalThis.fetch.bind(globalThis);
    return fetchImpl(input, init);
  }

  async requestJson(method, uri, payload = {}) {
    const upper = String(method).toUpperCase();
    const headers = {
      ...this.authHeaders(),
      Accept: JSON_ACCEPT,
    };
    const init = { method: upper, headers };

    if (upper !== 'GET' && upper !== 'HEAD') {
      headers['Content-Type'] = 'application/json';
      init.body = JSON.stringify(payload ?? {});
    }

    if (this.timeout > 0 && typeof AbortSignal !== 'undefined' && AbortSignal.timeout) {
      init.signal = AbortSignal.timeout(this.timeout * 1000);
    }

    let response;
    try {
      response = await this.fetch(this.resolveUri(uri), init);
    } catch (error) {
      throw new SvedaError(error instanceof Error ? error.message : 'Sveda API request failed');
    }

    return this.decodeResponse(response);
  }

  async requestStream(method, uri, payload = {}) {
    const headers = {
      ...this.authHeaders(),
      Accept: STREAM_ACCEPT,
      'Content-Type': 'application/json',
    };

    let response;
    try {
      response = await this.fetch(this.resolveUri(uri), {
        method: String(method).toUpperCase(),
        headers,
        body: JSON.stringify(payload ?? {}),
      });
    } catch (error) {
      throw new SvedaError(error instanceof Error ? error.message : 'Sveda stream request failed');
    }

    if (response.status === 401 || response.status === 403) {
      throw new SvedaAuthenticationError(
        `Sveda API authentication failed with status ${response.status}`,
        { status: response.status },
      );
    }

    if (!response.ok) {
      throw new SvedaError(`Sveda stream request failed with status ${response.status}`, {
        status: response.status,
      });
    }

    if (!response.body) {
      throw new SvedaError('Sveda stream response has no readable body.');
    }

    return response.body;
  }

  async decodeResponse(response) {
    const status = response.status;
    const body = await response.text();

    if (status === 401 || status === 403) {
      throw new SvedaAuthenticationError(`Sveda API authentication failed with status ${status}`, {
        status,
      });
    }

    if (status < 200 || status >= 300) {
      let decoded = null;
      try {
        decoded = JSON.parse(body);
      } catch {
        decoded = null;
      }

      throw new SvedaError(
        decoded !== null &&
          typeof decoded === 'object' &&
          !Array.isArray(decoded) &&
          typeof decoded.message === 'string'
          ? decoded.message
          : `Sveda API request failed with status ${status}`,
        { status, response: decoded },
      );
    }

    if (body === '') {
      return {};
    }

    let decoded;
    try {
      decoded = JSON.parse(body);
    } catch {
      throw new SvedaError('Unable to decode Sveda API response as JSON.');
    }

    if (decoded === null || typeof decoded !== 'object') {
      throw new SvedaError('Unable to decode Sveda API response as JSON.');
    }

    return decoded;
  }
}
