import { apiRateLimiter, authRateLimiter, tokenMiddleware } from './middleware.js';

import { apiRouter } from './routes/api.js';
import dotenv from 'dotenv';
import express from 'express';
import { fileURLToPath } from 'url';
import { initDb } from './db.js';
import { oauthRouter } from './routes/oauth.js';
import path from 'path';
import session from 'express-session';
import { webhookRouter } from './routes/webhook.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'PATREON_CLIENT_ID',
  'PATREON_CLIENT_SECRET', 
  'REDIRECT_URL',
  'SESSION_SECRET'
];

const missingEnvVars = requiredEnvVars.filter(varName => !process.env[varName]);

if (missingEnvVars.length > 0) {
  console.error('❌ Missing required environment variables:', missingEnvVars);
  console.error('Please check your .env file and ensure all required variables are set');
  process.exit(1);
}

console.log('✅ Environment variables validated');

// Setup paths for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database connection (but don't fail if unavailable)
initDb().catch(err => {
  console.warn('MongoDB connection failed, continuing without database features:', err.message);
  // Don't exit - allow server to start for testing without MongoDB
});

const app = express();
const PORT = process.env.SERVER_PORT || 8888;

// More secure proxy trust configuration
// Only trust specific proxy IP or first proxy in a chain
if (process.env.BEHIND_PROXY === 'true') {
  // If you know your proxy IP, specify it explicitly
  if (process.env.PROXY_IP) {
    app.set('trust proxy', process.env.PROXY_IP);
  } else {
    // Trust only the first proxy in the chain
    app.set('trust proxy', 1);
  }
} else {
  app.set('trust proxy', false);
}

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'bambisleep-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));

// Apply security headers directly
app.use((req, res, next) => {
  // Basic security headers
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'");
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// Token middleware
app.use(tokenMiddleware);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Apply rate limiters to specific routes
app.use('/api/', apiRateLimiter);
app.use('/oauth/login', authRateLimiter);
app.use('/oauth/redirect', authRateLimiter);

// Routes
app.use('/oauth', oauthRouter);
app.use('/api', apiRouter);
app.use('/webhooks', webhookRouter);

// Add simple Patreon auth redirect
app.get('/auth/patreon', (req, res) => {
  res.redirect('/oauth/login');
});

// Basic index route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Debug page for troubleshooting
app.get('/debug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'debug.html'));
});

// Configuration diagnostic endpoint
app.get('/config', (req, res) => {
  res.json({
    patreon_client_id: process.env.PATREON_CLIENT_ID ? '✅ Set' : '❌ Missing',
    patreon_client_secret: process.env.PATREON_CLIENT_SECRET ? '✅ Set' : '❌ Missing',
    redirect_url: process.env.REDIRECT_URL || '❌ Missing',
    session_secret: process.env.SESSION_SECRET ? '✅ Set' : '❌ Missing',
    my_tier_ids: process.env.MY_TIER_IDS || '⚠️ Not set (no memberships can be verified)',
    mongodb_uri: process.env.MONGODB_URI ? '✅ Set' : '⚠️ Not set (data won\'t persist)',
    node_env: process.env.NODE_ENV || 'development'
  });
});

// Status page
app.get('/status', async (req, res) => {
  if (!req.user) {
    return res.redirect('/');
  }
  
  try {
    const patronData = await req.getPatronData();
    const minTierAmount = 300; // $3.00 minimum tier
    
    // Import dynamically to avoid circular dependencies
    const { verifyMembershipTier } = await import('./services/patreon.js');
    
    // Verify membership
    const verification = verifyMembershipTier(patronData, minTierAmount) || {
      isPatron: false,
      hasTier: false,
      amountCents: 0,
      tierName: 'Unknown'
    };
    
    // Map verification properties for display
    const status = verification.isPatron ? 'Active Patron' : 'Not Active';
    const pledgeFormatted = verification.amountCents ? 
      `$${(verification.amountCents / 100).toFixed(2)}` : 
      'No active pledge';
    
    // Simple styling for better readability
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>BambiSleep Chat - Patron Status</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
          }
          h1 {
            color: #e91e63;
            border-bottom: 2px solid #e91e63;
            padding-bottom: 10px;
          }
          .status-card {
            border: 1px solid #ddd;
            border-radius: 5px;
            padding: 15px;
            margin-bottom: 20px;
            background-color: #f9f9f9;
          }
          .highlight {
            font-weight: bold;
            color: #e91e63;
          }
          .btn {
            display: inline-block;
            background-color: #e91e63;
            color: white;
            padding: 8px 16px;
            text-decoration: none;
            border-radius: 4px;
            margin-top: 5px;
          }
          .btn:hover {
            background-color: #c2185b;
          }
          .message {
            padding: 10px;
            border-left: 4px solid #e91e63;
            background-color: #fcf8f8;
            margin: 15px 0;
          }
        </style>
      </head>
      <body>
        <h1>Patron Status</h1>
        <div class="status-card">
          <p>Hello <span class="highlight">${req.user.fullName || 'Patron'}</span>!</p>
          <p>Status: <strong>${status}</strong></p>
          <p>Tier: <strong>${verification.tierName || 'None'}</strong></p>
          <p>Pledge: <strong>${pledgeFormatted}</strong></p>
          <p>Access granted: <strong>${verification.hasTier ? 'Yes' : 'No'}</strong></p>
        </div>
        
        ${verification.hasTier ? 
          `<p class="message">Thank you for supporting BambiSleep! You have full access to our exclusive content.</p>
           <p><a href="/chat" class="btn">Go to Chat</a></p>` : 
          `<div class="message">
             <p>To access the chat, please subscribe to a tier of <span class="highlight">$3.00 or higher</span>.</p>
             <p>Your current pledge is ${pledgeFormatted}.</p>
             <p><a href="https://www.patreon.com/bambi" target="_blank" class="btn">Upgrade on Patreon</a></p>
           </div>`
        }
        <p><a href="/oauth/logout">Logout</a> | <a href="/">Return home</a></p>
      </body>
      </html>
    `);
  } catch (err) {
    console.error('Status page error:', err);
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>BambiSleep Chat - Status Error</title>
        <style>
          body {
            font-family: Arial, sans-serif;
            line-height: 1.6;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            color: #333;
          }
          h1 {
            color: #e91e63;
            border-bottom: 2px solid #e91e63;
            padding-bottom: 10px;
          }
          .error-card {
            border: 1px solid #f44336;
            border-radius: 5px;
            padding: 15px;
            margin-bottom: 20px;
            background-color: #ffebee;
          }
          .btn {
            display: inline-block;
            background-color: #e91e63;
            color: white;
            padding: 8px 16px;
            text-decoration: none;
            border-radius: 4px;
            margin-top: 5px;
          }
        </style>
      </head>
      <body>
        <h1>Patron Status</h1>
        <div class="error-card">
          <p>Hello ${req.user ? req.user.fullName : 'Patron'}!</p>
          <p>Status: Error retrieving status</p>
          <p>Error details: ${err.message || 'Unknown error'}</p>
        </div>
        <p><a href="/oauth/logout" class="btn">Logout</a> <a href="/" class="btn">Return home</a></p>
      </body>
      </html>
    `);
  }
});

// Start server
app.listen(PORT, () => {
  // Simple URL builder from env vars
  const host = process.env.SERVER_HOST || 'localhost';
  const url = `http://${host}:${PORT}`;
  console.log(`Server running at ${url}`);
});