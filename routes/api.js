import express from 'express';
import { getUserById } from '../db.js';
import { verifyMembershipTier } from '../services/patreon.js';

const router = express.Router();

// Middleware to check authentication
function requireAuth(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

// GET /api/verify - Simple endpoint to verify if user has active patron status
router.get('/verify', requireAuth, async (req, res) => {
  try {
    const patronData = await req.getPatronData();
    const minTierAmount = 300; // $3.00 minimum tier
    const verification = verifyMembershipTier(patronData, minTierAmount);
    
    res.json({
      verified: verification.isPatron,
      status: verification.isPatron ? 'active' : 'inactive'
    });
  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({ error: 'Failed to verify patron status' });
  }
});

// GET /api/user/tier - Get user's tier details
router.get('/user/tier', requireAuth, async (req, res) => {
  try {
    const patronData = await req.getPatronData();
    const minTierAmount = 300; // $3.00 minimum tier
    const tierInfo = verifyMembershipTier(patronData, minTierAmount);
    
    res.json({
      tierName: tierInfo.tierName || 'None',
      amountCents: tierInfo.amountCents || 0,
      isActive: tierInfo.isPatron,
      status: tierInfo.isPatron ? 'active' : 'inactive'
    });
  } catch (error) {
    console.error('Tier info error:', error);
    res.status(500).json({ error: 'Failed to fetch tier information' });
  }
});

// GET /api/admin/tiers - Get tier IDs for configuration (admin use only)
router.get('/admin/tiers', async (req, res) => {
  try {
    // This endpoint helps fetch tier IDs for MY_TIER_IDS configuration
    // You'll need a valid access token to use this - get one by logging in first
    if (!req.user) {
      return res.status(401).json({ 
        error: 'Unauthorized',
        message: 'Log in with Patreon first to get access token'
      });
    }

    const patronData = await req.getPatronData();
    
    // Extract tier information from the response
    const tiers = patronData.included?.filter(item => item.type === 'tier') || [];
    
    const tierInfo = tiers.map(tier => ({
      id: tier.id,
      title: tier.attributes?.title || 'Unknown',
      amount_cents: tier.attributes?.amount_cents || 0,
      amount_formatted: tier.attributes?.amount_cents ? 
        `€${(tier.attributes.amount_cents / 100).toFixed(2)}` : 'Free'
    }));

    res.json({
      message: 'Copy these tier IDs to your MY_TIER_IDS environment variable',
      tiers: tierInfo,
      suggested_config: `MY_TIER_IDS=${tierInfo.map(t => t.id).join(',')}`,
      note: 'Set this in your .env file and restart the server'
    });
  } catch (error) {
    console.error('Tier fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch tier information',
      details: error.message 
    });
  }
});

// GET /api/public/campaign-tiers - Get campaign tier information (no auth required)
router.get('/public/campaign-tiers', async (req, res) => {
  try {
    // This fetches public campaign information
    // You need to set PATREON_CAMPAIGN_ID in your environment
    const campaignId = process.env.PATREON_CAMPAIGN_ID;
    
    if (!campaignId) {
      return res.json({
        error: 'PATREON_CAMPAIGN_ID not configured',
        message: 'Based on your Patreon page, your tiers are:',
        manual_tiers: [
          { name: 'pink poodle collar', amount: '€30/month', estimated_cents: 3000 },
          { name: 'airhead barbie', amount: '€70.50/month', estimated_cents: 7050 },
          { name: 'Brian Dead Bobble Head', amount: '€193/month', estimated_cents: 19300 }
        ],
        instructions: [
          '1. Log in via Patreon (/auth/patreon)',
          '2. Visit /api/admin/tiers to get actual tier IDs',
          '3. Add them to MY_TIER_IDS in your .env file'
        ]
      });
    }

    // Fetch public campaign data
    const fetch = (await import('node-fetch')).default;
    const url = `https://www.patreon.com/api/oauth2/v2/campaigns/${campaignId}?include=tiers&fields[tier]=title,amount_cents`;
    
    const response = await fetch(url);
    const data = await response.json();
    
    const tiers = data.included?.filter(item => item.type === 'tier') || [];
    const tierInfo = tiers.map(tier => ({
      id: tier.id,
      title: tier.attributes?.title || 'Unknown',
      amount_cents: tier.attributes?.amount_cents || 0
    }));

    res.json({
      campaign_id: campaignId,
      tiers: tierInfo,
      suggested_config: `MY_TIER_IDS=${tierInfo.map(t => t.id).join(',')}`
    });
  } catch (error) {
    console.error('Public tier fetch error:', error);
    res.status(500).json({ 
      error: 'Failed to fetch public tier information',
      fallback_instructions: [
        '1. Log in via Patreon (/auth/patreon)',
        '2. Visit /api/admin/tiers to get tier IDs',
        '3. Add them to MY_TIER_IDS in your .env file'
      ]
    });
  }
});

export { router as apiRouter };