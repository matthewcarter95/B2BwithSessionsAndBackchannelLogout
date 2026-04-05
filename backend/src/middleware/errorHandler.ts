import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

/**
 * Custom error class with status code
 */
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * Error handler middleware
 * Catches all errors and formats them consistently
 */
export function errorHandler(
  err: Error | ApiError,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Default to 500 server error
  let statusCode = 500;
  let message = 'Internal Server Error';
  let details: any = undefined;

  // Check if it's our custom ApiError
  if (err instanceof ApiError) {
    statusCode = err.statusCode;
    message = err.message;
    details = err.details;
  } else {
    // Handle known error types
    if (err.name === 'ValidationError') {
      statusCode = 400;
      message = 'Validation Error';
      details = err.message;
    } else if (err.name === 'UnauthorizedError') {
      statusCode = 401;
      message = 'Unauthorized';
    } else if (err.name === 'ForbiddenError') {
      statusCode = 403;
      message = 'Forbidden';
    } else if (err.name === 'NotFoundError') {
      statusCode = 404;
      message = 'Not Found';
    } else if (err.name === 'ConflictError') {
      statusCode = 409;
      message = 'Conflict';
    } else if (err.name === 'TooManyRequestsError') {
      statusCode = 429;
      message = 'Too Many Requests';
    }
  }

  // Log the error
  console.error('❌ Error:', {
    statusCode,
    message,
    error: err.message,
    stack: config.nodeEnv === 'development' ? err.stack : undefined,
    path: req.path,
    method: req.method,
    requestId: req.headers['x-request-id'],
  });

  // Send error response
  res.status(statusCode).json({
    error: err.name || 'Error',
    message: config.nodeEnv === 'production' ? message : err.message,
    statusCode,
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString(),
    path: req.path,
    ...(details && { details }),
    ...(config.nodeEnv === 'development' && { stack: err.stack }),
  });
}

/**
 * 404 Not Found handler
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} not found`,
    statusCode: 404,
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString(),
    availableRoutes: {
      health: 'GET /health',
      backchannelLogout: 'POST /logout/backchannel',
      backchannelInfo: 'GET /logout/backchannel',
    },
  });
}

/**
 * Async error wrapper
 * Wraps async route handlers to catch errors
 */
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
