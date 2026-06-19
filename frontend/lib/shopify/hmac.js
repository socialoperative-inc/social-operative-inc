// Shopify HMAC verification helpers.
// All comparisons are timing-safe.
import crypto from 'node:crypto';

const safeStr = (v) => (typeof v === 'string' ? v : '');

/**
 * Verify the `hmac` query parameter on the OAuth callback URL.
 * Per Shopify docs, the message is the query string with `hmac` removed,
 * keys sorted alphabetically, joined with `&` as `key=value`.
 */
export function verifyOAuthHmac(searchParams, apiSecret) {
  if (!apiSecret) return false;
  const provided = safeStr(searchParams.get('hmac'));
  if (!provided) return false;

  const params = [];
  for (const [k, v] of searchParams.entries()) {
    if (k === 'hmac' || k === 'signature') continue;
    params.push([k, v]);
  }
  params.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  const message = params.map(([k, v]) => `${k}=${v}`).join('&');

  const expected = crypto
    .createHmac('sha256', apiSecret)
    .update(message)
    .digest('hex');

  return timingSafeEqualHex(provided, expected);
}

/**
 * Verify the `X-Shopify-Hmac-Sha256` header on a webhook request.
 * The message is the raw request body, hashed with the API secret, base64-encoded.
 */
export function verifyWebhookHmac(rawBody, hmacHeader, apiSecret) {
  if (!apiSecret || !hmacHeader || !rawBody) return false;
  const expected = crypto
    .createHmac('sha256', apiSecret)
    .update(rawBody)
    .digest('base64');
  return timingSafeEqualB64(hmacHeader, expected);
}

function timingSafeEqualHex(a, b) {
  try {
    const ba = Buffer.from(a, 'hex');
    const bb = Buffer.from(b, 'hex');
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch (_) {
    return false;
  }
}

function timingSafeEqualB64(a, b) {
  try {
    const ba = Buffer.from(a, 'base64');
    const bb = Buffer.from(b, 'base64');
    if (ba.length !== bb.length || ba.length === 0) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch (_) {
    return false;
  }
}
