'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Store, Package, ShoppingCart, Users, Layers, RefreshCw, Plus, Search,
  Trash2, Edit3, ExternalLink, Check, X, Loader2, AlertCircle, Image as ImageIcon,
  Zap, Link2, Unlink, ArrowUpRight, TrendingUp, DollarSign, ShoppingBag,
  CheckCircle2, Circle, ChevronRight, Lock, Sparkles, Wand2
} from 'lucide-react';

const cn = (...a) => a.filter(Boolean).join(' ');
const fmt = (n) => new Intl.NumberFormat('en-US').format(Number(n) || 0);
const money = (amount, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(Number(amount) || 0);
  } catch {
    return `${currency} ${amount}`;
  }
};
const timeAgo = (d) => {
  if (!d) return 'never';
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

// Shopify wordmark/logo (inline SVG — no external assets)
function ShopifyLogo({ className = 'w-5 h-5' }) {
  return (
    <svg viewBox="0 0 109 124" className={className} aria-hidden="true">
      <path
        fill="#95BF47"
        d="M74.7 14.8c0-.4-.4-.7-.7-.7-.3 0-5.7-.4-5.7-.4s-3.8-3.8-4.2-4.2c-.4-.4-1.2-.3-1.5-.2-.04.02-.78.24-2.02.62-.4-1.16-1-2.6-1.84-4.04C58.16 3.36 56.16 2 53.74 2c-.16 0-.32 0-.5.02-.06-.08-.14-.16-.22-.24C51.78.58 50.06-.04 47.98.04c-4 .16-7.98 3.06-11.22 8.18-2.28 3.62-4.02 8.16-4.5 11.7-4.6 1.42-7.82 2.42-7.88 2.46-2.32.72-2.4.8-2.7 3-.22 1.66-6.32 48.86-6.32 48.86l51.04 8.84 22.12-5.5s-13.78-72.94-13.82-72.78zM58.5 10.94c-.94.3-2 .62-3.16.98v-.68c0-2.06-.28-3.72-.74-5.04 1.84.22 3.06 2.32 3.9 4.74zm-5.22 1.62c-2.14.66-4.48 1.38-6.84 2.12.66-2.54 1.92-5.06 3.46-6.72.58-.62 1.4-1.32 2.34-1.72.92 1.9 1.1 4.58 1.04 6.32zm-4.32-12.04c.78-.02 1.42.16 1.96.5-.86.46-1.7 1.12-2.48 1.98-2.06 2.22-3.64 5.66-4.28 9-1.96.6-3.88 1.2-5.66 1.74C39.66 8.66 43.84.74 48.96.52z"
      />
      <path
        fill="#5E8E3E"
        d="M74 14.1c-.3 0-5.7-.4-5.7-.4s-3.8-3.8-4.2-4.2c-.16-.16-.36-.22-.58-.26L60.46 82.96l22.12-5.5s-13.78-72.94-13.82-72.78c0-.34-.4-.6-.7-.6z"
      />
      <path
        fill="#FFFFFF"
        d="M53.7 24.34l-2.58 9.62s-2.86-1.3-6.26-1.08c-4.98.32-5.04 3.46-5 4.24.26 4.32 11.62 5.26 12.26 15.38.5 7.96-4.22 13.4-11.04 13.84-8.18.52-12.68-4.3-12.68-4.3l1.74-7.36s4.54 3.42 8.16 3.18c2.38-.14 3.22-2.08 3.14-3.44-.34-5.64-9.58-5.3-10.18-14.56-.48-7.8 4.62-15.7 16-16.42 4.36-.28 6.44 1.04 6.44 1.04z"
      />
    </svg>
  );
}

// ---------------- API hook ----------------
function useShopifyApi(apiFetch) {
  const call = useCallback(async (path, init) => {
    const res = await apiFetch(`/api/shopify${path}`, init);
    let body = null;
    try { body = await res.json(); } catch { body = {}; }
    if (!res.ok) throw new Error(body?.error || `Request failed (${res.status})`);
    return body;
  }, [apiFetch]);
  return call;
}

// ============================================================================
// ONBOARDING
// ============================================================================
function OnboardingScreen({ onConnect, connecting }) {
  const [shop, setShop] = useState('');
  const integrations = [
    { id: 'shopify', name: 'Shopify', logo: <ShopifyLogo className="w-7 h-7" />, status: 'live', accent: 'from-emerald-400 to-green-500' },
    { id: 'woo', name: 'WooCommerce', logo: <span className="text-2xl">🪵</span>, status: 'soon', accent: 'from-purple-500 to-fuchsia-600' },
    { id: 'amazon', name: 'Amazon', logo: <span className="text-2xl">📦</span>, status: 'soon', accent: 'from-orange-400 to-amber-500' },
    { id: 'etsy', name: 'Etsy', logo: <span className="text-2xl">🧶</span>, status: 'soon', accent: 'from-orange-500 to-red-500' },
    { id: 'tiktok', name: 'TikTok Shop', logo: <span className="text-2xl">🎵</span>, status: 'soon', accent: 'from-cyan-400 to-pink-500' },
  ];

  return (
    <div className="px-8 py-10 max-w-6xl mx-auto" data-testid="commerce-hub-onboarding">
      <div className="mb-8">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[10px] font-mono tracking-widest uppercase mb-4">
          <Sparkles className="w-3 h-3" />
          Commerce Hub
        </div>
        <h1 className="text-4xl md:text-5xl font-semibold tracking-tight text-white mb-3">
          Connect Your Store
        </h1>
        <p className="text-white/50 text-base max-w-2xl">
          Manage products, orders, customers and inventory across every channel from one unified Mission Control.
          Start with Shopify — additional platforms launching soon.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-start">
        {/* SHOPIFY connect card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-emerald-500/30 bg-gradient-to-br from-emerald-500/5 via-white/[0.02] to-white/[0.01] p-7"
          data-testid="shopify-connect-card"
        >
          <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />
          <div className="relative">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <ShopifyLogo className="w-7 h-7" />
              </div>
              <div>
                <div className="text-xl font-semibold text-white">Shopify</div>
                <div className="text-[10px] font-mono tracking-widest text-emerald-300 uppercase">Available now</div>
              </div>
            </div>

            <p className="text-white/60 text-sm leading-relaxed mt-4 mb-5">
              Connect your Shopify store to manage products, orders, customers and inventory directly from Social Operative — no more tab-switching.
            </p>

            <div className="space-y-2 mb-6">
              {[
                'Full product CRUD (create, edit, delete, images)',
                'Real-time order & customer sync',
                'Inventory tracking with one-click updates',
                'Multiple stores per workspace',
                'Encrypted token storage (AES-256-GCM)',
              ].map((t) => (
                <div key={t} className="flex items-center gap-2 text-sm text-white/70">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  {t}
                </div>
              ))}
            </div>

            <div className="space-y-3">
              <label className="text-[10px] font-mono tracking-widest text-white/40 uppercase">Your Shopify store</label>
              <div className="flex gap-2">
                <input
                  data-testid="shopify-shop-input"
                  value={shop}
                  onChange={(e) => setShop(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && shop.trim() && !connecting) onConnect(shop.trim()); }}
                  placeholder="yourstore.myshopify.com"
                  className="flex-1 px-4 py-3 rounded-xl bg-black/40 border border-white/10 text-white text-sm placeholder:text-white/30 focus:border-emerald-400/60 focus:ring-2 focus:ring-emerald-400/20 outline-none transition"
                />
                <button
                  data-testid="shopify-connect-btn"
                  onClick={() => onConnect(shop.trim())}
                  disabled={!shop.trim() || connecting}
                  className="px-5 py-3 rounded-xl bg-gradient-to-br from-emerald-400 to-green-500 text-emerald-950 font-semibold text-sm hover:shadow-lg hover:shadow-emerald-500/30 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
                >
                  {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                  {connecting ? 'Connecting…' : 'Connect Store'}
                </button>
              </div>
              <p className="text-[11px] text-white/40">
                You'll be redirected to Shopify to approve secure access. We never see your password.
              </p>
            </div>
          </div>
        </motion.div>

        {/* Future integrations */}
        <div>
          <div className="text-[10px] font-mono tracking-widest text-white/40 uppercase mb-3">Future Integrations</div>
          <div className="space-y-2.5">
            {integrations.slice(1).map((it) => (
              <div
                key={it.id}
                className="flex items-center justify-between p-4 rounded-xl border border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04] transition"
                data-testid={`integration-${it.id}-card`}
              >
                <div className="flex items-center gap-3">
                  <div className={cn('w-10 h-10 rounded-lg bg-gradient-to-br flex items-center justify-center', it.accent)}>
                    {it.logo}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-white">{it.name}</div>
                    <div className="text-[10px] text-white/40 font-mono tracking-widest uppercase">Coming Soon</div>
                  </div>
                </div>
                <div className="px-2.5 py-1 rounded-md bg-white/5 text-[10px] font-mono tracking-widest text-white/40 uppercase flex items-center gap-1.5">
                  <Lock className="w-3 h-3" /> Soon
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// STORE HEADER
// ============================================================================
function StoreHeader({ stores, activeStore, onSelect, onSync, onDisconnect, onAddStore, syncing }) {
  const [openMenu, setOpenMenu] = useState(false);
  return (
    <div className="px-8 pt-8 pb-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-white flex items-center justify-center shadow-lg shadow-emerald-500/10">
            <ShopifyLogo className="w-7 h-7" />
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-widest text-emerald-300 uppercase">Connected Store</div>
            <div className="flex items-center gap-2">
              <button
                data-testid="store-switcher"
                onClick={() => setOpenMenu(o => !o)}
                className="text-2xl font-semibold text-white flex items-center gap-2 hover:text-emerald-300 transition"
              >
                {activeStore?.storeName || activeStore?.shopDomain}
                {stores.length > 1 && <ChevronRight className="w-5 h-5 rotate-90 text-white/40" />}
              </button>
            </div>
            <div className="text-xs text-white/40 mt-0.5 flex items-center gap-2">
              <span>{activeStore?.shopDomain}</span>
              <span className="text-white/20">•</span>
              <span className="flex items-center gap-1">
                <span className={cn('w-1.5 h-1.5 rounded-full', activeStore?.status === 'active' ? 'bg-emerald-400' : 'bg-amber-400')} />
                {activeStore?.status === 'active' ? 'Healthy' : 'Needs attention'}
              </span>
              <span className="text-white/20">•</span>
              <span>Last sync {timeAgo(activeStore?.lastSyncAt)}</span>
            </div>
          </div>

          {openMenu && stores.length > 1 && (
            <div className="absolute mt-32 ml-16 w-72 rounded-xl border border-white/10 bg-[#0a0a0f] shadow-2xl p-2 z-40">
              {stores.map(s => (
                <button
                  key={s.id}
                  data-testid={`store-option-${s.id}`}
                  onClick={() => { onSelect(s); setOpenMenu(false); }}
                  className={cn(
                    'w-full text-left px-3 py-2 rounded-lg hover:bg-white/5 transition flex items-center justify-between',
                    s.id === activeStore?.id && 'bg-emerald-500/10'
                  )}
                >
                  <div>
                    <div className="text-sm text-white">{s.storeName || s.shopDomain}</div>
                    <div className="text-[10px] text-white/40">{s.shopDomain}</div>
                  </div>
                  {s.id === activeStore?.id && <Check className="w-4 h-4 text-emerald-400" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            data-testid="add-store-btn"
            onClick={onAddStore}
            className="px-3 py-2 rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-white/20 text-xs font-medium transition flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            Add store
          </button>
          <a
            href={`https://${activeStore?.shopDomain}/admin`}
            target="_blank" rel="noreferrer"
            className="px-3 py-2 rounded-lg border border-white/10 text-white/70 hover:text-white hover:border-white/20 text-xs font-medium transition flex items-center gap-1.5"
            data-testid="open-shopify-admin"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Shopify admin
          </a>
          <button
            data-testid="sync-store-btn"
            onClick={onSync}
            disabled={syncing}
            className="px-3 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/20 text-xs font-medium transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} />
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
          <button
            data-testid="disconnect-store-btn"
            onClick={onDisconnect}
            className="px-3 py-2 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-xs font-medium transition flex items-center gap-1.5"
          >
            <Unlink className="w-3.5 h-3.5" />
            Disconnect
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TABS
// ============================================================================
const TABS = [
  { id: 'dashboard', label: 'Dashboard', icon: TrendingUp },
  { id: 'products', label: 'Products', icon: Package },
  { id: 'orders', label: 'Orders', icon: ShoppingCart },
  { id: 'customers', label: 'Customers', icon: Users },
  { id: 'collections', label: 'Collections', icon: Layers },
  { id: 'inventory', label: 'Inventory', icon: ImageIcon },
];

function TabBar({ active, onChange }) {
  return (
    <div className="px-8 border-b border-white/[0.06] flex items-center gap-1 overflow-x-auto" data-testid="commerce-hub-tabs">
      {TABS.map(t => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => onChange(t.id)}
            className={cn(
              'relative px-4 py-3 text-xs font-medium tracking-wide transition flex items-center gap-2 whitespace-nowrap',
              isActive ? 'text-white' : 'text-white/40 hover:text-white/70'
            )}
          >
            <Icon className="w-3.5 h-3.5" />
            {t.label}
            {isActive && <motion.div layoutId="commerce-tab-active" className="absolute bottom-0 inset-x-2 h-[2px] bg-gradient-to-r from-emerald-400 to-green-500 rounded-full" />}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// DASHBOARD TAB
// ============================================================================
function DashboardTab({ api, storeId, currency }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await api(`/dashboard?storeId=${encodeURIComponent(storeId)}`);
      setData(d);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [api, storeId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>;
  if (error) return <ErrorBlock message={error} onRetry={load} />;

  const c = data?.counts || {};
  const shop = data?.shop || {};
  const cards = [
    { label: 'Products', value: c.products, icon: Package, accent: 'from-emerald-400 to-green-500', testid: 'stat-products' },
    { label: 'Orders', value: c.orders, icon: ShoppingCart, accent: 'from-blue-400 to-cyan-500', testid: 'stat-orders' },
    { label: 'Customers', value: c.customers, icon: Users, accent: 'from-purple-400 to-fuchsia-500', testid: 'stat-customers' },
    { label: 'Low stock', value: c.lowStock ?? 0, icon: AlertCircle, accent: 'from-amber-400 to-orange-500', testid: 'stat-lowstock' },
  ];

  return (
    <div className="px-8 py-6 space-y-6" data-testid="dashboard-tab">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(card => {
          const Icon = card.icon;
          return (
            <div key={card.label} data-testid={card.testid} className="relative overflow-hidden rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
              <div className={cn('absolute -top-10 -right-10 w-32 h-32 rounded-full blur-2xl opacity-30 bg-gradient-to-br', card.accent)} />
              <div className="relative">
                <div className="flex items-center justify-between mb-3">
                  <div className={cn('w-9 h-9 rounded-lg bg-gradient-to-br flex items-center justify-center', card.accent)}>
                    <Icon className="w-4 h-4 text-black/70" />
                  </div>
                </div>
                <div className="text-[10px] font-mono tracking-widest text-white/40 uppercase mb-1">{card.label}</div>
                <div className="text-2xl font-semibold text-white">{card.isText ? card.value : fmt(card.value)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="text-[10px] font-mono tracking-widest text-white/40 uppercase mb-4">Store information</div>
          <div className="space-y-2 text-sm">
            <Row k="Name" v={shop.name} />
            <Row k="Email" v={shop.email} />
            <Row k="Domain" v={shop.domain} />
            <Row k="Plan" v={shop.plan_display_name || shop.plan_name} />
            <Row k="Currency" v={shop.currency} />
            <Row k="Country" v={shop.country_name} />
            <Row k="Timezone" v={shop.iana_timezone} />
          </div>
        </div>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-5">
          <div className="text-[10px] font-mono tracking-widest text-white/40 uppercase mb-4">Recent orders</div>
          <div className="space-y-2">
            {(data?.recentOrders || []).slice(0, 5).map(o => {
              const total = o.totalPrice ?? o.total_price;
              const curr = o.currency || currency;
              const finS = o.financialStatus ?? o.financial_status;
              const cName = o.customerName || (o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : '') || o.customerEmail || o.email || 'Guest';
              const when = o.createdAtShopify ?? o.created_at;
              return (
                <div key={o.orderId || o.id} data-testid={`recent-order-${o.orderId || o.id}`} className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
                  <div>
                    <div className="text-sm text-white">{o.name || `#${o.orderId || o.id}`}</div>
                    <div className="text-[11px] text-white/40">{cName} · {timeAgo(when)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-white">{money(total, curr)}</div>
                    <div className="text-[10px] uppercase tracking-widest text-white/40">{finS}</div>
                  </div>
                </div>
              );
            })}
            {(!data?.recentOrders || data.recentOrders.length === 0) && (
              <div className="text-sm text-white/40 py-6 text-center">No orders yet</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ k, v }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-white/40 text-xs">{k}</span>
      <span className="text-white text-sm truncate">{v || '—'}</span>
    </div>
  );
}

// ============================================================================
// PRODUCTS TAB
// ============================================================================
function ProductsTab({ api, storeId, currency, toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editor, setEditor] = useState(null); // null | 'new' | product object
  const [rewriteFor, setRewriteFor] = useState(null); // product object for single rewrite
  const [bulkOpen, setBulkOpen] = useState(false);
  const PAGE = 50;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await api(`/products?storeId=${encodeURIComponent(storeId)}&page=${page}&limit=${PAGE}${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      setItems(d.products || []);
      setTotal(d.total || 0);
      setHasMore(d.hasMore || false);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [api, storeId, page, q]);

  useEffect(() => { load(); }, [load]);

  const filtered = items;

  const resync = async () => {
    setSyncing(true);
    try {
      const r = await api(`/sync/products?storeId=${encodeURIComponent(storeId)}`, { method: 'POST' });
      toast({ title: 'Products synced', description: `${r?.result?.products || 0} products, ${r?.result?.variants || 0} variants`, variant: 'success' });
      setPage(1); load();
    } catch (e) { toast({ title: 'Sync failed', description: e.message, variant: 'error' }); }
    finally { setSyncing(false); }
  };

  const handleDelete = async (p) => {
    const shopifyId = p.productId || p.id;
    if (!confirm('Delete this product from Shopify? This cannot be undone.')) return;
    try {
      await api(`/products/${shopifyId}?storeId=${encodeURIComponent(storeId)}`, { method: 'DELETE' });
      toast({ title: 'Product deleted', variant: 'success' });
      load();
    } catch (e) {
      toast({ title: 'Delete failed', description: e.message, variant: 'error' });
    }
  };

  return (
    <div className="px-8 py-6" data-testid="products-tab">
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            data-testid="products-search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products by title or vendor"
            className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/30 focus:border-emerald-400/40 outline-none"
          />
        </div>
        <button
          data-testid="refresh-products-btn"
          onClick={load}
          className="px-3 py-2.5 rounded-lg border border-white/10 text-white/70 hover:text-white text-xs flex items-center gap-1.5"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
        <button
          data-testid="resync-products-btn"
          onClick={resync}
          disabled={syncing}
          className="px-3 py-2.5 rounded-lg border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 text-xs flex items-center gap-1.5 disabled:opacity-50"
        >
          <RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} /> {syncing ? 'Re-syncing…' : 'Re-sync from Shopify'}
        </button>
        <button
          data-testid="ai-rewrite-all-btn"
          onClick={() => setBulkOpen(true)}
          className="px-3 py-2.5 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white text-xs font-semibold flex items-center gap-1.5 hover:shadow-lg hover:shadow-fuchsia-500/30"
        >
          <Wand2 className="w-3.5 h-3.5" /> AI rewrite catalog
        </button>
        <button
          data-testid="new-product-btn"
          onClick={() => setEditor('new')}
          className="px-4 py-2.5 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 text-emerald-950 font-semibold text-sm flex items-center gap-2 hover:shadow-lg hover:shadow-emerald-500/20"
        >
          <Plus className="w-4 h-4" /> New product
        </button>
      </div>

      {loading ? <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
        : error ? <ErrorBlock message={error} onRetry={load} />
        : filtered.length === 0 ? <EmptyState icon={Package} text={q ? 'No products match your search' : 'No products yet — create one to get started'} />
        : (
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] border-b border-white/[0.06]">
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] font-mono tracking-widest text-white/40 uppercase">Product</th>
                  <th className="text-left px-4 py-3 text-[10px] font-mono tracking-widest text-white/40 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-[10px] font-mono tracking-widest text-white/40 uppercase">Inventory</th>
                  <th className="text-left px-4 py-3 text-[10px] font-mono tracking-widest text-white/40 uppercase">Price</th>
                  <th className="text-left px-4 py-3 text-[10px] font-mono tracking-widest text-white/40 uppercase">Vendor</th>
                  <th className="text-right px-4 py-3 text-[10px] font-mono tracking-widest text-white/40 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(p => {
                  const img = p.image?.src || p.images?.[0]?.src;
                  const variant = p.variants?.[0] || {};
                  const inv = (p.variants || []).reduce((s, v) => s + (Number(v.inventory_quantity) || 0), 0);
                  return (
                    <tr key={p.id} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition" data-testid={`product-row-${p.id}`}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                            {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-4 h-4 text-white/20" />}
                          </div>
                          <div className="min-w-0">
                            <div className="text-white truncate max-w-xs">{p.title}</div>
                            <div className="text-[11px] text-white/40 truncate max-w-xs">{p.product_type || 'Uncategorized'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn(
                          'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-mono tracking-widest uppercase',
                          p.status === 'active' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                            : p.status === 'draft' ? 'bg-amber-500/10 text-amber-300 border border-amber-500/20'
                            : 'bg-white/5 text-white/40 border border-white/10'
                        )}>
                          <Circle className="w-1.5 h-1.5 fill-current" /> {p.status || 'draft'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-white/70">{fmt(inv)}</td>
                      <td className="px-4 py-3 text-white/70">{money(variant.price, currency)}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">{p.vendor || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button
                            data-testid={`ai-rewrite-${p.productId || p.id}`}
                            onClick={() => setRewriteFor(p)}
                            className="p-1.5 rounded-md hover:bg-fuchsia-500/10 text-white/60 hover:text-fuchsia-300"
                            title="AI rewrite copy"
                          >
                            <Wand2 className="w-4 h-4" />
                          </button>
                          <button
                            data-testid={`edit-product-${p.id}`}
                            onClick={() => setEditor(p)}
                            className="p-1.5 rounded-md hover:bg-white/5 text-white/60 hover:text-white"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            data-testid={`delete-product-${p.productId || p.id}`}
                            onClick={() => handleDelete(p)}
                            className="p-1.5 rounded-md hover:bg-rose-500/10 text-white/60 hover:text-rose-300"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      }

      {editor && (
        <ProductEditor
          api={api}
          storeId={storeId}
          product={editor === 'new' ? null : editor}
          onClose={() => setEditor(null)}
          onSaved={() => { setEditor(null); load(); }}
          toast={toast}
          currency={currency}
        />
      )}
      {rewriteFor && (
        <AIRewriteModal
          api={api}
          storeId={storeId}
          product={rewriteFor}
          onClose={() => setRewriteFor(null)}
          onApplied={() => { setRewriteFor(null); load(); }}
          toast={toast}
        />
      )}
      {bulkOpen && (
        <BulkRewriteModal
          api={api}
          storeId={storeId}
          products={items}
          onClose={() => setBulkOpen(false)}
          onDone={() => { setBulkOpen(false); load(); }}
          toast={toast}
        />
      )}
      <Pagination page={page} total={total} pageSize={PAGE} hasMore={hasMore} onChange={setPage} loading={loading} />
    </div>
  );
}

// ============================================================================
// AI REWRITE MODAL (single product)
// ============================================================================
function AIRewriteModal({ api, storeId, product, onClose, onApplied, toast }) {
  const productId = product.productId || product.id;
  const [tone, setTone] = useState('premium, confident, benefit-led');
  const [brandVoice, setBrandVoice] = useState('');
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState(null);

  const preview = async () => {
    setLoading(true); setResult(null);
    try {
      const d = await api(`/ai/rewrite/${productId}?storeId=${encodeURIComponent(storeId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone, brandVoice }),
      });
      setResult(d);
    } catch (e) {
      toast({ title: 'AI rewrite failed', description: e.message, variant: 'error' });
    } finally { setLoading(false); }
  };

  const apply = async () => {
    setApplying(true);
    try {
      await api(`/ai/rewrite/${productId}?storeId=${encodeURIComponent(storeId)}&apply=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tone, brandVoice }),
      });
      toast({ title: 'Pushed to Shopify', variant: 'success' });
      onApplied();
    } catch (e) {
      toast({ title: 'Apply failed', description: e.message, variant: 'error' });
    } finally { setApplying(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose} data-testid="ai-rewrite-modal">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-2xl border border-fuchsia-500/20 bg-[#0a0a0f] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] sticky top-0 bg-[#0a0a0f] z-10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center"><Wand2 className="w-4 h-4 text-white" /></div>
            <div>
              <div className="text-[10px] font-mono tracking-widest text-fuchsia-300 uppercase">AI rewrite</div>
              <div className="text-lg font-semibold text-white truncate max-w-md">{product.title}</div>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5" data-testid="ai-rewrite-close"><X className="w-5 h-5 text-white/60" /></button>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <div className="text-[10px] font-mono tracking-widest text-white/40 uppercase mb-1.5">Tone</div>
              <input data-testid="ai-tone" value={tone} onChange={(e) => setTone(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm text-white outline-none focus:border-fuchsia-400/50" />
            </label>
            <label className="block">
              <div className="text-[10px] font-mono tracking-widest text-white/40 uppercase mb-1.5">Brand voice (optional)</div>
              <input data-testid="ai-brand-voice" value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)}
                placeholder="e.g. minimalist, science-led, never use the word ‘amazing’"
                className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/30 outline-none focus:border-fuchsia-400/50" />
            </label>
          </div>

          <button
            data-testid="ai-preview-btn"
            onClick={preview}
            disabled={loading}
            className="w-full py-3 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
            {loading ? 'Generating…' : (result ? 'Re-generate' : 'Generate preview')}
          </button>

          {result?.preview && (
            <div className="grid md:grid-cols-2 gap-4" data-testid="ai-preview">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4">
                <div className="text-[10px] font-mono tracking-widest text-white/40 uppercase mb-2">Before</div>
                <div className="text-sm font-medium text-white mb-2">{result.preview.before.title}</div>
                <div className="text-xs text-white/60 max-h-64 overflow-y-auto" dangerouslySetInnerHTML={{ __html: result.preview.before.body_html || '<em class="text-white/30">(empty)</em>' }} />
              </div>
              <div className="rounded-xl border border-fuchsia-500/20 bg-fuchsia-500/5 p-4">
                <div className="text-[10px] font-mono tracking-widest text-fuchsia-300 uppercase mb-2">After</div>
                <div className="text-sm font-medium text-white mb-2">{result.preview.after.title}</div>
                <div className="text-xs text-white/70 max-h-64 overflow-y-auto" dangerouslySetInnerHTML={{ __html: result.preview.after.body_html }} />
                {result.preview.after.rationale && (
                  <div className="mt-3 text-[11px] text-fuchsia-200/70 border-t border-fuchsia-500/10 pt-3">
                    <span className="font-mono tracking-widest uppercase text-[9px] text-fuchsia-300 mr-2">Why</span>
                    {result.preview.after.rationale}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2 mt-3 text-[11px]">
                  <div><span className="text-white/40">SEO title:</span> <span className="text-white/80">{result.preview.after.seo_title || '—'}</span></div>
                  <div><span className="text-white/40">Model:</span> <span className="text-white/80">{result.preview.after.model}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/[0.06] sticky bottom-0 bg-[#0a0a0f]">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-white/60 hover:text-white text-sm">Cancel</button>
          <button
            data-testid="ai-apply-btn"
            onClick={apply}
            disabled={!result || applying}
            className="px-5 py-2 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 text-emerald-950 font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {applying ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {applying ? 'Pushing…' : 'Push to Shopify'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================================================
// BULK REWRITE MODAL (catalog)
// ============================================================================
function BulkRewriteModal({ api, storeId, products, onClose, onDone, toast }) {
  const [tone, setTone] = useState('premium, confident, benefit-led');
  const [brandVoice, setBrandVoice] = useState('');
  const [running, setRunning] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const [progress, setProgress] = useState({ done: 0, ok: 0, failed: 0, current: '' });
  const [errors, setErrors] = useState([]);

  const start = async () => {
    setRunning(true); setCancelled(false);
    setProgress({ done: 0, ok: 0, failed: 0, current: '' });
    setErrors([]);
    const list = products || [];
    let i = 0;
    for (const p of list) {
      if (cancelled) break;
      const productId = p.productId || p.id;
      const title = p.title;
      setProgress(prev => ({ ...prev, current: title }));
      try {
        await api(`/ai/rewrite/${productId}?storeId=${encodeURIComponent(storeId)}&apply=1`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tone, brandVoice }),
        });
        i++;
        setProgress({ done: i, ok: i - errors.length, failed: errors.length, current: title });
      } catch (e) {
        const errMsg = `${title}: ${e.message}`;
        setErrors(prev => [...prev, errMsg]);
        i++;
        setProgress(prev => ({ done: i, ok: prev.ok, failed: prev.failed + 1, current: title }));
      }
    }
    setRunning(false);
    toast({ title: 'Catalog rewrite finished', description: `${i - errors.length}/${list.length} succeeded`, variant: errors.length ? 'warn' : 'success' });
  };

  const pct = products?.length ? Math.round((progress.done / products.length) * 100) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={!running ? onClose : undefined} data-testid="bulk-rewrite-modal">
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl rounded-2xl border border-fuchsia-500/20 bg-[#0a0a0f] shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center"><Wand2 className="w-4 h-4 text-white" /></div>
            <div>
              <div className="text-[10px] font-mono tracking-widest text-fuchsia-300 uppercase">Bulk AI rewrite</div>
              <div className="text-lg font-semibold text-white">{products?.length || 0} products on this page</div>
            </div>
          </div>
          <button onClick={onClose} disabled={running} className="p-2 rounded-lg hover:bg-white/5 disabled:opacity-30" data-testid="bulk-rewrite-close"><X className="w-5 h-5 text-white/60" /></button>
        </div>

        <div className="p-6 space-y-4">
          <div className="text-sm text-white/60">
            This will rewrite the title, description, SEO title and SEO description of every product currently shown, and push the changes back to Shopify. It runs one product at a time so you can stop anytime. Affects this page only — paginate or filter first to scope.
          </div>

          {!running && progress.done === 0 && (
            <div className="grid grid-cols-2 gap-4">
              <label className="block">
                <div className="text-[10px] font-mono tracking-widest text-white/40 uppercase mb-1.5">Tone</div>
                <input data-testid="bulk-tone" value={tone} onChange={(e) => setTone(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm text-white outline-none focus:border-fuchsia-400/50" />
              </label>
              <label className="block">
                <div className="text-[10px] font-mono tracking-widest text-white/40 uppercase mb-1.5">Brand voice (optional)</div>
                <input data-testid="bulk-brand-voice" value={brandVoice} onChange={(e) => setBrandVoice(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm text-white outline-none focus:border-fuchsia-400/50" />
              </label>
            </div>
          )}

          {(running || progress.done > 0) && (
            <div data-testid="bulk-progress">
              <div className="flex items-center justify-between text-xs text-white/60 mb-2">
                <div>Progress: <span className="text-white">{progress.done}/{products?.length || 0}</span></div>
                <div className="font-mono tracking-widest uppercase text-[10px] text-white/40">{pct}%</div>
              </div>
              <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-fuchsia-500 to-purple-600 transition-all" style={{ width: `${pct}%` }} />
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs">
                <div><span className="text-emerald-300">{progress.ok}</span> <span className="text-white/40">succeeded</span></div>
                <div><span className="text-rose-300">{progress.failed}</span> <span className="text-white/40">failed</span></div>
              </div>
              {progress.current && running && (
                <div className="text-[11px] text-white/40 mt-2 truncate">Now: {progress.current}</div>
              )}
              {errors.length > 0 && (
                <div className="mt-3 max-h-32 overflow-y-auto rounded-lg border border-rose-500/10 bg-rose-500/5 p-3 text-[11px] text-rose-200 space-y-1">
                  {errors.slice(-8).map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/[0.06]">
          {!running && progress.done === 0 && (
            <>
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-white/60 hover:text-white text-sm">Cancel</button>
              <button
                data-testid="bulk-start-btn"
                onClick={start}
                disabled={!products?.length}
                className="px-5 py-2 rounded-lg bg-gradient-to-br from-fuchsia-500 to-purple-600 text-white font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
              >
                <Wand2 className="w-4 h-4" /> Rewrite {products?.length || 0} products
              </button>
            </>
          )}
          {running && (
            <button
              data-testid="bulk-cancel-btn"
              onClick={() => setCancelled(true)}
              className="px-5 py-2 rounded-lg border border-rose-500/30 text-rose-300 hover:bg-rose-500/10 text-sm flex items-center gap-2"
            >
              <X className="w-4 h-4" /> Stop after current
            </button>
          )}
          {!running && progress.done > 0 && (
            <button
              data-testid="bulk-done-btn"
              onClick={onDone}
              className="px-5 py-2 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 text-emerald-950 font-semibold text-sm flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> Done
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ---------------- Pagination ----------------
function Pagination({ page, total, pageSize, hasMore, onChange, loading }) {
  if (!total) return null;
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(start + pageSize - 1, total);
  return (
    <div className="flex items-center justify-between mt-3 text-xs text-white/50" data-testid="pagination">
      <div>Showing <span className="text-white/80">{start}-{end}</span> of <span className="text-white/80">{fmt(total)}</span></div>
      <div className="flex items-center gap-2">
        <button
          data-testid="page-prev"
          onClick={() => onChange(Math.max(1, page - 1))}
          disabled={page <= 1 || loading}
          className="px-3 py-1.5 rounded-md border border-white/10 hover:bg-white/5 disabled:opacity-40"
        >Prev</button>
        <span className="px-2">Page {page}</span>
        <button
          data-testid="page-next"
          onClick={() => onChange(page + 1)}
          disabled={!hasMore || loading}
          className="px-3 py-1.5 rounded-md border border-white/10 hover:bg-white/5 disabled:opacity-40"
        >Next</button>
      </div>
    </div>
  );
}

// ---------------- Product editor (modal) ----------------
function ProductEditor({ api, storeId, product, onClose, onSaved, toast, currency }) {
  const isNew = !product;
  const v = product?.variants?.[0] || {};
  const [form, setForm] = useState({
    title: product?.title || '',
    body_html: product?.body_html || '',
    vendor: product?.vendor || '',
    product_type: product?.product_type || '',
    status: product?.status || 'draft',
    tags: product?.tags || '',
    price: v.price || '',
    compare_at_price: v.compare_at_price || '',
    sku: v.sku || '',
    inventory_quantity: v.inventory_quantity ?? '',
  });
  const [imageUrl, setImageUrl] = useState('');
  const [saving, setSaving] = useState(false);

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.title.trim()) {
      toast({ title: 'Title required', variant: 'error' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        body_html: form.body_html,
        vendor: form.vendor,
        product_type: form.product_type,
        status: form.status,
        tags: form.tags,
        variants: [{
          ...(v.variantId ? { id: Number(v.variantId) } : (v.id ? { id: v.id } : {})),
          price: form.price || undefined,
          compare_at_price: form.compare_at_price || undefined,
          sku: form.sku || undefined,
          inventory_quantity: form.inventory_quantity === '' ? undefined : Number(form.inventory_quantity),
          inventory_management: 'shopify',
        }],
      };
      let saved;
      if (isNew) {
        saved = await api(`/products?storeId=${encodeURIComponent(storeId)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product: payload }),
        });
      } else {
        const shopifyId = product.productId || product.id;
        saved = await api(`/products/${shopifyId}?storeId=${encodeURIComponent(storeId)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ product: payload }),
        });
      }
      // Attach image if URL provided
      if (imageUrl.trim() && saved?.product?.id) {
        try {
          await api(`/products/${saved.product.id}/images?storeId=${encodeURIComponent(storeId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ image: { src: imageUrl.trim() } }),
          });
        } catch (e) { toast({ title: 'Saved, but image upload failed', description: e.message, variant: 'warn' }); }
      }
      toast({ title: isNew ? 'Product created' : 'Product updated', variant: 'success' });
      onSaved();
    } catch (e) {
      toast({ title: 'Save failed', description: e.message, variant: 'error' });
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose} data-testid="product-editor">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0a0a0f] shadow-2xl"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06] sticky top-0 bg-[#0a0a0f] z-10">
          <div>
            <div className="text-[10px] font-mono tracking-widest text-emerald-300 uppercase">{isNew ? 'New product' : 'Edit product'}</div>
            <div className="text-lg font-semibold text-white">{form.title || 'Untitled'}</div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5" data-testid="editor-close"><X className="w-5 h-5 text-white/60" /></button>
        </div>

        <div className="p-6 space-y-5">
          <Field label="Title">
            <input data-testid="editor-title" value={form.title} onChange={set('title')} className="input" placeholder="Premium hydration serum" />
          </Field>
          <Field label="Description">
            <textarea data-testid="editor-description" value={form.body_html} onChange={set('body_html')} rows={5} className="input resize-y" placeholder="HTML allowed" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vendor"><input data-testid="editor-vendor" value={form.vendor} onChange={set('vendor')} className="input" /></Field>
            <Field label="Product type"><input data-testid="editor-product-type" value={form.product_type} onChange={set('product_type')} className="input" /></Field>
            <Field label="Status">
              <select data-testid="editor-status" value={form.status} onChange={set('status')} className="input">
                <option value="active">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
            </Field>
            <Field label="Tags (comma-separated)"><input data-testid="editor-tags" value={form.tags} onChange={set('tags')} className="input" /></Field>
            <Field label={`Price (${currency || 'USD'})`}><input data-testid="editor-price" value={form.price} onChange={set('price')} className="input" placeholder="29.00" /></Field>
            <Field label={`Compare-at price (${currency || 'USD'})`}><input data-testid="editor-compare-price" value={form.compare_at_price} onChange={set('compare_at_price')} className="input" placeholder="49.00" /></Field>
            <Field label="SKU"><input data-testid="editor-sku" value={form.sku} onChange={set('sku')} className="input" /></Field>
            <Field label="Inventory quantity"><input data-testid="editor-inventory" type="number" value={form.inventory_quantity} onChange={set('inventory_quantity')} className="input" /></Field>
          </div>
          <Field label="Image URL (optional — will be attached after save)">
            <input data-testid="editor-image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="input" placeholder="https://cdn.example.com/image.jpg" />
          </Field>
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-white/[0.06] sticky bottom-0 bg-[#0a0a0f]">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-white/60 hover:text-white text-sm">Cancel</button>
          <button
            data-testid="editor-save-btn"
            onClick={save}
            disabled={saving}
            className="px-5 py-2 rounded-lg bg-gradient-to-br from-emerald-400 to-green-500 text-emerald-950 font-semibold text-sm flex items-center gap-2 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {isNew ? 'Create product' : 'Save changes'}
          </button>
        </div>
        <style jsx>{`
          .input {
            width: 100%; padding: 10px 12px; border-radius: 10px;
            background: rgba(0,0,0,0.4); border: 1px solid rgba(255,255,255,0.08);
            color: white; font-size: 13px; outline: none; transition: border-color .15s;
          }
          .input:focus { border-color: rgba(52,211,153,0.5); }
        `}</style>
      </motion.div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <div className="text-[10px] font-mono tracking-widest text-white/40 uppercase mb-1.5">{label}</div>
      {children}
    </label>
  );
}

// ============================================================================
// ORDERS TAB
// ============================================================================
function OrdersTab({ api, storeId, currency, toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState('');
  const [fin, setFin] = useState('');
  const [ful, setFul] = useState('');
  const [syncing, setSyncing] = useState(false);
  const PAGE = 50;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ storeId, page: String(page), limit: String(PAGE) });
      if (q) params.set('q', q);
      if (fin) params.set('financialStatus', fin);
      if (ful) params.set('fulfillmentStatus', ful);
      const d = await api(`/orders?${params.toString()}`);
      setItems(d.orders || []);
      setTotal(d.total || 0); setHasMore(d.hasMore || false);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [api, storeId, page, q, fin, ful]);

  useEffect(() => { load(); }, [load]);

  const resync = async () => {
    setSyncing(true);
    try {
      const r = await api(`/sync/orders?storeId=${encodeURIComponent(storeId)}`, { method: 'POST' });
      toast({ title: 'Orders synced', description: `${r?.result?.orders || 0} orders`, variant: 'success' });
      setPage(1); load();
    } catch (e) { toast({ title: 'Sync failed', description: e.message, variant: 'error' }); }
    finally { setSyncing(false); }
  };

  return (
    <div className="px-8 py-6" data-testid="orders-tab">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
          <input data-testid="orders-search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search by order #, email or customer" className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/30 focus:border-emerald-400/40 outline-none" />
        </div>
        <select data-testid="orders-financial-filter" value={fin} onChange={(e) => { setFin(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm text-white outline-none focus:border-emerald-400/40">
          <option value="">Any payment</option>
          <option value="paid">Paid</option><option value="pending">Pending</option><option value="refunded">Refunded</option><option value="partially_paid">Partially paid</option><option value="voided">Voided</option>
        </select>
        <select data-testid="orders-fulfillment-filter" value={ful} onChange={(e) => { setFul(e.target.value); setPage(1); }} className="px-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm text-white outline-none focus:border-emerald-400/40">
          <option value="">Any fulfillment</option>
          <option value="fulfilled">Fulfilled</option><option value="partial">Partial</option><option value="unfulfilled">Unfulfilled</option>
        </select>
        <button data-testid="refresh-orders-btn" onClick={load} className="px-3 py-2.5 rounded-lg border border-white/10 text-white/70 hover:text-white text-xs flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        <button data-testid="resync-orders-btn" onClick={resync} disabled={syncing} className="px-3 py-2.5 rounded-lg border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 text-xs flex items-center gap-1.5 disabled:opacity-50"><RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} /> {syncing ? 'Re-syncing…' : 'Re-sync from Shopify'}</button>
      </div>

      {loading ? <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
        : error ? <ErrorBlock message={error} onRetry={load} />
        : items.length === 0 ? <EmptyState icon={ShoppingCart} text="No orders yet — click Re-sync to import" />
        : (
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] border-b border-white/[0.06]"><tr>{['Order', 'Customer', 'Items', 'Total', 'Payment', 'Fulfillment', 'Date'].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono tracking-widest text-white/40 uppercase">{h}</th>)}</tr></thead>
              <tbody>
                {items.map(o => {
                  const total = o.totalPrice ?? o.total_price;
                  const curr = o.currency || currency;
                  const finS = o.financialStatus ?? o.financial_status;
                  const fulS = o.fulfillmentStatus ?? o.fulfillment_status;
                  const cName = o.customerName || (o.customer ? `${o.customer.first_name || ''} ${o.customer.last_name || ''}`.trim() : '') || o.customerEmail || o.email || 'Guest';
                  const created = o.createdAtShopify ?? o.created_at;
                  const items = o.lineItemCount ?? (o.line_items || []).length;
                  return (
                    <tr key={o.orderId || o.id} data-testid={`order-row-${o.orderId || o.id}`} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-white">{o.name || `#${o.orderId || o.id}`}</td>
                      <td className="px-4 py-3 text-white/70">{cName}</td>
                      <td className="px-4 py-3 text-white/60">{items}</td>
                      <td className="px-4 py-3 text-white font-medium">{money(total, curr)}</td>
                      <td className="px-4 py-3"><Badge text={finS} variant={finS === 'paid' ? 'success' : 'warn'} /></td>
                      <td className="px-4 py-3"><Badge text={fulS || 'unfulfilled'} variant={fulS === 'fulfilled' ? 'success' : 'muted'} /></td>
                      <td className="px-4 py-3 text-white/50 text-xs">{created ? new Date(created).toLocaleDateString() : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      <Pagination page={page} total={total} pageSize={PAGE} hasMore={hasMore} onChange={setPage} loading={loading} />
    </div>
  );
}

// ============================================================================
// CUSTOMERS TAB
// ============================================================================
function CustomersTab({ api, storeId, currency, toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [q, setQ] = useState('');
  const [syncing, setSyncing] = useState(false);
  const PAGE = 50;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ storeId, page: String(page), limit: String(PAGE) });
      if (q) params.set('q', q);
      const d = await api(`/customers?${params.toString()}`);
      setItems(d.customers || []);
      setTotal(d.total || 0); setHasMore(d.hasMore || false);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [api, storeId, page, q]);

  useEffect(() => { load(); }, [load]);

  const resync = async () => {
    setSyncing(true);
    try {
      const r = await api(`/sync/customers?storeId=${encodeURIComponent(storeId)}`, { method: 'POST' });
      toast({ title: 'Customers synced', description: `${r?.result?.customers || 0} customers`, variant: 'success' });
      setPage(1); load();
    } catch (e) { toast({ title: 'Sync failed', description: e.message, variant: 'error' }); }
    finally { setSyncing(false); }
  };

  return (
    <div className="px-8 py-6" data-testid="customers-tab">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-white/30 absolute left-3 top-1/2 -translate-y-1/2" />
          <input data-testid="customers-search" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search by name, email or phone" className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-black/40 border border-white/10 text-sm text-white placeholder:text-white/30 focus:border-emerald-400/40 outline-none" />
        </div>
        <button data-testid="refresh-customers-btn" onClick={load} className="px-3 py-2.5 rounded-lg border border-white/10 text-white/70 hover:text-white text-xs flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        <button data-testid="resync-customers-btn" onClick={resync} disabled={syncing} className="px-3 py-2.5 rounded-lg border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 text-xs flex items-center gap-1.5 disabled:opacity-50"><RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} /> {syncing ? 'Re-syncing…' : 'Re-sync from Shopify'}</button>
      </div>

      {loading ? <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
        : error ? <ErrorBlock message={error} onRetry={load} />
        : items.length === 0 ? <EmptyState icon={Users} text="No customers yet — click Re-sync to import" />
        : (
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] border-b border-white/[0.06]"><tr>{['Customer', 'Email', 'Phone', 'Orders', 'Spend', 'Tags', 'Joined'].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono tracking-widest text-white/40 uppercase">{h}</th>)}</tr></thead>
              <tbody>
                {items.map(c => {
                  const first = c.firstName ?? c.first_name;
                  const last = c.lastName ?? c.last_name;
                  const orders = c.ordersCount ?? c.orders_count;
                  const spent = c.totalSpent ?? c.total_spent;
                  const created = c.createdAtShopify ?? c.created_at;
                  return (
                    <tr key={c.customerId || c.id} data-testid={`customer-row-${c.customerId || c.id}`} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-3 text-white">{`${first || ''} ${last || ''}`.trim() || '—'}</td>
                      <td className="px-4 py-3 text-white/70 text-xs">{c.email || '—'}</td>
                      <td className="px-4 py-3 text-white/60 text-xs">{c.phone || '—'}</td>
                      <td className="px-4 py-3 text-white/60">{orders || 0}</td>
                      <td className="px-4 py-3 text-white font-medium">{money(spent, c.currency || currency)}</td>
                      <td className="px-4 py-3 text-white/50 text-xs truncate max-w-[160px]">{c.tags || '—'}</td>
                      <td className="px-4 py-3 text-white/50 text-xs">{created ? new Date(created).toLocaleDateString() : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      <Pagination page={page} total={total} pageSize={PAGE} hasMore={hasMore} onChange={setPage} loading={loading} />
    </div>
  );
}

// ============================================================================
// COLLECTIONS TAB
// ============================================================================
function CollectionsTab({ api, storeId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await api(`/collections?storeId=${encodeURIComponent(storeId)}&limit=100`);
      setItems(d.collections || []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [api, storeId]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>;
  if (error) return <ErrorBlock message={error} onRetry={load} />;
  if (items.length === 0) return <EmptyState icon={Layers} text="No collections yet" />;

  return (
    <div className="px-8 py-6" data-testid="collections-tab">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map(c => (
          <div key={`${c.kind}-${c.id}`} data-testid={`collection-card-${c.id}`} className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-4 hover:bg-white/[0.04] transition">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-lg bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
                {c.image?.src ? <img src={c.image.src} alt="" className="w-full h-full object-cover" /> : <Layers className="w-5 h-5 text-white/30" />}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-white font-medium truncate">{c.title}</div>
                <div className="text-[10px] font-mono tracking-widest text-white/40 uppercase mt-1">{c.kind} · {c.products_count ?? '—'} products</div>
              </div>
            </div>
            {c.body_html && (
              <div className="text-xs text-white/50 mt-3 line-clamp-2" dangerouslySetInnerHTML={{ __html: c.body_html.replace(/<[^>]+>/g, ' ').slice(0, 160) }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// INVENTORY TAB
// ============================================================================
function InventoryTab({ api, storeId, currency, toast }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [lowOnly, setLowOnly] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const PAGE = 100;

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const params = new URLSearchParams({ storeId, page: String(page), limit: String(PAGE) });
      if (lowOnly) params.set('lowStock', '1');
      const d = await api(`/inventory?${params.toString()}`);
      setItems(d.inventory || []);
      setTotal(d.total || 0); setHasMore(d.hasMore || false);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [api, storeId, page, lowOnly]);

  useEffect(() => { load(); }, [load]);

  const resync = async () => {
    setSyncing(true);
    try {
      const r = await api(`/sync/inventory?storeId=${encodeURIComponent(storeId)}`, { method: 'POST' });
      toast({ title: 'Inventory synced', description: `${r?.result?.levels || 0} levels`, variant: 'success' });
      setPage(1); load();
    } catch (e) { toast({ title: 'Sync failed', description: e.message, variant: 'error' }); }
    finally { setSyncing(false); }
  };

  return (
    <div className="px-8 py-6" data-testid="inventory-tab">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <button data-testid="inventory-low-toggle" onClick={() => { setLowOnly(!lowOnly); setPage(1); }} className={cn('px-3 py-2.5 rounded-lg border text-xs flex items-center gap-1.5', lowOnly ? 'bg-amber-500/10 border-amber-500/30 text-amber-200' : 'border-white/10 text-white/70 hover:text-white')}><AlertCircle className="w-3.5 h-3.5" /> {lowOnly ? 'Showing low stock only' : 'Show low stock only'}</button>
        <div className="flex-1" />
        <button data-testid="refresh-inventory-btn" onClick={load} className="px-3 py-2.5 rounded-lg border border-white/10 text-white/70 hover:text-white text-xs flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5" /> Refresh</button>
        <button data-testid="resync-inventory-btn" onClick={resync} disabled={syncing} className="px-3 py-2.5 rounded-lg border border-emerald-500/30 text-emerald-200 hover:bg-emerald-500/10 text-xs flex items-center gap-1.5 disabled:opacity-50"><RefreshCw className={cn('w-3.5 h-3.5', syncing && 'animate-spin')} /> {syncing ? 'Re-syncing…' : 'Re-sync from Shopify'}</button>
      </div>

      {loading ? <div className="p-12 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>
        : error ? <ErrorBlock message={error} onRetry={load} />
        : items.length === 0 ? <EmptyState icon={Package} text={lowOnly ? 'No low stock items 🎉' : 'No inventory items'} />
        : (
          <div className="rounded-xl border border-white/[0.06] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-white/[0.03] border-b border-white/[0.06]"><tr>{['Product', 'Variant', 'SKU', 'Price', 'On hand', 'Policy'].map(h => <th key={h} className="text-left px-4 py-3 text-[10px] font-mono tracking-widest text-white/40 uppercase">{h}</th>)}</tr></thead>
              <tbody>
                {items.map(it => {
                  const qty = it.available ?? it.inventoryQuantity ?? 0;
                  return (
                    <tr key={`${it.variantId || it.inventoryItemId}-${it.locationId || ''}`} data-testid={`inventory-row-${it.variantId || it.inventoryItemId}`} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02]">
                      <td className="px-4 py-3"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-md bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center shrink-0">{it.productImage ? <img src={it.productImage} alt="" className="w-full h-full object-cover" /> : <ImageIcon className="w-3 h-3 text-white/30" />}</div><span className="text-white truncate max-w-xs">{it.productTitle}</span></div></td>
                      <td className="px-4 py-3 text-white/70 text-xs">{it.variantTitle || '—'}</td>
                      <td className="px-4 py-3 text-white/50 text-xs font-mono">{it.sku || '—'}</td>
                      <td className="px-4 py-3 text-white/70">{it.price ? money(it.price, currency) : '—'}</td>
                      <td className="px-4 py-3"><span className={cn('font-medium', qty <= 5 ? 'text-rose-300' : qty <= 20 ? 'text-amber-300' : 'text-emerald-300')}>{fmt(qty)}</span></td>
                      <td className="px-4 py-3 text-white/50 text-xs">{it.inventoryPolicy || 'deny'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      <Pagination page={page} total={total} pageSize={PAGE} hasMore={hasMore} onChange={setPage} loading={loading} />
    </div>
  );
}

// ============================================================================
// SHARED COMPONENTS
// ============================================================================
function ErrorBlock({ message, onRetry }) {
  return (
    <div className="p-8 rounded-xl border border-rose-500/20 bg-rose-500/5 text-rose-200 text-sm flex items-center gap-3" data-testid="commerce-error">
      <AlertCircle className="w-5 h-5 shrink-0" />
      <div className="flex-1">{message}</div>
      {onRetry && <button onClick={onRetry} className="px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-xs">Retry</button>}
    </div>
  );
}

function EmptyState({ icon: Icon, text }) {
  return (
    <div className="p-16 flex flex-col items-center text-center" data-testid="commerce-empty">
      <div className="w-16 h-16 rounded-2xl border border-white/10 flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-white/30" />
      </div>
      <div className="text-white/50 text-sm">{text}</div>
    </div>
  );
}

function Badge({ text, variant = 'muted' }) {
  const styles = {
    success: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
    warn: 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    error: 'bg-rose-500/10 text-rose-300 border-rose-500/20',
    muted: 'bg-white/5 text-white/50 border-white/10',
  };
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono tracking-widest uppercase border', styles[variant] || styles.muted)}>
      {text || '—'}
    </span>
  );
}

// ============================================================================
// MAIN ENTRY
// ============================================================================
export default function CommerceHubView({ apiFetch, toast }) {
  const api = useShopifyApi(apiFetch);
  const [stores, setStores] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const [tab, setTab] = useState('dashboard');
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Load stores
  const loadStores = useCallback(async () => {
    try {
      const d = await api('/stores');
      setStores(d.stores || []);
      if ((d.stores || []).length > 0 && !activeId) {
        setActiveId(d.stores[0].id);
      }
    } catch (e) {
      toast({ title: 'Could not load stores', description: e.message, variant: 'error' });
      setStores([]);
    }
  }, [api, activeId, toast]);

  useEffect(() => { loadStores(); }, []); // eslint-disable-line

  // Handle ?shopify_connected=1 callback
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.get('shopify_connected') === '1') {
      toast({ title: 'Shopify connected', description: params.get('shop'), variant: 'success' });
      const url = new URL(window.location.href);
      url.searchParams.delete('shopify_connected');
      url.searchParams.delete('shop');
      window.history.replaceState({}, '', url.toString());
      loadStores();
    }
  }, []); // eslint-disable-line

  const connect = async (shop) => {
    if (!shop) return;
    setConnecting(true);
    try {
      const d = await api(`/auth/install?shop=${encodeURIComponent(shop)}`);
      if (d.installUrl) {
        window.location.href = d.installUrl;
      } else {
        throw new Error('Could not start install flow');
      }
    } catch (e) {
      toast({ title: 'Connect failed', description: e.message, variant: 'error' });
      setConnecting(false);
    }
  };

  const syncNow = async () => {
    if (!activeId) return;
    setSyncing(true);
    try {
      await api(`/stores/${activeId}/sync`, { method: 'POST' });
      toast({ title: 'Store synced', variant: 'success' });
      loadStores();
    } catch (e) {
      toast({ title: 'Sync failed', description: e.message, variant: 'error' });
    } finally { setSyncing(false); }
  };

  const disconnect = async () => {
    if (!activeId) return;
    const store = stores.find(s => s.id === activeId);
    if (!confirm(`Disconnect ${store?.shopDomain}? You can reconnect at any time.`)) return;
    try {
      await api(`/stores/${activeId}`, { method: 'DELETE' });
      toast({ title: 'Store disconnected', variant: 'success' });
      setActiveId(null);
      loadStores();
    } catch (e) {
      toast({ title: 'Disconnect failed', description: e.message, variant: 'error' });
    }
  };

  // Loading
  if (stores === null) {
    return <div className="p-16 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-emerald-400" /></div>;
  }

  // Onboarding (no stores OR user explicitly wants to add)
  if (stores.length === 0 || showOnboarding) {
    return (
      <div>
        {stores.length > 0 && (
          <div className="px-8 pt-6">
            <button onClick={() => setShowOnboarding(false)} className="text-xs text-white/50 hover:text-white flex items-center gap-1" data-testid="back-to-hub-btn">
              ← Back to Commerce Hub
            </button>
          </div>
        )}
        <OnboardingScreen onConnect={connect} connecting={connecting} />
      </div>
    );
  }

  const activeStore = stores.find(s => s.id === activeId) || stores[0];
  const currency = activeStore?.syncStats?.currency || 'USD';

  return (
    <div data-testid="commerce-hub-view">
      <StoreHeader
        stores={stores}
        activeStore={activeStore}
        onSelect={(s) => setActiveId(s.id)}
        onSync={syncNow}
        onDisconnect={disconnect}
        onAddStore={() => setShowOnboarding(true)}
        syncing={syncing}
      />
      <TabBar active={tab} onChange={setTab} />
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {tab === 'dashboard' && <DashboardTab api={api} storeId={activeStore.id} currency={currency} />}
          {tab === 'products' && <ProductsTab api={api} storeId={activeStore.id} currency={currency} toast={toast} />}
          {tab === 'orders' && <OrdersTab api={api} storeId={activeStore.id} currency={currency} toast={toast} />}
          {tab === 'customers' && <CustomersTab api={api} storeId={activeStore.id} currency={currency} toast={toast} />}
          {tab === 'collections' && <CollectionsTab api={api} storeId={activeStore.id} />}
          {tab === 'inventory' && <InventoryTab api={api} storeId={activeStore.id} currency={currency} toast={toast} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
