// Shopify webhook topic catalog + registration helper.
//
// Webhooks are registered via the REST Admin API:
//   POST /admin/api/{version}/webhooks.json
//   { "webhook": { "topic": "...", "address": "...", "format": "json" } }
import { apiVersion } from './client';

const safeStr = (v) => (typeof v === 'string' ? v : '');

// Topics required by the spec. Keep this list authoritative.
export const WEBHOOK_TOPICS = [
  'products/create',
  'products/update',
  'products/delete',
  'orders/create',
  'orders/updated',
  'customers/create',
  'customers/update',
  'inventory_levels/update',
  'app/uninstalled',
];

export function webhookAddress(appBaseUrl) {
  return `${safeStr(appBaseUrl).replace(/\/+$/, '')}/api/shopify/webhooks`;
}

async function listExisting(shopDomain, accessToken) {
  const url = `https://${shopDomain}/admin/api/${apiVersion()}/webhooks.json?limit=250`;
  const res = await fetch(url, {
    method: 'GET',
    headers: { 'X-Shopify-Access-Token': accessToken, Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) return [];
  const body = await res.json().catch(() => ({}));
  return body?.webhooks || [];
}

async function createOne(shopDomain, accessToken, topic, address) {
  const url = `https://${shopDomain}/admin/api/${apiVersion()}/webhooks.json`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ webhook: { topic, address, format: 'json' } }),
    cache: 'no-store',
  });
  const text = await res.text();
  let body = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text }; }
  if (!res.ok) {
    const msg = safeStr(body?.errors || body?.error || text).slice(0, 200);
    return { ok: false, topic, error: msg, status: res.status };
  }
  return { ok: true, topic, id: body?.webhook?.id };
}

async function deleteOne(shopDomain, accessToken, id) {
  const url = `https://${shopDomain}/admin/api/${apiVersion()}/webhooks/${id}.json`;
  await fetch(url, {
    method: 'DELETE',
    headers: { 'X-Shopify-Access-Token': accessToken },
    cache: 'no-store',
  });
}

/**
 * Idempotently register the required webhooks for a store.
 *  - Deletes any existing webhooks for our topics that point to a different
 *    address (e.g. stale preview URL).
 *  - Creates whichever required topic+address combos are missing.
 */
export async function registerWebhooks({ shopDomain, accessToken, address }) {
  const existing = await listExisting(shopDomain, accessToken);
  const haveCorrect = new Set();
  for (const w of existing) {
    if (!WEBHOOK_TOPICS.includes(w.topic)) continue;
    if (w.address === address) {
      haveCorrect.add(w.topic);
    } else {
      // Stale address for one of our topics — remove it.
      await deleteOne(shopDomain, accessToken, w.id);
    }
  }

  const results = [];
  for (const topic of WEBHOOK_TOPICS) {
    if (haveCorrect.has(topic)) {
      results.push({ ok: true, topic, skipped: true });
      continue;
    }
    results.push(await createOne(shopDomain, accessToken, topic, address));
  }
  return results;
}
