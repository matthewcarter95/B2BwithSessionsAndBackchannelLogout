import { useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';

export default function Callback() {
  const { isAuthenticated, error, isLoading } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isAuthenticated) {
      // Redirect to home page after successful authentication
      navigate('/');
    }
  }, [isLoading, isAuthenticated, navigate]);

  if (error) {
    return (
      <div className="container">
        <div className="error">
          <h2>Authentication Error</h2>
          <p>{error.message}</p>
          <button onClick={() => navigate('/login')} style={{ marginTop: '1rem' }}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="loading">
        <div className="spinner"></div>
        <p style={{ marginTop: '1rem' }}>Completing authentication...</p>
      </div>
    </div>
  );
}
