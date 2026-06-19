// =============================================================================
// Frontend proxy for the external Meta Ads Library scraper (metaads-scraper VPS).
//
// Why a proxy?
//   1. Hides SCRAPER_API_KEY from the browser.
//   2. Adds Supabase-auth gating (no anonymous scraping).
//   3. Persists saved ads + AI analyses against the logged-in user.
//   4. Returns clean degraded JSON when the scraper VPS is offline.
// =============================================================================
import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { verifySupabaseToken } from '../../../../lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// ---------- safe helpers ----------
const safeStr = (v) => (typeof v === 'string' ? v : '');
const cleanHeader = (v) =>
  typeof v === 'string' ? v.replace(/[\r\n\t]/g, '').trim() : '';

function getScraperBase() {
  const raw =
    cleanHeader(process.env.METAADS_SCRAPER_URL) ||
    cleanHeader(process.env.NEXT_PUBLIC_API_URL);
  if (!raw) return null;
  try {
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    return u.origin.replace(/\/$/, '');
  } catch (_) {
    return null;
  }
}
function getScraperKey() {
  return cleanHeader(process.env.METAADS_SCRAPER_API_KEY) || '';
}
function getAuthToken(request) {
  try {
    const auth = request?.headers?.get?.('authorization');
    if (typeof auth !== 'string') return null;
    if (!auth.startsWith('Bearer ')) return null;
    return auth.slice(7);
  } catch (_) {
    return null;
  }
}
function err(message, status = 500, extra = {}) {
  return NextResponse.json(
    { error: typeof message === 'string' ? message : 'Internal error', ...extra },
    { status }
  );
}

// ---------- shared mongo client (saved ads + ad analyses) ----------
let _client = null;
let _db = null;
let _failedAt = 0;
async function getDb() {
  if (_db) return _db;
  if (_failedAt && Date.now() - _failedAt < 15000) return null;
  const url = safeStr(process.env.MONGO_URL).trim();
  if (!url) return null;
  if (process.env.VERCEL && /localhost|127\.0\.0\.1|::1/.test(url)) return null;
  if (!/^mongodb(\+srv)?:\/\//.test(url)) return null;
  try {
    _client = new MongoClient(url, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 20000,
      connectTimeoutMS: 5000,
      maxPoolSize: 8,
    });
    await _client.connect();
    _db = _client.db(safeStr(process.env.DB_NAME) || 'social_operative');
    try {
      await Promise.all([
        _db.collection('saved_ads').createIndex({ userId: 1, savedAt: -1 }),
        _db.collection('saved_ads').createIndex({ userId: 1, adId: 1 }, { unique: true }),
        _db.collection('ad_analyses').createIndex({ userId: 1, adId: 1 }, { unique: true }),
        _db.collection('competitor_brands').createIndex({ userId: 1, addedAt: -1 }),
      ]);
    } catch (_) {}
    return _db;
  } catch (e) {
    _failedAt = Date.now();
    _db = null;
    _client = null;
    return null;
  }
}

// ---------- proxy fetch with timeout ----------
async function scraperFetch(pathAndQuery, { timeoutMs = 55000 } = {}) {
  const base = getScraperBase();
  const key = getScraperKey();
  if (!base) {
    const e = new Error('NEXT_PUBLIC_API_URL / METAADS_SCRAPER_URL not configured');
    e._kind = 'config';
    throw e;
  }
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${base}${pathAndQuery}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { 'X-API-Key': key } : {}),
      },
      signal: ctrl.signal,
      cache: 'no-store',
    });
    clearTimeout(t);
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch (_) {}
    return { ok: res.ok, status: res.status, json, text };
  } catch (e) {
    clearTimeout(t);
    if (e?.name === 'AbortError') {
      const err2 = new Error('Scraper request timed out');
      err2._kind = 'timeout';
      throw err2;
    }
    const err2 = new Error(safeStr(e?.message) || 'Scraper fetch failed');
    err2._kind = 'network';
    throw err2;
  }
}

