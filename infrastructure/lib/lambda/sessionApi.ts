// Lambda function code for Session API
// This will be bundled by CDK

import { DynamoDBClient, QueryCommand } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';

const dynamoClient = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME || '';

interface Session {
  sid: string;
  userId: string;
  email: string;
  loginTime: number;
  expiresAt: number;
  lastActivityAt: number;
  ipAddress?: string;
  userAgent?: string;
}

export const handler = async (event: any) => {
  console.log('Event:', JSON.stringify(event, null, 2));

  try {
    // Extract userId from query parameters (with URL decoding)
    const rawUserId = event.queryStringParameters?.user_id;

    if (!rawUserId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
        body: JSON.stringify({
          error: 'invalid_request',
          message: 'user_id query parameter is required',
        }),
      };
    }

    // Decode URL-encoded userId (handles auth0|xxx format)
    const userId = decodeURIComponent(rawUserId);
    console.log('Querying sessions for userId:', userId);

    // Query DynamoDB GSI
    const now = Math.floor(Date.now() / 1000);
    const IDLE_TIMEOUT_SECONDS = 15 * 60; // 15 minutes

    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'user_id-index',
      KeyConditionExpression: 'user_id = :userId',
      ExpressionAttributeValues: {
        ':userId': { S: userId },
      },
      ScanIndexForward: false, // Sort descending (newest first)
    });

    const response = await dynamoClient.send(command);
    const items = response.Items || [];

    console.log(`Found ${items.length} total sessions in DB for user ${userId}`);

    if (items.length === 0) {
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
        body: JSON.stringify({
          success: true,
          count: 0,
          sessions: [],
        }),
      };
    }

    // Parse all sessions and filter out expired ones
    const allSessions = items.map((item) => unmarshall(item));
    const activeSessions = allSessions.filter((session: any) => {
      const expired = session.expires_at && session.expires_at < now;
      if (expired) {
        console.log(`Session ${session.session_id} is expired (expires_at: ${session.expires_at}, now: ${now})`);
      }
      return !expired;
    });

    console.log(`${activeSessions.length} sessions are not expired`);

    if (activeSessions.length === 0) {
      console.log('All sessions expired');
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
        body: JSON.stringify({
          success: true,
          count: 0,
          sessions: [],
        }),
      };
    }

    // Find most recent login time (for sliding idle timeout)
    const mostRecentLoginTime = Math.max(
      ...activeSessions.map((s: any) => s.login_time || s.last_activity || 0)
    );

    const idleSeconds = now - mostRecentLoginTime;
    console.log(`Most recent login: ${mostRecentLoginTime}, idle for: ${idleSeconds}s (${Math.floor(idleSeconds / 60)}m)`);

    // Check sliding idle timeout
    if (idleSeconds > IDLE_TIMEOUT_SECONDS) {
      console.log(`User idle timeout exceeded (${Math.floor(idleSeconds / 60)}m > 15m) - returning empty list`);
      return {
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
        body: JSON.stringify({
          success: true,
          count: 0,
          sessions: [],
          idle_timeout: true,
        }),
      };
    }

    // Return active sessions (sanitized)
    const sessions = activeSessions.map((session: any) => ({
      session_id: session.session_id,
      user_id: session.user_id,
      email: session.email,
      login_time: session.login_time,
      expires_at: session.expires_at,
      last_activity: session.last_activity,
      status: session.status,
      ip_address: session.ip_address,
      user_agent: session.user_agent,
    }));

    console.log(`Returning ${sessions.length} active sessions`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: JSON.stringify({
        success: true,
        count: sessions.length,
        sessions,
      }),
    };
  } catch (error) {
    console.error('Error:', error);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
      },
      body: JSON.stringify({
        error: 'server_error',
        message: 'Failed to retrieve sessions',
      }),
    };
  }
};
