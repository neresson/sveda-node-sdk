import { randomBytes } from 'node:crypto';

export class McpTokenStore {
  constructor() {
    /** @type {Map<string, { userId: string, ability: string, expiresAt: number }>} */
    this.tokens = new Map();
  }

  /**
   * @param {string} userId
   * @param {{ ability?: string, ttlSeconds?: number, tokenName?: string }} [options]
   */
  mint(userId, options = {}) {
    const ability = options.ability ?? 'sveda:mcp';
    const ttlSeconds = Math.max(60, Number(options.ttlSeconds ?? 3600));
    const token = randomBytes(32).toString('hex');

    this.tokens.set(token, {
      userId: String(userId),
      ability,
      expiresAt: Date.now() + ttlSeconds * 1000,
    });

    return token;
  }

  /**
   * @param {string} plainToken
   * @param {string} [expectedAbility]
   * @returns {{ userId: string, ability: string } | null}
   */
  verify(plainToken, expectedAbility = 'sveda:mcp') {
    const record = this.tokens.get(String(plainToken ?? ''));
    if (!record) {
      return null;
    }

    if (record.expiresAt <= Date.now()) {
      this.tokens.delete(plainToken);
      return null;
    }

    if (expectedAbility && record.ability !== expectedAbility) {
      return null;
    }

    return { userId: record.userId, ability: record.ability };
  }

  revokeForUser(userId, tokenName = 'sveda-mcp') {
    for (const [token, record] of this.tokens.entries()) {
      if (record.userId === String(userId)) {
        this.tokens.delete(token);
      }
    }
  }
}
