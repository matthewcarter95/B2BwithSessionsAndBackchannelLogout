# Auth0 Setup Guide

This guide walks through setting up Auth0 for the B2B application with session management and backchannel logout support.

## Prerequisites

- Auth0 account (create one at [auth0.com](https://auth0.com))
- Auth0 plan that supports OIDC Backchannel Logout (Standard tier or above)

## Step 1: Create Auth0 Tenant

1. Log into [Auth0 Dashboard](https://manage.auth0.com)
2. Click **Create Tenant** (or select existing tenant)
3. Configure tenant:
   - **Tenant Name**: `b2b-app` (or your choice)
   - **Region**: Select closest to your users
   - **Environment**: Choose based on your needs
4. Note your **Domain**: `<tenant-name>.auth0.com`

## Step 2: Create SPA Application (Frontend)

1. Navigate to **Applications** > **Applications** > **Create Application**
2. Configure application:
   - **Name**: `B2B App - Frontend`
   - **Application Type**: `Single Page Application`
   - **Technology**: `React`
3. Click **Create**

### Configure SPA Settings

Go to the **Settings** tab:

**Application URIs:**
- **Allowed Callback URLs**:
  ```
  http://localhost:3000/callback
  http://localhost:5173/callback
  https://<your-amplify-domain>/callback
  ```
- **Allowed Logout URLs**:
  ```
  http://localhost:3000
  http://localhost:5173
  https://<your-amplify-domain>
  ```
- **Allowed Web Origins**:
  ```
  http://localhost:3000
  http://localhost:5173
  https://<your-amplify-domain>
  ```
- **Allowed Origins (CORS)**:
  ```
  http://localhost:3000
  http://localhost:5173
  https://<your-amplify-domain>
  ```

**Application Properties:**
- **Token Endpoint Authentication Method**: `None` (PKCE enabled by default)
- **Grant Types**: Ensure `Authorization Code` is checked
- **Response Types**: Ensure `code` is checked

**Save Changes**

### Enable Session ID in ID Token (CRITICAL)

⚠️ **IMPORTANT**: Auth0 does NOT include `sid` in ID tokens by default.

1. Scroll to **Advanced Settings** at the bottom
2. Go to **OAuth** tab
3. Find **Add Session ID (sid) to ID Token**
4. **Toggle ON** (enable)
5. Click **Save Changes** at the bottom

### Save Credentials

Note down these values (you'll need them for `.env` files):
- **Domain**: `<tenant-name>.auth0.com`
- **Client ID**: `<spa-client-id>`

## Step 3: Create M2M Application (Backend)

1. Navigate to **Applications** > **Applications** > **Create Application**
2. Configure application:
   - **Name**: `B2B App - Backend`
   - **Application Type**: `Machine to Machine Applications`
3. Click **Create**

### Configure M2M Settings

1. **Select API**: `Auth0 Management API`
2. **Grant Permissions** (Scopes):
   - `read:sessions` - Read user session information
   - `read:user_idp_tokens` - Read user IDP tokens
   - `delete:sessions` (optional) - Delete user sessions
3. Click **Authorize**

### Save Credentials

⚠️ **CRITICAL**: Store these securely - you'll only see the secret once!

- **Domain**: `<tenant-name>.auth0.com`
- **Client ID**: `<m2m-client-id>`
- **Client Secret**: `<m2m-client-secret>`
- **Audience**: `https://<tenant-name>.auth0.com/api/v2/`

**Store in AWS Secrets Manager** (after infrastructure is deployed):
```bash
aws secretsmanager create-secret \
  --name auth0/b2b/m2m-credentials \
  --secret-string '{
    "client_id": "<m2m-client-id>",
    "client_secret": "<m2m-client-secret>",
    "domain": "<tenant-name>.auth0.com",
    "audience": "https://<tenant-name>.auth0.com/api/v2/"
  }' \
  --region us-east-1
```

## Step 4: Configure OIDC Backchannel Logout

⚠️ **Note**: Complete this AFTER deploying the backend to get the ALB URL

1. Navigate to **Settings** (tenant settings, not application settings)
2. Scroll to **Advanced** section
3. Find **OIDC Backchannel Logout Configuration**

### Enable Backchannel Logout

4. **Toggle ON**: `Enable OIDC Backchannel Logout`
5. **Backchannel Logout URI**: `https://<your-backend-alb-url>/logout/backchannel`
   - You'll get this URL after deploying the ECS backend
   - Example: `https://b2b-alb-123456789.us-east-1.elb.amazonaws.com/logout/backchannel`
6. **Backchannel Logout Session Required**: `false` (optional, set to `true` for stricter validation)
7. Click **Save Changes**

## Step 5: Configure Session Settings

1. Still in **Settings** (tenant settings)
2. Scroll to **Session** section
3. Configure:
   - **Session Lifetime**: `24` hours
   - **Absolute Timeout**: `24` hours (requires new login after this period)
   - **Inactivity Timeout**: `3` days (optional)
   - **Require Re-login after**: Configure based on your security requirements

## Step 6: Create Environment Files

### Frontend `.env` file

Create `frontend/.env`:
```env
VITE_AUTH0_DOMAIN=<tenant-name>.auth0.com
VITE_AUTH0_CLIENT_ID=<spa-client-id>
VITE_AUTH0_AUDIENCE=https://<tenant-name>.auth0.com/api/v2/
VITE_BACKEND_URL=http://localhost:3000
VITE_LAMBDA_FUNCTION_URL=<will be provided after infrastructure deployment>
```

### Backend `.env` file

Create `backend/.env`:
```env
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Auth0
AUTH0_DOMAIN=<tenant-name>.auth0.com
AUTH0_CLIENT_ID=<spa-client-id>
AUTH0_M2M_CLIENT_ID=<m2m-client-id>
AUTH0_M2M_CLIENT_SECRET=<m2m-client-secret>
AUTH0_AUDIENCE=https://<tenant-name>.auth0.com/api/v2/

# AWS (local testing with localstack or actual AWS)
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=b2b-sessions
DYNAMODB_ENDPOINT=http://localhost:8000  # Remove for production

# CORS
CORS_ORIGIN=http://localhost:3000,http://localhost:5173
```

## Verification Checklist

After completing setup:

- [ ] Auth0 tenant created
- [ ] SPA application created with PKCE enabled
- [ ] M2M application created with Management API scopes
- [ ] **Session ID (sid) enabled in ID token** (Advanced Settings)
- [ ] Backchannel logout URI configured (after backend deployment)
- [ ] Environment files created with credentials
- [ ] M2M credentials stored in AWS Secrets Manager

## Testing the Configuration

### Verify sid in ID Token

After login, check that the ID token contains the `sid` claim:

```javascript
// In your frontend after successful login
import { useAuth0 } from '@auth0/auth0-react';

const { getIdTokenClaims } = useAuth0();
const claims = await getIdTokenClaims();
console.log('Session ID (sid):', claims.sid); // Should NOT be undefined
```

If `claims.sid` is undefined, verify you enabled "Add Session ID (sid) to ID Token" in the SPA application's Advanced Settings.

### Test M2M Token Acquisition

```bash
curl --request POST \
  --url https://<tenant-name>.auth0.com/oauth/token \
  --header 'content-type: application/json' \
  --data '{
    "client_id": "<m2m-client-id>",
    "client_secret": "<m2m-client-secret>",
    "audience": "https://<tenant-name>.auth0.com/api/v2/",
    "grant_type": "client_credentials"
  }'
```

Expected response:
```json
{
  "access_token": "eyJ...",
  "token_type": "Bearer",
  "expires_in": 86400
}
```

### Test Session API Access

```bash
# Get M2M access token first (from above)
export ACCESS_TOKEN="<access_token>"

# List sessions for a user
curl --request GET \
  --url https://<tenant-name>.auth0.com/api/v2/users/<user-id>/sessions \
  --header "authorization: Bearer $ACCESS_TOKEN"
```

## Troubleshooting

### Issue: `sid` not in ID token
**Solution**: Verify "Add Session ID (sid) to ID Token" is enabled in SPA Advanced Settings > OAuth tab

### Issue: Backchannel logout not working
**Solution**:
1. Check backchannel URI is correct in tenant settings
2. Verify backend endpoint is publicly accessible
3. Check CloudWatch logs for incoming requests
4. Verify JWT validation logic in backend

### Issue: M2M token acquisition failing
**Solution**:
1. Verify client ID and secret are correct
2. Check audience matches Management API
3. Verify M2M app has required scopes granted

### Issue: 403 Forbidden when calling Management API
**Solution**: Verify M2M application has been granted the required scopes (`read:sessions`, `read:user_idp_tokens`)

## Security Notes

1. **Never commit credentials to git**
   - Use `.env.example` files with placeholder values
   - Add `.env` to `.gitignore`

2. **Rotate M2M credentials regularly**
   - Recommended: Every 30 days
   - Use AWS Secrets Manager rotation

3. **Use HTTPS in production**
   - Auth0 callback URLs must use HTTPS (except localhost)
   - Backchannel logout endpoint must use HTTPS

4. **Limit CORS origins**
   - Only whitelist your actual frontend domains
   - Never use wildcards in production

## Additional Resources

- [Auth0 OIDC Backchannel Logout](https://auth0.com/docs/authenticate/login/logout/back-channel-logout)
- [Auth0 Session Management](https://auth0.com/docs/manage-users/sessions)
- [Auth0 Management API](https://auth0.com/docs/api/management/v2)
- [Auth0 React SDK](https://auth0.com/docs/quickstart/spa/react)
