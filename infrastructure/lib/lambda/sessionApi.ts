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
    // Extract userId from query parameters
    const userId = event.queryStringParameters?.userId;

    if (!userId) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
        },
        body: JSON.stringify({
          error: 'invalid_request',
          message: 'userId query parameter is required',
        }),
      };
    }

    console.log('Querying sessions for userId:', userId);

    // Query DynamoDB GSI
    const now = Math.floor(Date.now() / 1000);
    const command = new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'userId-expiresAt-index',
      KeyConditionExpression: 'userId = :userId AND expiresAt > :now',
      ExpressionAttributeValues: {
        ':userId': { S: userId },
        ':now': { N: now.toString() },
      },
      ScanIndexForward: false, // Sort descending (newest first)
      Limit: 20,
    });

    const response = await dynamoClient.send(command);

    // Parse sessions
    const sessions: Session[] = (response.Items || []).map((item) => {
      const session = unmarshall(item) as Session;
      // Sanitize - don't include full sessionData
      return {
        sid: session.sid,
        userId: session.userId,
        email: session.email,
        loginTime: session.loginTime,
        expiresAt: session.expiresAt,
        lastActivityAt: session.lastActivityAt,
        ipAddress: session.ipAddress,
        userAgent: session.userAgent,
      };
    });

    console.log(`Found ${sessions.length} sessions for user ${userId}`);

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
