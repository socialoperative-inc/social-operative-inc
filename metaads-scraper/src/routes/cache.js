const express = require('express');
const router = express.Router();
const memoryCache = require('../cache/memory');
const mongoCache = require('../cache/mongo');

router.get('/stats', async (req, res) => {
  res.json({
    memory: memoryCache.stats(),
    mongo: await mongoCache.stats().catch(() => ({ connected: false })),
  });
});

router.post('/clear', (req, res) => {
  memoryCache.clear();
  res.json({ ok: true, cleared: 'memory' });
});

module.exports = router;
