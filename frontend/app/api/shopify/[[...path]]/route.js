// app/api/shopify/[[...path]]/route.js
//
// Shopify Commerce Hub — isolated catch-all (sibling to /api/shopify/webhooks).
// Sync state lives in dedicated Mongo collections; all list endpoints read
// from those collections by default. Pass ?live=1 to force a live REST call.
//
// Public:
//   GET    /auth/callback                       OAuth landing
// Auth required (Supabase bearer):
//   GET    /config
//   GET    /auth/install?shop=
//   GET    /stores
//   POST   /stores/:id/reconnect                returns install URL
//   DELETE /stores/:id
//   POST   /stores/:id/sync                     legacy: pulls counts (kept for back-compat)
//   POST   /sync/all?storeId=
//   POST   /sync/:resource?storeId=             products|orders|customers|inventory
//   GET    /sync/logs?storeId=&limit=
//   GET    /webhooks/logs?storeId=&limit=
//   GET    /shop?storeId=                       live shop info
//   GET    /dashboard?storeId=                  aggregated from Mongo
//   GET    /products?storeId=&page=&limit=&q=&status=&live=
//   POST   /products?storeId=                   create
//   GET    /products/:productId?storeId=        one
//   PUT    /products/:productId?storeId=        update
//   DELETE /products/:productId?storeId=
//   POST   /products/:productId/images?storeId=
//   GET    /orders?storeId=&page=&limit=&q=&financialStatus=&fulfillmentStatus=&live=
//   GET    /customers?storeId=&page=&limit=&q=&live=
//   GET    /collections?storeId=                live (collections are small)
//   GET    /inventory?storeId=&page=&limit=&lowStock=
import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { verifySupabaseToken } from '../../../../lib/supabase/admin';
import { encryptToken, decryptToken, generateState } from '../../../../lib/shopify/crypto';
import { verifyOAuthHmac } from '../../../../lib/shopify/hmac';
import { normalizeShopDomain, isValidShopDomain } from '../../../../lib/shopify/validate';
import {
  isShopifyConfigured,
  defaultScopes,
  buildInstallUrl,
  exchangeCodeForToken,
  restGet,
  apiVersion,
} from '../../../../lib/shopify/client';
import { syncAll, syncProducts, syncOrders, syncCustomers, syncInventory, logSync } from '../../../../lib/shopify/sync';
import { registerWebhooks, webhookAddress } from '../../../../lib/shopify/webhooks';
import { rewriteProductCopy } from '../../../../lib/shopify/ai';

const safeStr = (v) => (typeof v === 'string' ? v : '');
const isLocalhostUri = (u) => {
  const v = safeStr(u);
  return v.includes('localhost') || v.includes('127.0.0.1') || v.includes('::1');
};
const now = () => new Date();

// ---------------- Mongo singleton ----------------
let cachedDb = null;
let dbInitFailedAt = 0;

