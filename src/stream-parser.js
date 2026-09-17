export const SSE_DONE_LINE = 'data: [DONE]';

const STREAM_EVENTS = new Set([
  'message.start',
  'text.delta',
  'reasoning.delta',
  'tool.call',
  'tool.result',
  'tool.progress',
  'context.usage',
  'chat.title',
  'max_steps',
  'message.end',
  'error',
]);

export class StreamEvent {
  constructor(type, payload) {
    this.type = type;
    this.payload = payload;

    for (const [key, value] of Object.entries(payload)) {
      if (key !== 'type' && key !== 'payload') {
        this[key] = value;
      }
    }
  }

  toArray() {
    return this.payload;
  }
}

export class StreamParser {
  parseLine(line) {
    const trimmed = String(line).trim();
    if (!trimmed.startsWith('data:')) {
      return null;
    }

    const payload = trimmed.slice(5).trim();
    if (payload === '' || payload === '[DONE]') {
      return null;
    }

    let decoded;
    try {
      decoded = JSON.parse(payload);
    } catch {
      return null;
    }

    if (decoded === null || typeof decoded !== 'object' || Array.isArray(decoded)) {
      return null;
    }

    const type = decoded.type;
    if (typeof type !== 'string' || !STREAM_EVENTS.has(type)) {
      return null;
    }

    return new StreamEvent(type, decoded);
  }

  async *iterate(body) {
    if (typeof body === 'string') {
      for (const line of body.split(/\r\n|\n|\r/)) {
        const event = this.parseLine(line);
        if (event !== null) {
          yield event;
        }
      }

      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    for await (const chunk of body) {
      buffer += decoder.decode(chunk, { stream: true });

      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        const event = this.parseLine(line);
        if (event !== null) {
          yield event;
        }
        newlineIndex = buffer.indexOf('\n');
      }
    }

    buffer += decoder.decode();
    const tail = buffer.trim();
    if (tail !== '') {
      const event = this.parseLine(tail);
      if (event !== null) {
        yield event;
      }
    }
  }
}
