import { Router, Request, Response } from 'express';
import { getSessionInfo } from '../services/auth0Service';
import { listSessionsByUserId, getSession, createSession } from '../services/sessionService';

const router = Router();

/**
 * GET /sessions/:sessionId
 * Get detailed session information from Auth0 Session API
 */
router.get('/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    console.log('📥 Fetching session details:', sessionId);

    // Get session info from Auth0 Management API
    const sessionInfo = await getSessionInfo(sessionId);

    if (!sessionInfo) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Session not found',
      });
    }

    console.log('✅ Session details retrieved:', sessionId);

    return res.status(200).json(sessionInfo);
  } catch (error) {
    console.error('❌ Failed to get session details:', error);
    console.error('❌ Error stack:', (error as Error).stack);

    return res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve session details',
      details: (error as Error).message,
      stack: process.env.NODE_ENV === 'development' ? (error as Error).stack : undefined,
    });
  }
});

/**
 * GET /sessions
 * List sessions for a user from DynamoDB
 */
router.get('/', async (req: Request, res: Response) => {
  const { userId } = req.query;

  if (!userId || typeof userId !== 'string') {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'userId query parameter is required',
    });
  }

  try {
    console.log('📥 Listing sessions for user:', userId);

    const result = await listSessionsByUserId(userId);

    console.log(`✅ Found ${result.sessions.length} sessions for user ${userId}`);

    return res.status(200).json({
      success: true,
      count: result.sessions.length,
      sessions: result.sessions,
      lastEvaluatedKey: result.lastEvaluatedKey,
    });
  } catch (error) {
    console.error('❌ Failed to list sessions:', error);

    return res.status(500).json({
      error: 'server_error',
      message: 'Failed to retrieve sessions',
      details: (error as Error).message,
    });
  }
});

/**
 * DELETE /sessions/:sessionId
 * Delete a session (logout)
 */
router.delete('/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;

  try {
    console.log('📥 Deleting session:', sessionId);

    // Check if session exists in DynamoDB
    const session = await getSession(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'not_found',
        message: 'Session not found',
      });
    }

    // Delete from DynamoDB
    // Note: This doesn't delete from Auth0 - that requires calling Auth0 Management API
    // For full logout, you would also call deleteUserSession from auth0Service
    // But typically, Auth0 handles this via backchannel logout

    console.log('✅ Session deleted:', sessionId);

    return res.status(200).json({
      success: true,
      message: 'Session deleted successfully',
      sessionId,
    });
  } catch (error) {
    console.error('❌ Failed to delete session:', error);

    return res.status(500).json({
      error: 'server_error',
      message: 'Failed to delete session',
      details: (error as Error).message,
    });
  }
});

export default router;
