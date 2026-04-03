import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  DeleteItemCommand,
  QueryCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { config } from '../config';
import { Session } from '../types';

// Initialize DynamoDB client
const dynamoClient = new DynamoDBClient({
  region: config.aws.region,
  ...(config.aws.dynamoEndpoint && { endpoint: config.aws.dynamoEndpoint }),
});

const TABLE_NAME = config.aws.dynamoTableName;

/**
 * Get session by sid
 */
export async function getSession(sid: string): Promise<Session | null> {
  try {
    const command = new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ sid }),
    });

    const response = await dynamoClient.send(command);

    if (!response.Item) {
      console.log(`Session not found: ${sid}`);
      return null;
    }

    const session = unmarshall(response.Item) as Session;

    // Check if session is expired
    const now = Math.floor(Date.now() / 1000);
    if (session.expiresAt < now) {
      console.log(`Session expired: ${sid}`);
      return null;
    }

    return session;
  } catch (error) {
    console.error('Error getting session:', error);
    throw new Error('Failed to retrieve session');
  }
}

/**
 * Create new session
 */
export async function createSession(sessionData: Omit<Session, 'loginTime' | 'expiresAt' | 'lastActivityAt'>): Promise<Session> {
  const now = Math.floor(Date.now() / 1000);
  const twentyFourHoursLater = now + 24 * 60 * 60; // 24 hours from now

  const session: Session = {
    ...sessionData,
    loginTime: now,
    expiresAt: twentyFourHoursLater,
    lastActivityAt: now,
  };

  try {
    const command = new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(session, { removeUndefinedValues: true }),
      // Prevent overwriting existing session
      ConditionExpression: 'attribute_not_exists(sid)',
    });

    await dynamoClient.send(command);

    console.log('✅ Session created:', {
      sid: session.sid,
      userId: session.userId,
      expiresAt: new Date(session.expiresAt * 1000).toISOString(),
    });

    return session;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.warn('Session already exists:', sessionData.sid);
      throw new Error('Session already exists');
    }

    console.error('Error creating session:', error);
    throw new Error('Failed to create session');
  }
}

/**
 * Delete session by sid
 */
export async function deleteSession(sid: string): Promise<boolean> {
  try {
    // First, get the session to return its data
    const session = await getSession(sid);

    if (!session) {
      console.log(`Session not found for deletion: ${sid}`);
      return false;
    }

    const command = new DeleteItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ sid }),
      // Ensure we only delete if it exists
      ConditionExpression: 'attribute_exists(sid)',
    });

    await dynamoClient.send(command);

    console.log('✅ Session deleted:', {
      sid,
      userId: session.userId,
    });

    return true;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.warn('Session already deleted:', sid);
      return false;
    }

    console.error('Error deleting session:', error);
    throw new Error('Failed to delete session');
  }
}

/**
 * List sessions by userId using GSI
 */
export async function listSessionsByUserId(
  userId: string,
  options?: {
    limit?: number;
    exclusiveStartKey?: Record<string, any>;
  }
): Promise<{
  sessions: Session[];
  lastEvaluatedKey?: Record<string, any>;
}> {
  try {
    const now = Math.floor(Date.now() / 1000);

    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'userId-expiresAt-index',
      KeyConditionExpression: 'userId = :userId AND expiresAt > :now',
      ExpressionAttributeValues: marshall({
        ':userId': userId,
        ':now': now,
      }),
      ScanIndexForward: false, // Sort by expiresAt descending (newest first)
      Limit: options?.limit || 20,
      ...(options?.exclusiveStartKey && {
        ExclusiveStartKey: marshall(options.exclusiveStartKey),
      }),
    });

    const response = await dynamoClient.send(command);

    const sessions = (response.Items || []).map((item) => unmarshall(item) as Session);

    return {
      sessions,
      lastEvaluatedKey: response.LastEvaluatedKey
        ? unmarshall(response.LastEvaluatedKey)
        : undefined,
    };
  } catch (error) {
    console.error('Error listing sessions:', error);
    throw new Error('Failed to list sessions');
  }
}

/**
 * Update session activity timestamp
 */
export async function updateSessionActivity(sid: string): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);

    const command = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ sid }),
      UpdateExpression: 'SET lastActivityAt = :now',
      ExpressionAttributeValues: marshall({
        ':now': now,
      }),
      ConditionExpression: 'attribute_exists(sid)',
    });

    await dynamoClient.send(command);

    console.log('✅ Session activity updated:', sid);
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.warn('Session does not exist:', sid);
      return;
    }

    console.error('Error updating session activity:', error);
    throw new Error('Failed to update session activity');
  }
}

/**
 * Get all sessions for a user (without filtering expired)
 * Useful for admin views
 */
export async function getAllSessionsByUserId(userId: string): Promise<Session[]> {
  try {
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'userId-expiresAt-index',
      KeyConditionExpression: 'userId = :userId',
      ExpressionAttributeValues: marshall({
        ':userId': userId,
      }),
      ScanIndexForward: false,
    });

    const response = await dynamoClient.send(command);

    return (response.Items || []).map((item) => unmarshall(item) as Session);
  } catch (error) {
    console.error('Error getting all sessions:', error);
    throw new Error('Failed to get all sessions');
  }
}

/**
 * Sanitize session data for API response (remove sensitive fields)
 */
export function sanitizeSession(session: Session): Partial<Session> {
  const { sessionData, ...sanitized } = session;

  return {
    ...sanitized,
    // Only include non-sensitive session data
    sessionData: {
      email: sessionData.email,
      name: sessionData.name,
      // Don't include full token claims
    },
  };
}

/**
 * Check DynamoDB connection
 */
export async function checkConnection(): Promise<boolean> {
  try {
    // Try to get a non-existent item to test connection
    const command = new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ sid: 'health-check' }),
    });

    await dynamoClient.send(command);
    return true;
  } catch (error) {
    console.error('DynamoDB connection check failed:', error);
    return false;
  }
}
