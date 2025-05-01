import express from 'express';
import { getUserByPatreonId, updateUserMembership } from '../db.js';
import crypto from 'crypto';

const router = express.Router();

// Webhook secret from environment variables
const WEBHOOK_SECRET = process.env.PATREON_WEBHOOK_SECRET;

// Validate webhook signature
function validateWebhook(req) {
  if (!WEBHOOK_SECRET) return true; // Skip validation if no secret configured
  
  const signature = req.headers['x-patreon-signature'];
  if (!signature) return false;
  
  const hmac = crypto.createHmac('md5', WEBHOOK_SECRET);
  hmac.update(req.rawBody); // You need to capture raw body
  const digest = hmac.digest('hex');
  
  return signature === digest;
}

// POST /webhooks/patreon - Handle Patreon webhooks
router.post('/patreon', express.json({ 
  verify: (req, res, buf) => {
    req.rawBody = buf.toString(); // Store raw body for signature verification
  }
}), async (req, res) => {
  // Validate webhook signature
  if (!validateWebhook(req)) {
    console.error('Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }
  
  const { data, included, meta } = req.body;
  const eventType = req.headers['x-patreon-event'];
  
  try {
    // Handle different event types
    switch (eventType) {
      case 'members:create':
      case 'members:update':
      case 'members:delete':
        // Process member data
        await processMemberEvent(data, included, eventType);
        break;
        
      default:
        console.log(`Unhandled webhook event: ${eventType}`);
    }
    
    res.status(200).send('Webhook processed');
  } catch (error) {
    console.error('Webhook processing error:', error);
    res.status(500).send('Error processing webhook');
  }
});

// Process member events
async function processMemberEvent(data, included, eventType) {
  // Extract patron ID
  const patronId = data.relationships?.user?.data?.id;
  if (!patronId) return;
  
  // Get membership status
  const status = data.attributes?.patron_status;
  const amountCents = data.attributes?.currently_entitled_amount_cents || 0;
  
  // Find user by Patreon ID and update membership
  await updateUserMembership(patronId, {
    status,
    amountCents,
    lastUpdated: new Date(),
    eventType
  });
}

export { router as webhookRouter };