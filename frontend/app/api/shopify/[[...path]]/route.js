// app/api/shopify/[[...path]]/route.js
//
// Shopify Commerce Hub — isolated catch-all keeping the main API route untouched.
// Mirrors the structural patterns of app/api/intel/[[...path]]/route.js.
//
// Routes (all prefixed /api/shopify):
//   PUBLIC:
//     GET  /auth/callback?code=&shop=&hmac=&state=
//
//   AUTH REQUIRED (Supabase bearer token):
//     GET    /config
//     GET    /auth/install?shop=<shop>.myshopify.com
//     GET    /stores
//     DELETE /stores/:id
//     POST   /stores/:id/sync
//     GET    /shop?storeId=
//     GET    /dashboard?storeId=                   (aggregated stats)
//     GET    /products?storeId=&limit=&page_info=  (list)
//     POST   /products?storeId=                    (create)
//     GET    /products/:productId?storeId=         (one)
//     PUT    /products/:productId?storeId=         (update — title/desc/status/variants)
//     DELETE /products/:productId?storeId=         (delete)
//     POST   /products/:productId/images?storeId=  (attach image)
//     GET    /orders?storeId=&limit=&status=
//     GET    /customers?storeId=&limit=
//     GET    /collections?storeId=&limit=
//     GET    /inventory?storeId=&limit=

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

const safeStr = (v) => (typeof v === 'string' ? v : '');
const isLocalhostUri = (u) => {
  const v = safeStr(u);
  return v.includes('localhost') || v.includes('127.0.0.1') || v.includes('::1');
};

// ---------------- Mongo singleton ----------------
let cachedDb = null;
let dbInitFailedAt = 0;

