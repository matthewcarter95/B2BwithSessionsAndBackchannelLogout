# Session Architecture Documentation

## Overview

This B2B application implements a comprehensive session management system with multiple layers of session tracking and timeout mechanisms. The architecture ensures secure session handling with proper idle timeout, backchannel logout support, and real-time session monitoring.

## Session Lifespan Components

### 1. Auth0 ID Token Session
- **Duration**: 15 minutes from token issuance
- **Managed by**: Auth0
- **Purpose**: JWT-based authentication token
- **Behavior**: Fixed expiration time, not renewable
- **Expiration**: When `exp` claim in JWT is reached

### 2. Global Session Store (DynamoDB)
- **Table**: `Auth0Sessions` (ARN: `arn:aws:dynamodb:us-west-2:204352680806:table/Auth0Sessions`)
- **Purpose**: Centralized session tracking across all user sessions
- **Schema**:
  ```
  session_id (String, Primary Key): Auth0 session ID
  user_id (String, GSI Partition Key): Auth0 user ID (format: auth0|xxx)
  expires_at (Number): Unix timestamp when session expires
  last_activity (Number): Unix timestamp of last session activity
  login_time (Number): Unix timestamp when session was created
  status (String): Session status (active, expired, etc.)
  email (String): User email
  ip_address (String): Client IP address
  user_agent (String): Client user agent
  ```

### 3. Sliding Idle Timeout
- **Duration**: 15 minutes from most recent session creation
- **Managed by**: GetSessionsByUserID Lambda function
- **Behavior**:
  - Tracks the most recent `login_time` across ALL sessions for a user
  - If current time - most recent login_time > 15 minutes, ALL sessions are considered idle
  - Returns empty session list when idle timeout is exceeded
  - Creating a new session extends the idle timeout for ALL existing sessions

### 4. Frontend Polling
- **Interval**: Every 30 seconds
- **Purpose**: Detect session changes (backchannel logout, idle timeout, expiration)
- **Implementation**: `useSessions` hook in `frontend/src/hooks/useSession.ts`
- **Behavior**:
  - Fetches current user's sessions from Lambda
  - Checks if current session ID (from ID token `sid` claim) exists in returned list
  - If current session not found: triggers logout and redirects to login
  - Logging: Console messages track polling activity

## Session Lifecycle Flow

### Session Creation
1. User authenticates via Auth0
2. Auth0 issues ID token with `sid` claim (session ID)
3. Backend receives authentication callback
4. Backend creates session record in DynamoDB with:
   - `session_id`: From Auth0 `sid` claim
   - `user_id`: From Auth0 `sub` claim
   - `login_time`: Current timestamp
   - `expires_at`: Current timestamp + 15 minutes
   - `last_activity`: Current timestamp
   - `status`: "active"

### Active Session Monitoring
1. Frontend polls Lambda every 30 seconds via `useSessions` hook
2. Lambda (GetSessionsByUserID) queries DynamoDB for user's sessions
3. Lambda applies filters:
   - **Expiration filter**: Removes sessions where `expires_at < now`
   - **Idle timeout filter**: If `now - mostRecentLoginTime > 15 minutes`, returns empty list
4. Frontend receives session list and validates current session exists
5. If current session missing: Frontend triggers logout

### Session Expiration Scenarios

#### Scenario 1: ID Token Expires (15 minutes)
- ID token `exp` claim is reached
- User can no longer make authenticated requests
- Session still exists in DynamoDB
- Lambda will filter it out based on `expires_at` timestamp

#### Scenario 2: Idle Timeout (15 minutes from last session creation)
- User has no activity for 15 minutes (no new sessions created)
- Lambda returns empty session list due to idle timeout
- Frontend detects missing session and triggers logout
- Session record remains in DynamoDB (marked as idle)

#### Scenario 3: Backchannel Logout
- Auth0 sends backchannel logout event via EventBridge
- EventBridge rule triggers RemoveSessionFromStore Lambda
- Lambda deletes session from DynamoDB
- Next frontend poll detects missing session and triggers logout

