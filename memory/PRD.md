# Social Operative Inc — Product Requirements (PRD)

> Source of truth: https://github.com/socialoperative-inc/social-operative-inc
> Container preview: https://github-source.preview.emergentagent.com
> Production: https://social-operative-inc.vercel.app

## Implementation log

### 2026-01 — Repo import + preview wiring (done)
- Imported repo into `/app/frontend` preserving file structure.
- FastAPI proxy at `/app/backend/server.py` forwards `/api/*` to Next.js on :3000.
- `.env.local` wired with Supabase, OpenRouter, Mongo Atlas credentials.

### 2026-01 — Shopify Commerce Hub MVP (done)
- Sidebar item added between Competitor Intelligence and Analytics.
- Onboarding screen with future-platform placeholders (WooCommerce, Amazon, Etsy, TikTok Shop).
- OAuth flow with HMAC + state nonce + AES-256-GCM token encryption.

### 2026-01 — Shopify Commerce Hub COMPLETE (this milestone)
**Phase 1 — OAuth** — each step now logs into `sync_logs`
(install_start → hmac_verify → state_verify → token_exchange → persist → webhook_register).
**Phase 2 — Multi-store** — `/stores/:id/reconnect` returns a fresh install URL;
unlimited stores per user enforced via `{userId, shopDomain}` unique index.
**Phase 3 — Product Sync** — `lib/shopify/sync.js syncProducts()` paginates the
full catalog into `shopify_products` and `shopify_variants` collections.
**Phase 4 — Orders** — `syncOrders()` upserts full orders with payment +
fulfillment status, customer summary into `shopify_orders`.
**Phase 5 — Customers** — `syncCustomers()` upserts into `shopify_customers`
with phone, orders count, total spent, tags.
**Phase 6 — Inventory** — `syncInventory()` joins variants → inventory_levels
across all store locations; persists to `shopify_inventory`. Low-stock filter
(`?lowStock=1`) and dashboard counter.
**Phase 7 — Webhooks** — `/api/shopify/webhooks` (POST) with raw-body HMAC
verification, dispatches to per-topic handlers, logs every receipt to
`shopify_webhooks` (status: ok | rejected | orphan | dispatch_error).
Auto-registered during OAuth callback for all 9 topics:
  products/create, products/update, products/delete,
  orders/create, orders/updated,
  customers/create, customers/update,
  inventory_levels/update,
  app/uninstalled.
**Phase 8 — DB** — All 8 collections + indexes auto-created on first connect.
**Phase 9 — Testing** — Verified end-to-end via curl: config, install URL,
webhook POST with valid HMAC = 200, bad HMAC = 401, sync_logs records
install_start, all auth-gated endpoints return 401 without bearer token.

## Backlog
- **P1**: Bulk AI rewrite (Content Studio × Commerce Hub).
- **P1**: Inventory mutation endpoint (`inventory_levels/adjust.json`).
- **P2**: WooCommerce / Amazon / Etsy / TikTok Shop integrations.
- **P2**: Background daily sync cron + per-resource webhook backfill.
