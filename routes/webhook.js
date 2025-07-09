import { getUserByPatreonId, updateUserMembership } from '../db.js';

import crypto from 'crypto';
import express from 'express';

const router = express.Router();

// Webhook secret from environment variables
const WEBHOOK_SECRET = process.env.PATREON_WEBHOOK_SECRET;

// Validate webhook signature
function validateWebhook(req) {
  if (!WEBHOOK_SECRET) {
    console.warn('PATREON_WEBHOOK_SECRET not configured - webhook signature validation disabled');
    return true; // Skip validation if no secret configured
  }
  
  const signature = req.headers['x-patreon-signature'] || req.headers['X-Patreon-Signature'];
  if (!signature) {
    console.warn('No signature header found in webhook request');
    return false;
  }

  if (!req.rawBody) {
    console.error('Raw body not available for signature verification');
    return false;
  }
  
  const hmac = crypto.createHmac('md5', WEBHOOK_SECRET);
  hmac.update(req.rawBody);
  const digest = hmac.digest('hex');
  
  const isValid = signature === digest;
  if (!isValid) {
    console.error('Webhook signature validation failed');
    console.error('Expected:', digest);
    console.error('Received:', signature);
  }
  
  return isValid;
}

// POST /webhooks/patreon - Handle Patreon webhooks
router.post('/patreon', express.raw({ type: 'application/json' }), async (req, res) => {
  // Store raw body for signature verification
  req.rawBody = req.body;
  
  // Parse JSON manually after storing raw body
  let parsedBody;
  try {
    parsedBody = JSON.parse(req.body.toString());
  } catch (error) {
    console.error('Failed to parse webhook JSON:', error);
    return res.status(400).send('Invalid JSON');
  }

  // Validate webhook signature
  if (!validateWebhook(req)) {
    console.error('Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }
  
  const { data, included, meta } = parsedBody;
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
  // Extract patron ID with better error handling
  const patronId = data?.relationships?.user?.data?.id;
  if (!patronId) {
    console.warn('No patron ID found in webhook data');
    return;
  }
  
  // Get membership status with defaults
  const status = data?.attributes?.patron_status || 'unknown';
  const amountCents = data?.attributes?.currently_entitled_amount_cents || 0;
  
  try {
    // Find user by Patreon ID and update membership
    await updateUserMembership(patronId, {
      status,
      amountCents,
      lastUpdated: new Date(),
      eventType
    });
  } catch (error) {
    console.error('Failed to update user membership:', error);
    throw error; // Re-throw to trigger webhook retry
  }
}

export { router as webhookRouter };