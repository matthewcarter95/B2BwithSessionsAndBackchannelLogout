import { Request, Response, NextFunction } from 'express';

/**
 * Request logging middleware
 * Logs all incoming requests with timing information
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log request
  console.log('📥 Incoming request:', {
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip || req.socket.remoteAddress,
    userAgent: req.headers['user-agent'],
    requestId: req.headers['x-request-id'],
    timestamp: new Date().toISOString(),
  });

  // Log response
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const logLevel = res.statusCode >= 500 ? '❌' : res.statusCode >= 400 ? '⚠️' : '✅';

    console.log(`${logLevel} Response:`, {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      requestId: req.headers['x-request-id'],
    });
  });

  next();
}

/**
 * Sanitize sensitive data from logs
 */
export function sanitizeForLog(obj: any): any {
  if (!obj || typeof obj !== 'object') {
    return obj;
  }

  const sensitiveKeys = [
    'password',
    'token',
    'secret',
    'authorization',
    'cookie',
    'access_token',
    'refresh_token',
    'id_token',
    'logout_token',
  ];

  const sanitized = { ...obj };

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();

    if (sensitiveKeys.some((sensitive) => lowerKey.includes(sensitive))) {
      if (typeof sanitized[key] === 'string' && sanitized[key].length > 10) {
        // Show only first 10 characters
        sanitized[key] = sanitized[key].substring(0, 10) + '...[REDACTED]';
      } else {
        sanitized[key] = '[REDACTED]';
      }
    } else if (typeof sanitized[key] === 'object') {
      sanitized[key] = sanitizeForLog(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Body logging middleware (with sanitization)
 */
export function bodyLogger(req: Request, _res: Response, next: NextFunction): void {
  if (req.body && Object.keys(req.body).length > 0) {
    console.log('📦 Request body:', sanitizeForLog(req.body));
  }

  next();
}
