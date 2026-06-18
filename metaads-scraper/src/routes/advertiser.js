const express = require('express');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const { scrapeAdvertiser } = require('../scrapers/meta-ads-library');
const { enrichBatch } = require('../enrich');
const memoryCache = require('../cache/memory');
const mongoCache = require('../cache/mongo');
const config = require('../config');
const log = require('../utils/logger');
const { scrapeLimiter } = require('../middleware/rate-limit');
const { validateQuery, advertiserQuerySchema } = require('../middleware/validation');

router.get('/:pageId', scrapeLimiter, validateQuery(advertiserQuerySchema), async (req, res) => {
  const pageId = req.validatedQuery.pageId;
  const limit = Math.min(
    req.validatedQuery.limit || config.scraper.defaultLimit,
    config.scraper.maxLimit
  );
  const country = req.validatedQuery.country || 'US';
  const key = `advertiser:${pageId}:${limit}:${country}`;
  const reqId = uuidv4();

  const fromMem = memoryCache.get(key);
  if (fromMem) return res.json({ ...fromMem, cached: 'memory', reqId });

  const fromMongo = await mongoCache.readCache(key);
  if (fromMongo) {
    memoryCache.set(key, fromMongo, Math.min(config.scraper.cacheTtlSeconds, 600));
    return res.json({ ...fromMongo, cached: 'mongo', reqId });
  }

  try {
    const { ads, meta } = await scrapeAdvertiser({ pageId, limit, country });
    const enriched = enrichBatch(ads);
    const payload = { ads: enriched, meta, ts: new Date().toISOString() };
    memoryCache.set(key, payload, Math.min(config.scraper.cacheTtlSeconds, 600));
    mongoCache.writeCache(key, payload, config.scraper.cacheTtlSeconds, { pageId, country }).catch(() => {});
    res.json({ ...payload, cached: 'miss', reqId });
  } catch (e) {
    log.error('[advertiser] scrape failed', { err: e?.message, pageId });
    res.status(502).json({ error: 'Scrape failed', detail: (e?.message || '').slice(0, 300), reqId });
  }
});

module.exports = router;
