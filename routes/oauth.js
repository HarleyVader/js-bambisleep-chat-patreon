import express from 'express';
import { getAuthUrl, exchangeCodeForTokens, getPatronInfo } from '../services/patreon.js';

const router = express.Router();

// Start OAuth flow - redirect to Patreon
router.get('/login', (req, res) => {
  const authUrl = getAuthUrl();
  res.redirect(authUrl);
});

// Callback endpoint after Patreon authorization
router.get('/redirect', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.status(400).send('Authorization code missing');
  }
  
  try {
    // Exchange auth code for access token
    const tokens = await exchangeCodeForTokens(code);
    
    // Get patron info using the token
    const patronInfo = await getPatronInfo(tokens.access_token);
    
    // In a real app, you'd save tokens and user info to database
    // For demo, we'll just show the patron info
    res.json({
      status: 'success',
      patron: patronInfo
    });
  } catch (error) {
    console.error('OAuth error:', error);
    res.status(500).send('Authentication failed');
  }
});

export { router as oauthRouter };