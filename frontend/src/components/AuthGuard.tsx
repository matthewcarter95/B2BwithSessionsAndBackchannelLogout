import { ReactNode, useEffect } from 'react';
import { useAuth0 } from '@auth0/auth0-react';
import { useQueryClient } from '@tanstack/react-query';

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const { isAuthenticated, isLoading, loginWithRedirect, logout } = useAuth0();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      // Redirect to login if not authenticated
      loginWithRedirect({
        appState: { returnTo: window.location.pathname },
      });
    }
  }, [isLoading, isAuthenticated, loginWithRedirect]);

  // Listen for logout events
  useEffect(() => {
    const handleLogout = (event: Event) => {
      const customEvent = event as CustomEvent;
      console.log('🚪 Logout event received:', customEvent.detail);

      // Clear React Query cache
      queryClient.clear();

      // Logout and redirect to login
      logout({
        logoutParams: {
          returnTo: window.location.origin + `?reason=${customEvent.detail?.reason || 'session_expired'}`,
        },
      });
    };

    window.addEventListener('auth:logout', handleLogout);

    return () => {
      window.removeEventListener('auth:logout', handleLogout);
    };
  }, [logout, queryClient]);

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
