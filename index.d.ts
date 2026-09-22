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
      policy?: string | null;
      grants?: Record<string, unknown> | null;
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

export const MODE_READ: 'read';
export const MODE_WRITE: 'write';
export const MODE_DELETE: 'delete';
export const MCP_PROTOCOL_VERSION: '2025-11-25';
export const DEFAULT_MCP_PATH: '/mcp/sveda';
export const DEFAULT_MCP_ABILITY: 'sveda:mcp';
export const PAGE_CONTEXT_HEADER: 'x-sveda-page-context';
export const CHAT_ID_HEADER: 'x-sveda-chat-id';

export type HostTool = {
  name: string | (() => string);
  description: string | (() => string);
  mode?: string | (() => string);
  domain?: string | (() => string);
  confirmation?: 'required' | 'auto' | (() => 'required' | 'auto');
  schema?: (() => Record<string, unknown>) | Record<string, unknown>;
  inputSchema?: Record<string, unknown>;
  handle: (
    arguments: Record<string, unknown>,
    context?: { user?: unknown; pageContext?: unknown; chatId?: string | null },
  ) => unknown | Promise<unknown>;
};

export type HostManagerOptions = {
  baseUrl?: string;
  base_url?: string;
  hostApiKey?: string;
  host_api_key?: string;
  timeout?: number;
  fetch?: typeof fetch;
  mcpPath?: string;
  mcpUrl?: string;
  mcp?: {
    path?: string;
    url?: string;
    serverName?: string;
    serverVersion?: string;
    instructions?: string;
    ability?: string;
    tokenTtlSeconds?: number;
  };
  serverName?: string;
  serverVersion?: string;
  instructions?: string;
  mcpAbility?: string;
  tokenTtlSeconds?: number;
  visitorPrefix?: string;
  session?: { visitorPrefix?: string };
  tokenStore?: McpTokenStore;
  authorizeUsing?: (user: unknown) => boolean;
  afterAuthenticateUsing?: (user: unknown) => void | Promise<void>;
  resolveToolsUsing?: (user?: unknown) => HostTool[];
  policyUsing?: (user: unknown) => string | null | undefined;
  visitorIdUsing?: (user: unknown) => string;
  mintTokenUsing?: (user: unknown) => string | Promise<string>;
  verifyBearerTokenUsing?: (
    plainToken: string,
  ) => Promise<{ user: unknown } | null> | { user: unknown } | null;
};

export class McpTokenStore {
  mint(
    userId: string,
    options?: { ability?: string; ttlSeconds?: number; tokenName?: string },
  ): string;
  verify(plainToken: string, expectedAbility?: string): { userId: string; ability: string } | null;
  revokeForUser(userId: string, tokenName?: string): void;
}

export class HostManager {
  baseUrl: string;
  hostApiKey: string;
  mcpPath: string;
  mcpUrl: string;
  serverName: string;
  serverVersion: string;
  instructions: string;
  mcpAbility: string;
  tokenTtlSeconds: number;
  visitorPrefix: string;
  tokenStore: McpTokenStore | null;
  authorizeUsing: ((user: unknown) => boolean) | null;
  afterAuthenticateUsing: ((user: unknown) => void | Promise<void>) | null;
  resolveToolsUsing: ((user?: unknown) => HostTool[]) | null;
  policyUsing: ((user: unknown) => string | null | undefined) | null;
  visitorIdUsing: ((user: unknown) => string) | null;
  mintTokenUsing: ((user: unknown) => string | Promise<string>) | null;
  verifyBearerTokenUsing:
    | ((plainToken: string) => Promise<{ user: unknown } | null> | { user: unknown } | null)
    | null;
  constructor(options?: HostManagerOptions);
  authorizeUsing(callback: (user: unknown) => boolean): this;
  afterAuthenticateUsing(callback: (user: unknown) => void | Promise<void>): this;
  resolveToolsUsing(callback: (user?: unknown) => HostTool[]): this;
  policyUsing(callback: (user: unknown) => string | null | undefined): this;
  visitorIdUsing(callback: (user: unknown) => string): this;
  mintTokenUsing(callback: (user: unknown) => string | Promise<string>): this;
  verifyBearerTokenUsing(
    callback: (
      plainToken: string,
    ) => Promise<{ user: unknown } | null> | { user: unknown } | null,
  ): this;
  authorize(user: unknown): boolean;
  afterAuthenticate(user: unknown): Promise<void>;
  resolveTools(user?: unknown): HostTool[];
  describe(user?: unknown): Record<string, unknown>;
  policyFor(user: unknown): string | null;
  visitorId(user: unknown): string;
  mintMcpToken(user: unknown): Promise<string>;
  defaultMintMcpToken(user: unknown): string;
  mcpPublicUrl(requestOrigin?: string): string;
  isConfigured(): boolean;
  hostClient(): SvedaClient;
  startSession(
    user: unknown,
    options?: { requestOrigin?: string },
  ): Promise<{
    origin: string;
    token: string;
    expires_in: number;
    appearance: Record<string, unknown> | null;
  }>;
  authenticateBearerToken(plainToken: string): Promise<{ user: unknown } | null>;
}

export function buildInputSchema(tool: HostTool): Record<string, unknown>;
export function toolAnnotations(mode: string): Record<string, boolean>;

export function handleHostMcpRequest(
  host: HostManager,
  body: unknown,
  context: { user: unknown; headers?: Record<string, string | string[] | undefined> },
): Promise<{
  status: number;
  body: Record<string, unknown> | null;
  sessionId?: string;
}>;

export function createAuthenticateHostMcpMiddleware(
  host: HostManager,
): (req: unknown, res: unknown, next: (error?: unknown) => void) => Promise<void>;

export function createHostMcpHandler(
  host: HostManager,
): (req: unknown, res: unknown) => Promise<void>;

export function createHostMcpRouter(host: HostManager): (req: import('http').IncomingMessage, res: import('http').ServerResponse, next?: () => void) => void;

export function executeHostMcpRequest(
  host: HostManager,
  input: {
    authorization?: string | null;
    headers?: Record<string, string>;
    body: unknown;
  },
): Promise<{ status: number; body: unknown; headers: Record<string, string> }>;

export function startHostSession(options: {
  host?: HostManager;
  user?: unknown;
  baseUrl?: string;
  hostApiKey?: string;
  visitorId?: string;
  hostMcpUrl?: string;
  hostMcpToken?: string;
  mintMcpToken?: () => string | Promise<string>;
  requestOrigin?: string;
  fetch?: typeof fetch;
}): Promise<{
  origin: string;
  token: string;
  expires_in: number;
  appearance: Record<string, unknown> | null;
}>;
