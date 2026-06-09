// app/api/shopify/webhooks/route.js
//
// Public webhook endpoint for ALL Shopify topics. The topic is read from the
// X-Shopify-Topic header. Every payload is HMAC-verified using the raw body
// (Next.js exposes it via request.text() — we must NOT consume request.json()
// first or the signature will not match).
//
// Logged into the `shopify_webhooks` collection, then dispatched into the
// resource-specific collections in `shopify_products`, `shopify_orders`,
// `shopify_customers`, `shopify_inventory`.
import { NextResponse } from 'next/server';
import { MongoClient } from 'mongodb';
import { v4 as uuidv4 } from 'uuid';
import { verifyWebhookHmac } from '../../../../lib/shopify/hmac';

const safeStr = (v) => (typeof v === 'string' ? v : '');
const now = () => new Date();

// ---------- DB (local cache) ----------
let cachedDb = null;
let dbInitFailedAt = 0;

async function getDb() {
  if (cachedDb) return cachedDb;
  if (dbInitFailedAt && Date.now() - dbInitFailedAt < 15000) return null;
  const url = safeStr(process.env.MONGO_URL).trim();
  if (!url || (!url.startsWith('mongodb://') && !url.startsWith('mongodb+srv://'))) {
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
    return cachedDb;
  } catch (e) {
    console.error('[shopify-webhooks mongo]', safeStr(e?.message));
    dbInitFailedAt = Date.now();
    return null;
  }
}

