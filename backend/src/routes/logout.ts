import { Router, Request, Response } from 'express';
import { validateLogoutToken } from '../services/tokenValidator';
import { getSession, deleteSession } from '../services/sessionService';

const router = Router();

/**
 * POST /logout/backchannel
 * OIDC Backchannel Logout Endpoint
 *
 * Receives logout tokens from Auth0 when a user logs out or their session expires.
 * Validates the token and deletes the associated session from DynamoDB.
 */
router.post('/backchannel', async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // Extract logout_token from request body
    const { logout_token } = req.body;

    if (!logout_token) {
      console.error('❌ Missing logout_token in request body');
      return res.status(400).json({
        error: 'invalid_request',
        message: 'logout_token is required',
      });
    }

    if (typeof logout_token !== 'string') {
      console.error('❌ Invalid logout_token type');
      return res.status(400).json({
        error: 'invalid_request',
        message: 'logout_token must be a string',
      });
    }

    console.log('📨 Backchannel logout request received');

    // Step 1: Validate logout token and extract sid
    let sid: string;
    let payload: any;

    try {
      const result = await validateLogoutToken(logout_token);
      sid = result.sid;
      payload = result.payload;

      console.log('✅ Token validated successfully', {
        sid,
        sub: payload.sub,
        iat: new Date(payload.iat * 1000).toISOString(),
      });
    } catch (error) {
      console.error('❌ Token validation failed:', (error as Error).message);
      return res.status(401).json({
        error: 'invalid_token',
        message: (error as Error).message,
      });
    }

    // Step 2: Get session from DynamoDB
    // Note: Auth0 sends "sid" but DynamoDB table uses "session_id"
    const session = await getSession(sid);

    if (!session) {
      console.warn('⚠️  Session not found in DynamoDB:', sid);
      // Per OIDC spec, return 200 OK even if session doesn't exist
      // (idempotent operation)
      return res.status(200).json({
        success: true,
        message: 'Session not found (may already be deleted)',
        sid,
      });
    }

    console.log('📦 Session found:', {
      session_id: session.session_id,
      user_id: session.user_id,
      email: session.email || 'N/A',
      last_activity: session.last_activity ? new Date(session.last_activity * 1000).toISOString() : 'N/A',
      expires_at: session.expires_at ? new Date(session.expires_at * 1000).toISOString() : 'N/A',
    });

    // Step 3: Delete session from DynamoDB
    const deleted = await deleteSession(sid);

    if (deleted) {
      console.log('✅ Session deleted successfully:', sid);
    } else {
      console.warn('⚠️  Session was already deleted:', sid);
    }

    // Step 4: Log audit event (optional - implement if audit table exists)
    // await logAuditEvent({
    //   eventType: 'BACKCHANNEL_LOGOUT',
    //   userId: session.userId,
    //   sessionId: sid,
    //   timestamp: Date.now(),
    //   details: { sub: payload.sub },
    // });

    const duration = Date.now() - startTime;
    console.log(`✅ Backchannel logout completed in ${duration}ms`);

    // Return 200 OK (per OIDC spec)
    return res.status(200).json({
      success: true,
      sid,
      session_id: session.session_id,
      user_id: session.user_id,
      processedAt: new Date().toISOString(),
      duration: `${duration}ms`,
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error('❌ Backchannel logout failed:', error);

    // Return 500 for unexpected errors
    return res.status(500).json({
      error: 'server_error',
      message: 'Failed to process backchannel logout',
      details: config.nodeEnv === 'development' ? (error as Error).message : undefined,
      duration: `${duration}ms`,
    });
  }
});

/**
 * GET /logout/backchannel
 * Info endpoint for backchannel logout
 *
 * Returns information about the backchannel logout configuration.
 * Useful for debugging and verification.
 */
router.get('/backchannel', (_req: Request, res: Response) => {
  res.json({
    endpoint: '/logout/backchannel',
    method: 'POST',
    description: 'OIDC Backchannel Logout Endpoint',
    spec: 'https://openid.net/specs/openid-connect-backchannel-1_0.html',
    configuration: {
      auth0_domain: config.auth0.domain,
      expected_audience: config.auth0.clientId,
      dynamodb_table: config.aws.dynamoTableName,
    },
    usage: {
      contentType: 'application/x-www-form-urlencoded or application/json',
      body: {
        logout_token: 'JWT token from Auth0',
      },
    },
    example: {
      request: {
        method: 'POST',
        url: '/logout/backchannel',
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          logout_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...',
        },
      },
      response: {
        success: true,
        sid: 'session-id',
        userId: 'auth0|user-id',
        processedAt: '2024-01-01T00:00:00.000Z',
      },
    },
  });
});

// Import config at the top with other imports
import { config } from '../config';

export default router;
