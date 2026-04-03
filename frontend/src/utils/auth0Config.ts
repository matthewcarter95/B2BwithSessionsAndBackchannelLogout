import { Auth0ProviderOptions } from '@auth0/auth0-react';

export const auth0Config: Auth0ProviderOptions = {
  domain: import.meta.env.VITE_AUTH0_DOMAIN || '',
  clientId: import.meta.env.VITE_AUTH0_CLIENT_ID || '',
  authorizationParams: {
    redirect_uri: window.location.origin + '/callback',
    audience: import.meta.env.VITE_AUTH0_AUDIENCE,
    scope: 'openid profile email',
  },
  useRefreshTokens: true,
  cacheLocation: 'localstorage',
};

// Validate Auth0 configuration
export function validateAuth0Config(): void {
  if (!auth0Config.domain) {
    throw new Error('VITE_AUTH0_DOMAIN is required');
  }
  if (!auth0Config.clientId) {
    throw new Error('VITE_AUTH0_CLIENT_ID is required');
  }
  console.log('✅ Auth0 configuration validated');
}
