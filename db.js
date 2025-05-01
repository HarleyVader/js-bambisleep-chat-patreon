import { MongoClient } from 'mongodb'

// Simple database connection
let client
let db

// Initialize database connection
async function initDb() {
  if (db) return db
  
  // Connect to MongoDB using connection string
  const uri = process.env.MONGODB_URI || 'mongodb://brandynette:CNNvfZi@192.168.0.178:27017/bambisleep-patronage?authSource=admin'
  client = new MongoClient(uri)
  
  try {
    await client.connect()
    db = client.db()
    console.log('Connected to MongoDB')
    return db
  } catch (err) {
    console.error('MongoDB connection error:', err)
    throw err
  }
}

// Save user data and tokens
async function saveUser(userData, tokens) {
  const db = await initDb()
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
  return db.collection('users').findOne({ patreonId })
}

// Check if token needs refresh
function isTokenExpired(user) {
  // Add 5 minute buffer before actual expiry
  const bufferTime = 5 * 60 * 1000
  return Date.now() >= (user.tokenExpiry - bufferTime)
}

export { initDb, saveUser, getUserById, isTokenExpired }