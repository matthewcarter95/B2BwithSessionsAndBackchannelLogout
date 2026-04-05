import { Request } from 'express';

// Session types
// Note: DynamoDB table uses snake_case attribute names
export interface Session {
  session_id: string; // Maps to DynamoDB session_id (partition key)
  user_id: string; // Maps to DynamoDB user_id (GSI key)
  expires_at?: number; // Unix timestamp
  last_activity?: number; // Unix timestamp (note: field name is last_activity, not last_activity_at)
  status?: string;
  // Optional fields that may exist in sessions
  email?: string;
  tenant_id?: string;
  session_data?: Record<string, any>;
  login_time?: number;
  ip_address?: string;
  user_agent?: string;
}

// Auth0 types
export interface Auth0Config {
  domain: string;
  clientId: string;
  m2mClientId: string;
  m2mClientSecret: string;
  audience: string;
}

export interface M2MToken {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export interface Auth0Session {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  authenticated_at: string;
  authentication_methods: any[];
  device?: {
    user_agent?: string;
    ip?: string;
  };
}

// JWT types
export interface LogoutTokenPayload {
  iss: string;
  sub: string;
  aud: string | string[];
  iat: number;
  exp: number;
  sid?: string; // Can be at top level or in events
  events: {
    'http://schemas.openid.net/event/backchannel-logout'?: {
      sid?: string;
    };
    'http://openid.net/specs/openid-connect-backchannel-1_0.html#event'?: {
      sid?: string;
    };
    [key: string]: any; // Allow other event types
  };
}

export interface DecodedToken {
  header: {
    alg: string;
    typ: string;
    kid: string;
  };
  payload: LogoutTokenPayload;
}

// API types
export interface ApiError {
  error: string;
  message: string;
  statusCode: number;
  requestId?: string;
  timestamp: string;
  details?: any;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: ApiError;
}

// Request extensions
export interface AuthenticatedRequest extends Request {
  user?: {
    sub: string;
    email?: string;
  };
  requestId?: string;
}

// Config types
export interface AppConfig {
  port: number;
  nodeEnv: string;
  logLevel: string;
  auth0: Auth0Config;
  aws: {
    region: string;
    dynamoTableName: string;
    dynamoAuditTableName?: string;
    dynamoEndpoint?: string;
  };
  cors: {
    origin: string | string[];
  };
}

// Audit log types
export interface AuditEvent {
  eventId: string;
  timestamp: number;
  eventType: 'LOGIN' | 'LOGOUT' | 'BACKCHANNEL_LOGOUT' | 'SESSION_CREATED' | 'SESSION_DELETED';
  userId: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  details?: Record<string, any>;
}
