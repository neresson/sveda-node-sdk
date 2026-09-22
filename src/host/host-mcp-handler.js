import {
  CHAT_ID_HEADER,
  MCP_PROTOCOL_VERSION,
  PAGE_CONTEXT_HEADER,
  PAGE_CONTEXT_MAX_BYTES,
} from './constants.js';
import { toMcpTool, toolName } from './manifest.js';

function jsonRpcResult(id, result) {
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

function jsonRpcError(id, code, message) {
  return {
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  };
}

function encodeToolResult(result) {
  if (typeof result === 'string') {
    return {
      content: [{ type: 'text', text: result }],
      isError: false,
    };
  }

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(result ?? null),
      },
    ],
    isError: false,
  };
}

function readPageContext(headers) {
  const raw = headers[PAGE_CONTEXT_HEADER] ?? headers['X-Sveda-Page-Context'];
  if (!raw || String(raw).length > PAGE_CONTEXT_MAX_BYTES) {
    return null;
  }

  try {
    return JSON.parse(String(raw));
  } catch {
    return null;
  }
}

function readChatId(headers) {
  const raw = headers[CHAT_ID_HEADER] ?? headers['X-Sveda-Chat-Id'];
  if (!raw) {
    return null;
  }

  const value = String(raw).trim();
  return value === '' ? null : value;
}

/**
 * @param {import('./host-manager.js').HostManager} host
 * @param {unknown} body
 * @param {{ user: unknown, headers?: Record<string, string | string[] | undefined> }} context
 */
export async function handleHostMcpRequest(host, body, context) {
  const payload = body && typeof body === 'object' ? body : {};
  const method = String(payload.method ?? '');
  const params = payload.params && typeof payload.params === 'object' ? payload.params : {};
  const id = payload.id ?? null;
  const isNotification = payload.id === undefined || payload.id === null;

  const callContext = {
    user: context.user,
    pageContext: readPageContext(context.headers ?? {}),
    chatId: readChatId(context.headers ?? {}),
  };

  if (method === 'notifications/initialized') {
    return { status: 202, body: null };
  }

  if (method === 'initialize') {
    const serverName = host.serverName || 'Host Application';
    const serverVersion = host.serverVersion || '0.1.0';
    const result = {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        tools: { listChanged: false },
      },
      serverInfo: {
        name: serverName,
        version: serverVersion,
      },
    };

    if (host.instructions && host.instructions.trim() !== '') {
      result.instructions = host.instructions.trim();
    }

    return {
      status: 200,
      body: jsonRpcResult(id, result),
      sessionId: `sess-${Date.now()}`,
    };
  }

  if (method === 'tools/list') {
    const perPage = Math.min(250, Math.max(1, Number(params.per_page ?? params.perPage ?? 250)));
    const tools = host.resolveTools(callContext.user).map(toMcpTool);
    const cursor = typeof params.cursor === 'string' ? params.cursor : '';
    const start = cursor === '' ? 0 : Number.parseInt(cursor, 10);
    const slice = tools.slice(start, start + perPage);
    const nextIndex = start + slice.length;
    const result = {
      tools: slice,
    };

    if (nextIndex < tools.length) {
      result.nextCursor = String(nextIndex);
    }

    return {
      status: 200,
      body: jsonRpcResult(id, result),
    };
  }

  if (method === 'tools/call') {
    const name = String(params.name ?? '');
    const args =
      params.arguments && typeof params.arguments === 'object' && !Array.isArray(params.arguments)
        ? params.arguments
        : {};

    const tool = host
      .resolveTools(callContext.user)
      .find((candidate) => toolName(candidate) === name);
    if (!tool) {
      return {
        status: 200,
        body: jsonRpcResult(id, {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        }),
      };
    }

    try {
      const output = await tool.handle(args, callContext);
      return {
        status: 200,
        body: jsonRpcResult(id, encodeToolResult(output)),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Tool execution failed.';
      return {
        status: 200,
        body: jsonRpcResult(id, {
          content: [{ type: 'text', text: message }],
          isError: true,
        }),
      };
    }
  }

  if (isNotification) {
    return { status: 202, body: null };
  }

  return {
    status: 200,
    body: jsonRpcError(id, -32601, `Method not found: ${method}`),
  };
}
