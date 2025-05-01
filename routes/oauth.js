import express from 'express';
import { getAuthUrl, getTokens, getPatronData } from '../services/patreon.js';
import { saveUser } from '../db.js';

const router = express.Router();

// Auth redirect to Patreon
router.get('/login', (req, res) => {
  res.redirect(getAuthUrl());
});

// Patreon redirect callback
router.get('/redirect', async (req, res) => {
  const { code } = req.query;
  
  if (!code) {
    return res.redirect('/?error=missing_code');
  }
  
  try {
    // Exchange code for tokens
    const tokens = await getTokens(code);
    
    if (tokens.error) {
      return res.redirect(`/?error=${tokens.error}`);
    }
    
    // Get patron data
    const patronData = await getPatronData(tokens.access_token);
    const user = patronData.data;
    
    // Save user and tokens
    await saveUser(
      { 
        id: user.id, 
        email: user.attributes.email,
        fullName: user.attributes.full_name
      }, 
      tokens
    );
    
    // Set session
    req.session.patreonId = user.id;
    
    // Redirect to status page
    res.redirect('/status');
  } catch (err) {
    console.error('Auth callback error:', err);
    res.redirect('/?error=server_error');
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

export { router as oauthRouter };