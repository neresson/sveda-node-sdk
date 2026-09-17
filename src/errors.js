export class SvedaError extends Error {
  constructor(message, { status = 0, response = null } = {}) {
    super(message);
    this.name = 'SvedaError';
    this.status = status;
    this.response = response;
  }
}

export class SvedaAuthenticationError extends SvedaError {
  constructor(message, { status = 0, response = null } = {}) {
    super(message, { status, response });
    this.name = 'SvedaAuthenticationError';
  }
}
