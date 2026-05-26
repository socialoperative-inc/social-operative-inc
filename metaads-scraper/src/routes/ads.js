const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { scrape } = require('../scrapers/meta-ads-library');
const { enrichBatch } = require('../enrich');
const { filterEcommerce } = require('../enrich/ecommerce-filter');
const memoryCache = require('../cache/memory');
const mongoCache = require('../cache/mongo');
const config = require('../config');
const log = require('../utils/logger');
const { scrapeLimiter } = require('../middleware/rate-limit');
const { validateQuery, searchQuerySchema } = require('../middleware/validation');

function cacheKey({ q, country, mediaType, adType, limit, filterDtc }) {
  return `ads:${(q || '').toLowerCase().trim()}:${country}:${mediaType}:${adType}:${limit}:dtc${filterDtc}`;
}

const SUPPORTED_COUNTRIES = ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'IT', 'ES', 'BR', 'IN', 'MX', 'NL', 'SE', 'NO', 'DK', 'FI'];

// Apply rate limiting and validation
router.get('/', scrapeLimiter, validateQuery(searchQuerySchema), async (req, res) => {
  const q = req.validatedQuery.q;
  
  // Multi-country support
  let country = req.validatedQuery.country || 'US';
  if (!SUPPORTED_COUNTRIES.includes(country)) country = 'US';

  const mediaType = req.validatedQuery.media || 'all';
  const adType = 'all';
  const limit = Math.min(
    req.validatedQuery.limit || config.scraper.defaultLimit,
    config.scraper.maxLimit
  );
  
  // DTC filtering flag (default: true to prioritize ecommerce)
  const filterDtc = req.validatedQuery.filterDtc !== 'false';
  const minEcomScore = filterDtc ? 50 : 0;  // Increased from 40 to 50 for more aggressive filtering

  const key = cacheKey({ q, country, mediaType, adType, limit, filterDtc });
  const reqId = uuidv4();

  // L1 cache
  const fromMem = memoryCache.get(key);
  if (fromMem) {
    return res.json({ ...fromMem, cached: 'memory', reqId });
  }
  // L2 cache
  const fromMongo = await mongoCache.readCache(key);
  if (fromMongo) {
    memoryCache.set(key, fromMongo, Math.min(config.scraper.cacheTtlSeconds, 600));
    return res.json({ ...fromMongo, cached: 'mongo', reqId });
  }

  try {
    const { ads, meta } = await scrape({ query: q, country, mediaType, adType, limit });
    let enriched = enrichBatch(ads);
    
    // Apply DTC/ecommerce filtering if enabled
    if (filterDtc && minEcomScore > 0) {
      enriched = filterEcommerce(enriched, minEcomScore);
      log.info('[ads] DTC filter applied', { before: ads.length, after: enriched.length, minScore: minEcomScore });
    }
    
    const payload = { 
      ads: enriched, 
      meta: { ...meta, filtered: filterDtc, minEcomScore }, 
      ts: new Date().toISOString() 
    };
    memoryCache.set(key, payload, Math.min(config.scraper.cacheTtlSeconds, 600));
    mongoCache.writeCache(key, payload, config.scraper.cacheTtlSeconds, { q, country }).catch(() => {});
    res.json({ ...payload, cached: 'miss', reqId });
  } catch (e) {
    log.error('[ads] scrape failed', { err: e?.message, q });
    res.status(502).json({
      error: 'Scrape failed',
      detail: (e?.message || '').slice(0, 300),
      reqId,
    });
  }
});

// Export supported countries for frontend
router.get('/countries', (req, res) => {
  res.json({ countries: SUPPORTED_COUNTRIES });
});

module.exports = router;