async function getDb() {
  if (cachedDb) return cachedDb;
  if (dbInitFailedAt && Date.now() - dbInitFailedAt < 15000) return null;

  const url = safeStr(process.env.MONGO_URL).trim();
  if (!url) { dbInitFailedAt = Date.now(); return null; }
  if (process.env.VERCEL && isLocalhostUri(url)) { dbInitFailedAt = Date.now(); return null; }
  if (!url.startsWith('mongodb://') && !url.startsWith('mongodb+srv://')) { dbInitFailedAt = Date.now(); return null; }

  try {
    const client = new MongoClient(url, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 30000,
      connectTimeoutMS: 5000,
      maxPoolSize: 10,
      retryWrites: true,
    });
    await client.connect();
    cachedDb = client.db(safeStr(process.env.DB_NAME) || 'social_operative');
    // Best-effort index creation across all Shopify collections.
    try {
      await Promise.all([
        cachedDb.collection('shopify_stores').createIndex({ userId: 1, shopDomain: 1 }, { unique: true }),
        cachedDb.collection('shopify_stores').createIndex({ id: 1 }, { unique: true }),
        cachedDb.collection('shopify_stores').createIndex({ shopDomain: 1 }),

        cachedDb.collection('shopify_oauth_state').createIndex({ state: 1 }, { unique: true }),
        cachedDb.collection('shopify_oauth_state').createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),

        cachedDb.collection('shopify_products').createIndex({ storeId: 1, productId: 1 }, { unique: true }),
        cachedDb.collection('shopify_products').createIndex({ storeId: 1, syncedAt: -1 }),
        cachedDb.collection('shopify_products').createIndex({ storeId: 1, title: 1 }),

        cachedDb.collection('shopify_variants').createIndex({ storeId: 1, variantId: 1 }, { unique: true }),
        cachedDb.collection('shopify_variants').createIndex({ storeId: 1, productId: 1 }),
        cachedDb.collection('shopify_variants').createIndex({ storeId: 1, inventoryQuantity: 1 }),

        cachedDb.collection('shopify_orders').createIndex({ storeId: 1, orderId: 1 }, { unique: true }),
        cachedDb.collection('shopify_orders').createIndex({ storeId: 1, createdAtShopify: -1 }),
        cachedDb.collection('shopify_orders').createIndex({ storeId: 1, financialStatus: 1 }),

        cachedDb.collection('shopify_customers').createIndex({ storeId: 1, customerId: 1 }, { unique: true }),
        cachedDb.collection('shopify_customers').createIndex({ storeId: 1, email: 1 }),
        cachedDb.collection('shopify_customers').createIndex({ storeId: 1, createdAtShopify: -1 }),

        cachedDb.collection('shopify_inventory').createIndex({ storeId: 1, inventoryItemId: 1, locationId: 1 }, { unique: true }),
        cachedDb.collection('shopify_inventory').createIndex({ storeId: 1, available: 1 }),

        cachedDb.collection('shopify_webhooks').createIndex({ ts: -1 }),
        cachedDb.collection('shopify_webhooks').createIndex({ storeId: 1, ts: -1 }),

        cachedDb.collection('sync_logs').createIndex({ ts: -1 }),
        cachedDb.collection('sync_logs').createIndex({ storeId: 1, ts: -1 }),
      ]);
    } catch (_) {}
    return cachedDb;
  } catch (e) {
    console.error('[shopify mongo]', safeStr(e?.message));
    dbInitFailedAt = Date.now();
    cachedDb = null;
    return null;
  }
}

// ---------------- Helpers ----------------
function getAuthToken(request) {
  try {
    const auth = request?.headers?.get?.('authorization');
    if (typeof auth !== 'string' || !auth.startsWith('Bearer ')) return null;
    return auth.slice(7);
  } catch (_) { return null; }
}

function err(message, status = 500) {
  return NextResponse.json(
    { error: typeof message === 'string' ? message : 'Internal error' },
    { status }
  );
}

function appBaseUrl() {
  const candidates = [
    process.env.SHOPIFY_APP_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  ];
  for (const c of candidates) {
    const v = safeStr(c).trim();
    if (!v) continue;
    const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
    try {
      const u = new URL(withScheme);
      return u.origin;
    } catch (_) {}
  }
  return 'https://social-operative-inc.vercel.app';
}

const redirectUri = () => `${appBaseUrl()}/api/shopify/auth/callback`;

async function resolveStore(db, userId, storeId) {
  const store = await db
    .collection('shopify_stores')
    .findOne({ id: storeId, userId, uninstalled: { $ne: true } });
  if (!store) throw Object.assign(new Error('Store not found'), { status: 404 });
  const accessToken = decryptToken(safeStr(store.encryptedToken));
  return { store, accessToken };
}

async function readJsonBody(request) {
  try {
    const text = await request.text();
    return text ? JSON.parse(text) : {};
  } catch (_) { return {}; }
}

