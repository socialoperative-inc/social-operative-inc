// Shop domain validation.
// Shopify shop domains must look like `mystore.myshopify.com` — strict regex
// prevents redirect/open-redirect attacks via the `shop` query parameter.

const SHOP_RE = /^[a-z0-9][a-z0-9-]{0,59}\.myshopify\.com$/i;

const safeStr = (v) => (typeof v === 'string' ? v : '');

export function isValidShopDomain(shop) {
  const v = safeStr(shop).trim().toLowerCase();
  if (!v) return false;
  if (v.length > 100) return false;
  return SHOP_RE.test(v);
}

/**
 * Normalize user input that may include scheme, path, or trailing slash,
 * and return the canonical `mystore.myshopify.com` form (or null if invalid).
 */
export function normalizeShopDomain(shop) {
  let v = safeStr(shop).trim().toLowerCase();
  if (!v) return null;
  // Strip protocol
  v = v.replace(/^https?:\/\//, '');
  // Strip path / query
  v = v.split('/')[0].split('?')[0];
  // If user gave just the subdomain, append .myshopify.com
  if (!v.includes('.')) v = `${v}.myshopify.com`;
  return isValidShopDomain(v) ? v : null;
}
