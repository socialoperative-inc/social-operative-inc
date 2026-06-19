// Shopify → MongoDB sync engine.
//
// Pulls products / variants / orders / customers / inventory from a connected
// store and upserts them into dedicated collections, logging each step into
// `sync_logs`. Designed to run from the OAuth callback (background) and from
// manual /sync endpoints.
import { v4 as uuidv4 } from 'uuid';
import { restGet, apiVersion } from './client';

const safeStr = (v) => (typeof v === 'string' ? v : '');
const now = () => new Date();

// ----------------- sync_logs helper -----------------
export async function logSync(db, doc) {
  try {
    await db.collection('sync_logs').insertOne({
      id: uuidv4(),
      ts: now(),
      ...doc,
    });
  } catch (_) {}
}

// ----------------- Link header pagination -----------------
//  Shopify REST returns:  Link: <https://...&page_info=XXX>; rel="next", <...>; rel="previous"
export function extractPageInfo(linkHeader) {
  const v = safeStr(linkHeader);
  if (!v) return { next: null, prev: null };
  const out = { next: null, prev: null };
  for (const part of v.split(',')) {
    const m = part.trim().match(/<([^>]+)>;\s*rel="?(next|previous)"?/i);
    if (!m) continue;
    try {
      const u = new URL(m[1]);
      const pi = u.searchParams.get('page_info');
      if (pi) out[m[2] === 'previous' ? 'prev' : 'next'] = pi;
    } catch (_) {}
  }
  return out;
}

