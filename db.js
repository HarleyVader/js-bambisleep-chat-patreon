import { MongoClient } from 'mongodb'

// Simple database connection
let client
let db

// Initialize database connection
async function initDb() {
  if (db) return db
  
  // Connect to MongoDB using connection string
  const uri = process.env.MONGODB_URI
  if (!uri) {
    console.warn('MONGODB_URI environment variable not set - running without database')
    return null
  }
  
  client = new MongoClient(uri)
  
  try {
    await client.connect()
    db = client.db()
    console.log('Connected to MongoDB')
    return db
  } catch (err) {
    console.error('MongoDB connection error:', err)
    console.warn('Continuing without database - some features may not work')
    return null
  }
}

// Save user data and tokens
async function saveUser(userData, tokens) {
  const db = await initDb()
  if (!db) {
    console.warn('Database not available - cannot save user data')
    return { userId: userData.id }
  }
  
  const now = Date.now()
  const expiryTime = now + (tokens.expires_in * 1000)
  
  // Store user with tokens
  await db.collection('users').updateOne(
    { patreonId: userData.id },
    { 
      $set: {
        patreonId: userData.id,
        email: userData.email,
        fullName: userData.fullName,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        tokenExpiry: expiryTime,
        updatedAt: now
      },
      $setOnInsert: { createdAt: now }
    },
    { upsert: true }
  )
  
  return { userId: userData.id }
}

// Get user by Patreon ID
async function getUserById(patreonId) {
  const db = await initDb()
  if (!db) return null
  return db.collection('users').findOne({ patreonId })
}

// Check if token needs refresh
function isTokenExpired(user) {
  // Add 5 minute buffer before actual expiry
  const bufferTime = 5 * 60 * 1000
  return Date.now() >= (user.tokenExpiry - bufferTime)
}

// Get user by Patreon ID
export async function getUserByPatreonId(patreonId) {
  const db = await initDb()
  if (!db) return null
  return await db.collection('users').findOne({ patreonId });
}

// Update user membership status from webhook
export async function updateUserMembership(patreonId, membershipData) {
  const db = await initDb()
  if (!db) {
    console.warn('Database not available - cannot update user membership')
    return null
  }
  return await db.collection('users').updateOne(
    { patreonId },
    { 
      $set: { 
        membershipStatus: membershipData.status,
        membershipAmountCents: membershipData.amountCents,
        membershipLastUpdated: membershipData.lastUpdated,
        lastEventType: membershipData.eventType
      }
    }
  );
}

export { initDb, saveUser, getUserById, isTokenExpired }