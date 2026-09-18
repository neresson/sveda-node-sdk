function normalizeProperty(definition) {
  if (definition === null || typeof definition !== 'object' || Array.isArray(definition)) {
    return { type: 'string' };
  }

  const { required: _required, ...rest } = definition;
  return rest;
}

export function buildInputSchema(tool) {
  if (tool.inputSchema && typeof tool.inputSchema === 'object') {
    return tool.inputSchema;
  }

  const raw =
    typeof tool.schema === 'function' ? tool.schema() : tool.schema ?? {};

  if (raw && typeof raw === 'object' && raw.type === 'object' && raw.properties) {
    return raw;
  }

  const properties = {};
  const required = [];

  for (const [key, definition] of Object.entries(raw)) {
    properties[key] = normalizeProperty(definition);
    if (definition?.required === true) {
      required.push(key);
    }
  }

  const schema = {
    type: 'object',
    properties,
  };

  if (required.length > 0) {
    schema.required = required;
  }

  return schema;
}

export function toolAnnotations(mode) {
  if (mode === 'read') {
    return { readOnlyHint: true };
  }

  if (mode === 'delete') {
    return {
      readOnlyHint: false,
      destructiveHint: true,
    };
  }

  return {
    readOnlyHint: false,
    destructiveHint: false,
  };
}
