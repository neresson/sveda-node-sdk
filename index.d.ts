export class SvedaError extends Error {
  status: number;
  response: unknown;
  constructor(message: string, options?: { status?: number; response?: unknown });
}

export class SvedaAuthenticationError extends SvedaError {}

export class StreamEvent {
  type: string;
  payload: Record<string, unknown>;
  constructor(type: string, payload: Record<string, unknown>);
  toArray(): Record<string, unknown>;
  [key: string]: unknown;
}

export class StreamParser {
  parseLine(line: string): StreamEvent | null;
  iterate(body: string | AsyncIterable<Uint8Array>): AsyncGenerator<StreamEvent, void, unknown>;
}

export const SSE_DONE_LINE: 'data: [DONE]';

export class MessageResponse {
  payload: Record<string, unknown>;
  constructor(payload?: Record<string, unknown>);
  explanation(): string;
  tokensUsed(): number;
  chatId(): string;
}

export type EmbedToken = {
  token: string;
  visitorId: string;
  expiresIn: number;
  appearance: Record<string, unknown> | null;
};

export type SvedaClientOptions = {
  baseUrl: string;
  hostApiKey?: string | null;
  embedToken?: string | null;
  timeout?: number;
  fetch?: typeof fetch;
};

export class SvedaClient {
  baseUrl: string;
  hostApiKey: string | null;
  embedToken: string | null;
  embed: {
    createToken(params?: {
      visitorId?: string;
      visitor_id?: string;
      hostMcpUrl?: string;
      host_mcp_url?: string;
      hostMcpToken?: string;
      host_mcp_token?: string;
    }): Promise<EmbedToken>;
    config(): Promise<Record<string, unknown>>;
  };
  chat: {
    create(params: Record<string, unknown>): Promise<MessageResponse>;
    createStreamed(params: Record<string, unknown>): AsyncGenerator<StreamEvent, void, unknown>;
  };
  histories: {
    list(): Promise<Record<string, unknown>>;
    get(chatId: string): Promise<Record<string, unknown>>;
    rename(chatId: string, title: string): Promise<Record<string, unknown>>;
    delete(chatId: string): Promise<Record<string, unknown>>;
  };
  constructor(options?: SvedaClientOptions);
}

export function startHostSession(options: {
  baseUrl: string;
  hostApiKey: string;
  visitorId?: string;
  fetch?: typeof fetch;
}): Promise<{
  origin: string;
  token: string;
  expires_in: number;
  appearance: Record<string, unknown> | null;
}>;
