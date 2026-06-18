const dotenv = require('dotenv');
dotenv.config();

const num = (v, def) => {
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : def;
};
const bool = (v, def) => (v == null ? def : /^(1|true|yes|on)$/i.test(String(v)));

const config = {
  port: num(process.env.PORT, 8080),
  env: process.env.NODE_ENV || 'development',
  apiKey: (process.env.SCRAPER_API_KEY || '').trim(),
  corsOrigins: (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  mongo: {
    url: (process.env.MONGO_URL || '').trim(),
    dbName: process.env.DB_NAME || 'metaads_cache',
  },
  scraper: {
    defaultCountry: (process.env.SCRAPER_DEFAULT_COUNTRY || 'US').toUpperCase(),
    defaultLimit: num(process.env.SCRAPER_DEFAULT_LIMIT, 30),
    maxLimit: num(process.env.SCRAPER_MAX_LIMIT, 80),
    cacheTtlSeconds: num(process.env.SCRAPER_CACHE_TTL_SECONDS, 3600),
    headless: bool(process.env.SCRAPER_HEADLESS, true),
    userAgent:
      process.env.SCRAPER_USER_AGENT ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    navigationTimeoutMs: num(process.env.SCRAPER_NAVIGATION_TIMEOUT_MS, 60000),
    maxScrolls: num(process.env.SCRAPER_MAX_SCROLLS, 8),
  },
  rateLimit: {
    windowMs: num(process.env.RATE_LIMIT_WINDOW_MS, 60000),
    max: num(process.env.RATE_LIMIT_MAX, 60),
  },
};

module.exports = config;
