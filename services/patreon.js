import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

const {
  PATREON_CLIENT_ID,
  PATREON_CLIENT_SECRET,
  REDIRECT_URL,
  MY_TIER_IDS
} = process.env;

// Parse tier IDs from environment variable
const MY_TIERS = MY_TIER_IDS ? MY_TIER_IDS.split(',').map(id => id.trim()) : [];

// APIv2 Base URL
const PATREON_API_BASE = 'https://www.patreon.com/api/oauth2/v2';

// Generate authorization URL for Patreon login using APIv2 scopes
export function getAuthUrl() {
  // APIv2 scopes - more granular and secure
  const scope = 'identity identity[email] identity.memberships campaigns campaigns.members';
  
  return `https://www.patreon.com/oauth2/authorize?` +
    `response_type=code&` +
    `client_id=${PATREON_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(REDIRECT_URL)}&` +
    `scope=${encodeURIComponent(scope)}`;
}

// Exchange authorization code for access token using APIv2
export async function getTokens(code) {
  console.log('Exchanging code for tokens using APIv2...');
  
  // Validate required environment variables
  if (!PATREON_CLIENT_ID || !PATREON_CLIENT_SECRET || !REDIRECT_URL) {
    console.error('Missing required Patreon environment variables');
    return { error: 'invalid_client' };
  }
  
  try {
    const params = new URLSearchParams({
      code,
      grant_type: 'authorization_code',
      client_id: PATREON_CLIENT_ID,
      client_secret: PATREON_CLIENT_SECRET,
      redirect_uri: REDIRECT_URL
    });

    const response = await fetch('https://www.patreon.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'BambiSleep - Patron Verification v2'
      },
      body: params
    });

    const tokensResponse = await response.json();
    
    if (!response.ok || tokensResponse.error) {
      console.error('Token exchange error:', tokensResponse);
      return { error: tokensResponse.error || 'failed_to_exchange_token' };
    }

    console.log('Token exchange successful');
    return tokensResponse;
  } catch (error) {
    console.error('Token exchange error:', error);
    if (error.message && error.message.includes('invalid_grant')) {
      return { error: 'invalid_grant' };
    }
    return { error: 'failed_to_exchange_token' };
  }
}

// Add alias for function name
export const exchangeCodeForTokens = getTokens;

// Fetch patron data using APIv2 identity endpoint
export async function fetchPatronData(accessToken) {
  if (!accessToken) {
    throw new Error('No access token provided');
  }

  console.log('Fetching patron data from Patreon APIv2...');
  
  try {
    // APIv2 identity endpoint with explicit field requests
    const url = new URL(`${PATREON_API_BASE}/identity`);
    
    // Request specific fields and includes for optimal data
    url.searchParams.append('include', 'memberships,memberships.currently_entitled_tiers');
    url.searchParams.append('fields[user]', 'email,full_name');
    url.searchParams.append('fields[member]', 'currently_entitled_amount_cents,patron_status,last_charge_date,last_charge_status,lifetime_support_cents');
    url.searchParams.append('fields[tier]', 'title,amount_cents');
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'BambiSleep - Patron Verification v2'
      }
    });

    if (!response.ok) {
      throw new Error(`APIv2 request failed: ${response.status} ${response.statusText}`);
    }

    const patronData = await response.json();
    console.log('Patron data fetched successfully from APIv2');
    
    return patronData;
  } catch (error) {
    console.error('Error fetching patron data from APIv2:', error);
    throw error;
  }
}

// Add this alias to match the import in oauth.js
export const getPatronData = fetchPatronData;

// Improved verification using APIv2 member structure
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

  // APIv2 uses 'member' type in included array for memberships
  const memberships = patronData.included?.filter(item => item.type === 'member') || [];
  
  // Find active membership specifically for this campaign
  const activeMembership = memberships.find(membership => {
    if (membership.attributes?.patron_status !== 'active_patron') return false;
    
    // Safety check: if MY_TIERS is empty, no one can be verified (security feature)
    if (MY_TIERS.length === 0) {
      console.warn('MY_TIER_IDS environment variable not set - no memberships can be verified');
      return false;
    }
    
    // Check if this membership has any of our tiers
    const entitledTiers = membership.relationships?.currently_entitled_tiers?.data || [];
    return entitledTiers.some(tier => MY_TIERS.includes(tier.id));
  });
  
  if (activeMembership) {
    const pledgeAmount = activeMembership.attributes.currently_entitled_amount_cents || 0;
    
    // Find entitled tier name from APIv2 structure
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

// Refresh an expired token using APIv2
export async function refreshTokens(refreshToken) {
  try {
    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: PATREON_CLIENT_ID,
      client_secret: PATREON_CLIENT_SECRET
    });

    const response = await fetch('https://www.patreon.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'BambiSleep - Patron Verification v2'
      },
      body: params
    });

    const tokensResponse = await response.json();
    
    if (!response.ok || tokensResponse.error) {
      console.error('Token refresh error:', tokensResponse);
      return { error: tokensResponse.error || 'Failed to refresh token' };
    }

    return tokensResponse;
  } catch (error) {
    console.error('Token refresh error:', error);
    return { error: 'Failed to refresh token' };
  }
}

// Add new APIv2 campaign members endpoint for better member management
export async function getCampaignMembers(accessToken, campaignId, cursor = null) {
  try {
    const url = new URL(`${PATREON_API_BASE}/campaigns/${campaignId}/members`);
    
    // Request specific member fields
    url.searchParams.append('include', 'currently_entitled_tiers,user');
    url.searchParams.append('fields[member]', 'currently_entitled_amount_cents,patron_status,last_charge_date,last_charge_status,lifetime_support_cents,full_name');
    url.searchParams.append('fields[tier]', 'title,amount_cents');
    url.searchParams.append('fields[user]', 'email,full_name');
    
    // Add pagination cursor if provided
    if (cursor) {
      url.searchParams.append('page[cursor]', cursor);
    }
    
    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': 'BambiSleep - Patron Verification v2'
      }
    });

    if (!response.ok) {
      throw new Error(`APIv2 campaign members request failed: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching campaign members from APIv2:', error);
    throw error;
  }
}