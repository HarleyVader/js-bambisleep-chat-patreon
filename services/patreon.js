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

// Fetch patron data with required fields for proper membership validation
export async function fetchPatronData(accessToken) {
  if (!accessToken) {
    throw new Error('No access token provided');
  }

  // Include relevant membership data and campaign info
  const url = 'https://www.patreon.com/api/oauth2/v2/identity?' + 
    'include=memberships,memberships.currently_entitled_tiers,campaign' +
    '&fields[user]=email,full_name' +
    '&fields[member]=patron_status,currently_entitled_amount_cents' +
    '&fields[tier]=title,amount_cents';

  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'User-Agent': 'BambiSleep Chat (nodejs)'
    }
  });

  if (!response.ok) {
    throw new Error(`Patreon API error: ${response.status}`);
  }

  return response.json();
}

// Add this alias to match the import in oauth.js
export const getPatronData = fetchPatronData;

// Improved verification with direct membership checks
export function verifyMembershipTier(patronData, minTierAmount = 300) {
  // Default empty result
  const result = {
    isPatron: false,
    hasTier: false,
    amountCents: 0,
    tierName: 'None'
  };

  // Return default if no data
  if (!patronData || !patronData.data) {
    return result;
  }

  // Check included memberships
  const memberships = patronData.included?.filter(item => item.type === 'member') || [];
  
  // Find active membership
  const activeMembership = memberships.find(membership => 
    membership.attributes?.patron_status === 'active_patron');
  
  if (activeMembership) {
    const pledgeAmount = activeMembership.attributes.currently_entitled_amount_cents || 0;
    
    // Find entitled tier name
    let tierName = 'Unknown';
    if (activeMembership.relationships?.currently_entitled_tiers?.data?.length > 0) {
      const tierId = activeMembership.relationships.currently_entitled_tiers.data[0].id;
      const tier = patronData.included?.find(item => 
        item.type === 'tier' && item.id === tierId);
      
      if (tier) {
        tierName = tier.attributes.title || 'Unknown';
      }
    }
    
    result.isPatron = true;
    result.amountCents = pledgeAmount;
    result.tierName = tierName;
    result.hasTier = pledgeAmount >= minTierAmount;
  }
  
  return result;
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