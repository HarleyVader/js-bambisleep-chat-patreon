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

export { router as apiRouter };