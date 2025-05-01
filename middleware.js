import { getUserById, isTokenExpired, saveUser } from './db.js';
import { refreshTokens, getPatronData } from './services/patreon.js';
import rateLimit from 'express-rate-limit';

// API rate limiting (100 requests per minute per user)
export const apiRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.user?.id || req.ip, // Limit by user ID if authenticated, IP otherwise
  message: {
    error: 'Too many requests. Please try again later.',
    retryAfter: 'Retry after the rate limit window closes.'
  }
});

// More aggressive rate limiting for authentication endpoints
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // 30 requests per 15 minutes
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please try again later.',
    retryAfter: 'Retry after the rate limit window closes.'
  }
});

export async function tokenMiddleware(req, res, next) {
  const userId = req.session?.patreonId;
  
  if (!userId) {
    return next();
  }
  
  try {
    // Get user data with tokens
    const user = await getUserById(userId);
    
    if (!user) {
      delete req.session.patreonId;
      return next();
    }
    
    // Check if token needs refresh
    if (isTokenExpired(user)) {
      try {
        // Refresh the token
        const newTokens = await refreshTokens(user.refreshToken);
        
        // Update user with new tokens
        await saveUser(
          { 
            id: userId, 
            email: user.email, 
            fullName: user.fullName 
          },
          newTokens
        );
        
        // Update user object
        user.accessToken = newTokens.access_token;
        user.refreshToken = newTokens.refresh_token;
        user.tokenExpiry = Date.now() + (newTokens.expires_in * 1000);
      } catch (refreshError) {
        // Token refresh failed, clear session
        delete req.session.patreonId;
        return next();
      }
    }
    
    // Add user data to request
    req.user = user;
    
    // Add convenience method to get patron data
    req.getPatronData = () => getPatronData(user.accessToken);
  } catch (err) {
    console.error('Token middleware error:', err);
  }
  
  next();
}