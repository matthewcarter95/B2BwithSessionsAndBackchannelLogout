import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'express-async-errors';
import { config } from './config';
import { requestLogger, bodyLogger } from './middleware/logging';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import logoutRoutes from './routes/logout';
import sessionRoutes from './routes/sessions';

const app: Application = express();

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: config.cors.origin,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
}));

// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Request ID middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  req.headers['x-request-id'] =
    req.headers['x-correlation-id'] as string ||
    req.headers['x-request-id'] as string ||
    `req-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  next();
});

// Logging middleware
app.use(requestLogger);
app.use(bodyLogger);

// Health check endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: config.nodeEnv,
  });
});

// Root endpoint
app.get('/', (_req: Request, res: Response) => {
  res.json({
    name: 'B2B Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      backchannelLogout: 'POST /logout/backchannel',
      sessions: 'GET /sessions',
    },
  });
});

// API Routes
app.use('/logout', logoutRoutes);
app.use('/sessions', sessionRoutes);

// 404 handler
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(errorHandler);

export default app;