// ---------- per-topic handlers ----------
async function handleProductCreateOrUpdate(db, store, body) {
  if (!body?.id) return;
  await db.collection('shopify_products').updateOne(
    { storeId: store.id, productId: String(body.id) },
    {
      $set: {
        storeId: store.id,
        userId: store.userId,
        shopDomain: store.shopDomain,
        productId: String(body.id),
        title: body.title,
        bodyHtml: body.body_html,
        vendor: body.vendor,
        productType: body.product_type,
        handle: body.handle,
        status: body.status,
        tags: body.tags,
        image: body.image?.src || body.images?.[0]?.src || null,
        images: (body.images || []).map((i) => i.src),
        createdAt: body.created_at ? new Date(body.created_at) : null,
        updatedAtShopify: body.updated_at ? new Date(body.updated_at) : null,
        syncedAt: now(),
        raw: body,
      },
      $setOnInsert: { id: uuidv4() },
    },
    { upsert: true }
  );
  // upsert variants
  for (const v of body.variants || []) {
    await db.collection('shopify_variants').updateOne(
      { storeId: store.id, variantId: String(v.id) },
      {
        $set: {
          storeId: store.id,
          userId: store.userId,
          shopDomain: store.shopDomain,
          productId: String(body.id),
          productTitle: body.title,
          productImage: body.image?.src || body.images?.[0]?.src || null,
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

async function handleProductDelete(db, store, body) {
  if (!body?.id) return;
  await db.collection('shopify_products').deleteOne({ storeId: store.id, productId: String(body.id) });
  await db.collection('shopify_variants').deleteMany({ storeId: store.id, productId: String(body.id) });
}

async function handleOrderCreateOrUpdate(db, store, o) {
  if (!o?.id) return;
  await db.collection('shopify_orders').updateOne(
    { storeId: store.id, orderId: String(o.id) },
    {
      $set: {
        storeId: store.id,
        userId: store.userId,
        shopDomain: store.shopDomain,
        orderId: String(o.id),
        name: o.name,
        number: o.number,
        email: o.email,
        phone: o.phone,
        currency: o.currency,
        totalPrice: o.total_price,
        subtotalPrice: o.subtotal_price,
        totalTax: o.total_tax,
        totalDiscounts: o.total_discounts,
        financialStatus: o.financial_status,
        fulfillmentStatus: o.fulfillment_status,
        customerId: o.customer?.id ? String(o.customer.id) : null,
        customerEmail: o.customer?.email || o.email,
        customerName: o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : null,
        lineItemCount: (o.line_items || []).length,
        tags: o.tags,
        createdAtShopify: o.created_at ? new Date(o.created_at) : null,
        updatedAtShopify: o.updated_at ? new Date(o.updated_at) : null,
        processedAt: o.processed_at ? new Date(o.processed_at) : null,
        syncedAt: now(),
        raw: o,
      },
      $setOnInsert: { id: uuidv4() },
    },
    { upsert: true }
  );
}

async function handleCustomerCreateOrUpdate(db, store, c) {
  if (!c?.id) return;
  await db.collection('shopify_customers').updateOne(
    { storeId: store.id, customerId: String(c.id) },
    {
      $set: {
        storeId: store.id,
        userId: store.userId,
        shopDomain: store.shopDomain,
        customerId: String(c.id),
        firstName: c.first_name,
        lastName: c.last_name,
        email: c.email,
        phone: c.phone,
        ordersCount: c.orders_count,
        totalSpent: c.total_spent,
        currency: c.currency,
        tags: c.tags,
        acceptsMarketing: c.accepts_marketing,
        state: c.state,
        createdAtShopify: c.created_at ? new Date(c.created_at) : null,
        updatedAtShopify: c.updated_at ? new Date(c.updated_at) : null,
        syncedAt: now(),
        raw: c,
      },
      $setOnInsert: { id: uuidv4() },
    },
    { upsert: true }
  );
}

async function handleInventoryLevelUpdate(db, store, lvl) {
  if (!lvl?.inventory_item_id || !lvl?.location_id) return;
  await db.collection('shopify_inventory').updateOne(
    {
      storeId: store.id,
      inventoryItemId: String(lvl.inventory_item_id),
      locationId: String(lvl.location_id),
    },
    {
      $set: {
        storeId: store.id,
        userId: store.userId,
        shopDomain: store.shopDomain,
        inventoryItemId: String(lvl.inventory_item_id),
        locationId: String(lvl.location_id),
        available: lvl.available,
        updatedAtShopify: lvl.updated_at ? new Date(lvl.updated_at) : null,
        syncedAt: now(),
      },
      $setOnInsert: { id: uuidv4() },
    },
    { upsert: true }
  );
}

async function handleAppUninstalled(db, store) {
  await db.collection('shopify_stores').updateOne(
    { id: store.id },
    {
      $set: {
        uninstalled: true,
        status: 'uninstalled',
        uninstalledAt: now(),
      },
    }
  );
}

// ---------- POST handler ----------
export async function POST(request) {
  const startedAt = Date.now();
  let rawBody = '';
  try {
    // CRITICAL: read raw body BEFORE anything else, for HMAC verify.
    rawBody = await request.text();
  } catch (e) {
    return NextResponse.json({ error: 'body read failed' }, { status: 400 });
  }

  const hmacHeader = request.headers.get('x-shopify-hmac-sha256');
  const topic = safeStr(request.headers.get('x-shopify-topic'));
  const shopDomain = safeStr(request.headers.get('x-shopify-shop-domain'));
  const webhookId = safeStr(request.headers.get('x-shopify-webhook-id'));

  const secret = safeStr(process.env.SHOPIFY_API_SECRET).trim();
  if (!secret) {
    return NextResponse.json({ error: 'server not configured' }, { status: 503 });
  }

  // HMAC verification
  if (!verifyWebhookHmac(rawBody, hmacHeader, secret)) {
    // Best-effort log of the failure (do NOT return 200 — Shopify will retry).
    try {
      const db = await getDb();
      if (db) {
        await db.collection('shopify_webhooks').insertOne({
          id: uuidv4(),
          ts: now(),
          topic, shopDomain, webhookId,
          status: 'rejected',
          reason: 'invalid HMAC',
          bytes: rawBody.length,
        });
      }
    } catch (_) {}
    return NextResponse.json({ error: 'invalid hmac' }, { status: 401 });
  }

  // Parse body
  let body = null;
  try {
    body = rawBody ? JSON.parse(rawBody) : null;
  } catch (_) {
    body = null;
  }

  const db = await getDb();
  if (!db) {
    // Return 503 so Shopify retries
    return NextResponse.json({ error: 'db unavailable' }, { status: 503 });
  }

  // Locate the store record
  const store = await db.collection('shopify_stores').findOne({ shopDomain });
  if (!store) {
    try {
      await db.collection('shopify_webhooks').insertOne({
        id: uuidv4(),
        ts: now(),
        topic, shopDomain, webhookId,
        status: 'orphan',
        reason: 'no matching store',
        bytes: rawBody.length,
      });
    } catch (_) {}
    // Still 200 — there is nothing for us to do; preventing infinite retries.
    return NextResponse.json({ ok: true, orphan: true });
  }

  // Dispatch
  let dispatchError = null;
  try {
    switch (topic) {
      case 'products/create':
      case 'products/update':
        await handleProductCreateOrUpdate(db, store, body);
        break;
      case 'products/delete':
        await handleProductDelete(db, store, body);
        break;
      case 'orders/create':
      case 'orders/updated':
        await handleOrderCreateOrUpdate(db, store, body);
        break;
      case 'customers/create':
      case 'customers/update':
        await handleCustomerCreateOrUpdate(db, store, body);
        break;
      case 'inventory_levels/update':
        await handleInventoryLevelUpdate(db, store, body);
        break;
      case 'app/uninstalled':
        await handleAppUninstalled(db, store);
        break;
      default:
        // Unknown topic — log and accept (200) so Shopify doesn't retry.
        break;
    }
  } catch (e) {
    dispatchError = safeStr(e?.message);
  }

  // Audit log
  try {
    await db.collection('shopify_webhooks').insertOne({
      id: uuidv4(),
      ts: now(),
      topic, shopDomain, webhookId,
      storeId: store.id,
      userId: store.userId,
      status: dispatchError ? 'dispatch_error' : 'ok',
      error: dispatchError,
      bytes: rawBody.length,
      durationMs: Date.now() - startedAt,
    });
  } catch (_) {}

  // 200 even when dispatch errored — webhook receipt is valid and we logged
  // the failure for re-processing. (Returning non-200 causes Shopify to keep
  // retrying for 48h which would amplify the bug rather than fix it.)
  return NextResponse.json({ ok: true });
}

// Reject non-POST (e.g. health probes) cleanly.
export async function GET() {
  return NextResponse.json({ ok: true, info: 'Shopify webhook endpoint — POST only' });
}

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;
