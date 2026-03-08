/**
 * ⏱️🦀 Clawck — Error Types
 * Typed errors for consistent API error responses.
 */

export class ClawckError extends Error {
  code: string;
  status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'ClawckError';
    this.code = code;
    this.status = status;
  }
}

export class ValidationError extends ClawckError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends ClawckError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotFoundError';
  }
}

export class ConfigError extends ClawckError {
  constructor(message: string) {
    super(message, 'CONFIG_ERROR', 500);
    this.name = 'ConfigError';
  }
}
