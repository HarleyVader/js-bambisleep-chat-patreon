import { getAuthUrl, getPatronData, getTokens } from '../services/patreon.js';

import express from 'express';
import { saveUser } from '../db.js';

const router = express.Router();

// Auth redirect to Patreon
router.get('/login', (req, res) => {
  res.redirect(getAuthUrl());
});

// Patreon redirect callback
router.get('/redirect', async (req, res) => {
  const { code } = req.query;
  
  // Check environment variables
  const requiredEnvVars = {
    'PATREON_CLIENT_ID': process.env.PATREON_CLIENT_ID,
    'PATREON_CLIENT_SECRET': process.env.PATREON_CLIENT_SECRET,
    'REDIRECT_URL': process.env.REDIRECT_URL
  };
  
  const missingVars = Object.entries(requiredEnvVars)
    .filter(([name, value]) => !value)
    .map(([name]) => name);
  
  if (missingVars.length > 0) {
    console.error('Missing environment variables:', missingVars);
    return res.redirect('/?error=invalid_client');
  }
  
  if (!code) {
    return res.redirect('/?error=missing_code');
  }
  
  try {
    // Exchange code for tokens
    console.log('Attempting to exchange code for tokens...');
    const tokens = await getTokens(code);
    
    if (tokens.error) {
      console.error('Token exchange failed:', tokens.error);
      console.error('This usually means:');
      console.error('  1. Invalid Patreon client credentials');
      console.error('  2. Incorrect redirect URL configuration');
      console.error('  3. Network connectivity issues');
      return res.redirect(`/?error=${tokens.error}`);
    }
    
    console.log('Tokens received successfully, fetching patron data...');
    // Get patron data
    const patronData = await getPatronData(tokens.access_token);
    
    if (!patronData || !patronData.data) {
      console.error('No patron data received from Patreon API');
      return res.redirect('/?error=no_patron_data');
    }
    
    const user = patronData.data;
    console.log('Patron data received for user:', user.attributes?.full_name || user.id);
    
    // Save user and tokens
    console.log('Saving user data to database...');
    try {
      await saveUser(
        { 
          id: user.id, 
          email: user.attributes.email,
          fullName: user.attributes.full_name
        }, 
        tokens
      );
      console.log('User data saved successfully');
    } catch (saveError) {
      console.error('Failed to save user data:', saveError);
      // Continue even if save fails - don't block the login process
      console.warn('Continuing login process despite save failure');
    }
    
    console.log('User data saved, setting session...');
    // Set session
    req.session.patreonId = user.id;
    
    console.log('Redirecting to status page...');
    // Redirect to status page
    res.redirect('/status');
  } catch (err) {
    console.error('Auth callback error:', err);
    console.error('Error stack:', err.stack);
    
    // More specific error handling
    if (err.message && err.message.includes('ENOTFOUND')) {
      return res.redirect('/?error=network_error');
    } else if (err.message && err.message.includes('MongoDB')) {
      return res.redirect('/?error=database_error');
    } else if (err.message && err.message.includes('token')) {
      return res.redirect('/?error=token_error');
    } else {
      return res.redirect('/?error=server_error');
    }
  }
});

// Logout
router.get('/logout', (req, res) => {
  req.session.destroy();
  res.redirect('/');
});

export { router as oauthRouter };