### Backchannel Logout Integration

**EventBridge Rule**:
```
ARN: arn:aws:events:us-west-2:204352680806:rule/aws.partner/auth0.com/fiscal-psft-2464f167-bc5b-47d6-abaa-c5b043cda053/auth0.logs/CallLambdaToRemoveSessionFromStore
```

**Flow**:
1. Auth0 session ends (logout, timeout, admin action)
2. Auth0 publishes event to EventBridge partner event bus
3. EventBridge rule matches auth0.logs events
4. Rule invokes RemoveSessionFromStore Lambda
5. Lambda deletes session record from DynamoDB
6. Frontend polling detects missing session within 30 seconds
7. Frontend triggers local logout and redirect to login page

## Lambda Functions

### GetSessionsByUserID
- **Purpose**: Retrieve active sessions for a user with idle timeout logic
- **URL**: `https://33jle54hwkwrgf4i2otlshvc2y0ajgks.lambda-url.us-west-2.on.aws`
- **Query Parameter**: `user_id` (URL-encoded, e.g., `auth0%7C69c6a57ca4570f1655e92e9c`)
- **Logic**:
  1. Query DynamoDB GSI `user_id-index` for all user sessions
  2. Filter out sessions where `expires_at < now`
  3. Calculate most recent `login_time` across remaining sessions
  4. If `now - mostRecentLoginTime > 900` (15 minutes), return empty list with `idle_timeout: true`
  5. Otherwise return active session list
- **Response**:
  ```json
  {
    "user_id": "auth0|xxx",
    "session_count": 1,
    "sessions": [
      {
        "session_id": "xxx",
        "user_id": "auth0|xxx",
        "expires_at": 1234567890,
        "last_activity": 1234567890,
        "status": "active"
      }
    ],
    "idle_timeout": false
  }
  ```

### UpdateGlobalSessionStore
- **Purpose**: Create/update session in DynamoDB on login
- **Trigger**: Backend authentication callback
- **Action**: INSERT or UPDATE session record

### RemoveSessionFromStore
- **Purpose**: Delete session from DynamoDB on backchannel logout
- **Trigger**: EventBridge rule on Auth0 logout events
- **Action**: DELETE session record by session_id

## Frontend Implementation

### useSessions Hook
**Location**: `frontend/src/hooks/useSession.ts`

