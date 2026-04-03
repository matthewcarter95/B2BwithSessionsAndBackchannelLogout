import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const { isAuthenticated, loginWithRedirect, isLoading } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, navigate]);

  return (
    <div className="container">
      <div className="card" style={{ maxWidth: '500px', margin: '4rem auto', textAlign: 'center' }}>
        <h1>B2B Application</h1>
        <p style={{ margin: '1.5rem 0', color: '#666' }}>
          Session Management with Auth0 and Backchannel Logout
        </p>

        {isLoading ? (
          <div className="loading">
            <div className="spinner"></div>
          </div>
        ) : (
          <button
            onClick={() =>
              loginWithRedirect({
                appState: { returnTo: window.location.pathname },
              })
            }
            style={{ padding: '1rem 2rem', fontSize: '1.1rem' }}
          >
            Login with Auth0
          </button>
        )}

        <div style={{ marginTop: '2rem', fontSize: '0.9rem', color: '#999' }}>
          <p>
            This application demonstrates:
            <ul style={{ textAlign: 'left', marginTop: '0.5rem' }}>
              <li>Auth0 Authentication with PKCE</li>
              <li>Session management in DynamoDB</li>
              <li>OIDC Backchannel Logout</li>
              <li>Session ID tracking</li>
            </ul>
          </p>
        </div>
      </div>
    </div>
  );
}
