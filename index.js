import express from 'express';
import session from 'express-session';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { oauthRouter } from './routes/oauth.js';
import { initDb } from './db.js';
import { tokenMiddleware } from './middleware.js';

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

// Token middleware
app.use(tokenMiddleware);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/oauth', oauthRouter);

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
  console.log(`Server running on port ${PORT}`);
});