// Shopify Admin API client — native fetch only, no axios, no streaming
// (project hardening rules: see CRITICAL_FIXES.md).
//
// Handles:
//   - REST GET with bearer X-Shopify-Access-Token
//   - GraphQL POST
//   - Automatic 429 retry with Retry-After header
//   - Cost-based throttling backoff for GraphQL

const safeStr = (v) => (typeof v === 'string' ? v : '');

export function apiVersion() {
  return safeStr(process.env.SHOPIFY_API_VERSION).trim() || '2025-01';
}

export function isShopifyConfigured() {
  return Boolean(
    safeStr(process.env.SHOPIFY_API_KEY).trim() &&
      safeStr(process.env.SHOPIFY_API_SECRET).trim()
  );
}

function restBase(shopDomain) {
  return `https://${shopDomain}/admin/api/${apiVersion()}`;
}

/**
 * Single REST GET with automatic 429 retry.
 */
export async function restGet({ shopDomain, accessToken, path, query, attempt = 1 }) {
  const url = new URL(`${restBase(shopDomain)}${path}`);
  if (query && typeof query === 'object') {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
  }

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
    return restGet({ shopDomain, accessToken, path, query, attempt: attempt + 1 });
  }

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = { raw: text };
  }

  if (!res.ok) {
    const err = new Error(
      `Shopify REST ${res.status}: ${safeStr(body?.errors || body?.error || text).slice(0, 300)}`
    );
    err.status = res.status;
    err.body = body;
    throw err;
  }

  return body;
}

/**
 * GraphQL Admin API call.
 * Retries up to 3 times on THROTTLED status from Shopify's cost system.
 */
export async function graphql({ shopDomain, accessToken, query, variables, attempt = 1 }) {
  const url = `${restBase(shopDomain)}/graphql.json`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'X-Shopify-Access-Token': accessToken,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({ query, variables: variables || {} }),
    cache: 'no-store',
  });

  if (res.status === 429 && attempt < 4) {
    const retryAfter = Number(res.headers.get('Retry-After')) || 2;
    await new Promise((r) => setTimeout(r, retryAfter * 1000));
    return graphql({ shopDomain, accessToken, query, variables, attempt: attempt + 1 });
  }

  const json = await res.json().catch(() => ({}));

  // Cost-based throttle in errors[].extensions.code === 'THROTTLED'
  const throttled = Array.isArray(json?.errors)
    ? json.errors.some((e) => e?.extensions?.code === 'THROTTLED')
    : false;
  if (throttled && attempt < 4) {
    await new Promise((r) => setTimeout(r, 1500 * attempt));
    return graphql({ shopDomain, accessToken, query, variables, attempt: attempt + 1 });
  }

  if (!res.ok || (Array.isArray(json?.errors) && json.errors.length)) {
    const msg =
      Array.isArray(json?.errors) && json.errors.length
        ? json.errors.map((e) => e.message).join('; ')
        : `Shopify GraphQL ${res.status}`;
    const err = new Error(`Shopify GraphQL error: ${safeStr(msg).slice(0, 400)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }

  return json.data;
}

/**
 * Exchange an OAuth `code` for a permanent access token.
 * https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/authorization-code-grant
 */
export async function exchangeCodeForToken({ shopDomain, code }) {
  const apiKey = safeStr(process.env.SHOPIFY_API_KEY).trim();
  const apiSecret = safeStr(process.env.SHOPIFY_API_SECRET).trim();
  if (!apiKey || !apiSecret) {
    throw new Error(
      'Shopify is not configured on the server (SHOPIFY_API_KEY / SHOPIFY_API_SECRET missing)'
    );
  }

  const res = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: apiKey,
      client_secret: apiSecret,
      code,
    }),
    cache: 'no-store',
  });

  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch (_) {
    body = { raw: text };
  }

  if (!res.ok || !body?.access_token) {
    throw new Error(
      `Shopify token exchange failed (${res.status}): ${safeStr(body?.error || text).slice(0, 300)}`
    );
  }

  return {
    accessToken: safeStr(body.access_token),
    scope: safeStr(body.scope),
  };
}

/**
 * Build the OAuth authorization URL.
 */
export function buildInstallUrl({ shopDomain, redirectUri, state, scopes }) {
  const apiKey = safeStr(process.env.SHOPIFY_API_KEY).trim();
  const u = new URL(`https://${shopDomain}/admin/oauth/authorize`);
  u.searchParams.set('client_id', apiKey);
  u.searchParams.set('scope', scopes);
  u.searchParams.set('redirect_uri', redirectUri);
  u.searchParams.set('state', state);
  // grant_options[] empty => offline access (permanent token), which is what we want
  return u.toString();
}

export function defaultScopes() {
  const fromEnv = safeStr(process.env.SHOPIFY_APP_SCOPES).trim();
  if (fromEnv) return fromEnv;
  return 'read_products,write_products,read_orders,read_customers,read_shop';
}
