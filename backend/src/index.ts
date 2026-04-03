import app from './app';
import { config, validateConfig } from './config';

// Validate configuration on startup
try {
  validateConfig();
  console.log('✅ Configuration validated successfully');
} catch (error) {
  console.error('❌ Configuration validation failed:', (error as Error).message);
  process.exit(1);
}

// Start server
const server = app.listen(config.port, () => {
  console.log(`🚀 Server running on port ${config.port}`);
  console.log(`   Environment: ${config.nodeEnv}`);
  console.log(`   Log Level: ${config.logLevel}`);
  console.log(`   Auth0 Domain: ${config.auth0.domain}`);
  console.log(`   DynamoDB Table: ${config.aws.dynamoTableName}`);
  console.log(`\n📍 Health check: http://localhost:${config.port}/health`);
});

// Graceful shutdown
const shutdown = (signal: string) => {
  console.log(`\n${signal} received. Closing server gracefully...`);

  server.close(() => {
    console.log('✅ Server closed');
    console.log('🔌 Closing database connections...');

    // Add cleanup logic here (close DB connections, etc.)

    console.log('👋 Shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('⚠️  Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

export default server;