**Configuration**:
- `staleTime`: 5 seconds (data considered fresh for 5s)
- `refetchInterval`: 30 seconds (auto-refetch every 30s)
- `retry`: false (don't retry on failure, as session deletion is intentional)

**Session Validation Logic**:
```typescript
// Check if current session exists in returned list
const idToken = await getIdTokenClaims();
const currentSid = idToken?.sid;

const currentSessionExists = sessions.some(
  (session) => session.sid === currentSid
);

if (!currentSessionExists) {
  // Current session deleted - force logout
  queryClient.clear();
  logout({
    logoutParams: {
      returnTo: window.location.origin + '?reason=session_expired',
    },
  });
}
```

### Dashboard Integration
**Location**: `frontend/src/pages/Dashboard.tsx`

The Dashboard component starts global polling:
```typescript
// Start session polling (runs on all dashboard pages)
useSessions(user?.sub);
```

Console logging tracks polling activity:
```
🔄 Global session polling started for user: auth0|xxx
📡 Polling every 30 seconds to detect backchannel logout
```

## Timing Diagram

```
Time (minutes)    Event
0                 User logs in → Session created in DynamoDB
                  - login_time: T0
                  - expires_at: T0 + 15min

0-15              Frontend polls every 30s
                  Lambda returns session (not expired, not idle)

15                Session expires_at reached
                  Lambda filters out session (expired)
                  Frontend detects missing session → logout

OR (if user creates new session at T5):

5                 User logs in again (new session or refresh)
                  - New login_time: T5
                  - Idle timeout extends to T5 + 15min = T20

20                Idle timeout reached (if no more logins)
                  Lambda returns empty list (idle_timeout: true)
                  Frontend detects missing session → logout
```

## Security Considerations

1. **Defense in Depth**: Multiple layers of session validation
   - ID token expiration (Auth0)
   - Database expiration timestamp check (Lambda)
   - Idle timeout based on activity (Lambda)
   - Backchannel logout (EventBridge + Lambda)

2. **Sliding Window**: Idle timeout is user-level, not per-session
   - Prevents premature timeout when user opens multiple tabs/devices
   - All sessions benefit from activity on any device

3. **Frontend Detection**: 30-second polling interval
   - Balances real-time detection with API cost
   - User logged out within 30s of session deletion

4. **URL Encoding**: Proper handling of pipe character in Auth0 user IDs
   - `user_id` parameter must be URL-encoded
   - Lambda decodes: `auth0%7C123` → `auth0|123`

## Monitoring and Logging

### Lambda CloudWatch Logs
- `/aws/lambda/GetSessionsByUserID`: Session queries and idle timeout checks
- `/aws/lambda/UpdateGlobalSessionStore`: Session creation/updates
- `/aws/lambda/RemoveSessionFromStore`: Backchannel logout events

### Frontend Console Logs
- Polling start messages
- Session validation results
- Logout triggers

### Key Log Messages
```
# Lambda
"Searching for Decoded User ID: auth0|xxx"
"Found N total sessions in DB for user xxx"
"N sessions are not expired"
"Most recent login: T, idle for: Xs (Xm)"
"User idle timeout exceeded (Xm > 15m) - returning empty list"
"Returning N active sessions"

# Frontend
"🔄 Global session polling started for user: xxx"
"📡 Polling every 30 seconds to detect backchannel logout"
"❌ Current session not found in backend - likely deleted by backchannel logout"
"✅ Current session validated: xxx"
```

## Configuration

### Environment Variables

**Frontend** (`.env`):
```
VITE_LAMBDA_FUNCTION_URL=https://33jle54hwkwrgf4i2otlshvc2y0ajgks.lambda-url.us-west-2.on.aws
```

**Lambda**:
- `IDLE_TIMEOUT_SECONDS`: 900 (15 minutes) - hardcoded in Lambda code

**DynamoDB**:
- Table: `Auth0Sessions`
- Region: `us-west-2`
- GSI: `user_id-index` (queries by user_id)

## Testing Scenarios

### Test 1: Normal Session Flow
1. Login → Session created
2. Wait 5 minutes → Session still active
3. Wait 10 more minutes (15 total) → Session expired
4. Next poll → Frontend detects missing session → Logout

### Test 2: Sliding Idle Timeout
1. Login → Session A created at T0
2. Wait 10 minutes
3. Login again → Session B created at T10
4. Wait 10 minutes (T20) → Both sessions still active (idle timeout is T10+15=T25)
5. Wait 5 more minutes (T25) → Idle timeout exceeded → Frontend logout

### Test 3: Backchannel Logout
1. Login → Session created
2. Admin deletes session in Auth0 dashboard → Backchannel logout event
3. EventBridge triggers RemoveSessionFromStore Lambda
4. Session deleted from DynamoDB
5. Within 30 seconds, frontend poll detects missing session → Logout

## Troubleshooting

### Session Not Expiring
- Check Lambda logs for idle timeout calculation
- Verify `expires_at` timestamp in DynamoDB
- Confirm frontend polling is running (check console)

### Session Expired Too Early
- Check if multiple sessions exist (sliding timeout extends)
- Verify clock sync between Lambda and DynamoDB
- Check `login_time` vs `last_activity` timestamps

### Backchannel Logout Not Working
- Verify EventBridge rule is active
- Check RemoveSessionFromStore Lambda logs
- Confirm Auth0 is sending logout events
- Verify DynamoDB session deletion

### Frontend Not Detecting Logout
- Check browser console for polling logs
- Verify `sid` claim in ID token matches session_id in DynamoDB
- Confirm Lambda is returning empty list (not error)
- Check network tab for Lambda API calls