async function getDb() {
  if (cachedDb) return cachedDb;
  if (dbInitFailedAt && Date.now() - dbInitFailedAt < 15000) return null;

  const url = safeStr(process.env.MONGO_URL).trim();
  if (!url) {
    dbInitFailedAt = Date.now();
    return null;
  }
  if (process.env.VERCEL && isLocalhostUri(url)) {
    dbInitFailedAt = Date.now();
    return null;
  }
  if (!url.startsWith('mongodb://') && !url.startsWith('mongodb+srv://')) {
    dbInitFailedAt = Date.now();
    return null;
  }

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
    try {
      await Promise.all([
        cachedDb
          .collection('shopify_stores')
          .createIndex({ userId: 1, shopDomain: 1 }, { unique: true }),
        cachedDb
          .collection('shopify_stores')
          .createIndex({ id: 1 }, { unique: true }),
        cachedDb
          .collection('shopify_oauth_state')
          .createIndex({ state: 1 }, { unique: true }),
        cachedDb
          .collection('shopify_oauth_state')
          .createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
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
  } catch (_) {
    return null;
  }
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

function redirectUri() {
  return `${appBaseUrl()}/api/shopify/auth/callback`;
}

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
    if (!text) return {};
    return JSON.parse(text);
  } catch (_) {
    return {};
  }
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
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch (_) {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const e = new Error(
      `Shopify ${method} ${path} → ${res.status}: ${safeStr(
        parsed?.errors || parsed?.error || text
      ).slice(0, 400)}`
    );
    e.status = res.status;
    throw e;
  }
  return parsed;
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
  } catch (_) {
    return err('Bad request', 400);
  }

  try {
    // ============================================================
    // PUBLIC: OAuth callback
    // ============================================================
    if (path === '/auth/callback' && method === 'GET') {
      if (!isShopifyConfigured()) {
        return err('Shopify is not configured on the server', 503);
      }
      const u = new URL(request.url);
      const sp = u.searchParams;
      const shop = safeStr(sp.get('shop'));
      const code = safeStr(sp.get('code'));
      const state = safeStr(sp.get('state'));
      if (!shop || !code || !state) return err('missing required OAuth params', 400);
      if (!isValidShopDomain(shop)) return err('invalid shop domain', 400);

      if (!verifyOAuthHmac(sp, safeStr(process.env.SHOPIFY_API_SECRET).trim())) {
        return err('HMAC verification failed', 401);
      }

      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      const stateDoc = await db.collection('shopify_oauth_state').findOne({ state });
      if (!stateDoc) return err('invalid or expired state', 400);
      if (safeStr(stateDoc.shopDomain) !== shop)
        return err('state/shop mismatch', 400);

      let tokenRes;
      try {
        tokenRes = await exchangeCodeForToken({ shopDomain: shop, code });
      } catch (e) {
        return err(safeStr(e?.message) || 'token exchange failed', 502);
      }

      // Best-effort: fetch shop info to capture name immediately
      let storeName = shop.replace(/\.myshopify\.com$/, '');
      try {
        const info = await restGet({
          shopDomain: shop,
          accessToken: tokenRes.accessToken,
          path: '/shop.json',
        });
        if (info?.shop?.name) storeName = info.shop.name;
      } catch (_) {}

      const encrypted = encryptToken(tokenRes.accessToken);
      const now = new Date();
      await db.collection('shopify_stores').updateOne(
        { userId: safeStr(stateDoc.userId), shopDomain: shop },
        {
          $setOnInsert: {
            id: uuidv4(),
            userId: safeStr(stateDoc.userId),
            shopDomain: shop,
            installedAt: now,
          },
          $set: {
            encryptedToken: encrypted,
            storeName,
            scopes: tokenRes.scope,
            status: 'active',
            updatedAt: now,
            lastSyncAt: now,
            uninstalled: false,
          },
        },
        { upsert: true }
      );

      await db.collection('shopify_oauth_state').deleteOne({ state });

      try {
        await db.collection('activity').insertOne({
          id: uuidv4(),
          agent: 'commerce',
          type: 'shopify-install',
          summary: `Connected Shopify store ${shop}`,
          model: '-',
          userId: safeStr(stateDoc.userId),
          ts: now,
        });
      } catch (_) {}

      const dest = new URL(appBaseUrl());
      dest.searchParams.set('shopify_connected', '1');
      dest.searchParams.set('shop', shop);
      dest.hash = 'commerce-hub';
      return NextResponse.redirect(dest.toString(), { status: 302 });
    }

    // ============================================================
    // AUTH REQUIRED below
    // ============================================================
    const token = getAuthToken(request);
    let user = null;
    try {
      user = await verifySupabaseToken(token);
    } catch (_) {
      user = null;
    }
    if (!user) return err('Unauthorized — please log in', 401);

    // /config
    if (path === '/config' && method === 'GET') {
      return NextResponse.json({
        configured: isShopifyConfigured(),
        scopes: defaultScopes(),
        apiVersion: apiVersion(),
        redirectUri: redirectUri(),
      });
    }

    // /auth/install
    if (path === '/auth/install' && method === 'GET') {
      if (!isShopifyConfigured()) {
        return err(
          'Shopify is not configured on the server. Set SHOPIFY_API_KEY and SHOPIFY_API_SECRET.',
          503
        );
      }
      const u = new URL(request.url);
      const shopDomain = normalizeShopDomain(u.searchParams.get('shop'));
      if (!shopDomain) {
        return err('invalid shop — expected <name>.myshopify.com', 400);
      }
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);

      const state = generateState();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
      await db.collection('shopify_oauth_state').insertOne({
        state,
        userId: user.id,
        shopDomain,
        createdAt: new Date(),
        expiresAt,
      });

      const installUrl = buildInstallUrl({
        shopDomain,
        redirectUri: redirectUri(),
        state,
        scopes: defaultScopes(),
      });

      return NextResponse.json({ installUrl, shopDomain, state });
    }

    // /stores
    if (path === '/stores' && method === 'GET') {
      const db = await getDb();
      if (!db) return NextResponse.json({ stores: [] });
      const docs = await db
        .collection('shopify_stores')
        .find(
          { userId: user.id, uninstalled: { $ne: true } },
          { projection: { _id: 0, encryptedToken: 0 } }
        )
        .sort({ installedAt: -1 })
        .toArray();
      return NextResponse.json({ stores: docs });
    }

    // /stores/:id DELETE
    if (pathArr[0] === 'stores' && pathArr[1] && pathArr.length === 2 && method === 'DELETE') {
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      await db
        .collection('shopify_stores')
        .updateOne(
          { id: pathArr[1], userId: user.id },
          { $set: { uninstalled: true, status: 'disconnected', uninstalledAt: new Date() } }
        );
      return NextResponse.json({ ok: true });
    }

    // /stores/:id/sync POST
    if (
      pathArr[0] === 'stores' &&
      pathArr[1] &&
      pathArr[2] === 'sync' &&
      method === 'POST'
    ) {
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, pathArr[1]);
        // Light sync: pull shop + counts, persist lastSyncAt
        const [shopInfo, products, orders, customers] = await Promise.all([
          restGet({ shopDomain: store.shopDomain, accessToken, path: '/shop.json' }).catch(() => null),
          restGet({ shopDomain: store.shopDomain, accessToken, path: '/products/count.json' }).catch(() => null),
          restGet({ shopDomain: store.shopDomain, accessToken, path: '/orders/count.json', query: { status: 'any' } }).catch(() => null),
          restGet({ shopDomain: store.shopDomain, accessToken, path: '/customers/count.json' }).catch(() => null),
        ]);
        const now = new Date();
        await db.collection('shopify_stores').updateOne(
          { id: store.id },
          {
            $set: {
              lastSyncAt: now,
              storeName: shopInfo?.shop?.name || store.storeName,
              syncStats: {
                products: products?.count ?? null,
                orders: orders?.count ?? null,
                customers: customers?.count ?? null,
              },
              status: 'active',
            },
          }
        );
        return NextResponse.json({
          ok: true,
          lastSyncAt: now,
          stats: {
            products: products?.count ?? 0,
            orders: orders?.count ?? 0,
            customers: customers?.count ?? 0,
          },
          shop: shopInfo?.shop || null,
        });
      } catch (e) {
        return err(safeStr(e?.message), e?.status || 502);
      }
    }

    // /shop?storeId
    if (path === '/shop' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        const data = await restGet({
          shopDomain: store.shopDomain,
          accessToken,
          path: '/shop.json',
        });
        return NextResponse.json({ shop: data?.shop || null });
      } catch (e) {
        return err(safeStr(e?.message), e?.status || 502);
      }
    }

    // /dashboard?storeId
    if (path === '/dashboard' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        const [shopInfo, pCount, oCount, cCount, recentOrders] = await Promise.all([
          restGet({ shopDomain: store.shopDomain, accessToken, path: '/shop.json' }).catch(() => null),
          restGet({ shopDomain: store.shopDomain, accessToken, path: '/products/count.json' }).catch(() => null),
          restGet({ shopDomain: store.shopDomain, accessToken, path: '/orders/count.json', query: { status: 'any' } }).catch(() => null),
          restGet({ shopDomain: store.shopDomain, accessToken, path: '/customers/count.json' }).catch(() => null),
          restGet({ shopDomain: store.shopDomain, accessToken, path: '/orders.json', query: { limit: 5, status: 'any', order: 'created_at desc' } }).catch(() => null),
        ]);
        return NextResponse.json({
          shop: shopInfo?.shop || null,
          counts: {
            products: pCount?.count ?? 0,
            orders: oCount?.count ?? 0,
            customers: cCount?.count ?? 0,
          },
          recentOrders: recentOrders?.orders || [],
          store: {
            id: store.id,
            shopDomain: store.shopDomain,
            storeName: store.storeName,
            installedAt: store.installedAt,
            lastSyncAt: store.lastSyncAt,
            scopes: store.scopes,
            status: store.status || 'active',
          },
        });
      } catch (e) {
        return err(safeStr(e?.message), e?.status || 502);
      }
    }

    // ========== PRODUCTS ==========
    // /products GET (list)
    if (path === '/products' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 250);
      const q = safeStr(u.searchParams.get('q'));
      const status = safeStr(u.searchParams.get('status')) || 'any';
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        const data = await restGet({
          shopDomain: store.shopDomain,
          accessToken,
          path: '/products.json',
          query: { limit, status, ...(q ? { title: q } : {}) },
        });
        return NextResponse.json({ products: data?.products || [] });
      } catch (e) {
        return err(safeStr(e?.message), e?.status || 502);
      }
    }

    // /products POST (create)
    if (path === '/products' && method === 'POST') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      if (!storeId) return err('storeId required', 400);
      const body = await readJsonBody(request);
      if (!body || !body.product || !safeStr(body.product.title))
        return err('product.title is required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        const data = await restWrite({
          shopDomain: store.shopDomain,
          accessToken,
          method: 'POST',
          path: '/products.json',
          body: { product: body.product },
        });
        return NextResponse.json({ product: data?.product || null });
      } catch (e) {
        return err(safeStr(e?.message), e?.status || 502);
      }
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
          const data = await restGet({
            shopDomain: store.shopDomain,
            accessToken,
            path: `/products/${encodeURIComponent(productId)}.json`,
          });
          return NextResponse.json({ product: data?.product || null });
        } catch (e) {
          return err(safeStr(e?.message), e?.status || 502);
        }
      }

      if (method === 'PUT') {
        const body = await readJsonBody(request);
        if (!body || !body.product) return err('product body required', 400);
        try {
          const data = await restWrite({
            shopDomain: store.shopDomain,
            accessToken,
            method: 'PUT',
            path: `/products/${encodeURIComponent(productId)}.json`,
            body: { product: { id: Number(productId), ...body.product } },
          });
          return NextResponse.json({ product: data?.product || null });
        } catch (e) {
          return err(safeStr(e?.message), e?.status || 502);
        }
      }

      if (method === 'DELETE') {
        try {
          await restWrite({
            shopDomain: store.shopDomain,
            accessToken,
            method: 'DELETE',
            path: `/products/${encodeURIComponent(productId)}.json`,
          });
          return NextResponse.json({ ok: true });
        } catch (e) {
          return err(safeStr(e?.message), e?.status || 502);
        }
      }
    }

    // /products/:productId/images POST
    if (
      pathArr[0] === 'products' &&
      pathArr[1] &&
      pathArr[2] === 'images' &&
      method === 'POST'
    ) {
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
          shopDomain: store.shopDomain,
          accessToken,
          method: 'POST',
          path: `/products/${encodeURIComponent(pathArr[1])}/images.json`,
          body: { image },
        });
        return NextResponse.json({ image: data?.image || null });
      } catch (e) {
        return err(safeStr(e?.message), e?.status || 502);
      }
    }

    // /orders
    if (path === '/orders' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 250);
      const status = safeStr(u.searchParams.get('status')) || 'any';
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        const data = await restGet({
          shopDomain: store.shopDomain,
          accessToken,
          path: '/orders.json',
          query: { limit, status },
        });
        return NextResponse.json({ orders: data?.orders || [] });
      } catch (e) {
        return err(safeStr(e?.message), e?.status || 502);
      }
    }

    // /customers
    if (path === '/customers' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 250);
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        const data = await restGet({
          shopDomain: store.shopDomain,
          accessToken,
          path: '/customers.json',
          query: { limit },
        });
        return NextResponse.json({ customers: data?.customers || [] });
      } catch (e) {
        return err(safeStr(e?.message), e?.status || 502);
      }
    }

    // /collections
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
          restGet({
            shopDomain: store.shopDomain,
            accessToken,
            path: '/custom_collections.json',
            query: { limit },
          }).catch(() => ({ custom_collections: [] })),
          restGet({
            shopDomain: store.shopDomain,
            accessToken,
            path: '/smart_collections.json',
            query: { limit },
          }).catch(() => ({ smart_collections: [] })),
        ]);
        return NextResponse.json({
          collections: [
            ...(custom?.custom_collections || []).map((c) => ({ ...c, kind: 'custom' })),
            ...(smart?.smart_collections || []).map((c) => ({ ...c, kind: 'smart' })),
          ],
        });
      } catch (e) {
        return err(safeStr(e?.message), e?.status || 502);
      }
    }

    // /inventory
    if (path === '/inventory' && method === 'GET') {
      const u = new URL(request.url);
      const storeId = safeStr(u.searchParams.get('storeId'));
      const limit = Math.min(Number(u.searchParams.get('limit')) || 50, 250);
      if (!storeId) return err('storeId required', 400);
      const db = await getDb();
      if (!db) return err('Database unavailable', 503);
      try {
        const { store, accessToken } = await resolveStore(db, user.id, storeId);
        // Fetch products first to derive inventory_item_ids
        const products = await restGet({
          shopDomain: store.shopDomain,
          accessToken,
          path: '/products.json',
          query: { limit, fields: 'id,title,variants,image,images' },
        });
        const items = [];
        for (const p of products?.products || []) {
          for (const v of p.variants || []) {
            items.push({
              productId: p.id,
              productTitle: p.title,
              productImage: p.image?.src || p.images?.[0]?.src || null,
              variantId: v.id,
              variantTitle: v.title,
              sku: v.sku,
              price: v.price,
              compareAtPrice: v.compare_at_price,
              inventoryQuantity: v.inventory_quantity,
              inventoryItemId: v.inventory_item_id,
              inventoryPolicy: v.inventory_policy,
            });
          }
        }
        return NextResponse.json({ inventory: items });
      } catch (e) {
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

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
