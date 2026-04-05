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
 * Get session by session_id
 */
export async function getSession(sessionId: string): Promise<Session | null> {
  try {
    const command = new GetItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ session_id: sessionId }),
    });

    const response = await dynamoClient.send(command);

    if (!response.Item) {
      console.log(`Session not found: ${sessionId}`);
      return null;
    }

    const session = unmarshall(response.Item) as Session;

    // Check if session is expired
    const now = Math.floor(Date.now() / 1000);
    if (session.expires_at && session.expires_at < now) {
      console.log(`Session expired: ${sessionId}`);
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
export async function createSession(sessionData: Pick<Session, 'session_id' | 'user_id'> & Partial<Session>): Promise<Session> {
  const now = Math.floor(Date.now() / 1000);
  const twentyFourHoursLater = now + 24 * 60 * 60; // 24 hours from now

  const session: Session = {
    ...sessionData,
    login_time: sessionData.login_time || now,
    expires_at: sessionData.expires_at || twentyFourHoursLater,
    last_activity: sessionData.last_activity || now,
    status: sessionData.status || 'active',
  };

  try {
    const command = new PutItemCommand({
      TableName: TABLE_NAME,
      Item: marshall(session, { removeUndefinedValues: true }),
      // Prevent overwriting existing session
      ConditionExpression: 'attribute_not_exists(session_id)',
    });

    await dynamoClient.send(command);

    console.log('✅ Session created:', {
      session_id: session.session_id,
      user_id: session.user_id,
      expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A',
    });

    return session;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.warn('Session already exists:', sessionData.session_id);
      throw new Error('Session already exists');
    }

    console.error('Error creating session:', error);
    throw new Error('Failed to create session');
  }
}

/**
 * Delete session by session_id
 */
export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    // First, get the session to return its data
    const session = await getSession(sessionId);

    if (!session) {
      console.log(`Session not found for deletion: ${sessionId}`);
      return false;
    }

    const command = new DeleteItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ session_id: sessionId }),
      // Ensure we only delete if it exists
      ConditionExpression: 'attribute_exists(session_id)',
    });

    await dynamoClient.send(command);

    console.log('✅ Session deleted:', {
      session_id: sessionId,
      user_id: session.user_id,
    });

    return true;
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.warn('Session already deleted:', sessionId);
      return false;
    }

    console.error('Error deleting session:', error);
    throw new Error('Failed to delete session');
  }
}

/**
 * List sessions by user_id using GSI
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
      IndexName: 'user_id-index',
      KeyConditionExpression: 'user_id = :user_id',
      ExpressionAttributeValues: marshall({
        ':user_id': userId,
      }),
      ScanIndexForward: false, // Newest first
      Limit: options?.limit || 20,
      ...(options?.exclusiveStartKey && {
        ExclusiveStartKey: marshall(options.exclusiveStartKey),
      }),
    });

    const response = await dynamoClient.send(command);

    // Filter out expired sessions
    const sessions = (response.Items || [])
      .map((item) => unmarshall(item) as Session)
      .filter((session) => !session.expires_at || session.expires_at > now);

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
export async function updateSessionActivity(sessionId: string): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);

    const command = new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: marshall({ session_id: sessionId }),
      UpdateExpression: 'SET last_activity = :now',
      ExpressionAttributeValues: marshall({
        ':now': now,
      }),
      ConditionExpression: 'attribute_exists(session_id)',
    });

    await dynamoClient.send(command);

    console.log('✅ Session activity updated:', sessionId);
  } catch (error: any) {
    if (error.name === 'ConditionalCheckFailedException') {
      console.warn('Session does not exist:', sessionId);
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
      IndexName: 'user_id-index',
      KeyConditionExpression: 'user_id = :user_id',
      ExpressionAttributeValues: marshall({
        ':user_id': userId,
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
  const { session_data, ...sanitized } = session;

  return {
    ...sanitized,
    // Only include non-sensitive session data
    session_data: {
      email: session_data?.email,
      name: session_data?.name,
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
      Key: marshall({ session_id: 'health-check' }),
    });

    await dynamoClient.send(command);
    return true;
  } catch (error) {
    console.error('DynamoDB connection check failed:', error);
    return false;
  }
}
