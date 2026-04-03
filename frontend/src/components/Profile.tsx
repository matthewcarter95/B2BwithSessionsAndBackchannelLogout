import { useAuth0 } from '@auth0/auth0-react';
import { useState, useEffect } from 'react';

export default function Profile() {
  const { user, getIdTokenClaims, logout } = useAuth0();
  const [idToken, setIdToken] = useState<any>(null);
  const [timeUntilExpiry, setTimeUntilExpiry] = useState<string>('');

  useEffect(() => {
    // Fetch ID token claims on component mount
    const fetchTokenClaims = async () => {
      try {
        const claims = await getIdTokenClaims();
        setIdToken(claims);
      } catch (error) {
        console.error('Failed to get ID token claims:', error);
      }
    };

    fetchTokenClaims();
  }, [getIdTokenClaims]);

  useEffect(() => {
    // Update countdown every second
    if (!idToken?.exp) return;

    const interval = setInterval(() => {
      const now = Math.floor(Date.now() / 1000);
      const expiresAt = idToken.exp;
      const secondsRemaining = expiresAt - now;

      if (secondsRemaining <= 0) {
        setTimeUntilExpiry('Expired');
        clearInterval(interval);
      } else {
        const hours = Math.floor(secondsRemaining / 3600);
        const minutes = Math.floor((secondsRemaining % 3600) / 60);
        const seconds = secondsRemaining % 60;
        setTimeUntilExpiry(`${hours}h ${minutes}m ${seconds}s`);
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [idToken]);

  if (!user) {
    return (
      <div className="card">
        <h2>Profile</h2>
        <p>Loading user information...</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {/* User Profile Card */}
      <div className="card">
        <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
          {/* Avatar */}
          {user.picture && (
            <img
              src={user.picture}
              alt={user.name || 'User'}
              style={{
                width: '100px',
                height: '100px',
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          )}

          {/* User Info */}
          <div style={{ flex: 1 }}>
            <h2 style={{ marginTop: 0 }}>Profile</h2>

            <div style={{ display: 'grid', gap: '0.75rem' }}>
              <div>
                <strong>Name:</strong> {user.name || 'N/A'}
              </div>

              <div>
                <strong>Email:</strong> {user.email || 'N/A'}
                {user.email_verified && (
                  <span style={{ marginLeft: '0.5rem', color: '#4caf50' }}>✓ Verified</span>
                )}
              </div>

              <div>
                <strong>User ID:</strong>{' '}
                <code style={{ fontSize: '0.9em' }}>{user.sub}</code>
              </div>

              <div>
                <strong>Last Login:</strong>{' '}
                {user.updated_at
                  ? new Date(user.updated_at).toLocaleString()
                  : 'N/A'}
              </div>
            </div>

            <button
              onClick={() => logout({ logoutParams: { returnTo: window.location.origin } })}
              style={{ marginTop: '1.5rem' }}
            >
              Logout
            </button>
          </div>
        </div>
      </div>

      {/* Session Information Card */}
      <div className="card">
        <h3>Session Information</h3>

        {idToken ? (
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <strong>Session ID (sid):</strong>{' '}
              {idToken.sid ? (
                <code style={{ fontSize: '0.9em', color: '#1a73e8' }}>{idToken.sid}</code>
              ) : (
                <span style={{ color: '#d32f2f' }}>
                  ⚠️ Not found in ID token
                  <br />
                  <small style={{ fontSize: '0.85em' }}>
                    Make sure "Add Session ID (sid) to ID Token" is enabled in Auth0 application settings
                  </small>
                </span>
              )}
            </div>

            <div>
              <strong>Token Issued At:</strong>{' '}
              {new Date(idToken.iat * 1000).toLocaleString()}
            </div>

            <div>
              <strong>Token Expires At:</strong>{' '}
              {new Date(idToken.exp * 1000).toLocaleString()}
            </div>

            <div>
              <strong>Time Until Expiry:</strong>{' '}
              <span style={{ color: timeUntilExpiry === 'Expired' ? '#d32f2f' : '#4caf50' }}>
                {timeUntilExpiry || 'Calculating...'}
              </span>
            </div>

            <div>
              <strong>Issuer:</strong> {idToken.iss}
            </div>

            <div>
              <strong>Audience:</strong> {idToken.aud}
            </div>
          </div>
        ) : (
          <p>Loading session information...</p>
        )}
      </div>

      {/* Token Claims Card (Development Only) */}
      {import.meta.env.DEV && idToken && (
        <div className="card">
          <h3>ID Token Claims (Dev Only)</h3>
          <details>
            <summary style={{ cursor: 'pointer', marginBottom: '1rem' }}>
              Click to view full token claims
            </summary>
            <pre
              style={{
                background: '#f5f5f5',
                padding: '1rem',
                borderRadius: '4px',
                overflow: 'auto',
                maxHeight: '400px',
                fontSize: '0.85em',
              }}
            >
              {JSON.stringify(idToken, null, 2)}
            </pre>
          </details>
        </div>
      )}

      {/* Warning if sid is missing */}
      {idToken && !idToken.sid && (
        <div className="error">
          <h3>⚠️ Session ID (sid) Not Found</h3>
          <p>
            The ID token does not contain a session ID (sid) claim. This is required for the
            backchannel logout functionality to work correctly.
          </p>
          <p>
            <strong>To fix this:</strong>
          </p>
          <ol style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li>Go to Auth0 Dashboard → Applications → Your SPA Application</li>
            <li>Scroll to Advanced Settings → OAuth tab</li>
            <li>Find "Add Session ID (sid) to ID Token"</li>
            <li>Toggle it ON and save</li>
            <li>Log out and log back in</li>
          </ol>
        </div>
      )}
    </div>
  );
}
