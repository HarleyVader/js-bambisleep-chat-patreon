import { getUserById, isTokenExpired, saveUser } from './db.js';
import { refreshTokens, getPatronData } from './services/patreon.js';

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