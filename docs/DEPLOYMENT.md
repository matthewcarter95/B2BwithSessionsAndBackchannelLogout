# Deployment Guide

This guide walks through deploying the B2B application to AWS.

## Prerequisites

- AWS CLI configured with credentials
- Node.js 18+ and npm installed
- Docker installed (for backend container)
- Auth0 tenant configured (see [AUTH0_SETUP.md](./AUTH0_SETUP.md))

## Phase 1: Deploy Infrastructure

### Step 1: Bootstrap CDK (One-time setup)

```bash
cd infrastructure
npm install

# Bootstrap CDK in your AWS account/region
npx cdk bootstrap aws://ACCOUNT-ID/REGION
```

### Step 2: Review Infrastructure Changes

```bash
# Synthesize CloudFormation templates
npx cdk synth

# View changes to be deployed
npx cdk diff
```

### Step 3: Deploy Infrastructure Stacks

Deploy all stacks at once:

```bash
npx cdk deploy --all
```

Or deploy individually in order:

```bash
# 1. Networking (VPC, Security Groups)
npx cdk deploy B2BNetworkingStack

# 2. Database (DynamoDB)
npx cdk deploy B2BDatabaseStack

# 3. Lambda (Session API)
npx cdk deploy B2BLambdaStack

# 4. Compute (ECS, ALB)
npx cdk deploy B2BComputeStack
```

### Step 4: Note Important Outputs

After deployment, CDK will output important values:

```
B2BDatabaseStack.SessionsTableName = b2b-sessions
B2BLambdaStack.SessionApiFunctionUrl = https://....lambda-url.us-east-1.on.aws/
B2BComputeStack.LoadBalancerDNS = b2b-alb-....us-east-1.elb.amazonaws.com
B2BComputeStack.BackchannelLogoutUrl = http://b2b-alb-....us-east-1.elb.amazonaws.com/logout/backchannel
```

**Save these values** - you'll need them for configuration.

## Phase 2: Store Auth0 Credentials in AWS Secrets Manager

```bash
# Store M2M credentials
aws secretsmanager create-secret \
  --name auth0/b2b/m2m-credentials \
  --secret-string '{
    "client_id": "YOUR_M2M_CLIENT_ID",
    "client_secret": "YOUR_M2M_CLIENT_SECRET",
    "domain": "your-tenant.auth0.com",
    "audience": "https://your-tenant.auth0.com/api/v2/"
  }' \
  --region us-east-1
```

## Phase 3: Build and Deploy Backend

### Step 1: Create ECR Repository

```bash
# Create repository
aws ecr create-repository \
  --repository-name b2b-backend \
  --region us-east-1

# Get repository URI
export ECR_REPO=$(aws ecr describe-repositories \
  --repository-names b2b-backend \
  --query 'repositories[0].repositoryUri' \
  --output text \
  --region us-east-1)

echo $ECR_REPO
```

### Step 2: Build and Push Docker Image

```bash
cd backend

# Authenticate Docker to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin $ECR_REPO

# Build Docker image
docker build -t b2b-backend:latest .

# Tag image
docker tag b2b-backend:latest $ECR_REPO:latest
docker tag b2b-backend:latest $ECR_REPO:$(git rev-parse --short HEAD)

# Push to ECR
docker push $ECR_REPO:latest
docker push $ECR_REPO:$(git rev-parse --short HEAD)
```

### Step 3: Update ECS Service

```bash
# Update task definition with new image
aws ecs update-service \
  --cluster b2b-backend-cluster \
  --service b2b-backend-service \
  --force-new-deployment \
  --region us-east-1

# Monitor deployment
aws ecs wait services-stable \
  --cluster b2b-backend-cluster \
  --services b2b-backend-service \
  --region us-east-1
```

### Step 4: Verify Backend is Running

```bash
# Get ALB DNS from CDK output or:
export ALB_DNS=$(aws elbv2 describe-load-balancers \
  --names b2b-alb \
  --query 'LoadBalancers[0].DNSName' \
  --output text \
  --region us-east-1)

# Test health endpoint
curl http://$ALB_DNS/health

# Test backchannel logout info endpoint
curl http://$ALB_DNS/logout/backchannel
```

