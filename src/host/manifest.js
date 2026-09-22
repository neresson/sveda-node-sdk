import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { buildInputSchema, toolAnnotations } from './schema.js';

export const HOST_MANIFEST_SCHEMA = 'sveda.host/v1';

const packageJson = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../package.json'), 'utf8'),
);

export function toolName(tool) {
  return typeof tool.name === 'function' ? tool.name() : String(tool.name ?? '');
}

function toolDescription(tool) {
  if (typeof tool.description === 'function') {
    return tool.description();
  }

  return String(tool.description ?? '');
}

function toolMode(tool) {
  if (typeof tool.mode === 'function') {
    return tool.mode();
  }

  return String(tool.mode ?? 'read');
}

function toolDomain(tool) {
  if (typeof tool.domain === 'function') {
    return tool.domain();
  }

  return String(tool.domain ?? 'other');
}

function toolConfirmation(tool) {
  const value = typeof tool.confirmation === 'function' ? tool.confirmation() : tool.confirmation;

  return value === 'required' ? 'required' : null;
}

export function toMcpTool(tool) {
  const name = toolName(tool);
  const mode = toolMode(tool);
  const meta = {
    domain: toolDomain(tool),
    mode,
  };
  const confirmation = toolConfirmation(tool);
  if (confirmation) {
    meta.confirmation = confirmation;
  }

  return {
    name,
    title: name,
    description: toolDescription(tool),
    inputSchema: buildInputSchema(tool),
    annotations: toolAnnotations(mode),
    _meta: meta,
  };
}

export function hostHooks(host) {
  return {
    resolve_tools: host._resolveToolsUsing !== null,
    policy: host._policyUsing !== null,
    authorize: host._authorizeUsing !== null,
    visitor_id: host._visitorIdUsing !== null,
    mint_token: host._mintTokenUsing !== null,
  };
}

export function buildHostManifest(host, user = undefined, options = {}) {
  const language = options.language ?? 'node';
  const version = options.version ?? packageJson.version ?? '0.0.0';
  const authenticated = user !== undefined && user !== null;
  const policy = authenticated ? host.policyFor(user) : null;

  return {
    schema: HOST_MANIFEST_SCHEMA,
    sdk: { language, version },
    subject: {
      authenticated,
      policy,
    },
    hooks: hostHooks(host),
    tools: host.resolveTools(user).map(toMcpTool),
  };
}
