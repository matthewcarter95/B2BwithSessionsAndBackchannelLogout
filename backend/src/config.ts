import { config as dotenvConfig } from 'dotenv';
import { AppConfig } from './types';

// Load environment variables
dotenvConfig();

export const config: AppConfig = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  auth0: {
    domain: process.env.AUTH0_DOMAIN || '',
    clientId: process.env.AUTH0_CLIENT_ID || '',
    m2mClientId: process.env.AUTH0_M2M_CLIENT_ID || '',
    m2mClientSecret: process.env.AUTH0_M2M_CLIENT_SECRET || '',
    audience: process.env.AUTH0_AUDIENCE || '',
  },
  aws: {
    region: process.env.AWS_REGION || 'us-east-1',
    dynamoTableName: process.env.DYNAMODB_TABLE_NAME || 'b2b-sessions',
    dynamoAuditTableName: process.env.DYNAMODB_AUDIT_TABLE_NAME,
    dynamoEndpoint: process.env.DYNAMODB_ENDPOINT,
  },
  cors: {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  },
};

// Validate required configuration
export function validateConfig(): void {
  const required = {
    'AUTH0_DOMAIN': config.auth0.domain,
    'AUTH0_CLIENT_ID': config.auth0.clientId,
    'DYNAMODB_TABLE_NAME': config.aws.dynamoTableName,
  };

  const missing = Object.entries(required)
    .filter(([_, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(', ')}\n` +
      'Please check your .env file or environment configuration.'
    );
  }
}