async function restWrite({ shopDomain, accessToken, method, path, body }) {
  const url = `https://${shopDomain}/admin/api/${apiVersion()}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = { raw: text }; }
  if (!res.ok) {
    const e = new Error(`Shopify ${method} ${path} → ${res.status}: ${safeStr(parsed?.errors || parsed?.error || text).slice(0, 400)}`);
    e.status = res.status;
    throw e;
  }
  return parsed;
}

// ---------------- Background sync trigger (non-blocking) ----------------
function kickOffSync(db, store, accessToken) {
  // Fire-and-forget; do NOT await on the request path.
  (async () => {
    try {
      await syncAll(db, store, accessToken);
    } catch (e) {
      console.error('[shopify kickOffSync]', safeStr(e?.message));
    }
  })();
}

// ---------------- Handler ----------------
async function handle(request, { params }) {
  let pathArr = [];
  let path = '/';
  let method = 'GET';
  try {
    pathArr = Array.isArray(params?.path) ? params.path : [];
    path = '/' + pathArr.join('/');
    method = safeStr(request?.method) || 'GET';
  } catch (_) { return err('Bad request', 400); }

  try {
    // ============================================================
    // PUBLIC: /auth/callback
    // ============================================================
    if (path === '/auth/callback' && method === 'GET') {
      const db = await getDb();
      if (!isShopifyConfigured()) {
        if (db) await logSync(db, { resource: 'oauth', stage: 'callback', status: 'error', error: 'server not configured' });
        return err('Shopify is not configured on the server', 503);
      }
      const u = new URL(request.url);
      const sp = u.searchParams;
      const shop = safeStr(sp.get('shop'));
      const code = safeStr(sp.get('code'));
      const state = safeStr(sp.get('state'));
      if (!shop || !code || !state) {
        if (db) await logSync(db, { resource: 'oauth', stage: 'callback', status: 'error', error: 'missing params', shopDomain: shop });
        return err('missing required OAuth params', 400);
      }
      if (!isValidShopDomain(shop)) {
        if (db) await logSync(db, { resource: 'oauth', stage: 'callback', status: 'error', error: 'invalid shop', shopDomain: shop });
        return err('invalid shop domain', 400);
      }
      if (!db) return err('Database unavailable', 503);

      // 1) HMAC
      if (!verifyOAuthHmac(sp, safeStr(process.env.SHOPIFY_API_SECRET).trim())) {
        await logSync(db, { resource: 'oauth', stage: 'hmac_verify', status: 'error', shopDomain: shop });
        return err('HMAC verification failed', 401);
      }
      await logSync(db, { resource: 'oauth', stage: 'hmac_verify', status: 'ok', shopDomain: shop });

      // 2) State
      const stateDoc = await db.collection('shopify_oauth_state').findOne({ state });
      if (!stateDoc) {
        await logSync(db, { resource: 'oauth', stage: 'state_verify', status: 'error', error: 'invalid state', shopDomain: shop });
        return err('invalid or expired state', 400);
      }
      if (safeStr(stateDoc.shopDomain) !== shop) {
        await logSync(db, { resource: 'oauth', stage: 'state_verify', status: 'error', error: 'state/shop mismatch', shopDomain: shop });
        return err('state/shop mismatch', 400);
      }
      await logSync(db, { resource: 'oauth', stage: 'state_verify', status: 'ok', shopDomain: shop, userId: stateDoc.userId });

      // 3) Token exchange
      let tokenRes;
      try {
        tokenRes = await exchangeCodeForToken({ shopDomain: shop, code });
        await logSync(db, { resource: 'oauth', stage: 'token_exchange', status: 'ok', shopDomain: shop, userId: stateDoc.userId, scope: tokenRes.scope });
      } catch (e) {
        await logSync(db, { resource: 'oauth', stage: 'token_exchange', status: 'error', shopDomain: shop, userId: stateDoc.userId, error: safeStr(e?.message) });
        return err(safeStr(e?.message) || 'token exchange failed', 502);
      }

      // 4) Persist
      let storeName = shop.replace(/\.myshopify\.com$/, '');
      try {
        const info = await restGet({ shopDomain: shop, accessToken: tokenRes.accessToken, path: '/shop.json' });
        if (info?.shop?.name) storeName = info.shop.name;
      } catch (_) {}

      const encrypted = encryptToken(tokenRes.accessToken);
      const nowDate = now();
      await db.collection('shopify_stores').updateOne(
        { userId: safeStr(stateDoc.userId), shopDomain: shop },
        {
          $setOnInsert: { id: uuidv4(), userId: safeStr(stateDoc.userId), shopDomain: shop, installedAt: nowDate },
          $set: {
            encryptedToken: encrypted,
            storeName,
            scopes: tokenRes.scope,
            status: 'active',
            updatedAt: nowDate,
            uninstalled: false,
          },
        },
        { upsert: true }
      );
      await db.collection('shopify_oauth_state').deleteOne({ state });

      const store = await db.collection('shopify_stores').findOne({ userId: stateDoc.userId, shopDomain: shop });
      await logSync(db, { resource: 'oauth', stage: 'persist', status: 'ok', shopDomain: shop, userId: stateDoc.userId, storeId: store?.id });

      // 5) Register webhooks (best-effort)
      try {
        const results = await registerWebhooks({
          shopDomain: shop,
          accessToken: tokenRes.accessToken,
          address: webhookAddress(appBaseUrl()),
        });
        await logSync(db, {
          resource: 'oauth', stage: 'webhook_register',
          status: results.every(r => r.ok) ? 'ok' : 'partial',
          shopDomain: shop, storeId: store?.id, userId: stateDoc.userId,
          results,
        });
      } catch (e) {
        await logSync(db, {
          resource: 'oauth', stage: 'webhook_register', status: 'error',
          shopDomain: shop, storeId: store?.id, userId: stateDoc.userId,
          error: safeStr(e?.message),
        });
      }

      // 6) Background full sync
      kickOffSync(db, store, tokenRes.accessToken);

      try {
        await db.collection('activity').insertOne({
          id: uuidv4(),
          agent: 'commerce', type: 'shopify-install',
          summary: `Connected Shopify store ${shop}`,
          model: '-', userId: safeStr(stateDoc.userId), ts: nowDate,
        });
      } catch (_) {}

      const dest = new URL(appBaseUrl());
      dest.searchParams.set('shopify_connected', '1');
      dest.searchParams.set('shop', shop);
      dest.hash = 'commerce-hub';
      return NextResponse.redirect(dest.toString(), { status: 302 });
    }

    // ============================================================
    // AUTH REQUIRED
    // ============================================================
    const token = getAuthToken(request);
    let user = null;
    try { user = await verifySupabaseToken(token); } catch (_) { user = null; }
    if (!user) return err('Unauthorized — please log in', 401);

    // /config
    if (path === '/config' && method === 'GET') {
      return NextResponse.json({
        configured: isShopifyConfigured(),
        scopes: defaultScopes(),
        apiVersion: apiVersion(),
        redirectUri: redirectUri(),
        webhookAddress: webhookAddress(appBaseUrl()),
      });
    }

    // /auth/install
    if (path === '/auth/install' && method === 'GET') {
      if (!isShopifyConfigured()) return err('Shopify not configured', 503);
      const u = new URL(request.url);
      const shopDomain = normalizeShopDomain(u.searchParams.get('shop'));
      if (!shopDomain) return err('invalid shop — expected <name>.myshopify.com', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      const state = generateState();
      await db.collection('shopify_oauth_state').insertOne({
        state, userId: user.id, shopDomain,
        createdAt: now(), expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      await logSync(db, { resource: 'oauth', stage: 'install_start', status: 'ok', shopDomain, userId: user.id });
      return NextResponse.json({
        installUrl: buildInstallUrl({ shopDomain, redirectUri: redirectUri(), state, scopes: defaultScopes() }),
        shopDomain, state,
      });
    }

    // /stores GET
    if (path === '/stores' && method === 'GET') {
      const db = await getDb();
      if (!db) return NextResponse.json({ stores: [] });
      const docs = await db
        .collection('shopify_stores')
        .find({ userId: user.id, uninstalled: { $ne: true } }, { projection: { _id: 0, encryptedToken: 0 } })
        .sort({ installedAt: -1 })
        .toArray();
      return NextResponse.json({ stores: docs });
    }

    // /stores/:id DELETE
    if (pathArr[0] === 'stores' && pathArr[1] && pathArr.length === 2 && method === 'DELETE') {
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      await db.collection('shopify_stores').updateOne(
        { id: pathArr[1], userId: user.id },
        { $set: { uninstalled: true, status: 'disconnected', uninstalledAt: now() } }
      );
      await logSync(db, { resource: 'store', stage: 'disconnect', status: 'ok', storeId: pathArr[1], userId: user.id });
      return NextResponse.json({ ok: true });
    }

    // /stores/:id/reconnect POST
    if (pathArr[0] === 'stores' && pathArr[1] && pathArr[2] === 'reconnect' && method === 'POST') {
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      const existing = await db.collection('shopify_stores').findOne({ id: pathArr[1], userId: user.id });
      if (!existing) return err('Store not found', 404);
      const state = generateState();
      await db.collection('shopify_oauth_state').insertOne({
        state, userId: user.id, shopDomain: existing.shopDomain,
        createdAt: now(), expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      });
      return NextResponse.json({
        installUrl: buildInstallUrl({ shopDomain: existing.shopDomain, redirectUri: redirectUri(), state, scopes: defaultScopes() }),
        shopDomain: existing.shopDomain,
      });
    }

    // /stores/:id/sync POST  (legacy counts sync, kept for compat)
    if (pathArr[0] === 'stores' && pathArr[1] && pathArr[2] === 'sync' && method === 'POST') {
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, pathArr[1]);
        const results = await syncAll(db, store, accessToken);
        return NextResponse.json({ ok: true, results });
      } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
    }

    // /sync/all POST
    if (path === '/sync/all' && method === 'POST') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        const results = await syncAll(db, store, accessToken);
        return NextResponse.json({ ok: true, results });
      } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
    }

    // /sync/:resource POST  (products|orders|customers|inventory)
    if (pathArr[0] === 'sync' && pathArr[1] && method === 'POST') {
      const resource = pathArr[1];
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        let result;
        if (resource === 'products') result = await syncProducts(db, store, accessToken);
        else if (resource === 'orders') result = await syncOrders(db, store, accessToken);
        else if (resource === 'customers') result = await syncCustomers(db, store, accessToken);
        else if (resource === 'inventory') result = await syncInventory(db, store, accessToken);
        else return err('Unknown resource', 400);
        await db.collection('shopify_stores').updateOne({ id: store.id }, { $set: { lastSyncAt: now() } });
        return NextResponse.json({ ok: true, resource, result });
      } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
    }

    // /sync/logs GET
    if (path === '/sync/logs' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 250);
      const db = await getDb();
      if (!db) return NextResponse.json({ logs: [] });
      const q = { userId: user.id };
      if (storeId) q.storeId = storeId;
      const logs = await db.collection('sync_logs')
        .find(q, { projection: { _id: 0 } })
        .sort({ ts: -1 })
        .limit(limit)
        .toArray();
      return NextResponse.json({ logs });
    }

    // /webhooks/logs GET
    if (path === '/webhooks/logs' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 250);
      const db = await getDb();
      if (!db) return NextResponse.json({ logs: [] });
      const q = { userId: user.id };
      if (storeId) q.storeId = storeId;
      const logs = await db.collection('shopify_webhooks')
        .find(q, { projection: { _id: 0 } })
        .sort({ ts: -1 })
        .limit(limit)
        .toArray();
      return NextResponse.json({ logs });
    }

    // /shop?storeId  (live)
    if (path === '/shop' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        const data = await restGet({ shopDomain: store.shopDomain, accessToken, path: '/shop.json' });
        return NextResponse.json({ shop: data?.shop || null });
      } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
    }

    // /dashboard?storeId  (counts from Mongo + live shop info)
    if (path === '/dashboard' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);

        const [products, orders, customers, lowStock, recentOrders, shopInfo] = await Promise.all([
          db.collection('shopify_products').countDocuments({ storeId: store.id }),
          db.collection('shopify_orders').countDocuments({ storeId: store.id }),
          db.collection('shopify_customers').countDocuments({ storeId: store.id }),
          db.collection('shopify_inventory').countDocuments({ storeId: store.id, available: { $lte: 5 } }),
          db.collection('shopify_orders').find({ storeId: store.id }, { projection: { _id: 0, raw: 0 } }).sort({ createdAtShopify: -1 }).limit(5).toArray(),
          restGet({ shopDomain: store.shopDomain, accessToken, path: '/shop.json' }).catch(() => null),
        ]);

        return NextResponse.json({
          shop: shopInfo?.shop || null,
          counts: { products, orders, customers, lowStock },
          recentOrders,
          store: {
            id: store.id,
            shopDomain: store.shopDomain,
            storeName: store.storeName,
            installedAt: store.installedAt,
            lastSyncAt: store.lastSyncAt,
            scopes: store.scopes,
            status: store.status || 'active',
            syncStats: store.syncStats || null,
          },
        });
      } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
    }

    // ========== PRODUCTS ==========
    // /products GET — Mongo-backed list with pagination/search/filter (?live=1 to bypass)
    if (path === '/products' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const page = Math.max(Number(u.searchParams.get('page')) || 1, 1);
      const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 250);
      const q = safeStr(u.searchParams.get('q'));
      const status = safeStr(u.searchParams.get('status'));
      const live = u.searchParams.get('live') === '1';
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        if (live) {
          const data = await restGet({ shopDomain: store.shopDomain, accessToken, path: '/products.json', query: { limit } });
          return NextResponse.json({ products: data?.products || [], page: 1, total: data?.products?.length || 0, live: true });
        }
        const filter = { storeId: store.id };
        if (status && status !== 'any') filter.status = status;
        if (q) filter.$or = [
          { title: { $regex: q, $options: 'i' } },
          { vendor: { $regex: q, $options: 'i' } },
          { handle: { $regex: q, $options: 'i' } },
        ];
        const [items, total] = await Promise.all([
          db.collection('shopify_products')
            .find(filter, { projection: { _id: 0, raw: 0 } })
            .sort({ updatedAtShopify: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray(),
          db.collection('shopify_products').countDocuments(filter),
        ]);
        // attach variants summary
        const productIds = items.map(p => p.productId);
        const variants = productIds.length
          ? await db.collection('shopify_variants')
              .find({ storeId: store.id, productId: { $in: productIds } }, { projection: { _id: 0, raw: 0 } })
              .toArray()
          : [];
        const variantByProduct = {};
        for (const v of variants) (variantByProduct[v.productId] = variantByProduct[v.productId] || []).push(v);
        const products = items.map(p => ({ ...p, variants: variantByProduct[p.productId] || [] }));
        return NextResponse.json({ products, page, limit, total, hasMore: page * limit < total });
      } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
    }

    // /products POST (create) — also write to Mongo on success
    if (path === '/products' && method === 'POST') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      if (!storeId) return err('storeId required', 400);
      const body = await readJsonBody(request);
      if (!body?.product?.title) return err('product.title is required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        const data = await restWrite({ shopDomain: store.shopDomain, accessToken, method: 'POST', path: '/products.json', body: { product: body.product } });
        // mirror to Mongo immediately
        try { await syncProductIntoMongo(db, store, data?.product); } catch (_) {}
        return NextResponse.json({ product: data?.product || null });
      } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
    }

    // /products/:productId GET / PUT / DELETE
    if (pathArr[0] === 'products' && pathArr[1] && pathArr.length === 2) {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const productId = pathArr[1];
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      const { store, accessToken } = await resolveStore(db, user.id, storeId);

      if (method === 'GET') {
        try {
          const data = await restGet({ shopDomain: store.shopDomain, accessToken, path: `/products/${encodeURIComponent(productId)}.json` });
          return NextResponse.json({ product: data?.product || null });
        } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
      }
      if (method === 'PUT') {
        const body = await readJsonBody(request);
        if (!body?.product) return err('product body required', 400);
        try {
          const data = await restWrite({
            shopDomain: store.shopDomain, accessToken, method: 'PUT',
            path: `/products/${encodeURIComponent(productId)}.json`,
            body: { product: { id: Number(productId), ...body.product } },
          });
          try { await syncProductIntoMongo(db, store, data?.product); } catch (_) {}
          return NextResponse.json({ product: data?.product || null });
        } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
      }
      if (method === 'DELETE') {
        try {
          await restWrite({ shopDomain: store.shopDomain, accessToken, method: 'DELETE', path: `/products/${encodeURIComponent(productId)}.json` });
          await db.collection('shopify_products').deleteOne({ storeId: store.id, productId: String(productId) });
          await db.collection('shopify_variants').deleteMany({ storeId: store.id, productId: String(productId) });
          return NextResponse.json({ ok: true });
        } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
      }
    }

    // /products/:productId/images POST
    if (pathArr[0] === 'products' && pathArr[1] && pathArr[2] === 'images' && method === 'POST') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      if (!storeId) return err('storeId required', 400);
      const body = await readJsonBody(request);
      const image = body?.image || {};
      if (!safeStr(image.src) && !safeStr(image.attachment))
        return err('image.src (URL) or image.attachment (base64) required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        const data = await restWrite({
          shopDomain: store.shopDomain, accessToken, method: 'POST',
          path: `/products/${encodeURIComponent(pathArr[1])}/images.json`, body: { image },
        });
        return NextResponse.json({ image: data?.image || null });
      } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
    }

    // ========== ORDERS ==========
    if (path === '/orders' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const page = Math.max(Number(u.searchParams.get('page')) || 1, 1);
      const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 250);
      const q = safeStr(u.searchParams.get('q'));
      const fin = safeStr(u.searchParams.get('financialStatus'));
      const ful = safeStr(u.searchParams.get('fulfillmentStatus'));
      const live = u.searchParams.get('live') === '1';
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        if (live) {
          const data = await restGet({ shopDomain: store.shopDomain, accessToken, path: '/orders.json', query: { limit, status: 'any' } });
          return NextResponse.json({ orders: data?.orders || [], page: 1, total: data?.orders?.length || 0, live: true });
        }
        const filter = { storeId: store.id };
        if (fin) filter.financialStatus = fin;
        if (ful) filter.fulfillmentStatus = ful;
        if (q) filter.$or = [
          { name: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
          { customerName: { $regex: q, $options: 'i' } },
        ];
        const [items, total] = await Promise.all([
          db.collection('shopify_orders')
            .find(filter, { projection: { _id: 0, raw: 0 } })
            .sort({ createdAtShopify: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray(),
          db.collection('shopify_orders').countDocuments(filter),
        ]);
        return NextResponse.json({ orders: items, page, limit, total, hasMore: page * limit < total });
      } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
    }

    // ========== CUSTOMERS ==========
    if (path === '/customers' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const page = Math.max(Number(u.searchParams.get('page')) || 1, 1);
      const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 250);
      const q = safeStr(u.searchParams.get('q'));
      const live = u.searchParams.get('live') === '1';
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        if (live) {
          const data = await restGet({ shopDomain: store.shopDomain, accessToken, path: '/customers.json', query: { limit } });
          return NextResponse.json({ customers: data?.customers || [], page: 1, total: data?.customers?.length || 0, live: true });
        }
        const filter = { storeId: store.id };
        if (q) filter.$or = [
          { firstName: { $regex: q, $options: 'i' } },
          { lastName: { $regex: q, $options: 'i' } },
          { email: { $regex: q, $options: 'i' } },
          { phone: { $regex: q, $options: 'i' } },
        ];
        const [items, total] = await Promise.all([
          db.collection('shopify_customers')
            .find(filter, { projection: { _id: 0, raw: 0 } })
            .sort({ createdAtShopify: -1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray(),
          db.collection('shopify_customers').countDocuments(filter),
        ]);
        return NextResponse.json({ customers: items, page, limit, total, hasMore: page * limit < total });
      } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
    }

    // ========== COLLECTIONS (live; rarely large) ==========
    if (path === '/collections' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 250);
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        const [custom, smart] = await Promise.all([
          restGet({ shopDomain: store.shopDomain, accessToken, path: '/custom_collections.json', query: { limit } }).catch(() => ({ custom_collections: [] })),
          restGet({ shopDomain: store.shopDomain, accessToken, path: '/smart_collections.json', query: { limit } }).catch(() => ({ smart_collections: [] })),
        ]);
        return NextResponse.json({
          collections: [
            ...(custom?.custom_collections || []).map((c) => ({ ...c, kind: 'custom' })),
            ...(smart?.smart_collections || []).map((c) => ({ ...c, kind: 'smart' })),
          ],
        });
      } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
    }

    // ========== INVENTORY ==========
    if (path === '/inventory' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const page = Math.max(Number(u.searchParams.get('page')) || 1, 1);
      const limit = Math.min(Number(u.searchParams.get('limit')) || 100, 500);
      const lowStock = u.searchParams.get('lowStock') === '1';
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store } = await resolveStore(db, user.id, storeId);
        // Prefer inventory-levels collection if present; fallback to variants.
        const hasLevels = (await db.collection('shopify_inventory').estimatedDocumentCount()) > 0;
        if (hasLevels) {
          const filter = { storeId: store.id };
          if (lowStock) filter.available = { $lte: 5 };
          const [items, total] = await Promise.all([
            db.collection('shopify_inventory')
              .find(filter, { projection: { _id: 0 } })
              .sort({ available: 1 })
              .skip((page - 1) * limit)
              .limit(limit)
              .toArray(),
            db.collection('shopify_inventory').countDocuments(filter),
          ]);
          return NextResponse.json({ inventory: items, page, limit, total, hasMore: page * limit < total, source: 'inventory_levels' });
        }
        // Fallback: variants
        const filter = { storeId: store.id };
        if (lowStock) filter.inventoryQuantity = { $lte: 5 };
        const [items, total] = await Promise.all([
          db.collection('shopify_variants')
            .find(filter, { projection: { _id: 0, raw: 0 } })
            .sort({ inventoryQuantity: 1 })
            .skip((page - 1) * limit)
            .limit(limit)
            .toArray(),
          db.collection('shopify_variants').countDocuments(filter),
        ]);
        const inventory = items.map(v => ({
          productId: v.productId,
          productTitle: v.productTitle,
          productImage: v.productImage,
          variantId: v.variantId,
          variantTitle: v.title,
          sku: v.sku,
          price: v.price,
          compareAtPrice: v.compareAtPrice,
          inventoryQuantity: v.inventoryQuantity,
          available: v.inventoryQuantity,
          inventoryPolicy: v.inventoryPolicy,
          inventoryItemId: v.inventoryItemId,
        }));
        return NextResponse.json({ inventory, page, limit, total, hasMore: page * limit < total, source: 'variants' });
      } catch (e) { return err(safeStr(e?.message), e?.status || 502); }
    }

    // ========== AI REWRITE ==========
    // POST /ai/rewrite/:productId?storeId=&apply=1
    if (pathArr[0] === 'ai' && pathArr[1] === 'rewrite' && pathArr[2] && method === 'POST') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const apply = u.searchParams.get('apply') === '1';
      const productId = pathArr[2];
      if (!storeId) return err('storeId required', 400);
      const body = await readJsonBody(request);
      const tone = safeStr(body?.tone);
      const brandVoice = safeStr(body?.brandVoice);
      const model = safeStr(body?.model);

      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        // Always pull fresh product from Shopify so we have variants/desc
        const live = await restGet({
          shopDomain: store.shopDomain,
          accessToken,
          path: `/products/${encodeURIComponent(productId)}.json`,
        });
        const sourceProduct = live?.product;
        if (!sourceProduct) return err('Product not found in Shopify', 404);

        const ai = await rewriteProductCopy({ product: sourceProduct, tone, brandVoice, model });

        let updated = null;
        if (apply) {
          const upd = await restWrite({
            shopDomain: store.shopDomain,
            accessToken,
            method: 'PUT',
            path: `/products/${encodeURIComponent(productId)}.json`,
            body: {
              product: {
                id: Number(productId),
                title: ai.title,
                body_html: ai.body_html,
                metafields_global_title_tag: ai.seo_title || undefined,
                metafields_global_description_tag: ai.seo_description || undefined,
              },
            },
          });
          updated = upd?.product || null;
          try { await syncProductIntoMongo(db, store, updated); } catch (_) {}
        }

        await logSync(db, {
          resource: 'ai_rewrite',
          stage: apply ? 'apply' : 'preview',
          status: 'ok',
          storeId: store.id, userId: user.id,
          productId,
          model: ai.model,
        });

        return NextResponse.json({
          ok: true,
          preview: {
            before: {
              title: safeStr(sourceProduct.title),
              body_html: safeStr(sourceProduct.body_html),
            },
            after: ai,
          },
          applied: !!apply,
          product: updated,
        });
      } catch (e) {
        try {
          const db2 = await getDb();
          if (db2) await logSync(db2, {
            resource: 'ai_rewrite', stage: 'error', status: 'error',
            storeId, userId: user.id, productId,
            error: safeStr(e?.message),
          });
        } catch (_) {}
        return err(safeStr(e?.message), e?.status || 502);
      }
    }

    return err(`Route not found: /api/shopify${path}`, 404);
  } catch (e) {
    const msg = safeStr(e?.message) || 'Internal server error';
    console.error('[shopify api]', msg, e?.stack);
    return NextResponse.json({ error: msg, path, method }, { status: 500 });
  }
}

// Inline helper used by POST /products and PUT /products/:id to mirror to Mongo
async function syncProductIntoMongo(db, store, p) {
  if (!p?.id) return;
  await db.collection('shopify_products').updateOne(
    { storeId: store.id, productId: String(p.id) },
    {
      $set: {
        storeId: store.id,
        userId: store.userId,
        shopDomain: store.shopDomain,
        productId: String(p.id),
        title: p.title,
        bodyHtml: p.body_html,
        vendor: p.vendor,
        productType: p.product_type,
        handle: p.handle,
        status: p.status,
        tags: p.tags,
        image: p.image?.src || p.images?.[0]?.src || null,
        images: (p.images || []).map((i) => i.src),
        createdAt: p.created_at ? new Date(p.created_at) : null,
        updatedAtShopify: p.updated_at ? new Date(p.updated_at) : null,
        syncedAt: now(),
        raw: p,
      },
      $setOnInsert: { id: uuidv4() },
    },
    { upsert: true }
  );
  for (const v of p.variants || []) {
    await db.collection('shopify_variants').updateOne(
      { storeId: store.id, variantId: String(v.id) },
      {
        $set: {
          storeId: store.id,
          userId: store.userId,
          shopDomain: store.shopDomain,
          productId: String(p.id),
          productTitle: p.title,
          productImage: p.image?.src || p.images?.[0]?.src || null,
          variantId: String(v.id),
          title: v.title,
          sku: v.sku,
          price: v.price,
          compareAtPrice: v.compare_at_price,
          inventoryItemId: v.inventory_item_id ? String(v.inventory_item_id) : null,
          inventoryQuantity: v.inventory_quantity,
          inventoryPolicy: v.inventory_policy,
          inventoryManagement: v.inventory_management,
          syncedAt: now(),
          raw: v,
        },
        $setOnInsert: { id: uuidv4() },
      },
      { upsert: true }
    );
  }
}

async function safeHandle(request, ctx) {
  try { return await handle(request, ctx || { params: {} }); }
  catch (e) {
    return NextResponse.json({ error: safeStr(e?.message) || 'Fatal error' }, { status: 500 });
  }
}

export const GET = safeHandle;
export const POST = safeHandle;
export const PUT = safeHandle;
export const DELETE = safeHandle;
export const PATCH = safeHandle;

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
