import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand } from "@aws-sdk/lib-dynamodb";

const client = new DynamoDBClient({});
const docClient = DynamoDBDocumentClient.from(client);

const IDLE_TIMEOUT_SECONDS = 15 * 60; // 15 minutes

export const handler = async (event) => {
    // 1. Get the raw value from query parameters
    const rawUserId = event.queryStringParameters?.user_id;

    if (!rawUserId) {
        return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Missing user_id query parameter" })
        };
    }

    // 2. DECODE the value (This turns %7C back into |)
    const userId = decodeURIComponent(rawUserId);
    console.log("Searching for Decoded User ID:", userId);

    const params = {
        TableName: "Auth0Sessions",
        IndexName: "user_id-index",
        KeyConditionExpression: "user_id = :uid",
        ExpressionAttributeValues: {
            ":uid": userId // Now it matches "auth0|..."
        }
    };

    try {
        const data = await docClient.send(new QueryCommand(params));
        const items = data.Items || [];

        console.log(`Found ${items.length} total sessions in DB for user ${userId}`);

        if (items.length === 0) {
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    session_count: 0,
                    sessions: []
                }),
            };
        }

        // Get current timestamp
        const now = Math.floor(Date.now() / 1000);

        // Filter out expired sessions
        const activeSessions = items.filter((session) => {
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
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    session_count: 0,
                    sessions: []
                }),
            };
        }

        // Find most recent login time (for sliding idle timeout)
        const mostRecentLoginTime = Math.max(
            ...activeSessions.map((s) => s.login_time || s.last_activity || 0)
        );

        const idleSeconds = now - mostRecentLoginTime;
        console.log(`Most recent login: ${mostRecentLoginTime}, idle for: ${idleSeconds}s (${Math.floor(idleSeconds / 60)}m)`);

        // Check sliding idle timeout - if user has been idle > 15 minutes, return empty list
        if (idleSeconds > IDLE_TIMEOUT_SECONDS) {
            console.log(`User idle timeout exceeded (${Math.floor(idleSeconds / 60)}m > 15m) - returning empty list`);
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    session_count: 0,
                    sessions: [],
                    idle_timeout: true
                }),
            };
        }

        // Return active sessions
        console.log(`Returning ${activeSessions.length} active sessions`);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: userId,
                session_count: activeSessions.length,
                sessions: activeSessions
            }),
        };
    } catch (err) {
        console.error("DynamoDB Query Error:", err);
        return {
            statusCode: 500,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ error: "Could not retrieve sessions" }),
        };
    }
};
