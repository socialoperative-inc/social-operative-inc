# Social Operative Inc — Product Requirements (PRD)

> Source of truth: https://github.com/socialoperative-inc/social-operative-inc
> Container preview: https://github-source.preview.emergentagent.com
> Production: https://social-operative-inc.vercel.app

## Original problem statement
Connect to existing GitHub repository as single source of truth. Analyze the
codebase before making changes, then add a Shopify Commerce Hub directly below
Competitor Intelligence in the sidebar. Manage Shopify entirely from inside
Social Operative — products, orders, customers, inventory, collections — with
full OAuth, encrypted token storage, and a beautiful onboarding flow.

## Architecture (unchanged)
- **Framework**: Next.js 14 App Router (single Vercel deploy)
- **DB**: MongoDB Atlas, `socialoperative` database
- **Auth**: Supabase (service-role server-side, anon browser-side)
- **AI**: OpenRouter
- **Meta Ads scraper**: Railway-hosted Express + Playwright microservice
- **Container preview**: Next.js on :3000, FastAPI thin proxy on :8001 forwarding `/api/*`

## Core personas
- **DTC operator / agency manager**: signs in, connects Shopify + Meta + AI
  agents, runs daily ops without leaving the app.
- **Solo merchant**: connects a single Shopify store, uses AI agents and the
  Commerce Hub for daily product / order management.

## Implementation log

### 2026-01 — Repo import + preview wiring
- Imported repo into `/app/frontend` (preserving file structure).
- Created FastAPI proxy at `/app/backend/server.py` (forwards `/api/*` → Next.js).
- Wired `.env.local` with real Supabase + OpenRouter + Mongo Atlas credentials.

### 2026-01 — Shopify Commerce Hub MVP (this milestone)
**New files**
- `lib/shopify/crypto.js` — AES-256-GCM token-at-rest encryption.
- `lib/shopify/hmac.js` — OAuth + webhook HMAC verification (timing-safe).
- `lib/shopify/validate.js` — shop-domain validator/normalizer.
- `lib/shopify/client.js` — REST + GraphQL Admin API client with 429 retry.
- `app/api/shopify/[[...path]]/route.js` — isolated Shopify catch-all
  (install, callback, stores, sync, products CRUD + images, orders, customers,
  collections, inventory, dashboard).
- `components/commerce-hub/CommerceHubView.jsx` — full Commerce Hub UI
  (onboarding, store header, dashboard, products with editor modal,
  orders, customers, collections, inventory).
- `.env.example` — documented env template.

**Modified files**
- `app/page.js` — added `Store` icon import, `commerce-hub` sidebar item
  between Competitor Intelligence and Analytics, and the view dispatch.
- `.env.local` — added Shopify keys + `SHOPIFY_ENCRYPTION_KEY`.
- `package.json` — `start` script binds `0.0.0.0:3000` for the preview container.

**Database changes (auto-created on first call)**
- Collection `shopify_stores` — indexes: `{userId, shopDomain}` (unique),
  `{id}` (unique).
- Collection `shopify_oauth_state` — indexes: `{state}` (unique),
  `{expiresAt}` TTL.

**Environment variables added**
- `SHOPIFY_API_KEY`, `SHOPIFY_API_SECRET`, `SHOPIFY_APP_URL`
- `SHOPIFY_API_VERSION` (default `2026-04`)
- `SHOPIFY_APP_SCOPES`
- `SHOPIFY_ENCRYPTION_KEY` (auto-generated, 32-byte base64)

**OAuth scopes requested**
`read_products, write_products, read_orders, read_customers, read_inventory,
write_inventory, read_markets, read_publications, read_content, write_content`

**Security**
- AES-256-GCM at-rest token encryption.
- Strict shop-domain regex (`^[a-z0-9][a-z0-9-]*\.myshopify\.com$`).
- HMAC verification on OAuth callback (timing-safe `crypto.timingSafeEqual`).
- 10-minute TTL OAuth state nonces, single-use, bound to userId + shopDomain.
- All Shopify routes Supabase-auth gated except `/auth/callback`.

## Backlog (next iterations)
**P0**
- Webhook receiver `/api/shopify/webhooks` with HMAC verify + topic dispatch
  (orders/create, products/update, app/uninstalled).
- Shopify-to-Mongo data warehouse (background sync) for fast offline analytics.

**P1**
- Bulk product editor (CSV upload, AI rewrite-all flow tied into Content Studio).
- Inventory level mutation endpoints (POST /inventory/adjust) with
  `inventory_levels/adjust.json`.
- GraphQL-based analytics tiles (sales over time, top SKUs by revenue).

**P2**
- Multi-channel: WooCommerce, Amazon, Etsy, TikTok Shop integrations
  (UI placeholders shipped in onboarding screen).
- Customer LTV cohort analysis tied into Commerce Intelligence AI agent.
