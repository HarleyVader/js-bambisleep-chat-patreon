# js-patreon-bambissleep.chat

Standalone OAuth2 Patronage Verification for Bambisleep.chat

## Project Overview

This is a lightweight ES6 JavaScript implementation for verifying Patreon patronage status. The application handles OAuth2 authentication flow with Patreon's API to validate users' membership tiers.

## Development Plan

### 1. Setup Project Structure
- Create basic file structure
- Initialize npm and add minimal dependencies
- Setup build process (if needed)

### 2. Patreon OAuth2 Implementation
- Create OAuth2 authorization flow
- Handle redirect and token exchange
- Implement token storage and refresh logic
- Fetch patron status from Patreon API

### 3. Verification Logic
- Parse API responses to determine membership tier
- Implement verification checks for access levels
- Create simple caching mechanism to reduce API calls

### 4. Integration Interface
- Build simple API endpoints for Bambisleep.chat integration
- Implement webhook handling for membership status changes
- Provide status verification methods

### 5. Frontend Components
- Create minimal login button and authorization UI
- Develop status indicator for current patronage level
- Add simple admin panel for configuration

## Implementation Plan

### Phase 1: Core Functionality
- [x] Setup basic Express server
- [x] Implement Patreon OAuth2 flow (authorization, token exchange)
- [x] Create patron data retrieval functionality
- [x] Implement membership verification logic
- [x] Add MongoDB database for token storage
  - [x] Create users collection with fields: patreonId, email, fullName, accessToken, refreshToken, tokenExpiry
- [x] Implement token storage and refresh mechanism
  - [x] Add middleware to check token expiration
  - [x] Auto-refresh tokens when expired
- [x] Add express-session for user session management
- [x] Complete OAuth flow with success/error handling

### Phase 2: Frontend Components
- [x] Create simple index.html with login button
- [x] Design status page to display patron tier
  - [x] Show patron information
  - [x] Display pledge amount
  - [x] Show active/inactive status
- [x] Add error notification components
- [x] Implement basic CSS styling

### Phase 3: Integration Features 
- [x] Create REST API endpoints for Bambisleep.chat
  - [x] GET `/api/verify`: Verify if user has active patron status
  - [x] GET `/api/user/tier`: Get user's current tier details
- [x] Implement webhook receiver for Patreon events
  - [x] Handle `members:create` events
  - [x] Handle `members:update` events
  - [x] Handle `members:delete` events
- [x] Create webhook processor to update user status
- [ ] Build basic admin view for membership status

### Phase 4: Performance & Security
- [x] Add token expiry handling with refresh buffer
- [x] Implement basic rate limiting (100 requests/minute per user)
- [x] Add security headers
  - [x] Content-Security-Policy
  - [x] X-XSS-Protection
  - [x] X-Content-Type-Options
- [ ] Create API documentation

## Getting Started

1. Register a client application on [Patreon](https://www.patreon.com/portal/registration/register-clients)
2. Set the following environment variables:
   - `PATREON_CLIENT_ID`: Your Patreon client ID
   - `PATREON_CLIENT_SECRET`: Your Patreon client secret
   - `REDIRECT_URL`: OAuth redirect URL
   - `MONGODB_URI`: MongoDB connection string
   - `SESSION_SECRET`: Secret for Express sessions
3. Install dependencies: `npm install`
4. Start the service: `node index.js`

## API Usage

Basic verification flow:
1. Redirect users to Patreon login via the provided button
2. Upon successful authorization, the service will validate membership
3. Access level information is returned to Bambisleep.chat

## Security Considerations

- Never expose your Client Secret in client-side code
- Implement proper token storage with encryption
- Use HTTPS for all API communications
- Regularly refresh the OAuth tokens

## Current Implementation Steps Log

- This implementation follows the OAuth2 authorization from [Patreon API](https://docs.patreon.com/?javascript#introduction) : 

1. User clicks login button
2. User is redirected to Patreon for authorization
3. After authorization, Patreon redirects back with a code
4. Your server exchanges that code for access and refresh tokens
5. The tokens are used to fetch patron information
6. Patron status and tier information is verified

## Code Implementation

```javascript
// Simple Patreon OAuth2 implementation
const config = {
  clientId: process.env.PATREON_CLIENT_ID,
  clientSecret: process.env.PATREON_CLIENT_SECRET,
  redirectUrl: process.env.REDIRECT_URL
}

// Step 1: Generate authorization URL
function getAuthUrl() {
  // Request identity, email, and membership scopes
  const scopes = 'identity identity[email] identity.memberships campaigns campaigns.members'
  
  return `https://www.patreon.com/oauth2/authorize?` +
    `response_type=code&` +
    `client_id=${config.clientId}&` +
    `redirect_uri=${encodeURIComponent(config.redirectUrl)}&` +
    `scope=${encodeURIComponent(scopes)}`
}

// Step 2: Exchange authorization code for tokens
async function getTokens(code) {
  const params = new URLSearchParams({
    code,
    grant_type: 'authorization_code', 
    client_id: config.clientId,
    client_secret: config.clientSecret,
    redirect_uri: config.redirectUrl
  })
  
  const response = await fetch('https://www.patreon.com/api/oauth2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: params
  })
  
  return response.json()
}

// Step 3: Fetch patron status using the token
async function getPatronData(accessToken) {
  // Specify fields and includes for APIv2
  const includes = ['memberships', 'memberships.currently_entitled_tiers']
  const fields = {
    user: 'email,full_name',
    member: 'currently_entitled_amount_cents,patron_status'
  }
  
  const url = new URL('https://www.patreon.com/api/oauth2/v2/identity')
  url.searchParams.append('include', includes.join(','))
  url.searchParams.append('fields[user]', fields.user)
  url.searchParams.append('fields[member]', fields.member)
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'BambiSleep - Patron Verification'
    }
  })
  
  return response.json()
}

// Step 4: Verify membership tier
function verifyMembershipTier(patronData, requiredAmountCents = 0) {
  // Check if user has active membership
  const memberships = patronData?.included?.filter(item => item.type === 'member')
  
  if (!memberships?.length) return { status: 'not_patron' }
  
  const membership = memberships[0]
  const isActive = membership.attributes.patron_status === 'active_patron'
  const pledgeAmount = membership.attributes.currently_entitled_amount_cents || 0
  
  return { 
    status: isActive ? 'active' : 'inactive',
    pledgeAmount,
    hasTier: pledgeAmount >= requiredAmountCents
  }
}

// Refresh tokens when expired
async function refreshTokens(refreshToken) {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: config.clientId,
    client_secret: config.clientSecret
  })
  
  const response = await fetch('https://www.patreon.com/api/oauth2/token', {
    method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'},
    body: params
  })
  
  return response.json()
}

export { getAuthUrl, getTokens, getPatronData, verifyMembershipTier, refreshTokens }