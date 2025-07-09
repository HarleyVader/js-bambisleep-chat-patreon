import { patreon as patreonAPI, oauth as patreonOAuth } from 'patreon';

import dotenv from 'dotenv';

dotenv.config();

const {
  PATREON_CLIENT_ID,
  PATREON_CLIENT_SECRET,
  REDIRECT_URL,
  MY_TIER_IDS
} = process.env;

// Parse tier IDs from environment variable
const MY_TIERS = MY_TIER_IDS ? MY_TIER_IDS.split(',').map(id => id.trim()) : [];

// Initialize OAuth client
const patreonOAuthClient = patreonOAuth(PATREON_CLIENT_ID, PATREON_CLIENT_SECRET);

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
  console.log('Exchanging code for tokens...');
  
  // Validate required environment variables
  if (!PATREON_CLIENT_ID || !PATREON_CLIENT_SECRET || !REDIRECT_URL) {
    console.error('Missing required Patreon environment variables');
    return { error: 'invalid_client' };
  }
  
  try {
    const tokensResponse = await patreonOAuthClient.getTokens(code, REDIRECT_URL);
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

// Fetch patron data with required fields for proper membership validation
export async function fetchPatronData(accessToken) {
  if (!accessToken) {
    throw new Error('No access token provided');
  }

  console.log('Fetching patron data from Patreon API...');
  
  try {
    const patreonAPIClient = patreonAPI(accessToken);
    
    // Use the official library to fetch current user with memberships
    const result = await patreonAPIClient('/current_user', {
      fields: {
        user: 'email,full_name',
        membership: 'patron_status,currently_entitled_amount_cents',
        tier: 'title,amount_cents'
      },
      include: 'memberships,memberships.currently_entitled_tiers'
    });

    console.log('Patron data fetched successfully');
    
    // Convert JsonApiDataStore result to our expected format
    const userData = result.store.findAll('user')[0];
    const memberships = result.store.findAll('membership');
    const tiers = result.store.findAll('tier');
    
    return {
      data: {
        id: userData.id,
        type: 'user',
        attributes: {
          email: userData.email,
          full_name: userData.full_name
        }
      },
      included: [
        ...memberships.map(m => ({
          id: m.id,
          type: 'membership',
          attributes: {
            patron_status: m.patron_status,
            currently_entitled_amount_cents: m.currently_entitled_amount_cents
          },
          relationships: {
            currently_entitled_tiers: {
              data: m.currently_entitled_tiers?.map(t => ({ id: t.id, type: 'tier' })) || []
            }
          }
        })),
        ...tiers.map(t => ({
          id: t.id,
          type: 'tier',
          attributes: {
            title: t.title,
            amount_cents: t.amount_cents
          }
        }))
      ]
    };
  } catch (error) {
    console.error('Error fetching patron data:', error);
    throw error;
  }
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
  const memberships = patronData.included?.filter(item => item.type === 'membership') || [];
  
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
  try {
    const tokensResponse = await patreonOAuthClient.refreshToken(refreshToken);
    return tokensResponse;
  } catch (error) {
    console.error('Token refresh error:', error);
    return { error: 'Failed to refresh token' };
  }
}