export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.detail ? { detail: this.detail } : {}),
      },
    };
  }
}

export class InvalidGrantError extends HttpError {
  constructor(message = 'Invalid or expired connect grant', detail?: Record<string, unknown>) {
    super(401, 'invalid_grant', message, detail);
  }
}

export class ScopesNotAllowedError extends HttpError {
  constructor(detail?: Record<string, unknown>) {
    super(403, 'scopes_not_allowed', 'Requested scopes exceed tool maximum', detail);
  }
}

export class IdempotencyConflictError extends HttpError {
  constructor() {
    super(409, 'idempotency_conflict', 'Idempotency key reused with different inputs');
  }
}

export class ReplayError extends HttpError {
  constructor() {
    super(401, 'invalid_grant', 'Connect grant has already been used (replay)');
  }
}
