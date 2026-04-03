import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth0 } from '@auth0/auth0-react';
import apiClient from '../utils/apiClient';
import axios from 'axios';

const LAMBDA_FUNCTION_URL = import.meta.env.VITE_LAMBDA_FUNCTION_URL || '';
const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

// Types
export interface Session {
  sid: string;
  userId: string;
  email: string;
  loginTime: number;
  expiresAt: number;
  lastActivityAt: number;
  ipAddress?: string;
  userAgent?: string;
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

/**
 * Fetch all sessions for a user from Lambda Function URL
 */
export function useSessions(userId?: string) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: ['sessions', userId],
    queryFn: async () => {
      if (!userId) {
        throw new Error('User ID is required');
      }

      // Get access token for authentication
      const token = await getAccessTokenSilently();

      // Call Lambda Function URL
      const response = await axios.get(`${LAMBDA_FUNCTION_URL}?userId=${userId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data.sessions as Session[];
    },
    enabled: isAuthenticated && !!userId && !!LAMBDA_FUNCTION_URL,
    staleTime: 5 * 1000, // 5 seconds
    refetchInterval: 30 * 1000, // Auto-refetch every 30 seconds
  });
}

/**
 * Fetch detailed session information from Auth0 via backend
 */
export function useSessionDetail(sessionId?: string) {
  const { isAuthenticated, getAccessTokenSilently } = useAuth0();

  return useQuery({
    queryKey: ['session', sessionId],
    queryFn: async () => {
      if (!sessionId) {
        throw new Error('Session ID is required');
      }

      // Get access token
      const token = await getAccessTokenSilently();

      // Call backend which calls Auth0 Management API
      const response = await apiClient.get(`/sessions/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return response.data as Auth0Session;
    },
    enabled: isAuthenticated && !!sessionId,
    staleTime: 60 * 1000, // 1 minute
  });
}

/**
 * Delete a session (mutation)
 */
export function useDeleteSession() {
  const queryClient = useQueryClient();
  const { getAccessTokenSilently } = useAuth0();

  return useMutation({
    mutationFn: async (sessionId: string) => {
      const token = await getAccessTokenSilently();

      await apiClient.delete(`/sessions/${sessionId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      return sessionId;
    },
    onSuccess: (sessionId) => {
      // Invalidate sessions list to trigger refetch
      queryClient.invalidateQueries({ queryKey: ['sessions'] });

      // Remove the specific session from cache
      queryClient.removeQueries({ queryKey: ['session', sessionId] });

      console.log('✅ Session deleted:', sessionId);
    },
    onError: (error) => {
      console.error('❌ Failed to delete session:', error);
    },
  });
}

/**
 * Parse user agent string to get device information
 */
export function parseUserAgent(userAgent?: string): {
  browser: string;
  os: string;
  device: string;
} {
  if (!userAgent) {
    return { browser: 'Unknown', os: 'Unknown', device: 'Unknown' };
  }

  // Simple parsing - you can use ua-parser-js library for better results
  let browser = 'Unknown';
  let os = 'Unknown';
  let device = 'Desktop';

  // Browser detection
  if (userAgent.includes('Chrome')) browser = 'Chrome';
  else if (userAgent.includes('Firefox')) browser = 'Firefox';
  else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) browser = 'Safari';
  else if (userAgent.includes('Edge')) browser = 'Edge';
  else if (userAgent.includes('MSIE') || userAgent.includes('Trident')) browser = 'Internet Explorer';

  // OS detection
  if (userAgent.includes('Windows')) os = 'Windows';
  else if (userAgent.includes('Mac OS')) os = 'macOS';
  else if (userAgent.includes('Linux')) os = 'Linux';
  else if (userAgent.includes('Android')) os = 'Android';
  else if (userAgent.includes('iOS')) os = 'iOS';

  // Device detection
  if (userAgent.includes('Mobile')) device = 'Mobile';
  else if (userAgent.includes('Tablet')) device = 'Tablet';

  return { browser, os, device };
}

/**
 * Format timestamp to relative time
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;

  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  return new Date(timestamp * 1000).toLocaleDateString();
}

/**
 * Format timestamp to date and time
 */
export function formatDateTime(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleString();
}

/**
 * Get time remaining until expiry
 */
export function getTimeRemaining(expiresAt: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = expiresAt - now;

  if (diff <= 0) return 'Expired';

  const hours = Math.floor(diff / 3600);
  const minutes = Math.floor((diff % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m remaining`;
  }
  return `${minutes}m remaining`;
}

/**
 * Mask sensitive data (e.g., IP address)
 */
export function maskIpAddress(ip?: string): string {
  if (!ip) return 'N/A';

  const parts = ip.split('.');
  if (parts.length === 4) {
    // IPv4: Show first two octets only
    return `${parts[0]}.${parts[1]}.***.**`;
  }

  // IPv6 or other format: Show first 8 characters
  return ip.substring(0, 8) + '...';
}

/**
 * Truncate session ID for display
 */
export function truncateSessionId(sid: string, length = 12): string {
  if (sid.length <= length) return sid;
  return `${sid.substring(0, length)}...`;
}
