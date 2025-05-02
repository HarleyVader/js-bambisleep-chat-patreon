import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { oauthRouter } from './routes/oauth.js';
import { apiRouter } from './routes/api.js';
import { webhookRouter } from './routes/webhook.js';
import { initDb } from './db.js';
import { tokenMiddleware, apiRateLimiter, authRateLimiter } from './middleware.js';

// Load environment variables
dotenv.config();

// Setup paths for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Initialize database
initDb().catch(err => {
  console.error('MongoDB connection error:', err);
  process.exit(1);
});

const app = express();
const PORT = process.env.SERVER_PORT || 8888;

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
  res.setHeader('Content-Security-Policy', "default-src 'self'");
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

// Status page
app.get('/status', async (req, res) => {
  if (!req.user) {
    return res.redirect('/');
  }
  
  try {
    const patronData = await req.getPatronData();
    const minTierAmount = 300;
    
    // Import dynamically to avoid circular dependencies
    const { verifyMembershipTier } = await import('./services/patreon.js');
    const verification = verifyMembershipTier(patronData, minTierAmount);
    
    res.send(`
      <h1>Patron Status</h1>
      <p>Hello ${req.user.fullName}!</p>
      <p>Status: ${verification.status}</p>
      <p>Pledge: $${verification.pledgeAmount / 100}</p>
      <p>Access granted: ${verification.hasTier ? 'Yes' : 'No'}</p>
      <p><a href="/oauth/logout">Logout</a></p>
    `);
  } catch (err) {
    console.error('Status page error:', err);
    res.send('Error fetching patron data. <a href="/">Return home</a>');
  }
});

// Start server
app.listen(PORT, () => {
  // Simple URL builder from env vars
  const host = process.env.SERVER_HOST || 'localhost';
  const url = `http://${host}:${PORT}`;
  console.log(`Server running at ${url}`);
});