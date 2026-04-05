import axios, { AxiosError } from 'axios';
import { config } from '../config';
import { M2MToken, Auth0Session } from '../types';

// Token cache
interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

/**
 * Get M2M access token for Auth0 Management API
 */
export async function getM2MToken(forceRefresh = false): Promise<string> {
  // Check cache first (with 5 minute buffer before expiration)
  const now = Math.floor(Date.now() / 1000);
  if (!forceRefresh && tokenCache && tokenCache.expiresAt > now + 300) {
    console.log('✅ Using cached M2M token');
    return tokenCache.token;
  }

  try {
    console.log('🔄 Requesting new M2M token from Auth0...');

    const response = await axios.post<M2MToken>(
      `https://${config.auth0.domain}/oauth/token`,
      {
        client_id: config.auth0.m2mClientId,
        client_secret: config.auth0.m2mClientSecret,
        audience: config.auth0.audience,
        grant_type: 'client_credentials',
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const { access_token, expires_in } = response.data;

    // Cache the token
    tokenCache = {
      token: access_token,
      expiresAt: now + expires_in,
    };

    console.log('✅ M2M token acquired', {
      expiresIn: expires_in,
      expiresAt: new Date(tokenCache.expiresAt * 1000).toISOString(),
    });

    return access_token;
  } catch (error) {
    console.error('❌ Failed to get M2M token:', error);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response) {
        console.error('Response data:', axiosError.response.data);
        throw new Error(
          `Auth0 token request failed: ${axiosError.response.status} - ${JSON.stringify(
            axiosError.response.data
          )}`
        );
      } else if (axiosError.request) {
        throw new Error('Auth0 token request failed: No response received');
      }
    }

    throw new Error('Failed to acquire M2M token');
  }
}

/**
 * Get user sessions from Auth0 Management API
 */
export async function getUserSessions(userId: string): Promise<Auth0Session[]> {
  try {
    const token = await getM2MToken();

    const response = await axios.get<Auth0Session[]>(
      `https://${config.auth0.domain}/api/v2/users/${userId}/sessions`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log(`✅ Retrieved ${response.data.length} sessions for user ${userId}`);

    return response.data;
  } catch (error) {
    console.error('❌ Failed to get user sessions:', error);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 401) {
        // Token might be expired, try refreshing
        console.log('🔄 Token expired, refreshing...');
        const token = await getM2MToken(true);

        // Retry request with new token
        const retryResponse = await axios.get<Auth0Session[]>(
          `https://${config.auth0.domain}/api/v2/users/${userId}/sessions`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        return retryResponse.data;
      } else if (axiosError.response?.status === 404) {
        console.log('User not found or no sessions');
        return [];
      } else if (axiosError.response?.status === 429) {
        throw new Error('Rate limit exceeded - too many requests to Auth0 API');
      }
    }

    throw new Error('Failed to retrieve user sessions from Auth0');
  }
}

/**
 * Get specific session details from Auth0
 */
export async function getSessionInfo(sessionId: string): Promise<Auth0Session | null> {
  try {
    const token = await getM2MToken();

    console.log(`🔍 Calling Auth0 Sessions API: https://${config.auth0.domain}/api/v2/sessions/${sessionId}`);

    const response = await axios.get<Auth0Session>(
      `https://${config.auth0.domain}/api/v2/sessions/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('✅ Retrieved session info:', sessionId);

    return response.data;
  } catch (error) {
    console.error('❌ Failed to get session info:', error);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      console.error('❌ Status:', axiosError.response?.status);
      console.error('❌ Response data:', JSON.stringify(axiosError.response?.data, null, 2));

      if (axiosError.response?.status === 404) {
        console.log('Session not found:', sessionId);
        return null;
      } else if (axiosError.response?.status === 401) {
        // Token expired, refresh and retry
        console.log('🔄 Token expired, retrying with fresh token...');
        const token = await getM2MToken(true);

        const retryResponse = await axios.get<Auth0Session>(
          `https://${config.auth0.domain}/api/v2/sessions/${sessionId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        return retryResponse.data;
      } else if (axiosError.response?.status === 403) {
        throw new Error(`Auth0 API access forbidden. Check M2M application scopes. Response: ${JSON.stringify(axiosError.response?.data)}`);
      }
    }

    throw new Error('Failed to retrieve session info from Auth0');
  }
}

/**
 * Delete a specific session from Auth0 (optional - for manual logout)
 */
export async function deleteUserSession(
  userId: string,
  sessionId: string
): Promise<boolean> {
  try {
    const token = await getM2MToken();

    await axios.delete(
      `https://${config.auth0.domain}/api/v2/users/${userId}/sessions/${sessionId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('✅ Deleted session from Auth0:', sessionId);

    return true;
  } catch (error) {
    console.error('❌ Failed to delete session:', error);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        console.log('Session already deleted or not found');
        return false;
      } else if (axiosError.response?.status === 401) {
        // Retry with refreshed token
        const token = await getM2MToken(true);

        await axios.delete(
          `https://${config.auth0.domain}/api/v2/users/${userId}/sessions/${sessionId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        return true;
      }
    }

    throw new Error('Failed to delete session from Auth0');
  }
}

/**
 * Get user info from Auth0 Management API
 */
export async function getUserInfo(userId: string): Promise<any> {
  try {
    const token = await getM2MToken();

    const response = await axios.get(
      `https://${config.auth0.domain}/api/v2/users/${userId}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log('✅ Retrieved user info for:', userId);

    return response.data;
  } catch (error) {
    console.error('❌ Failed to get user info:', error);

    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      if (axiosError.response?.status === 404) {
        throw new Error('User not found');
      } else if (axiosError.response?.status === 401) {
        // Retry with refreshed token
        const token = await getM2MToken(true);

        const retryResponse = await axios.get(
          `https://${config.auth0.domain}/api/v2/users/${userId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            timeout: 10000,
          }
        );

        return retryResponse.data;
      }
    }

    throw new Error('Failed to retrieve user info from Auth0');
  }
}

/**
 * Clear token cache (useful for testing)
 */
export function clearTokenCache(): void {
  tokenCache = null;
  console.log('🔄 M2M token cache cleared');
}

/**
 * Get token cache info (for debugging)
 */
export function getTokenCacheInfo(): {
  cached: boolean;
  expiresAt?: string;
  expiresIn?: number;
} {
  if (!tokenCache) {
    return { cached: false };
  }

  const now = Math.floor(Date.now() / 1000);
  return {
    cached: true,
    expiresAt: new Date(tokenCache.expiresAt * 1000).toISOString(),
    expiresIn: tokenCache.expiresAt - now,
  };
}
