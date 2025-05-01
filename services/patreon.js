import fetch from 'node-fetch';
import dotenv from 'dotenv';

dotenv.config();

const {
  PATREON_CLIENT_ID,
  PATREON_CLIENT_SECRET,
  REDIRECT_URL,
  PATREON_API_VERSION
} = process.env;

// Generate authorization URL for Patreon login
export function getAuthUrl() {
  const scope = 'identity identity[email] identity.memberships campaigns campaigns.members';
  
  return `https://www.patreon.com/oauth2/authorize?` +
    `response_type=code&` +
    `client_id=${PATREON_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URL)}&` +
    `scope=${encodeURIComponent(scope)}`;
}

// Exchange authorization code for access token
export async function getTokens(code) {
  const response = await fetch('https://www.patreon.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: PATREON_CLIENT_ID,
      client_secret: PATREON_CLIENT_SECRET,
      redirect_uri: REDIRECT_URL
    })
  });
  
  if (!response.ok) {
    console.error('Token exchange error:', await response.text());
    return { error: 'Failed to exchange token' };
  }
  
  return response.json();
}

// Add alias for function name
export const exchangeCodeForTokens = getTokens;

// Get patron information using the access token
export async function getPatronInfo(accessToken) {
  // Include fields needed to determine membership status
  const fields = {
    user: 'email,first_name,last_name,full_name,is_email_verified',
    member: 'currently_entitled_amount_cents,patron_status,last_charge_date,last_charge_status'
  };
  
  const includes = ['memberships', 'memberships.currently_entitled_tiers'];
  
  const url = new URL('https://www.patreon.com/api/oauth2/v2/identity');
  
  // Add fields and includes as query parameters
  url.searchParams.append('include', includes.join(','));
  url.searchParams.append('fields[user]', fields.user);
  url.searchParams.append('fields[member]', fields.member);
  
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  });
  
  if (!response.ok) {
    console.error('Patron data error:', await response.text());
    return { error: 'Failed to fetch patron data' };
  }
  
  return response.json();
}

// Add alias for function name
export const getPatronData = getPatronInfo;

// Verify if a user has specific membership tier
export function verifyMembershipTier(patronData, requiredAmountCents = 0) {
  try {
    // Check if user has a membership
    const memberships = patronData?.included?.filter(item => item.type === 'member');
    
    if (!memberships || memberships.length === 0) {
      return { isPatron: false, tier: 'none' };
    }
    
    // Check active patron status and payment
    const membership = memberships[0];
    const isActivePatron = membership.attributes.patron_status === 'active_patron';
    const currentAmountCents = membership.attributes.currently_entitled_amount_cents || 0;
    
    // Get entitled tiers if available
    const tierIds = membership.relationships?.currently_entitled_tiers?.data?.map(tier => tier.id) || [];
    const tiers = patronData?.included?.filter(item => 
      item.type === 'tier' && tierIds.includes(item.id)
    ) || [];
    
    // Get highest tier name
    const tierName = tiers.length > 0 
      ? tiers.sort((a, b) => b.attributes.amount_cents - a.attributes.amount_cents)[0]?.attributes?.title
      : 'Unknown';
    
    return {
      isPatron: isActivePatron,
      hasTier: currentAmountCents >= requiredAmountCents,
      amountCents: currentAmountCents,
      tierName
    };
  } catch (error) {
    console.error('Error verifying membership tier:', error);
    return { isPatron: false, tier: 'error', error: error.message };
  }
}

// Refresh an expired token
export async function refreshTokens(refreshToken) {
  const response = await fetch('https://www.patreon.com/api/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: PATREON_CLIENT_ID,
      client_secret: PATREON_CLIENT_SECRET
    })
  });
  
  if (!response.ok) {
    console.error('Token refresh error:', await response.text());
    return { error: 'Failed to refresh token' };
  }
  
  return response.json();
}