// =============================================================================
// Handler
// =============================================================================
async function handle(request, { params }) {
  let pathArr = [];
  let method = 'GET';
  let path = '/';
  try {
    pathArr = Array.isArray(params?.path) ? params.path : [];
    path = '/' + pathArr.join('/');
    method = safeStr(request?.method) || 'GET';
  } catch (_) {
    return err('Bad request', 400);
  }

  // -------- health (public) --------
  if (path === '/health' && method === 'GET') {
    const base = getScraperBase();
    if (!base) {
      return NextResponse.json({
        ok: false,
        configured: false,
        message: 'Scraper backend URL not configured. Set NEXT_PUBLIC_API_URL (and METAADS_SCRAPER_API_KEY) in Vercel env vars.',
        ts: new Date().toISOString(),
      });
    }
    try {
      const r = await scraperFetch('/health', { timeoutMs: 8000 });
      return NextResponse.json({
        ok: r.ok,
        configured: true,
        base,
        upstream: r.json || { raw: r.text?.slice(0, 200) },
        ts: new Date().toISOString(),
      }, { status: r.ok ? 200 : 502 });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        configured: true,
        base,
        error: safeStr(e?.message),
        kind: e?._kind || 'unknown',
        ts: new Date().toISOString(),
      }, { status: 200 }); // 200 with ok:false — client renders graceful offline state
    }
  }

  // -------- auth gate for everything else --------
  const token = getAuthToken(request);
  let user = null;
  try { user = await verifySupabaseToken(token); } catch (_) { user = null; }
  if (!user) return err('Unauthorized — please log in', 401);

  // -------- search ads --------
  if (path === '/ads' && method === 'GET') {
    const u = new URL(request.url);
    const q = safeStr(u.searchParams.get('q'));
    const limit = safeStr(u.searchParams.get('limit')) || '30';
    const media = ['all', 'image', 'video'].includes(u.searchParams.get('media'))
      ? u.searchParams.get('media')
      : 'all';
    if (!q.trim()) return err('query parameter ?q= is required', 400);
    const qs = new URLSearchParams({ q: q.trim(), limit, media }).toString();
    try {
      const r = await scraperFetch(`/ads?${qs}`, { timeoutMs: 55000 });
      if (!r.ok) {
        return NextResponse.json(
          { ok: false, error: r.json?.error || `Scraper ${r.status}`, ads: [], offline: false },
          { status: r.status }
        );
      }
      return NextResponse.json({ ok: true, offline: false, ...(r.json || {}) });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        offline: true,
        kind: e?._kind || 'network',
        error: safeStr(e?.message),
        ads: [],
      });
    }
  }

  // -------- advertiser by pageId --------
  if (pathArr[0] === 'advertiser' && pathArr[1] && method === 'GET') {
    const u = new URL(request.url);
    const limit = safeStr(u.searchParams.get('limit')) || '30';
    try {
      const r = await scraperFetch(`/advertiser/${encodeURIComponent(pathArr[1])}?limit=${limit}`);
      return NextResponse.json({ ok: r.ok, offline: false, ...(r.json || {}) }, { status: r.ok ? 200 : r.status });
    } catch (e) {
      return NextResponse.json({
        ok: false,
        offline: true,
        kind: e?._kind || 'network',
        error: safeStr(e?.message),
        ads: [],
      });
    }
  }

  // -------- saved ads --------
  const db = await getDb();

  if (path === '/saved-ads' && method === 'GET') {
    if (!db) return NextResponse.json({ saved: [], offline: true });
    try {
      const docs = await db
        .collection('saved_ads')
        .find({ userId: user.id }, { projection: { _id: 0 } })
        .sort({ savedAt: -1 })
        .limit(120)
        .toArray();
      return NextResponse.json({ saved: docs });
    } catch (_) {
      return NextResponse.json({ saved: [], offline: true });
    }
  }

  if (path === '/saved-ads' && method === 'POST') {
    if (!db) return err('Database unavailable', 503);
    let body;
    try { body = await request.json(); } catch (_) { return err('invalid JSON body', 400); }
    const ad = body?.ad;
    if (!ad || !ad.adId) return err('ad with adId required', 400);
    const doc = {
      id: uuidv4(),
      adId: safeStr(ad.adId),
      userId: user.id,
      ad,
      note: safeStr(body?.note),
      tags: Array.isArray(body?.tags) ? body.tags : [],
      savedAt: new Date(),
    };
    try {
      await db.collection('saved_ads').updateOne(
        { userId: user.id, adId: doc.adId },
        { $set: doc },
        { upsert: true }
      );
      return NextResponse.json({ ok: true, saved: doc });
    } catch (e) {
      return err(safeStr(e?.message) || 'Save failed', 500);
    }
  }

  if (pathArr[0] === 'saved-ads' && pathArr[1] && method === 'DELETE') {
    if (!db) return err('Database unavailable', 503);
    try {
      await db.collection('saved_ads').deleteOne({ userId: user.id, adId: pathArr[1] });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return err(safeStr(e?.message) || 'Delete failed', 500);
    }
  }

  // -------- competitor brand tracker --------
  if (path === '/competitors' && method === 'GET') {
    if (!db) return NextResponse.json({ competitors: [] });
    try {
      const docs = await db
        .collection('competitor_brands')
        .find({ userId: user.id }, { projection: { _id: 0 } })
        .sort({ addedAt: -1 })
        .toArray();
      return NextResponse.json({ competitors: docs });
    } catch (_) {
      return NextResponse.json({ competitors: [] });
    }
  }
  if (path === '/competitors' && method === 'POST') {
    if (!db) return err('Database unavailable', 503);
    let body;
    try { body = await request.json(); } catch (_) { return err('invalid JSON body', 400); }
    const name = safeStr(body?.name).trim();
    const pageId = safeStr(body?.pageId).trim();
    if (!name && !pageId) return err('name or pageId required', 400);
    const doc = {
      id: uuidv4(),
      userId: user.id,
      name,
      pageId,
      note: safeStr(body?.note),
      niche: safeStr(body?.niche),
      addedAt: new Date(),
    };
    try {
      await db.collection('competitor_brands').insertOne(doc);
      const { _id, ...rest } = doc;
      return NextResponse.json({ competitor: rest });
    } catch (e) {
      return err(safeStr(e?.message) || 'Add failed', 500);
    }
  }
  if (pathArr[0] === 'competitors' && pathArr[1] && method === 'DELETE') {
    if (!db) return err('Database unavailable', 503);
    try {
      await db.collection('competitor_brands').deleteOne({ userId: user.id, id: pathArr[1] });
      return NextResponse.json({ ok: true });
    } catch (e) {
      return err(safeStr(e?.message) || 'Delete failed', 500);
    }
  }

  return err(`Route not found: ${path}`, 404);
}

async function safeHandle(request, ctx) {
  try {
    return await handle(request, ctx || { params: {} });
  } catch (e) {
    return NextResponse.json(
      { error: safeStr(e?.message) || 'Fatal error' },
      { status: 500 }
    );
  }
}

export const GET = safeHandle;
export const POST = safeHandle;
export const PUT = safeHandle;
export const DELETE = safeHandle;
export const PATCH = safeHandle;
