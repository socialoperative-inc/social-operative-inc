// Optional MongoDB L2 cache layer for scraped ads.
// All operations are graceful — failures never crash the scraper.
const { MongoClient } = require('mongodb');
const config = require('../config');
const log = require('../utils/logger');

let client = null;
let db = null;
let failedAt = 0;

async function getDb() {
  if (db) return db;
  if (failedAt && Date.now() - failedAt < 30000) return null;
  const url = config.mongo.url;
  if (!url) return null;
  if (
    url.includes('localhost') ||
    url.includes('127.0.0.1') ||
    url.includes('::1')
  ) {
    // Allowed on VPS where the scraper may run with a local Mongo, but warn.
    log.warn('[mongo] using local URL — confirm this is intended on production VPS');
  }
  try {
    client = new MongoClient(url, {
      serverSelectionTimeoutMS: 5000,
      connectTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      maxPoolSize: 10,
    });
    await client.connect();
    db = client.db(config.mongo.dbName);
    await db.collection('ads').createIndex({ key: 1 }, { unique: true });
    await db.collection('ads').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    await db.collection('ads').createIndex({ q: 1, country: 1, fetchedAt: -1 });
    log.info('[mongo] connected', { dbName: config.mongo.dbName });
    return db;
  } catch (e) {
    log.error('[mongo] connection failed', { err: e?.message });
    failedAt = Date.now();
    db = null;
    client = null;
    return null;
  }
}

async function readCache(key) {
  const d = await getDb();
  if (!d) return null;
  try {
    const doc = await d.collection('ads').findOne({ key });
    if (!doc) return null;
    if (doc.expiresAt && new Date(doc.expiresAt) < new Date()) return null;
    return doc.payload;
  } catch (e) {
    log.warn('[mongo] readCache failed', { err: e?.message });
    return null;
  }
}

async function writeCache(key, payload, ttlSeconds, meta = {}) {
  const d = await getDb();
  if (!d) return false;
  try {
    await d.collection('ads').updateOne(
      { key },
      {
        $set: {
          key,
          payload,
          ...meta,
          fetchedAt: new Date(),
          expiresAt: new Date(Date.now() + ttlSeconds * 1000),
        },
      },
      { upsert: true }
    );
    return true;
  } catch (e) {
    log.warn('[mongo] writeCache failed', { err: e?.message });
    return false;
  }
}

async function stats() {
  const d = await getDb();
  if (!d) return { connected: false };
  try {
    const count = await d.collection('ads').countDocuments();
    return { connected: true, count };
  } catch (e) {
    return { connected: false, error: e?.message };
  }
}

module.exports = { getDb, readCache, writeCache, stats };
