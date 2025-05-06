import { getUserById, isTokenExpired, saveUser } from './db.js';
import { refreshTokens, getPatronData } from './services/patreon.js';
import rateLimit from 'express-rate-limit';

// Create more secure rate limiter config
const rateLimiterOptions = {
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true, // Return rate limit info in the RateLimit-* headers
  legacyHeaders: false, // Disable the X-RateLimit-* headers
  // Add a custom IP extraction function for more security when behind a proxy
  keyGenerator: (req) => {
    // Get first IP from X-Forwarded-For or use the connection IP
    const xForwardedFor = req.headers['x-forwarded-for'];
    if (xForwardedFor) {
      // Only use the first IP in the list (client IP)
      return xForwardedFor.split(',')[0].trim();
    }
    return req.ip;
  }
};

// API rate limiter (stricter)
export const apiRateLimiter = rateLimit({
  ...rateLimiterOptions,
  max: 100,
  message: 'Too many API requests, please try again later.'
});

// Auth rate limiter (more lenient)
export const authRateLimiter = rateLimit({
  ...rateLimiterOptions,
  max: 20,
  message: 'Too many authentication attempts, please try again later.'
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