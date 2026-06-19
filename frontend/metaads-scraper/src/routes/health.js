const express = require('express');
const router = express.Router();
const config = require('../config');
const mongoCache = require('../cache/mongo');
const memoryCache = require('../cache/memory');

router.get('/', async (req, res) => {
  const m = await mongoCache.stats().catch(() => ({ connected: false }));
  res.json({
    status: 'ok',
    service: 'metaads-scraper',
    version: '1.0.0',
    uptimeSeconds: Math.round(process.uptime()),
    env: config.env,
    cache: {
      memory: memoryCache.stats(),
      mongo: m,
    },
    scraper: {
      headless: config.scraper.headless,
      defaultCountry: config.scraper.defaultCountry,
      defaultLimit: config.scraper.defaultLimit,
      maxLimit: config.scraper.maxLimit,
    },
    ts: new Date().toISOString(),
  });
});

module.exports = router;
