# B2B Application with Auth0 Sessions and Backchannel Logout

A full-stack B2B application demonstrating Auth0 authentication, session management with DynamoDB, and OIDC backchannel logout support.

## Architecture

- **Frontend**: React + TypeScript + Vite with Auth0 React SDK
- **Backend**: Express.js + TypeScript on Amazon ECS (Fargate)
- **Session Store**: Amazon DynamoDB with TTL
- **Authentication**: Auth0 with Authorization Code + PKCE flow
- **Infrastructure**: AWS CDK (TypeScript)

## Project Structure

```
├── frontend/          # React SPA
│   ├── src/
│   │   ├── components/    # React components
│   │   ├── hooks/         # Custom React hooks
│   │   ├── pages/         # Page components
│   │   └── utils/         # Utilities (Auth0 config, API client)
│   └── package.json
├── backend/           # Express.js API
│   ├── src/
│   │   ├── routes/        # API routes
│   │   ├── services/      # Business logic
│   │   ├── middleware/    # Express middleware
│   │   └── types/         # TypeScript types
│   ├── Dockerfile
│   └── package.json
├── infrastructure/    # AWS CDK
│   ├── lib/stacks/       # CDK stacks
│   └── package.json
└── docs/             # Documentation
    └── AUTH0_SETUP.md   # Auth0 configuration guide
```

## Features

✅ Auth0 authentication with PKCE
✅ Session ID (sid) tracking from ID tokens
✅ DynamoDB session store with TTL
✅ OIDC backchannel logout endpoint
✅ Session list view
✅ Session detail view with Auth0 Session API
✅ ECS Fargate deployment
✅ Lambda Function URL for session API
✅ CloudWatch monitoring

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- AWS Account with CLI configured
- Auth0 account (Standard tier or higher for backchannel logout)
- Docker (for backend containerization)

### Step 1: Clone and Install Dependencies

```bash
# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install

# Install infrastructure dependencies
cd ../infrastructure
npm install
```

### Step 2: Configure Auth0

Follow the comprehensive guide in [`docs/AUTH0_SETUP.md`](./docs/AUTH0_SETUP.md) to:

1. Create Auth0 tenant
2. Create SPA application (frontend)
3. Create M2M application (backend)
4. **CRITICAL**: Enable "Add Session ID (sid) to ID Token" in SPA advanced settings
5. Configure OIDC backchannel logout (after backend deployment)

### Step 3: Configure Environment Variables

#### Backend `.env`

Create `backend/.env` from `backend/.env.example`:

```env
NODE_ENV=development
PORT=3000

# Auth0 (from Step 2)
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_CLIENT_ID=your-spa-client-id
AUTH0_M2M_CLIENT_ID=your-m2m-client-id
AUTH0_M2M_CLIENT_SECRET=your-m2m-client-secret
AUTH0_AUDIENCE=https://your-tenant.auth0.com/api/v2/

# AWS
AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=b2b-sessions

# CORS
CORS_ORIGIN=http://localhost:5173
```

#### Frontend `.env`

Create `frontend/.env` from `frontend/.env.example`:

```env
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your-spa-client-id
VITE_AUTH0_AUDIENCE=https://your-tenant.auth0.com/api/v2/
VITE_BACKEND_URL=http://localhost:3000
```

### Step 4: Run Locally (Development)

#### Terminal 1: Backend

```bash
cd backend
npm run dev
```

Backend will run on http://localhost:3000

#### Terminal 2: Frontend

```bash
cd frontend
npm run dev
```

Frontend will run on http://localhost:5173

### Step 5: Test Locally

1. Open http://localhost:5173
2. Click "Login with Auth0"
3. Complete authentication
4. View your profile (should see `sid` in ID token)
5. Navigate to Sessions page

**Note**: For full functionality (sessions list, backchannel logout), you'll need to:
- Deploy infrastructure to AWS (DynamoDB, Lambda)
- Or run local DynamoDB using LocalStack or DynamoDB Local

## Deployment

### Deploy Infrastructure

```bash
cd infrastructure
npm install

# Bootstrap CDK (one-time per account/region)
npx cdk bootstrap

# Review changes
npx cdk synth

# Deploy all stacks
npx cdk deploy --all
```

This creates:
- VPC with public/private subnets
- DynamoDB session table
- ECS cluster and service
- Application Load Balancer
- Lambda function for session API
- CloudWatch dashboards and alarms

### Build and Deploy Backend