## Phase 4: Configure Auth0 Backchannel Logout

1. Log into [Auth0 Dashboard](https://manage.auth0.com)
2. Navigate to **Settings** > **Advanced**
3. Find **OIDC Backchannel Logout**
4. Set **Backchannel Logout URI**:
   ```
   http://b2b-alb-....us-east-1.elb.amazonaws.com/logout/backchannel
   ```
   (Use the URL from CDK output: `B2BComputeStack.BackchannelLogoutUrl`)
5. Click **Save Changes**

## Phase 5: Deploy Frontend

### Option A: AWS Amplify Console

1. Go to AWS Amplify Console
2. Click **New app** > **Host web app**
3. Connect to your Git repository
4. Configure build settings:

```yaml
version: 1
frontend:
  phases:
    preBuild:
      commands:
        - cd frontend
        - npm ci
    build:
      commands:
        - npm run build
  artifacts:
    baseDirectory: frontend/dist
    files:
      - '**/*'
  cache:
    paths:
      - frontend/node_modules/**/*
```

5. Set environment variables:
   - `VITE_AUTH0_DOMAIN`: your-tenant.auth0.com
   - `VITE_AUTH0_CLIENT_ID`: Your SPA client ID
   - `VITE_AUTH0_AUDIENCE`: https://your-tenant.auth0.com/api/v2/
   - `VITE_BACKEND_URL`: http://[ALB_DNS]
   - `VITE_LAMBDA_FUNCTION_URL`: [Lambda Function URL from CDK output]

6. Deploy

### Option B: Manual Build and S3 + CloudFront

```bash
cd frontend

# Create .env.production
cat > .env.production <<EOF
VITE_AUTH0_DOMAIN=your-tenant.auth0.com
VITE_AUTH0_CLIENT_ID=your-spa-client-id
VITE_AUTH0_AUDIENCE=https://your-tenant.auth0.com/api/v2/
VITE_BACKEND_URL=http://[ALB_DNS]
VITE_LAMBDA_FUNCTION_URL=[Lambda_Function_URL]
EOF

# Build
npm run build

# Upload to S3 (create bucket first)
aws s3 sync dist/ s3://your-bucket-name --delete

# Invalidate CloudFront cache (if using CloudFront)
aws cloudfront create-invalidation \
  --distribution-id YOUR_DISTRIBUTION_ID \
  --paths "/*"
```

## Phase 6: Update Auth0 Callback URLs

After deploying frontend, update Auth0 SPA application with production URLs:

1. Log into Auth0 Dashboard
2. Go to **Applications** > **Your SPA App** > **Settings**
3. Add to **Allowed Callback URLs**:
   ```
   https://your-amplify-domain/callback
   ```
4. Add to **Allowed Logout URLs**:
   ```
   https://your-amplify-domain
   ```
5. Add to **Allowed Web Origins**:
   ```
   https://your-amplify-domain
   ```
6. Click **Save Changes**

## Phase 7: Verify End-to-End Flow

### Test 1: Health Checks

```bash
# Backend health
curl http://$ALB_DNS/health

# Lambda session API
curl "$(aws cloudformation describe-stacks \
  --stack-name B2BLambdaStack \
  --query 'Stacks[0].Outputs[?OutputKey==`SessionApiFunctionUrl`].OutputValue' \
  --output text)?userId=test"
```

### Test 2: Login Flow

1. Navigate to your frontend URL
2. Click "Login with Auth0"
3. Complete authentication
4. Verify redirect to dashboard
5. Check profile page shows your info and `sid`

### Test 3: Sessions List

1. Navigate to Sessions page
2. Verify you see your current session
3. Click on session to view details

### Test 4: Backchannel Logout

**Manual Test:**

```bash
# Generate a test logout token (use jwt.io or Auth0)
# Token should include sid in events claim

curl -X POST http://$ALB_DNS/logout/backchannel \
  -H "Content-Type: application/json" \
  -d '{
    "logout_token": "YOUR_LOGOUT_TOKEN"
  }'

# Check session was deleted
aws dynamodb get-item \
  --table-name b2b-sessions \
  --key '{"sid": {"S": "YOUR_SESSION_ID"}}' \
  --region us-east-1
```

**Real Test:**

1. Log into application
2. Open another browser/device
3. Log out from Auth0 dashboard or other device
4. Verify session is deleted from DynamoDB
5. Check CloudWatch logs for backchannel logout event

## Monitoring

### CloudWatch Logs

```bash
# Backend logs
aws logs tail /ecs/b2b-backend --follow

# Lambda logs
aws logs tail /aws/lambda/b2b-session-api --follow
```

### ECS Service Status

```bash
aws ecs describe-services \
  --cluster b2b-backend-cluster \
  --services b2b-backend-service \
  --region us-east-1
```

### ALB Health Checks

```bash
aws elbv2 describe-target-health \
  --target-group-arn $(aws elbv2 describe-target-groups \
    --names b2b-backend-tg \
    --query 'TargetGroups[0].TargetGroupArn' \
    --output text) \
  --region us-east-1
```

## Rollback

### Rollback ECS Deployment

```bash
# List task definitions
aws ecs list-task-definitions \
  --family-prefix b2b-backend \
  --region us-east-1

# Update service to previous task definition
aws ecs update-service \
  --cluster b2b-backend-cluster \
  --service b2b-backend-service \
  --task-definition b2b-backend:PREVIOUS_REVISION \
  --region us-east-1
```

### Rollback Infrastructure

```bash
cd infrastructure

# Destroy specific stack
npx cdk destroy B2BComputeStack

# Destroy all
npx cdk destroy --all
```

## Troubleshooting

### ECS Tasks Failing to Start

```bash
# Check task logs
aws ecs describe-tasks \
  --cluster b2b-backend-cluster \
  --tasks $(aws ecs list-tasks \
    --cluster b2b-backend-cluster \
    --service-name b2b-backend-service \
    --query 'taskArns[0]' \
    --output text) \
  --region us-east-1

# Check stopped tasks
aws ecs describe-tasks \
  --cluster b2b-backend-cluster \
  --tasks $(aws ecs list-tasks \
    --cluster b2b-backend-cluster \
    --desired-status STOPPED \
    --query 'taskArns[0]' \
    --output text) \
  --region us-east-1
```

### ALB Unhealthy Targets

```bash
# Check target health
aws elbv2 describe-target-health \
  --target-group-arn [TARGET_GROUP_ARN]

# Check security groups allow ALB -> ECS communication
```

### Backchannel Logout Not Working

1. Verify Auth0 backchannel URI is correct
2. Check ALB is publicly accessible
3. Check CloudWatch logs for incoming requests
4. Verify JWT validation (check Auth0 JWKS endpoint accessible)

## Cost Optimization

### Development Environment

```bash
# Reduce ECS task count
aws ecs update-service \
  --cluster b2b-backend-cluster \
  --service b2b-backend-service \
  --desired-count 1 \
  --region us-east-1

# Stop ECS service when not in use
aws ecs update-service \
  --cluster b2b-backend-cluster \
  --service b2b-backend-service \
  --desired-count 0 \
  --region us-east-1
```

### Production Environment

- Use 3 NAT Gateways across AZs for HA
- Enable ALB access logs to S3
- Set up CloudWatch alarms
- Configure DynamoDB auto-scaling
- Use provisioned capacity if traffic is predictable

## Next Steps

1. **Configure HTTPS**: Add SSL certificate to ALB
2. **Set up CI/CD**: Automate deployments with GitHub Actions or CodePipeline
3. **Enable Monitoring**: CloudWatch dashboards and alarms
4. **Configure WAF**: Protect ALB with AWS WAF rules
5. **Backup Strategy**: Configure DynamoDB point-in-time recovery
6. **Disaster Recovery**: Document and test recovery procedures

## Support

For issues, check:
- CloudWatch Logs
- ECS Service Events
- ALB Target Health
- DynamoDB Metrics
- [README.md](../README.md) - Main documentation
- [AUTH0_SETUP.md](./AUTH0_SETUP.md) - Auth0 configuration
