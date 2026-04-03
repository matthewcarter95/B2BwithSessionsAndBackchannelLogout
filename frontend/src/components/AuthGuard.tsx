import { ReactNode, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useNavigate } from 'react-router-dom';

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, loginWithRedirect } = useAuth0();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to login if not authenticated
      loginWithRedirect({
        appState: { returnTo: window.location.pathname },
      });
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  if (isLoading) {
    return (
      <div className="loading">
        <div className="spinner"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect to login
  }

  return <>{children}</>;
}