```bash
cd backend

# Build Docker image
docker build -t b2b-backend:latest .

# Tag for ECR
docker tag b2b-backend:latest <account-id>.dkr.ecr.us-east-1.amazonaws.com/b2b-backend:latest

# Push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <account-id>.dkr.ecr.us-east-1.amazonaws.com
docker push <account-id>.dkr.ecr.us-east-1.amazonaws.com/b2b-backend:latest

# Update ECS service
aws ecs update-service --cluster b2b-backend-cluster --service b2b-backend-service --force-new-deployment
```

### Deploy Frontend to Amplify

```bash
cd frontend

# Build
npm run build

# Deploy using Amplify Console or CLI
amplify publish
```

### Configure Auth0 Backchannel Logout

After backend is deployed:

1. Get ALB URL from CDK output or AWS Console
2. In Auth0 Dashboard > Settings > Advanced
3. Set Backchannel Logout URI: `https://<alb-url>/logout/backchannel`
4. Save changes

## Implementation Status

### ✅ Completed

- [x] Project structure created
- [x] Auth0 setup documentation
- [x] Backend bootstrap (Express + TypeScript)
- [x] Frontend bootstrap (React + TypeScript + Vite)
- [x] Auth0 integration (Auth0Provider, AuthGuard)
- [x] Basic pages (Login, Callback, Dashboard)
- [x] Docker configuration
- [x] Environment configuration

### 🚧 In Progress / Next Steps

- [ ] Backend token validator service (JWT + JWKS)
- [ ] Backend session service (DynamoDB operations)
- [ ] Backend backchannel logout endpoint
- [ ] Backend Auth0 service (M2M token + Management API)
- [ ] Backend middleware (CORS, error handling, logging)
- [ ] Infrastructure stacks (VPC, DynamoDB, ECS, Lambda)
- [ ] Frontend Profile component (with sid display)
- [ ] Frontend session hooks (React Query)
- [ ] Frontend SessionList component
- [ ] Frontend SessionDetail component
- [ ] End-to-end testing

See the task list with `/tasks` to track detailed progress.

## Key Features

### Session Management

- Sessions stored in DynamoDB with partition key `sid`
- Global Secondary Index on `userId` for efficient user lookups
- Automatic expiration using DynamoDB TTL (24 hours)
- Session includes: user info, login time, device info, IP address

### Backchannel Logout Flow

1. User logs out from Auth0 (or session expires)
2. Auth0 sends logout token (JWT) to backend endpoint
3. Backend validates token signature and claims
4. Backend extracts `sid` from logout token
5. Backend deletes session from DynamoDB
6. Audit event logged

### Security

- PKCE flow for SPA authentication
- JWT signature verification using JWKS
- M2M credentials stored in AWS Secrets Manager
- Strict CORS configuration
- Helmet.js security headers
- Rate limiting (to be implemented)

## Testing

### Backend Tests

```bash
cd backend
npm test
```

### Frontend Tests

```bash
cd frontend
npm test
```

### Manual Testing

Use the included test script to simulate backchannel logout:

```bash
# scripts/test-backchannel.sh (to be created)
./scripts/test-backchannel.sh <logout-token>
```

## Monitoring

After deployment, CloudWatch dashboards show:

- ECS task health and resource usage
- ALB request metrics and error rates
- DynamoDB capacity and latency
- Lambda invocations and errors
- Custom metrics (backchannel logout events, session counts)

## Troubleshooting

### sid not in ID token

**Problem**: Profile page shows `sid: undefined`

**Solution**: Verify "Add Session ID (sid) to ID Token" is enabled in Auth0 SPA application Advanced Settings > OAuth tab

### Backchannel logout not working

**Problem**: Logout from Auth0 doesn't delete session from DynamoDB

**Solution**:
1. Check Auth0 tenant settings have correct backchannel URI
2. Verify backend endpoint is publicly accessible
3. Check CloudWatch logs for errors
4. Test endpoint manually with curl

### CORS errors

**Problem**: Frontend shows CORS errors when calling backend

**Solution**:
1. Verify CORS_ORIGIN in backend `.env` includes frontend URL
2. Check backend logs for preflight requests
3. Ensure frontend URL matches exactly (http vs https, port)

## Resources

- [Plan Document](/.claude/plans/peppy-coalescing-harp.md) - Detailed implementation plan
- [Auth0 Setup Guide](./docs/AUTH0_SETUP.md) - Step-by-step Auth0 configuration
- [Auth0 Backchannel Logout Spec](https://openid.net/specs/openid-connect-backchannel-1_0.html)
- [Auth0 React SDK](https://auth0.com/docs/quickstart/spa/react)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)

## License

MIT

## Support

For issues or questions, please check the documentation or create an issue in the repository.
