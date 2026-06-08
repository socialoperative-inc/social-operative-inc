// X-API-Key based authentication between the Vercel frontend and the scraper VPS.
const config = require('../config');

module.exports = function apiKeyAuth(req, res, next) {
  // Health check is always public.
  if (req.path === '/health' || req.path === '/' || req.path.startsWith('/health')) {
    return next();
  }
  if (!config.apiKey) {
    // No key configured → reject all non-health traffic to fail closed.
    return res.status(503).json({
      error: 'SCRAPER_API_KEY is not configured on the server. Set it in .env to enable scraping.',
    });
  }
  const provided = req.header('x-api-key') || req.query.apiKey;
  if (!provided || provided !== config.apiKey) {
    return res.status(401).json({ error: 'Invalid or missing X-API-Key' });
  }
  next();
};
