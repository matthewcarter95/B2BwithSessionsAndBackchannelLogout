import { useState } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';
import {
  useSessions,
  useDeleteSession,
  parseUserAgent,
  formatRelativeTime,
  formatDateTime,
  getTimeRemaining,
  maskIpAddress,
  truncateSessionId,
} from '../hooks/useSession';

export default function SessionList() {
  const { user } = useAuth0();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<'loginTime' | 'lastActivityAt'>('loginTime');

  // Fetch sessions
  const { data: sessions, isLoading, error, refetch } = useSessions(user?.sub);

  // Delete session mutation
  const deleteSessionMutation = useDeleteSession();

  if (isLoading) {
    return (
      <div className="card">
        <h2>Your Sessions</h2>
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading sessions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2>Your Sessions</h2>
        <div className="error">
          <h3>Failed to Load Sessions</h3>
          <p>{(error as Error).message}</p>
          <button onClick={() => refetch()} style={{ marginTop: '1rem' }}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!sessions || sessions.length === 0) {
    return (
      <div className="card">
        <h2>Your Sessions</h2>
        <p>No active sessions found.</p>
        <button onClick={() => refetch()} style={{ marginTop: '1rem' }}>
          Refresh
        </button>
      </div>
    );
  }

  // Sort sessions
  const sortedSessions = [...sessions].sort((a, b) => {
    if (sortBy === 'loginTime') {
      return b.loginTime - a.loginTime; // Newest first
    }
    return b.lastActivityAt - a.lastActivityAt; // Most recent activity first
  });

  const handleDeleteSession = async (sid: string) => {
    if (!confirm('Are you sure you want to logout this session?')) {
      return;
    }

    try {
      await deleteSessionMutation.mutateAsync(sid);
      alert('Session logged out successfully');
    } catch (error) {
      alert('Failed to logout session: ' + (error as Error).message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Your Sessions</h2>
            <p style={{ color: '#666', marginBottom: 0 }}>
              You have {sessions.length} active session{sessions.length !== 1 ? 's' : ''}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <label htmlFor="sort">Sort by:</label>
            <select
              id="sort"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              style={{ padding: '0.5rem' }}
            >
              <option value="loginTime">Login Time</option>
              <option value="lastActivityAt">Last Activity</option>
            </select>
            <button onClick={() => refetch()}>Refresh</button>
          </div>
        </div>
      </div>

      {/* Sessions Table */}
      <div className="card">
        <table>
          <thead>
            <tr>
              <th>Session ID</th>
              <th>Device</th>
              <th>Location</th>
              <th>Login Time</th>
              <th>Last Activity</th>
              <th>Expires</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedSessions.map((session) => {
              const deviceInfo = parseUserAgent(session.userAgent);
              const isCurrentSession = user?.sid === session.sid;

              return (
                <tr
                  key={session.sid}
                  style={{
                    backgroundColor: isCurrentSession ? '#e3f2fd' : undefined,
                  }}
                >
                  {/* Session ID */}
                  <td>
                    <code style={{ fontSize: '0.85em' }}>
                      {truncateSessionId(session.sid)}
                    </code>
                    {isCurrentSession && (
                      <span
                        style={{
                          marginLeft: '0.5rem',
                          color: '#4caf50',
                          fontSize: '0.85em',
                        }}
                      >
                        (Current)
                      </span>
                    )}
                  </td>

                  {/* Device */}
                  <td>
                    <div>
                      <strong>{deviceInfo.device}</strong>
                    </div>
                    <div style={{ fontSize: '0.85em', color: '#666' }}>
                      {deviceInfo.browser} on {deviceInfo.os}
                    </div>
                  </td>

                  {/* Location (IP) */}
                  <td>
                    <code style={{ fontSize: '0.85em' }}>
                      {maskIpAddress(session.ipAddress)}
                    </code>
                  </td>

                  {/* Login Time */}
                  <td>
                    <div>{formatRelativeTime(session.loginTime)}</div>
                    <div style={{ fontSize: '0.85em', color: '#666' }}>
                      {formatDateTime(session.loginTime)}
                    </div>
                  </td>

                  {/* Last Activity */}
                  <td>
                    <div>{formatRelativeTime(session.lastActivityAt)}</div>
                  </td>

                  {/* Expires */}
                  <td>
                    <div style={{ fontSize: '0.9em' }}>
                      {getTimeRemaining(session.expiresAt)}
                    </div>
                  </td>

                  {/* Actions */}
                  <td>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={() => navigate(`/sessions/${session.sid}`)}
                        style={{
                          padding: '0.4rem 0.8rem',
                          fontSize: '0.9em',
                          background: '#1a73e8',
                        }}
                      >
                        Details
                      </button>
                      <button
                        onClick={() => handleDeleteSession(session.sid)}
                        disabled={
                          deleteSessionMutation.isPending ||
                          isCurrentSession // Prevent deleting current session
                        }
                        style={{
                          padding: '0.4rem 0.8rem',
                          fontSize: '0.9em',
                          background: '#d32f2f',
                        }}
                      >
                        {deleteSessionMutation.isPending ? 'Logging out...' : 'Logout'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Info Card */}
      <div className="card" style={{ fontSize: '0.9em', color: '#666' }}>
        <h3>About Sessions</h3>
        <ul style={{ marginLeft: '1.5rem' }}>
          <li>Sessions automatically expire after 24 hours of inactivity</li>
          <li>You can logout any session except your current one</li>
          <li>Logging out a session will remove it from all devices</li>
          <li>
            When you logout from Auth0, the backend will receive a backchannel logout notification
          </li>
          <li>Sessions are stored in DynamoDB with automatic cleanup via TTL</li>
        </ul>
      </div>
    </div>
  );
}
