import { useParams, useNavigate } from 'react-router-dom';
import { useAuth0 } from '@auth0/auth0-react';
import {
  useSessionDetail,
  useDeleteSession,
  formatDateTime,
} from '../hooks/useSession';

export default function SessionDetail() {
  const { sid } = useParams<{ sid: string }>();
  const navigate = useNavigate();
  const { user } = useAuth0();

  // Fetch session details from Auth0 via backend
  const { data: session, isLoading, error } = useSessionDetail(sid);

  // Delete session mutation
  const deleteSessionMutation = useDeleteSession();

  const handleDeleteSession = async () => {
    if (!sid) return;

    if (!confirm('Are you sure you want to logout this session?')) {
      return;
    }

    try {
      await deleteSessionMutation.mutateAsync(sid);
      alert('Session logged out successfully');
      navigate('/sessions');
    } catch (error) {
      alert('Failed to logout session: ' + (error as Error).message);
    }
  };

  const handleBack = () => {
    navigate('/sessions');
  };

  if (isLoading) {
    return (
      <div className="card">
        <h2>Session Details</h2>
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading session details from Auth0...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <h2>Session Details</h2>
        <div className="error">
          <h3>Failed to Load Session Details</h3>
          <p>{(error as Error).message}</p>
          <p>
            This could happen if:
            <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
              <li>The session has been deleted</li>
              <li>The session ID is invalid</li>
              <li>The backend cannot reach Auth0 Management API</li>
              <li>M2M credentials are not configured correctly</li>
            </ul>
          </p>
          <button onClick={handleBack} style={{ marginTop: '1rem' }}>
            Back to Sessions List
          </button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="card">
        <h2>Session Details</h2>
        <p>Session not found.</p>
        <button onClick={handleBack}>Back to Sessions List</button>
      </div>
    );
  }

  const isCurrentSession = user?.sid === sid;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* Header */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h2 style={{ marginTop: 0 }}>Session Details</h2>
            <p style={{ color: '#666' }}>
              Session ID: <code>{sid}</code>
              {isCurrentSession && (
                <span style={{ marginLeft: '0.5rem', color: '#4caf50' }}>
                  (Current Session)
                </span>
              )}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button onClick={handleBack}>Back to List</button>
            <button
              onClick={handleDeleteSession}
              disabled={deleteSessionMutation.isPending || isCurrentSession}
              style={{ background: '#d32f2f' }}
            >
              {deleteSessionMutation.isPending ? 'Logging out...' : 'Logout Session'}
            </button>
          </div>
        </div>
      </div>

      {/* Session Information */}
      <div className="card">
        <h3>Session Information</h3>
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          <div>
            <strong>Session ID:</strong>{' '}
            <code style={{ fontSize: '0.9em' }}>{session.id}</code>
          </div>

          <div>
            <strong>User ID:</strong>{' '}
            <code style={{ fontSize: '0.9em' }}>{session.user_id}</code>
          </div>

          <div>
            <strong>Created At:</strong> {formatDateTime(new Date(session.created_at).getTime() / 1000)}
          </div>

          <div>
            <strong>Last Updated:</strong> {formatDateTime(new Date(session.updated_at).getTime() / 1000)}
          </div>

          <div>
            <strong>Authenticated At:</strong> {formatDateTime(new Date(session.authenticated_at).getTime() / 1000)}
          </div>
        </div>
      </div>

      {/* Device Information */}
      {session.device && (
        <div className="card">
          <h3>Device Information</h3>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            {session.device.ip && (
              <div>
                <strong>IP Address:</strong> <code>{session.device.ip}</code>
              </div>
            )}

            {session.device.user_agent && (
              <div>
                <strong>User Agent:</strong>
                <pre
                  style={{
                    background: '#f5f5f5',
                    padding: '0.5rem',
                    borderRadius: '4px',
                    marginTop: '0.5rem',
                    overflow: 'auto',
                    fontSize: '0.85em',
                  }}
                >
                  {session.device.user_agent}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Authentication Methods */}
      {session.authentication_methods && session.authentication_methods.length > 0 && (
        <div className="card">
          <h3>Authentication Methods</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {session.authentication_methods.map((method, index) => (
              <div
                key={index}
                style={{
                  background: '#f5f5f5',
                  padding: '0.75rem',
                  borderRadius: '4px',
                }}
              >
                <strong>Method {index + 1}:</strong>
                <pre style={{ marginTop: '0.5rem', fontSize: '0.85em' }}>
                  {JSON.stringify(method, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Full Session JSON (Auth0 Session API Response) */}
      <div className="card">
        <h3>Full Session Data (Auth0 Session API)</h3>
        <p style={{ color: '#666', fontSize: '0.9em' }}>
          This is the raw JSON response from Auth0's Session Management API. This data is retrieved
          using the M2M (Machine-to-Machine) application credentials from the backend.
        </p>
        <pre
          style={{
            background: '#f5f5f5',
            padding: '1rem',
            borderRadius: '4px',
            overflow: 'auto',
            maxHeight: '600px',
            fontSize: '0.85em',
            border: '1px solid #ddd',
          }}
        >
          {JSON.stringify(session, null, 2)}
        </pre>
      </div>

      {/* Information Card */}
      <div className="card" style={{ fontSize: '0.9em', color: '#666' }}>
        <h3>About This Data</h3>
        <ul style={{ marginLeft: '1.5rem' }}>
          <li>This session information comes from Auth0's Session Management API</li>
          <li>The backend uses M2M credentials to authenticate with Auth0 Management API</li>
          <li>Session data includes authentication methods, device info, and timestamps</li>
          <li>When you logout, Auth0 will send a backchannel logout token to the backend</li>
          <li>The backend validates the token and deletes the session from DynamoDB</li>
        </ul>
      </div>

      {/* Warning for current session */}
      {isCurrentSession && (
        <div
          className="card"
          style={{ background: '#fff3cd', border: '1px solid #ffc107' }}
        >
          <h3 style={{ marginTop: 0 }}>⚠️ Current Session</h3>
          <p>
            This is your current active session. Logging out this session will sign you out of the
            application.
          </p>
        </div>
      )}
    </div>
  );
}
