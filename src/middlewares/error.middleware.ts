import { NextFunction, Request, Response } from 'express';
import { ErrorResponse } from '../types/api.types';
import { logger } from '../utils/logger';

/**
 * Application-specific error carrying an HTTP status code.
 *
 * Throw this anywhere in the request lifecycle to produce a controlled,
 * well-formed error response instead of a generic 500.
 */
export class ApiError extends Error {
  public readonly statusCode: number;
  public readonly details?: unknown;

  constructor(statusCode: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.details = details;
    // Restore prototype chain (required when extending built-ins in TS).
    Object.setPrototypeOf(this, ApiError.prototype);
  }
}

/**
 * 404 handler for unknown routes. Registered after all real routes.
 */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
}

/**
 * Centralized error-handling middleware. Must be registered last and must
 * keep all four parameters so Express recognizes it as an error handler.
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response<ErrorResponse>,
  _next: NextFunction
): void {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let name = 'InternalServerError';
  let details: unknown;

  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    name = err.name;
    details = err.details;
  } else if (err instanceof Error) {
    message = err.message || message;
    name = err.name || name;
  }

  if (statusCode >= 500) {
    logger.error(`Unhandled error: ${message}`, err);
  } else {
    logger.warn(`Request failed (${statusCode}): ${message}`);
  }

  const body: ErrorResponse = {
    success: false,
    message,
    error: {
      name,
      statusCode,
      ...(details !== undefined ? { details } : {}),
    },
  };

  res.status(statusCode).json(body);
}
