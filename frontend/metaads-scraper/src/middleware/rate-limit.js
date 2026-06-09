// =============================================================================
// Rate limiting middleware for API protection
// Prevents abuse and ensures fair usage across all endpoints
// =============================================================================

const rateLimit = require('express-rate-limit');
const log = require('../utils/logger');

// General API rate limiter - 60 requests per minute
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.', code: 'RATE_LIMIT_EXCEEDED' },
  handler: (req, res) => {
    log.warn('[rate-limit] API limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({
      error: 'Too many requests from this IP, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: 60,
    });
  },
});

// Scraping endpoint rate limiter - 10 requests per minute (expensive operations)
const scrapeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  handler: (req, res) => {
    log.warn('[rate-limit] Scrape limit exceeded', { ip: req.ip, path: req.path });
    res.status(429).json({
      error: 'Scraping rate limit exceeded. Maximum 10 searches per minute.',
      code: 'SCRAPE_LIMIT_EXCEEDED',
      retryAfter: 60,
    });
  },
});

// Health check limiter - 30 requests per minute
const healthLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
});

module.exports = {
  apiLimiter,
  scrapeLimiter,
  healthLimiter,
};
