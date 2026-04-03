import React from 'react';
import ReactDOM from 'react-dom/client';
import { Auth0Provider } from '@auth0/auth0-react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { auth0Config, validateAuth0Config } from './utils/auth0Config';
import './index.css';

// Validate Auth0 configuration
try {
  validateAuth0Config();
} catch (error) {
  console.error('Auth0 configuration error:', (error as Error).message);
}

// Create React Query client
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Auth0Provider
      {...auth0Config}
      onRedirectCallback={(appState) => {
        // Navigate to the URL specified in appState (from the login page)
        // or default to the home page
        window.location.href = appState?.returnTo || window.location.origin;
      }}
    >
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </Auth0Provider>
  </React.StrictMode>
);
