export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly field?: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode = 500,
    code = 'INTERNAL_ERROR',
    field?: string,
    isOperational = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly errors: string[];

  constructor(message: string, code = 'VALIDATION_ERROR', field?: string, errors?: string[]) {
    super(message, 400, code, field);
    this.errors = errors || [message];
  }
}

export class ConflictError extends AppError {
  constructor(message: string, code = 'CONFLICT', field?: string) {
    super(message, 409, code, field);
  }
}

export class NotFoundError extends AppError {
  public readonly ctaText?: string;
  public readonly ctaLink?: string;

  constructor(
    message = 'Resource not found.',
    code = 'NOT_FOUND',
    ctaText?: string,
    ctaLink?: string
  ) {
    super(message, 404, code);
    this.ctaText = ctaText;
    this.ctaLink = ctaLink;
  }
}

export class AuthError extends AppError {
  constructor(
    message = 'Authentication failed.',
    statusCode = 401,
    code = 'AUTH_ERROR',
    field?: string
  ) {
    super(message, statusCode, code, field);
  }
}

export class RateLimitError extends AppError {
  constructor(
    message = 'Too many requests. Please try again later.',
    code = 'RATE_LIMIT_EXCEEDED'
  ) {
    super(message, 429, code);
  }
}

export class TenantMismatchError extends AppError {
  constructor(
    message = 'You can only modify resources belonging to your own tenant subdomain.',
    code = 'TENANT_MISMATCH'
  ) {
    super(message, 403, code);
  }
}