// ----------------- Paginated GET helper -----------------
async function pagedGet({ shopDomain, accessToken, path, query }) {
  // Returns the JSON body PLUS parsed pagination from the Link header.
  // Implements 429 retry inline so we don't double-wrap restGet logic.
  const url = new URL(`https://${shopDomain}/admin/api/${apiVersion()}${path}`);
  if (query) for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  let attempt = 0;
  while (true) {
    attempt++;
    const res = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'X-Shopify-Access-Token': accessToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (res.status === 429 && attempt < 4) {
      const retryAfter = Number(res.headers.get('Retry-After')) || 2;
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
    if (!res.ok) {
      const e = new Error(`Shopify GET ${path} → ${res.status}: ${safeStr(body?.errors || body?.error || text).slice(0, 300)}`);
      e.status = res.status;
      throw e;
    }
    return { body, page: extractPageInfo(res.headers.get('Link')) };
  }
}

// ----------------- PRODUCTS + VARIANTS -----------------
export async function syncProducts(db, store, accessToken, { fullScan = true, limit = 250 } = {}) {
  const startedAt = now();
  let page_info = null;
  let total = 0, variantTotal = 0;
  try {
    do {
      const q = page_info ? { limit, page_info } : { limit, status: 'any' };
      const { body, page } = await pagedGet({
        shopDomain: store.shopDomain,
        accessToken,
        path: '/products.json',
        query: q,
      });
      const products = body?.products || [];
      total += products.length;

      // Upsert products
      if (products.length > 0) {
        const ops = products.map((p) => ({
          updateOne: {
            filter: { storeId: store.id, productId: String(p.id) },
            update: {
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
            upsert: true,
          },
        }));
        await db.collection('shopify_products').bulkWrite(ops, { ordered: false });

        // Upsert variants
        const variantOps = [];
        for (const p of products) {
          for (const v of p.variants || []) {
            variantTotal++;
            variantOps.push({
              updateOne: {
                filter: { storeId: store.id, variantId: String(v.id) },
                update: {
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
                    position: v.position,
                    inventoryItemId: v.inventory_item_id ? String(v.inventory_item_id) : null,
                    inventoryQuantity: v.inventory_quantity,
                    inventoryPolicy: v.inventory_policy,
                    inventoryManagement: v.inventory_management,
                    barcode: v.barcode,
                    grams: v.grams,
                    requiresShipping: v.requires_shipping,
                    taxable: v.taxable,
                    syncedAt: now(),
                    raw: v,
                  },
                  $setOnInsert: { id: uuidv4() },
                },
                upsert: true,
              },
            });
          }
        }
        if (variantOps.length > 0) {
          await db.collection('shopify_variants').bulkWrite(variantOps, { ordered: false });
        }
      }

      page_info = fullScan ? page.next : null;
      if (!fullScan) break;
    } while (page_info);

    await logSync(db, {
      storeId: store.id, userId: store.userId, resource: 'products',
      status: 'ok', items: total, variants: variantTotal,
      durationMs: Date.now() - startedAt.getTime(),
    });
    return { ok: true, products: total, variants: variantTotal };
  } catch (e) {
    await logSync(db, {
      storeId: store.id, userId: store.userId, resource: 'products',
      status: 'error', error: safeStr(e?.message), items: total,
      durationMs: Date.now() - startedAt.getTime(),
    });
    throw e;
  }
}

// ----------------- ORDERS -----------------
export async function syncOrders(db, store, accessToken, { fullScan = true, limit = 250 } = {}) {
  const startedAt = now();
  let page_info = null;
  let total = 0;
  try {
    do {
      const q = page_info ? { limit, page_info } : { limit, status: 'any' };
      const { body, page } = await pagedGet({
        shopDomain: store.shopDomain,
        accessToken,
        path: '/orders.json',
        query: q,
      });
      const orders = body?.orders || [];
      total += orders.length;

      if (orders.length > 0) {
        const ops = orders.map((o) => ({
          updateOne: {
            filter: { storeId: store.id, orderId: String(o.id) },
            update: {
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
            upsert: true,
          },
        }));
        await db.collection('shopify_orders').bulkWrite(ops, { ordered: false });
      }

      page_info = fullScan ? page.next : null;
      if (!fullScan) break;
    } while (page_info);

    await logSync(db, {
      storeId: store.id, userId: store.userId, resource: 'orders',
      status: 'ok', items: total,
      durationMs: Date.now() - startedAt.getTime(),
    });
    return { ok: true, orders: total };
  } catch (e) {
    await logSync(db, {
      storeId: store.id, userId: store.userId, resource: 'orders',
      status: 'error', error: safeStr(e?.message), items: total,
      durationMs: Date.now() - startedAt.getTime(),
    });
    throw e;
  }
}

// ----------------- CUSTOMERS -----------------
export async function syncCustomers(db, store, accessToken, { fullScan = true, limit = 250 } = {}) {
  const startedAt = now();
  let page_info = null;
  let total = 0;
  try {
    do {
      const q = page_info ? { limit, page_info } : { limit };
      const { body, page } = await pagedGet({
        shopDomain: store.shopDomain,
        accessToken,
        path: '/customers.json',
        query: q,
      });
      const customers = body?.customers || [];
      total += customers.length;

      if (customers.length > 0) {
        const ops = customers.map((c) => ({
          updateOne: {
            filter: { storeId: store.id, customerId: String(c.id) },
            update: {
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
            upsert: true,
          },
        }));
        await db.collection('shopify_customers').bulkWrite(ops, { ordered: false });
      }

      page_info = fullScan ? page.next : null;
      if (!fullScan) break;
    } while (page_info);

    await logSync(db, {
      storeId: store.id, userId: store.userId, resource: 'customers',
      status: 'ok', items: total,
      durationMs: Date.now() - startedAt.getTime(),
    });
    return { ok: true, customers: total };
  } catch (e) {
    await logSync(db, {
      storeId: store.id, userId: store.userId, resource: 'customers',
      status: 'error', error: safeStr(e?.message), items: total,
      durationMs: Date.now() - startedAt.getTime(),
    });
    throw e;
  }
}

// ----------------- INVENTORY LEVELS -----------------
//  Inventory levels are fetched by inventory_item_ids (max 50/page) at a location.
//  We use the variants we already synced to gather inventory_item_ids.
export async function syncInventory(db, store, accessToken) {
  const startedAt = now();
  let total = 0;
  try {
    // 1) locations
    const locResp = await restGet({
      shopDomain: store.shopDomain,
      accessToken,
      path: '/locations.json',
    });
    const locations = locResp?.locations || [];
    const locIds = locations.map((l) => l.id);
    if (locIds.length === 0) {
      await logSync(db, {
        storeId: store.id, userId: store.userId, resource: 'inventory',
        status: 'ok', items: 0, note: 'no locations',
        durationMs: Date.now() - startedAt.getTime(),
      });
      return { ok: true, levels: 0 };
    }

    // 2) variant inventory_item_ids
    const variants = await db
      .collection('shopify_variants')
      .find({ storeId: store.id, inventoryItemId: { $ne: null } }, { projection: { inventoryItemId: 1, variantId: 1, productId: 1, productTitle: 1, sku: 1 } })
      .toArray();

    if (variants.length === 0) {
      await logSync(db, {
        storeId: store.id, userId: store.userId, resource: 'inventory',
        status: 'ok', items: 0, note: 'no variants',
        durationMs: Date.now() - startedAt.getTime(),
      });
      return { ok: true, levels: 0 };
    }

    const itemIds = [...new Set(variants.map((v) => v.inventoryItemId))];
    const chunks = [];
    for (let i = 0; i < itemIds.length; i += 50) chunks.push(itemIds.slice(i, i + 50));

    const ops = [];
    for (const chunk of chunks) {
      const resp = await restGet({
        shopDomain: store.shopDomain,
        accessToken,
        path: '/inventory_levels.json',
        query: {
          inventory_item_ids: chunk.join(','),
          location_ids: locIds.join(','),
          limit: 250,
        },
      });
      for (const lvl of resp?.inventory_levels || []) {
        total++;
        const variant = variants.find((v) => v.inventoryItemId === String(lvl.inventory_item_id));
        ops.push({
          updateOne: {
            filter: {
              storeId: store.id,
              inventoryItemId: String(lvl.inventory_item_id),
              locationId: String(lvl.location_id),
            },
            update: {
              $set: {
                storeId: store.id,
                userId: store.userId,
                shopDomain: store.shopDomain,
                inventoryItemId: String(lvl.inventory_item_id),
                locationId: String(lvl.location_id),
                available: lvl.available,
                productId: variant?.productId || null,
                variantId: variant?.variantId || null,
                productTitle: variant?.productTitle || null,
                sku: variant?.sku || null,
                updatedAtShopify: lvl.updated_at ? new Date(lvl.updated_at) : null,
                syncedAt: now(),
              },
              $setOnInsert: { id: uuidv4() },
            },
            upsert: true,
          },
        });
      }
    }
    if (ops.length > 0) {
      await db.collection('shopify_inventory').bulkWrite(ops, { ordered: false });
    }

    await logSync(db, {
      storeId: store.id, userId: store.userId, resource: 'inventory',
      status: 'ok', items: total,
      durationMs: Date.now() - startedAt.getTime(),
    });
    return { ok: true, levels: total };
  } catch (e) {
    await logSync(db, {
      storeId: store.id, userId: store.userId, resource: 'inventory',
      status: 'error', error: safeStr(e?.message), items: total,
      durationMs: Date.now() - startedAt.getTime(),
    });
    throw e;
  }
}

// ----------------- FULL SYNC -----------------
export async function syncAll(db, store, accessToken) {
  const results = { products: null, orders: null, customers: null, inventory: null, errors: [] };
  try { results.products = await syncProducts(db, store, accessToken); }
  catch (e) { results.errors.push(`products: ${safeStr(e?.message)}`); }
  try { results.orders = await syncOrders(db, store, accessToken); }
  catch (e) { results.errors.push(`orders: ${safeStr(e?.message)}`); }
  try { results.customers = await syncCustomers(db, store, accessToken); }
  catch (e) { results.errors.push(`customers: ${safeStr(e?.message)}`); }
  try { results.inventory = await syncInventory(db, store, accessToken); }
  catch (e) { results.errors.push(`inventory: ${safeStr(e?.message)}`); }
  // update store lastSyncAt
  await db.collection('shopify_stores').updateOne(
    { id: store.id },
    {
      $set: {
        lastSyncAt: now(),
        status: results.errors.length === 0 ? 'active' : 'partial',
        syncStats: {
          products: results.products?.products ?? null,
          orders: results.orders?.orders ?? null,
          customers: results.customers?.customers ?? null,
          inventoryLevels: results.inventory?.levels ?? null,
        },
      },
    }
  );
  return results;
}
