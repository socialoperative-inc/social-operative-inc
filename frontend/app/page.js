'use client';

import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Target, ShoppingBag, MessageCircle, Sparkles, Search,
  BarChart3, Workflow, Upload, Settings, Bell, ChevronDown, Plus, Send,
  Zap, TrendingUp, Activity, Database, Cpu, Globe, Image as ImageIcon,
  Trash2, Copy, Check, Loader2, Bookmark, Play, ArrowUpRight, Sparkle,
  Shield, Brain, Rocket, Eye, Command, Menu, X, LogOut, Mail, Lock, User,
  AlertCircle, Wifi, WifiOff, Download, Store
} from 'lucide-react';
import {
  LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, AreaChart, Area,
  BarChart, Bar, PieChart, Pie, Cell
} from 'recharts';
import MetaAdsIntelligenceView from '../components/meta-ads/MetaAdsIntelligenceView';
import CommerceHubView from '../components/commerce-hub/CommerceHubView';

// ============================================================================
// AUTH CONTEXT
// ============================================================================
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

const STORAGE_KEY = 'so-auth-session-v1';

function loadSession() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s?.session?.expires_at && s.session.expires_at * 1000 < Date.now() + 60000) return null;
    return s;
  } catch (e) { return null; }
}

function saveSession(s) {
  if (typeof window === 'undefined') return;
  if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  else localStorage.removeItem(STORAGE_KEY);
}

function AuthProvider({ children }) {
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = loadSession();
    if (s) setAuth(s);
    setLoading(false);
  }, []);

  // Auto-refresh session
  useEffect(() => {
    if (!auth?.session?.refresh_token) return;
    const expiresMs = (auth.session.expires_at * 1000) - Date.now();
    const refreshIn = Math.max(expiresMs - 5 * 60 * 1000, 30 * 1000); // refresh 5 min before expiry, min 30s
    const t = setTimeout(async () => {
      try {
        const r = await fetch('/api/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: auth.session.refresh_token }),
        });
        if (r.ok) {
          const d = await r.json();
          setAuth(d); saveSession(d);
        } else {
          logout();
        }
      } catch (e) {}
    }, refreshIn);
    return () => clearTimeout(t);
  }, [auth]);

  const login = async (email, password) => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Login failed');
    setAuth(d); saveSession(d);
    return d;
  };

  const signup = async (email, password, name) => {
    const r = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Signup failed');
    setAuth(d); saveSession(d);
    return d;
  };

  const logout = () => { setAuth(null); saveSession(null); };

  // Authenticated fetch helper
  const apiFetch = useCallback(async (url, opts = {}) => {
    const headers = { ...(opts.headers || {}) };
    if (auth?.session?.access_token) headers['Authorization'] = `Bearer ${auth.session.access_token}`;
    return fetch(url, { ...opts, headers });
  }, [auth]);

  return (
    <AuthContext.Provider value={{ auth, user: auth?.user, loading, login, signup, logout, apiFetch }}>
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================================
// CONFIG
// ============================================================================
const AGENTS = {
  'meta-ads': {
    id: 'meta-ads', name: 'Meta Ads Intelligence', short: 'Meta Ads', icon: Target,
    color: 'from-blue-500 to-cyan-400', accent: '#3b82f6',
    tagline: 'AI marketing strategist for Meta/Facebook/Instagram ads',
    quickPrompts: [
      'Generate 5 viral ad hooks for a premium skincare product targeting women 25-40',
      'Write a high-converting Facebook ad copy for a $97 ebook on AI productivity',
      'Suggest audience targeting and lookalike strategies for a luxury watch brand',
      'Analyze why a CTR of 0.8% is underperforming and recommend 3 fixes',
    ],
  },
  'commerce': {
    id: 'commerce', name: 'Commerce Intelligence', short: 'Commerce', icon: ShoppingBag,
    color: 'from-purple-500 to-pink-400', accent: '#a855f7',
    tagline: 'AI-powered e-commerce conversion optimization',
    quickPrompts: [
      'Write a high-converting product description for a wireless noise-cancelling headphone, $249',
      'Generate 3 bundle offer ideas for a coffee brand selling beans, grinder, and mug',
      'Create an SEO-optimized title and bullets for "ergonomic office chair"',
      'Build a 5-email abandoned cart sequence for a fashion DTC brand',
    ],
  },
  'support': {
    id: 'support', name: 'Support Operative', short: 'Support', icon: MessageCircle,
    color: 'from-emerald-500 to-teal-400', accent: '#10b981',
    tagline: 'AI customer support and communication specialist',
    quickPrompts: [
      'Customer is angry their order is 5 days late. Write 3 reply variants.',
      'Reply to a COD refusal: customer says "I want to see product before paying"',
      'Draft a refund approval email that keeps the customer loyal',
      'Write a WhatsApp reply to: "Where is my order?? Been 10 days!!"',
    ],
  },
  'content': {
    id: 'content', name: 'Content Studio', short: 'Content', icon: Sparkles,
    color: 'from-amber-500 to-orange-400', accent: '#f59e0b',
    tagline: 'AI creative content generation system',
    quickPrompts: [
      'Generate 10 viral Reel hooks for a fitness coach selling a 12-week program',
      'Write a UGC script for a skincare serum highlighting before/after',
      'Create a 7-day content calendar for a sustainable fashion brand',
      'Write 5 Instagram captions in a luxury minimalist tone for a watch launch',
    ],
  },
  'competitor': {
    id: 'competitor', name: 'Competitor Intelligence', short: 'Competitor', icon: Search,
    color: 'from-rose-500 to-red-400', accent: '#f43f5e',
    tagline: 'AI competitor research and market intelligence',
    quickPrompts: [
      'Analyze Glossier as a competitor in premium skincare. Give a strategic breakdown.',
      'What angles are winning right now in the supplements niche?',
      'Compare pricing strategies of Allbirds vs Cariuma sneakers',
      'Identify market gaps in the AI productivity tools space',
    ],
  },
};

const MODELS = [
  { id: 'deepseek/deepseek-chat', label: 'DeepSeek Chat', tier: 'Fast' },
  { id: 'anthropic/claude-3.5-sonnet', label: 'Claude 3.5 Sonnet', tier: 'Premium' },
  { id: 'openai/gpt-4o', label: 'GPT-4o', tier: 'Premium' },
  { id: 'openai/gpt-4o-mini', label: 'GPT-4o Mini', tier: 'Fast' },
  { id: 'google/gemini-2.0-flash-exp:free', label: 'Gemini 2.0 Flash', tier: 'Free' },
  { id: 'meta-llama/llama-3.3-70b-instruct', label: 'Llama 3.3 70B', tier: 'Open' },
];

const SIDEBAR_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'meta-ads', label: 'Meta Ads Intelligence', icon: Target },
  { id: 'commerce', label: 'Commerce Intelligence', icon: ShoppingBag },
  { id: 'support', label: 'Support Operative', icon: MessageCircle },
  { id: 'content', label: 'Content Studio', icon: Sparkles },
  { id: 'competitor', label: 'Competitor Intelligence', icon: Search },
  { id: 'commerce-hub', label: 'Commerce Hub', icon: Store },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'workflows', label: 'Workflows', icon: Workflow },
  { id: 'uploads', label: 'Upload Center', icon: Upload },
  { id: 'settings', label: 'Settings', icon: Settings },
];

const cn = (...a) => a.filter(Boolean).join(' ');
const fmt = (n) => new Intl.NumberFormat('en-US').format(n);

// ============================================================================
// TOAST SYSTEM
// ============================================================================
const ToastContext = createContext(null);
function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((toast) => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, ...toast }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), toast.duration || 4500);
  }, []);
  return (
    <ToastContext.Provider value={{ toast: push }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] space-y-2 max-w-sm">
        <AnimatePresence>
          {toasts.map(t => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, x: 30 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 30 }}
              className={cn(
                'glass rounded-lg p-3 pr-4 flex items-start gap-2.5 shadow-xl border',
                t.type === 'error' ? 'border-rose-500/40' : t.type === 'success' ? 'border-emerald-500/40' : 'border-white/10'
              )}
            >
              {t.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" /> :
                t.type === 'success' ? <Check className="w-4 h-4 text-emerald-400 mt-0.5 shrink-0" /> :
                <Bell className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />}
              <div className="text-xs text-white/90">{t.message}</div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
const useToast = () => useContext(ToastContext);

// ============================================================================
// ERROR BOUNDARY
// ============================================================================
import React from 'react';
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('UI error:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#050507]">
          <div className="max-w-md glass rounded-2xl p-6 text-center">
            <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
            <div className="text-lg font-semibold mb-2">Something went wrong</div>
            <div className="text-xs text-white/60 mb-4 break-words font-mono">{String(this.state.error?.message || this.state.error)}</div>
            <button onClick={() => { this.setState({ error: null }); window.location.reload(); }} className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm">Reload</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

// ============================================================================
// SHARED
// ============================================================================
function PulseDot({ color = 'bg-emerald-400' }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      <span className={cn('absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping', color)}></span>
      <span className={cn('relative inline-flex rounded-full h-2 w-2', color)}></span>
    </span>
  );
}

// ============================================================================
// AUTH PAGES (Login / Signup)
// ============================================================================
function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { login, signup } = useAuth();

  const submit = async (e) => {
    e?.preventDefault();
    setError(''); setLoading(true);
    try {
      if (mode === 'login') await login(email, password);
      else await signup(email, password, name);
    } catch (err) {
      setError(err.message || 'Authentication failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-grid bg-radial-glow flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="relative mb-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-2xl shadow-blue-500/40">
              <Sparkle className="w-7 h-7 text-white" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-emerald-400 border-[3px] border-[#050507] pulse-dot"></div>
          </div>
          <div className="text-xl font-bold tracking-tight">Social Operative <span className="gradient-text">Inc.</span></div>
          <div className="text-[11px] text-white/40 font-mono tracking-widest mt-1">AI COMMERCE INTELLIGENCE · MISSION CONTROL</div>
        </div>

        <div className="glass-strong rounded-2xl p-6 md:p-8 neon-border">
          <div className="flex items-center gap-2 mb-1">
            <PulseDot />
            <div className="text-[10px] text-white/40 font-mono uppercase tracking-widest">Secure Access</div>
          </div>
          <h2 className="text-2xl font-bold mb-1">{mode === 'login' ? 'Welcome back, Operative' : 'Activate your console'}</h2>
          <p className="text-sm text-white/50 mb-6">{mode === 'login' ? 'Sign in to enter the mission control.' : 'Create your AI commerce operating system.'}</p>

          <form onSubmit={submit} className="space-y-3">
            {mode === 'signup' && (
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input
                  type="text" placeholder="Your name" value={name} onChange={e => setName(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:bg-white/5 transition"
                />
              </div>
            )}
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="email" required placeholder="you@brand.com" value={email} onChange={e => setEmail(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:bg-white/5 transition"
              />
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="password" required placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 focus:bg-white/5 transition"
              />
            </div>

            {error && (
              <motion.div initial={{ opacity: 0, y: -5 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                <AlertCircle className="w-4 h-4 text-rose-400 mt-0.5 shrink-0" />
                <div className="text-xs text-rose-200">{error}</div>
              </motion.div>
            )}

            <button
              type="submit" disabled={loading}
              className={cn(
                'w-full py-3 rounded-lg text-sm font-semibold transition relative overflow-hidden',
                loading ? 'bg-white/10 text-white/40' : 'bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white glow-blue hover:shadow-2xl hover:shadow-blue-500/40'
              )}
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : (mode === 'login' ? 'Sign In to Mission Control' : 'Create Operative Account')}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-white/5 text-center text-xs text-white/50">
            {mode === 'login' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }} className="text-blue-400 hover:text-blue-300 font-medium">
              {mode === 'login' ? 'Sign up' : 'Sign in'}
            </button>
          </div>
        </div>

        <div className="mt-6 text-center text-[10px] text-white/30 font-mono tracking-widest">
          POWERED BY SUPABASE AUTH · OPENROUTER AI · ENCRYPTED · 99.98% UPTIME
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// TOP NAV
// ============================================================================
function TopNav({ model, setModel, agentName, onMenuClick, onLogout, userName }) {
  return (
    <div className="h-16 px-4 md:px-6 flex items-center justify-between border-b border-white/5 glass-strong sticky top-0 z-30">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button onClick={onMenuClick} className="lg:hidden p-2 rounded-lg hover:bg-white/5">
          <Menu className="w-5 h-5 text-white/70" />
        </button>
        <div className="hidden md:flex items-center gap-2">
          <div className="px-2.5 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-white/70 font-medium flex items-center gap-1.5">
            <Database className="w-3 h-3 text-blue-400" />
            Workspace: <span className="text-white">Acme DTC</span>
            <ChevronDown className="w-3 h-3" />
          </div>
          <div className="text-xs text-white/40">/ <span className="text-white/70">{agentName}</span></div>
        </div>

        <div className="flex-1 max-w-xl mx-2 md:mx-4 relative hidden md:block">
          <div className="relative">
            <Command className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text" placeholder="Ask AI anything across your operations..."
              className="w-full pl-9 pr-16 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 transition"
            />
            <kbd className="absolute right-2 top-1/2 -translate-y-1/2 hidden md:inline-flex h-5 px-1.5 items-center rounded border border-white/10 text-[10px] text-white/40">⌘K</kbd>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 md:gap-3">
        <select value={model} onChange={(e) => setModel(e.target.value)}
          className="hidden md:block bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white/80 focus:outline-none focus:border-blue-500/50">
          {MODELS.map(m => <option key={m.id} value={m.id} className="bg-[#0a0a10]">{m.label} · {m.tier}</option>)}
        </select>
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
          <PulseDot />
          <span className="text-[11px] text-white/70 font-medium">Operational</span>
        </div>
        <button className="relative p-2 rounded-lg hover:bg-white/5 transition">
          <Bell className="w-4 h-4 text-white/70" />
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-blue-400 rounded-full"></span>
        </button>
        <div className="relative group">
          <button className="flex items-center gap-2 pl-2 md:pl-3 md:border-l md:border-white/10">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-purple-500 flex items-center justify-center text-xs font-semibold">
              {(userName || 'OP').slice(0, 2).toUpperCase()}
            </div>
          </button>
          <div className="absolute right-0 top-full mt-1 w-48 glass-strong rounded-lg border border-white/10 p-1 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition">
            <div className="px-3 py-2 border-b border-white/5 mb-1">
              <div className="text-xs font-medium truncate">{userName}</div>
              <div className="text-[10px] text-white/40">Operative</div>
            </div>
            <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 rounded text-xs hover:bg-white/5 text-rose-300">
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SIDEBAR
// ============================================================================
function Sidebar({ active, onChange, mobileOpen, onMobileClose }) {
  const content = (
    <>
      <div className="h-16 px-5 flex items-center gap-3 border-b border-white/5">
        <div className="relative">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Sparkle className="w-5 h-5 text-white" />
          </div>
          <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#0a0a10] pulse-dot"></div>
        </div>
        <div className="leading-tight flex-1">
          <div className="text-sm font-bold tracking-tight">Social Operative</div>
          <div className="text-[10px] text-white/40 font-mono tracking-widest">INC. · MISSION CONTROL</div>
        </div>
        <button className="lg:hidden p-1.5 rounded hover:bg-white/5" onClick={onMobileClose}>
          <X className="w-4 h-4 text-white/60" />
        </button>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto no-scrollbar">
        <div className="text-[10px] uppercase tracking-widest text-white/30 px-3 mb-2 font-semibold">Mission Control</div>
        {SIDEBAR_ITEMS.slice(0, 1).map(item => (
          <NavItem key={item.id} item={item} active={active === item.id} onClick={() => { onChange(item.id); onMobileClose?.(); }} />
        ))}
        <div className="text-[10px] uppercase tracking-widest text-white/30 px-3 mt-5 mb-2 font-semibold">AI Agents</div>
        {SIDEBAR_ITEMS.slice(1, 6).map(item => (
          <NavItem key={item.id} item={item} active={active === item.id} onClick={() => { onChange(item.id); onMobileClose?.(); }} />
        ))}
        <div className="text-[10px] uppercase tracking-widest text-white/30 px-3 mt-5 mb-2 font-semibold">Operations</div>
        {SIDEBAR_ITEMS.slice(6).map(item => (
          <NavItem key={item.id} item={item} active={active === item.id} onClick={() => { onChange(item.id); onMobileClose?.(); }} />
        ))}
      </nav>

      <div className="p-3 border-t border-white/5">
        <div className="glass rounded-xl p-3 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-purple-500/10"></div>
          <div className="relative">
            <div className="flex items-center gap-2 mb-1">
              <Brain className="w-3.5 h-3.5 text-blue-400" />
              <div className="text-xs font-semibold">AI Engine</div>
            </div>
            <div className="text-[10px] text-white/50 mb-2">OpenRouter · Multi-model</div>
            <div className="flex items-center justify-between">
              <PulseDot />
              <span className="text-[10px] text-emerald-400 font-mono">ONLINE</span>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-white/5 glass-strong flex-col h-screen sticky top-0">
        {content}
      </aside>
      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={onMobileClose} className="lg:hidden fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" />
            <motion.aside
              initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }} transition={{ type: 'spring', damping: 28 }}
              className="lg:hidden fixed left-0 top-0 bottom-0 w-72 glass-strong border-r border-white/5 z-50 flex flex-col">
              {content}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

function NavItem({ item, active, onClick }) {
  const Icon = item.icon;
  return (
    <button onClick={onClick} className={cn(
      'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 relative group',
      active ? 'bg-white/5 text-white' : 'text-white/55 hover:text-white hover:bg-white/[0.03]'
    )}>
      {active && (
        <motion.div layoutId="sidebar-active"
          className="absolute inset-0 rounded-lg bg-gradient-to-r from-blue-500/15 via-purple-500/10 to-transparent border border-blue-500/20"
          transition={{ type: 'spring', stiffness: 400, damping: 30 }} />
      )}
      <Icon className={cn('w-4 h-4 relative z-10', active && 'text-blue-400')} />
      <span className="relative z-10 font-medium">{item.label}</span>
      {active && <div className="ml-auto w-1 h-4 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.8)] relative z-10"></div>}
    </button>
  );
}

// ============================================================================
// STAT CARD
// ============================================================================
function StatCard({ label, value, delta, icon: Icon, accent, prefix = '', suffix = '' }) {
  const positive = delta >= 0;
  return (
    <motion.div whileHover={{ y: -2 }} className="relative glass rounded-xl p-4 overflow-hidden group">
      <div className={cn('absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20 group-hover:opacity-40 transition-opacity', accent)}></div>
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className="text-[11px] uppercase tracking-wider text-white/40 font-semibold">{label}</div>
          <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', accent)}>
            <Icon className="w-3.5 h-3.5 text-white" />
          </div>
        </div>
        <div className="text-xl md:text-2xl font-bold tracking-tight">{prefix}{typeof value === 'number' ? fmt(value) : value}{suffix}</div>
        {delta !== 0 && (
          <div className="flex items-center gap-1 mt-2 text-[11px]">
            <span className={cn('flex items-center gap-0.5 font-semibold', positive ? 'text-emerald-400' : 'text-rose-400')}>
              <TrendingUp className={cn('w-3 h-3', !positive && 'rotate-180')} />
              {positive ? '+' : ''}{delta}%
            </span>
            <span className="text-white/40">vs last period</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================================================
// DASHBOARD VIEW
// ============================================================================
function DashboardView({ onAgentSelect }) {
  const { apiFetch } = useAuth();
  const [stats, setStats] = useState(null);

  const loadStats = useCallback(async () => {
    try {
      const r = await apiFetch('/api/stats');
      const d = await r.json();
      setStats(d);
    } catch (e) {}
  }, [apiFetch]);

  useEffect(() => {
    loadStats();
    const t = setInterval(loadStats, 12000);
    return () => clearInterval(t);
  }, [loadStats]);

  const m = stats?.metrics;
  const activity = stats?.recentActivity || [];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs text-white/40 mb-2 font-mono">
            <PulseDot />
            <span className="tracking-widest">LIVE · MISSION CONTROL</span>
          </div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
            Welcome back, <span className="gradient-text">Operative</span>.
          </h1>
          <p className="text-white/50 text-sm mt-1">Your AI operations are running at peak performance.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70 hover:bg-white/10 transition flex items-center gap-2">
            <Eye className="w-3.5 h-3.5" /> Last 30 days
          </button>
          <button onClick={() => onAgentSelect('meta-ads')} className="px-3 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-xs text-blue-300 hover:bg-blue-500/30 transition flex items-center gap-2 glow-blue">
            <Rocket className="w-3.5 h-3.5" /> Launch Operation
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {m ? (
          <>
            <StatCard label={m.revenue.label} value={m.revenue.value} delta={m.revenue.delta} icon={TrendingUp} accent="bg-emerald-500" prefix="$" />
            <StatCard label={m.roas.label} value={m.roas.value} delta={m.roas.delta} icon={Zap} accent="bg-blue-500" suffix="x" />
            <StatCard label={m.conversions.label} value={m.conversions.value} delta={m.conversions.delta} icon={Target} accent="bg-purple-500" />
            <StatCard label={m.aiCalls.label} value={m.aiCalls.value} delta={m.aiCalls.delta} icon={Cpu} accent="bg-pink-500" />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-28 rounded-xl shimmer"></div>)
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div>
              <div className="text-xs text-white/40 font-mono uppercase tracking-widest mb-1">Revenue Intelligence</div>
              <div className="text-base md:text-lg font-semibold">Revenue vs Spend · 14d</div>
            </div>
            <div className="flex gap-2 text-[11px]">
              <span className="flex items-center gap-1.5 text-white/60"><span className="w-2 h-2 rounded-full bg-blue-400"></span> Revenue</span>
              <span className="flex items-center gap-1.5 text-white/60"><span className="w-2 h-2 rounded-full bg-purple-400"></span> Ad Spend</span>
            </div>
          </div>
          <div className="h-56 md:h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats?.revenueSeries || []}>
                <defs>
                  <linearGradient id="grad-rev" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="grad-spend" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#a855f7" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#a855f7" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" stroke="#ffffff20" tick={{ fill: '#ffffff60', fontSize: 10 }} />
                <YAxis stroke="#ffffff20" tick={{ fill: '#ffffff60', fontSize: 10 }} />
                <Tooltip contentStyle={{ background: '#0a0a10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#grad-rev)" />
                <Area type="monotone" dataKey="spend" stroke="#a855f7" strokeWidth={2} fill="url(#grad-spend)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass rounded-2xl p-4 md:p-5 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-xs text-white/40 font-mono uppercase tracking-widest mb-1">AI Activity Stream</div>
              <div className="text-base md:text-lg font-semibold flex items-center gap-2">Live Operations <PulseDot /></div>
            </div>
          </div>
          <div className="space-y-2 flex-1 overflow-y-auto max-h-64 pr-1">
            {activity.length === 0 ? (
              <div className="text-xs text-white/40 text-center py-8">Waiting for AI operations…</div>
            ) : activity.map((a, i) => (
              <motion.div key={a.id || i} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }}
                className="flex items-start gap-2.5 p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/5 transition border border-white/5">
                <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500/30 to-purple-500/30 flex items-center justify-center shrink-0 mt-0.5">
                  <Activity className="w-3.5 h-3.5 text-blue-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-white/90 truncate font-medium">{a.summary || a.type}</div>
                  <div className="text-[10px] text-white/40 flex items-center gap-1.5 mt-0.5">
                    <span className="font-mono uppercase">{a.agent}</span>
                    <span>·</span>
                    <span>{new Date(a.ts).toLocaleTimeString()}</span>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <AgentPanel agentKey="meta-ads" onSelect={onAgentSelect}
          metric="ROAS 4.82x" label="Campaigns: 12 active · 3 scaling"
          insight="2 winning creative angles detected. Recommend scaling top performer +30% budget." />
        <AgentPanel agentKey="commerce" onSelect={onAgentSelect}
          metric="CVR 3.41%" label="142 products · 28 optimized today"
          insight="'Aero Headphones' showing 18% conversion lift after AI title rewrite." />
        <AgentPanel agentKey="support" onSelect={onAgentSelect}
          metric="98% CSAT" label="47 tickets · avg 1.2min response"
          insight="Sentiment trending +12% positive. 3 angry escalations resolved by AI." />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">AI Recommendations</div>
            <span className="text-[10px] text-white/40 font-mono">5 NEW</span>
          </div>
          <div className="space-y-2">
            {[
              { icon: TrendingUp, text: 'Scale "Skincare Reel A" — projected +$8.2K/wk', color: 'text-emerald-400' },
              { icon: Target, text: 'Audience saturation on Campaign 7. Refresh recommended.', color: 'text-amber-400' },
              { icon: ShoppingBag, text: 'Bundle "Headphone + Case" — 23% AOV uplift potential.', color: 'text-purple-400' },
              { icon: MessageCircle, text: '12 customer questions match FAQ. Enable auto-reply?', color: 'text-blue-400' },
            ].map((r, i) => (
              <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02] hover:bg-white/5 transition border border-white/5">
                <r.icon className={cn('w-4 h-4 mt-0.5 shrink-0', r.color)} />
                <div className="text-xs text-white/80 leading-relaxed">{r.text}</div>
                <ArrowUpRight className="w-3.5 h-3.5 text-white/30 shrink-0 mt-0.5" />
              </div>
            ))}
          </div>
        </div>

        <div className="glass rounded-2xl p-4 md:p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-sm font-semibold">Operational Health</div>
            <PulseDot />
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'AI Engine', status: 'OPERATIONAL', value: '99.98%', icon: Brain },
              { label: 'Database', status: 'HEALTHY', value: '8ms', icon: Database },
              { label: 'Auth', status: 'ACTIVE', value: 'Supabase', icon: Shield },
              { label: 'Storage', status: 'SECURED', value: 'Supabase', icon: Upload },
            ].map((h, i) => (
              <div key={i} className="glass rounded-xl p-3 border border-white/5">
                <div className="flex items-center justify-between mb-2">
                  <h.icon className="w-3.5 h-3.5 text-blue-400" />
                  <PulseDot />
                </div>
                <div className="text-[10px] uppercase tracking-wider text-white/40 font-semibold">{h.label}</div>
                <div className="text-sm font-semibold">{h.value}</div>
                <div className="text-[10px] text-emerald-400 font-mono">{h.status}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AgentPanel({ agentKey, onSelect, metric, label, insight }) {
  const agent = AGENTS[agentKey];
  const Icon = agent.icon;
  return (
    <motion.button whileHover={{ y: -3 }} onClick={() => onSelect(agentKey)}
      className="text-left glass rounded-2xl p-4 md:p-5 relative overflow-hidden group">
      <div className={cn('absolute -top-20 -right-20 w-40 h-40 rounded-full blur-3xl opacity-30 bg-gradient-to-br', agent.color)}></div>
      <div className="relative">
        <div className="flex items-center justify-between mb-3">
          <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center bg-gradient-to-br', agent.color)}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-[10px] font-mono text-white/40 uppercase tracking-widest">{metric}</span>
        </div>
        <div className="text-sm font-semibold mb-1">{agent.name}</div>
        <div className="text-[11px] text-white/50 mb-3">{label}</div>
        <div className="text-xs text-white/80 leading-relaxed border-l-2 border-blue-500/40 pl-3 italic">{insight}</div>
        <div className="flex items-center gap-1 text-[11px] text-blue-400 mt-3 font-medium">
          Open Agent <ArrowUpRight className="w-3 h-3 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition" />
        </div>
      </div>
    </motion.button>
  );
}

// ============================================================================
// AGENT VIEW
// ============================================================================
function AgentView({ agentKey, model }) {
  const agent = AGENTS[agentKey];
  const Icon = agent.icon;
  const { apiFetch } = useAuth();
  const { toast } = useToast();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [convId, setConvId] = useState(null);
  const [history, setHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [attachedImages, setAttachedImages] = useState([]);
  const scrollRef = useRef(null);

  useEffect(() => {
    setMessages([]); setConvId(null); setAttachedImages([]);
    loadHistory();
  }, [agentKey]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const loadHistory = async () => {
    try {
      const r = await apiFetch(`/api/conversations?agent=${agentKey}`);
      if (r.ok) {
        const d = await r.json();
        setHistory(d.conversations || []);
      }
    } catch (e) {}
  };

  const sendMessage = async (text, imageUrls = null) => {
    if ((!text.trim() && (!imageUrls || imageUrls.length === 0)) || streaming) return;
    const images = imageUrls || attachedImages.map(a => a.publicUrl);
    const userMsg = { role: 'user', content: text, images };
    const newMessages = [...messages, userMsg, { role: 'assistant', content: '' }];
    setMessages(newMessages);
    setInput(''); setAttachedImages([]);
    setStreaming(true);

    try {
      const res = await apiFetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, { role: 'user', content: text }].map(m => ({ role: m.role, content: m.content })),
          model, agent: agentKey, conversationId: convId,
          images: images.length > 0 ? images : undefined,
        }),
      });

      const cid = res.headers.get('X-Conversation-Id');
      if (cid && !convId) setConvId(cid);

      if (!res.ok || !res.body) {
        const t = await res.text();
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: `⚠ ${t}` };
          return copy;
        });
        toast({ type: 'error', message: t.slice(0, 100) });
        setStreaming(false); return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages(prev => {
          const copy = [...prev];
          copy[copy.length - 1] = { role: 'assistant', content: acc };
          return copy;
        });
      }

      if (cid || convId) {
        try {
          await apiFetch('/api/chat/save', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId: cid || convId, role: 'assistant', content: acc }),
          });
        } catch (e) {}
      }
    } catch (e) {
      setMessages(prev => {
        const copy = [...prev];
        copy[copy.length - 1] = { role: 'assistant', content: `⚠ Connection error: ${e.message}` };
        return copy;
      });
      toast({ type: 'error', message: 'AI request failed. Retry?' });
    } finally {
      setStreaming(false);
      loadHistory();
    }
  };

  const handleFile = async (file) => {
    if (!file) return;
    try {
      const dataUrl = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result);
        r.onerror = rej;
        r.readAsDataURL(file);
      });
      const r = await apiFetch('/api/uploads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: file.name, type: file.type, dataUrl, tag: agentKey, size: file.size }),
      });
      const d = await r.json();
      if (r.ok && d.upload?.publicUrl) {
        setAttachedImages(prev => [...prev, d.upload]);
        toast({ type: 'success', message: 'Image uploaded' });
      } else {
        toast({ type: 'error', message: d.error || 'Upload failed' });
      }
    } catch (e) {
      toast({ type: 'error', message: e.message });
    }
  };

  const loadConversation = async (id) => {
    const r = await apiFetch(`/api/conversations/${id}`);
    if (r.ok) {
      const d = await r.json();
      if (d.conversation) { setMessages(d.conversation.messages || []); setConvId(id); }
    }
    setShowHistory(false);
  };

  return (
    <div className="flex h-[calc(100vh-4rem)]">
      {/* Desktop history */}
      <div className="hidden md:flex w-64 shrink-0 border-r border-white/5 glass-strong p-3 overflow-y-auto flex-col">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-widest text-white/40 font-semibold">History</div>
          <button onClick={() => { setMessages([]); setConvId(null); }} className="p-1 rounded hover:bg-white/10">
            <Plus className="w-3.5 h-3.5 text-white/60" />
          </button>
        </div>
        <div className="space-y-1">
          {history.length === 0 && <div className="text-[11px] text-white/30 px-2 py-3">No conversations yet.</div>}
          {history.map(h => (
            <button key={h.id} onClick={() => loadConversation(h.id)}
              className={cn('w-full text-left px-2 py-2 rounded-lg text-[11px] hover:bg-white/5 transition',
                convId === h.id && 'bg-white/5 border border-white/10')}>
              <div className="text-white/90 truncate">{h.messages?.[0]?.content?.slice(0, 60) || 'New chat'}</div>
              <div className="text-[10px] text-white/40 mt-0.5">{new Date(h.updatedAt).toLocaleString()}</div>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <div className="px-4 md:px-6 py-4 border-b border-white/5 flex items-center justify-between glass-strong">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => setShowHistory(!showHistory)} className="md:hidden p-1.5 rounded hover:bg-white/5">
              <Menu className="w-4 h-4 text-white/60" />
            </button>
            <div className={cn('w-9 h-9 md:w-10 md:h-10 rounded-xl flex items-center justify-center bg-gradient-to-br shrink-0', agent.color)}>
              <Icon className="w-4 h-4 md:w-5 md:h-5 text-white" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold flex items-center gap-2 text-sm md:text-base truncate">{agent.name} <PulseDot /></div>
              <div className="text-xs text-white/50 truncate hidden sm:block">{agent.tagline}</div>
            </div>
          </div>
          <label className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-white/70 hover:bg-white/10 transition cursor-pointer flex items-center gap-2 shrink-0">
            <ImageIcon className="w-3.5 h-3.5" /> <span className="hidden sm:inline">Upload</span>
            <input type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>
        </div>

        {/* Mobile history drawer */}
        <AnimatePresence>
          {showHistory && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="md:hidden absolute inset-0 top-16 z-20 glass-strong p-4 overflow-y-auto">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs uppercase tracking-widest text-white/40 font-semibold">History</div>
                <button onClick={() => { setMessages([]); setConvId(null); setShowHistory(false); }}
                  className="text-xs text-blue-400 flex items-center gap-1"><Plus className="w-3 h-3" /> New</button>
              </div>
              {history.length === 0 && <div className="text-xs text-white/40">No conversations yet.</div>}
              {history.map(h => (
                <button key={h.id} onClick={() => loadConversation(h.id)} className="w-full text-left p-3 rounded-lg hover:bg-white/5 mb-1 border border-white/5">
                  <div className="text-xs text-white/90 truncate">{h.messages?.[0]?.content?.slice(0, 80) || 'New chat'}</div>
                  <div className="text-[10px] text-white/40 mt-0.5">{new Date(h.updatedAt).toLocaleString()}</div>
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {messages.length === 0 ? (
            <WelcomePanel agent={agent} onPick={sendMessage} />
          ) : (
            messages.map((m, i) => <ChatBubble key={i} message={m} agent={agent} isLast={i === messages.length - 1} streaming={streaming} />)
          )}
        </div>

        <div className="p-3 md:p-4 border-t border-white/5 glass-strong">
          {attachedImages.length > 0 && (
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {attachedImages.map((img, i) => (
                <div key={i} className="flex items-center gap-2 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                  <img src={img.publicUrl} alt="" className="w-8 h-8 rounded object-cover" />
                  <span className="text-[11px] text-white/70 truncate max-w-[120px]">{img.name}</span>
                  <button onClick={() => setAttachedImages(p => p.filter((_, idx) => idx !== i))} className="text-white/40 hover:text-white">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="relative">
            <textarea
              value={input} onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(input); } }}
              placeholder={`Ask ${agent.short}…`}
              rows={2}
              className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-4 py-3 pr-14 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-blue-500/50 resize-none"
            />
            <button onClick={() => sendMessage(input)} disabled={streaming || (!input.trim() && attachedImages.length === 0)}
              className={cn('absolute right-2 bottom-2 w-9 h-9 rounded-lg flex items-center justify-center transition',
                streaming || (!input.trim() && attachedImages.length === 0) ? 'bg-white/5 text-white/30' : 'bg-gradient-to-br from-blue-500 to-purple-500 text-white glow-blue')}>
              {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-white/30 font-mono">
            <span className="truncate">MODEL: {model}</span>
            <span>{streaming ? 'STREAMING…' : 'READY'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function WelcomePanel({ agent, onPick }) {
  const Icon = agent.icon;
  return (
    <div className="max-w-3xl mx-auto py-6 md:py-8">
      <div className="text-center mb-6 md:mb-8">
        <div className={cn('w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center bg-gradient-to-br mx-auto mb-4 glow-blue', agent.color)}>
          <Icon className="w-7 h-7 md:w-8 md:h-8 text-white" />
        </div>
        <h2 className="text-xl md:text-2xl font-bold mb-2">{agent.name}</h2>
        <p className="text-white/50 text-sm">{agent.tagline}</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {agent.quickPrompts.map((p, i) => (
          <motion.button key={i} whileHover={{ y: -2 }} onClick={() => onPick(p)}
            className="text-left glass rounded-xl p-4 hover:border-blue-500/30 hover:bg-white/5 transition group border border-white/5">
            <div className="text-xs text-white/85 leading-relaxed">{p}</div>
            <div className="flex items-center gap-1 text-[10px] text-blue-400 mt-2 font-medium opacity-0 group-hover:opacity-100 transition">
              Run prompt <ArrowUpRight className="w-3 h-3" />
            </div>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

function ChatBubble({ message, agent, isLast, streaming }) {
  const [copied, setCopied] = useState(false);
  const isUser = message.role === 'user';
  const Icon = agent.icon;
  const copyContent = () => { navigator.clipboard.writeText(message.content); setCopied(true); setTimeout(() => setCopied(false), 2000); };

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={cn('flex gap-2 md:gap-3', isUser ? 'justify-end' : 'justify-start')}>
      {!isUser && (
        <div className={cn('w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0 bg-gradient-to-br', agent.color)}>
          <Icon className="w-3.5 h-3.5 md:w-4 md:h-4 text-white" />
        </div>
      )}
      <div className={cn('max-w-[88%] md:max-w-[80%] rounded-2xl px-3 md:px-4 py-2.5 md:py-3',
        isUser ? 'bg-blue-500/15 border border-blue-500/30' : 'glass border border-white/5')}>
        {message.images?.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-2">
            {message.images.map((url, i) => (
              <img key={i} src={url} alt="" className="max-w-[160px] max-h-[160px] rounded-lg border border-white/10" />
            ))}
          </div>
        )}
        <div className="text-sm whitespace-pre-wrap leading-relaxed text-white/95 break-words">
          {message.content || (isLast && streaming ? (
            <span className="inline-flex gap-1">
              <span className="w-2 h-2 bg-blue-400 rounded-full blink"></span>
              <span className="w-2 h-2 bg-blue-400 rounded-full blink" style={{ animationDelay: '0.2s' }}></span>
              <span className="w-2 h-2 bg-blue-400 rounded-full blink" style={{ animationDelay: '0.4s' }}></span>
            </span>
          ) : '')}
        </div>
        {!isUser && message.content && (
          <div className="flex items-center gap-2 mt-2 pt-2 border-t border-white/5">
            <button onClick={copyContent} className="text-[10px] text-white/40 hover:text-white flex items-center gap-1">
              {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        )}
      </div>
      {isUser && (
        <div className="w-7 h-7 md:w-8 md:h-8 rounded-lg flex items-center justify-center shrink-0 bg-white/10">
          <div className="text-[10px] font-semibold">SO</div>
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// ANALYTICS VIEW
// ============================================================================
function AnalyticsView() {
  const { apiFetch } = useAuth();
  const [stats, setStats] = useState(null);
  useEffect(() => { apiFetch('/api/stats').then(r => r.json()).then(setStats).catch(() => {}); }, [apiFetch]);

  const usageData = [
    { agent: 'Meta Ads', calls: 412 },
    { agent: 'Commerce', calls: 318 },
    { agent: 'Support', calls: 287 },
    { agent: 'Content', calls: 526 },
    { agent: 'Competitor', calls: 174 },
  ];
  const modelData = [
    { name: 'DeepSeek', value: 48, color: '#3b82f6' },
    { name: 'Claude', value: 22, color: '#a855f7' },
    { name: 'GPT-4o', value: 18, color: '#ec4899' },
    { name: 'Gemini', value: 12, color: '#f59e0b' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <div className="text-xs text-white/40 font-mono uppercase tracking-widest mb-2">Analytics · Operational Intelligence</div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Analytics Hub</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <StatCard label="Total AI Ops" value={1717} delta={34.2} icon={Cpu} accent="bg-blue-500" />
        <StatCard label="Revenue Impact" value="$92.4K" delta={18.7} icon={TrendingUp} accent="bg-emerald-500" />
        <StatCard label="Time Saved" value="384h" delta={42.1} icon={Zap} accent="bg-purple-500" />
        <StatCard label="Avg Response" value="1.2s" delta={-12.3} icon={Activity} accent="bg-pink-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 glass rounded-2xl p-4 md:p-5">
          <div className="text-sm font-semibold mb-4">AI Operations by Agent</div>
          <div className="h-64 md:h-72">
            <ResponsiveContainer>
              <BarChart data={usageData}>
                <XAxis dataKey="agent" stroke="#ffffff20" tick={{ fill: '#ffffff60', fontSize: 11 }} />
                <YAxis stroke="#ffffff20" tick={{ fill: '#ffffff60', fontSize: 11 }} />
                <Tooltip contentStyle={{ background: '#0a0a10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
                <defs>
                  <linearGradient id="bar-grad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
                <Bar dataKey="calls" fill="url(#bar-grad)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="glass rounded-2xl p-4 md:p-5">
          <div className="text-sm font-semibold mb-4">Model Distribution</div>
          <div className="h-56 md:h-72 flex items-center justify-center">
            <ResponsiveContainer>
              <PieChart>
                <Pie data={modelData} dataKey="value" innerRadius={50} outerRadius={90} paddingAngle={3}>
                  {modelData.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0a0a10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {modelData.map(m => (
              <div key={m.name} className="flex items-center gap-2 text-xs">
                <span className="w-2 h-2 rounded-full" style={{ background: m.color }}></span>
                <span className="text-white/70">{m.name}</span>
                <span className="text-white/40 ml-auto">{m.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-4 md:p-5">
        <div className="text-sm font-semibold mb-4">Revenue Trend · 14d</div>
        <div className="h-56 md:h-64">
          <ResponsiveContainer>
            <LineChart data={stats?.revenueSeries || []}>
              <XAxis dataKey="day" stroke="#ffffff20" tick={{ fill: '#ffffff60', fontSize: 10 }} />
              <YAxis stroke="#ffffff20" tick={{ fill: '#ffffff60', fontSize: 10 }} />
              <Tooltip contentStyle={{ background: '#0a0a10', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8 }} />
              <Line type="monotone" dataKey="revenue" stroke="#60a5fa" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="spend" stroke="#a855f7" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// WORKFLOWS VIEW
// ============================================================================
function WorkflowsView() {
  const { apiFetch } = useAuth();
  const [workflows, setWorkflows] = useState([]);
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState({ name: '', type: 'ai-task', schedule: 'manual' });

  const load = async () => {
    try {
      const r = await apiFetch('/api/workflows');
      if (r.ok) { const d = await r.json(); setWorkflows(d.workflows || []); }
    } catch (e) {}
  };
  useEffect(() => { load(); const t = setInterval(load, 5000); return () => clearInterval(t); }, []);

  const create = async () => {
    if (!form.name) return;
    await apiFetch('/api/workflows', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
    setShowNew(false); setForm({ name: '', type: 'ai-task', schedule: 'manual' });
    load();
  };
  const run = async (id) => { await apiFetch(`/api/workflows/run/${id}`, { method: 'POST' }); load(); };

  const TEMPLATES = [
    { type: 'meta-scrape', label: 'Meta Ads Library Scrape', icon: Target, color: 'from-blue-500 to-cyan-500', desc: 'Scrape competitor ads via Playwright' },
    { type: 'shopify-sync', label: 'Shopify Product Sync', icon: ShoppingBag, color: 'from-purple-500 to-pink-500', desc: 'Auto-optimize new product listings' },
    { type: 'whatsapp-auto', label: 'WhatsApp Auto-Reply', icon: MessageCircle, color: 'from-emerald-500 to-teal-500', desc: 'AI-powered customer reply automation' },
    { type: 'content-cal', label: 'Content Calendar', icon: Sparkles, color: 'from-amber-500 to-orange-500', desc: 'Weekly content scheduling' },
    { type: 'competitor-watch', label: 'Competitor Watch', icon: Search, color: 'from-rose-500 to-red-500', desc: 'Monitor competitor brand changes' },
    { type: 'ai-task', label: 'Custom AI Task', icon: Brain, color: 'from-indigo-500 to-violet-500', desc: 'Run scheduled AI prompt' },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs text-white/40 font-mono uppercase tracking-widest mb-2">Workflow Automation</div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Automation Center</h1>
          <p className="text-white/50 text-sm mt-1">Operational AI workflows running on autopilot.</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 text-white text-sm font-medium flex items-center gap-2 glow-blue">
          <Plus className="w-4 h-4" /> New Workflow
        </button>
      </div>

      <AnimatePresence>
        {showNew && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="glass rounded-2xl p-4 md:p-5">
            <div className="text-sm font-semibold mb-3">Choose a template</div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-4">
              {TEMPLATES.map(t => (
                <button key={t.type} onClick={() => setForm({ ...form, type: t.type, name: t.label })}
                  className={cn('text-left p-3 rounded-xl border transition', form.type === t.type ? 'border-blue-500/50 bg-blue-500/10' : 'border-white/10 hover:bg-white/5')}>
                  <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br mb-2', t.color)}>
                    <t.icon className="w-4 h-4 text-white" />
                  </div>
                  <div className="text-xs font-semibold">{t.label}</div>
                  <div className="text-[10px] text-white/50 mt-0.5">{t.desc}</div>
                </button>
              ))}
            </div>
            <div className="flex flex-col md:flex-row gap-3">
              <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Workflow name" className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
              <select value={form.schedule} onChange={e => setForm({ ...form, schedule: e.target.value })} className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
                <option value="manual" className="bg-[#0a0a10]">Manual</option>
                <option value="hourly" className="bg-[#0a0a10]">Hourly</option>
                <option value="daily" className="bg-[#0a0a10]">Daily</option>
                <option value="weekly" className="bg-[#0a0a10]">Weekly</option>
              </select>
              <button onClick={create} className="px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-medium">Create</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {workflows.length === 0 && (
          <div className="col-span-full glass rounded-2xl p-10 text-center text-white/40 text-sm">
            No workflows yet. Create your first automation to begin.
          </div>
        )}
        {workflows.map(w => (
          <div key={w.id} className="glass rounded-2xl p-4">
            <div className="flex items-start justify-between mb-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold truncate">{w.name}</div>
                <div className="text-[11px] text-white/40 font-mono uppercase tracking-wider mt-0.5">{w.type}</div>
              </div>
              <span className={cn('text-[10px] px-2 py-0.5 rounded-full font-mono uppercase shrink-0',
                w.status === 'running' ? 'bg-blue-500/20 text-blue-300' : w.status === 'completed' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-white/5 text-white/50')}>
                {w.status}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-white/50 mb-3">
              <span>Schedule: {w.schedule}</span>
              <span>Runs: {w.runs}</span>
            </div>
            <button onClick={() => run(w.id)} className="w-full py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-blue-500/20 hover:border-blue-500/30 transition text-xs font-medium flex items-center justify-center gap-2">
              <Play className="w-3 h-3" /> Execute Now
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// UPLOAD CENTER
// ============================================================================
function UploadView() {
  const { apiFetch } = useAuth();
  const { toast } = useToast();
  const [uploads, setUploads] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    try {
      const r = await apiFetch('/api/uploads');
      if (r.ok) { const d = await r.json(); setUploads(d.uploads || []); }
    } catch (e) {}
  };
  useEffect(() => { load(); }, []);

  const handleFiles = async (files) => {
    setUploading(true);
    for (const file of files) {
      try {
        const dataUrl = await new Promise((res, rej) => {
          const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file);
        });
        const r = await apiFetch('/api/uploads', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: file.name, type: file.type, dataUrl, tag: 'general', size: file.size }),
        });
        if (r.ok) { toast({ type: 'success', message: `Uploaded ${file.name}` }); }
        else { const d = await r.json(); toast({ type: 'error', message: d.error || 'Upload failed' }); }
      } catch (e) {
        toast({ type: 'error', message: e.message });
      }
    }
    setUploading(false);
    load();
  };

  const remove = async (id) => {
    await apiFetch(`/api/uploads/${id}`, { method: 'DELETE' });
    load();
  };

  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6">
      <div>
        <div className="text-xs text-white/40 font-mono uppercase tracking-widest mb-2">Upload Center · Supabase Storage</div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Asset Vault</h1>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); handleFiles(Array.from(e.dataTransfer.files)); }}
        className={cn('glass rounded-2xl border-2 border-dashed p-8 md:p-12 text-center transition-all',
          dragging ? 'border-blue-500/50 bg-blue-500/5 glow-blue' : 'border-white/10')}>
        {uploading ? <Loader2 className="w-10 h-10 mx-auto mb-4 text-blue-400 animate-spin" /> :
          <Upload className="w-10 h-10 md:w-12 md:h-12 mx-auto mb-4 text-white/40" />}
        <div className="text-base md:text-lg font-semibold mb-2">Drag & drop creatives, screenshots, or product images</div>
        <div className="text-xs md:text-sm text-white/50 mb-4">PNG · JPG · WEBP · SVG · multi-file · stored on Supabase</div>
        <label className="inline-flex px-4 py-2 rounded-lg bg-blue-500/20 border border-blue-500/30 text-blue-300 text-sm font-medium cursor-pointer hover:bg-blue-500/30 transition">
          Browse Files
          <input type="file" multiple accept="image/*" className="hidden" onChange={(e) => handleFiles(Array.from(e.target.files))} />
        </label>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {uploads.map(u => (
          <div key={u.id} className="glass rounded-xl p-2 group relative">
            <div className="aspect-square rounded-lg bg-white/5 overflow-hidden flex items-center justify-center">
              {u.publicUrl ? <img src={u.publicUrl} alt={u.name} className="w-full h-full object-cover" /> : <ImageIcon className="w-8 h-8 text-white/30" />}
            </div>
            <div className="text-[11px] mt-2 truncate font-medium">{u.name}</div>
            <div className="text-[10px] text-white/40 flex items-center justify-between">
              <span className="font-mono uppercase">{u.tag}</span>
              <span>{Math.round((u.size || 0) / 1024)}KB</span>
            </div>
            <button onClick={() => remove(u.id)} className="absolute top-3 right-3 p-1 rounded bg-rose-500/80 opacity-0 group-hover:opacity-100 transition">
              <Trash2 className="w-3 h-3 text-white" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// SETTINGS VIEW
// ============================================================================
function SettingsView({ model, setModel, user, onLogout }) {
  return (
    <div className="p-4 md:p-6 space-y-4 md:space-y-6 max-w-4xl">
      <div>
        <div className="text-xs text-white/40 font-mono uppercase tracking-widest mb-2">Settings</div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">Workspace Settings</h1>
      </div>

      <div className="glass rounded-2xl p-5 md:p-6 space-y-4">
        <div className="text-sm font-semibold">Account</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-white/60 mb-1.5 block">Name</label>
            <input defaultValue={user?.name || ''} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="text-xs text-white/60 mb-1.5 block">Email</label>
            <input value={user?.email || ''} disabled className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white/60" />
          </div>
        </div>
        <button onClick={onLogout} className="text-xs text-rose-300 hover:text-rose-200 flex items-center gap-2 mt-2">
          <LogOut className="w-3.5 h-3.5" /> Sign out
        </button>
      </div>

      <div className="glass rounded-2xl p-5 md:p-6 space-y-4">
        <div className="text-sm font-semibold">AI Engine</div>
        <div>
          <label className="text-xs text-white/60 mb-2 block">Default Model</label>
          <select value={model} onChange={e => setModel(e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm">
            {MODELS.map(m => <option key={m.id} value={m.id} className="bg-[#0a0a10]">{m.label} · {m.tier}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs text-white/60 mb-2 block">System Status</label>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {[
              { label: 'OpenRouter', status: 'Connected' },
              { label: 'Supabase Auth', status: 'Active' },
              { label: 'Supabase Storage', status: 'Active' },
              { label: 'MongoDB', status: 'Healthy' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2 p-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                <PulseDot />
                <div>
                  <div className="text-[10px] text-white/50 font-mono uppercase">{s.label}</div>
                  <div className="text-xs text-emerald-300">{s.status}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="glass rounded-2xl p-5 md:p-6 space-y-4">
        <div className="text-sm font-semibold">Theme</div>
        <div className="flex gap-3">
          <button className="flex-1 p-3 rounded-lg bg-[#050507] border-2 border-blue-500/50">
            <div className="text-xs font-medium">Mission Control · Dark</div>
            <div className="text-[10px] text-white/40 mt-1">Active</div>
          </button>
          <button disabled className="flex-1 p-3 rounded-lg bg-white/5 border border-white/10 opacity-50 cursor-not-allowed">
            <div className="text-xs font-medium">Light</div>
            <div className="text-[10px] text-white/40 mt-1">Coming soon</div>
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// MAIN APP (gated by auth)
// ============================================================================
function MainApp() {
  const { user, logout, apiFetch } = useAuth();
  const { toast } = useToast();
  const [view, setView] = useState('dashboard');
  const [model, setModel] = useState('deepseek/deepseek-chat');
  const [mobileSidebar, setMobileSidebar] = useState(false);

  const activeAgent = AGENTS[view];
  const viewName = activeAgent?.name || SIDEBAR_ITEMS.find(s => s.id === view)?.label || 'Dashboard';

  return (
    <div className="flex min-h-screen bg-grid bg-radial-glow">
      <Sidebar active={view} onChange={setView} mobileOpen={mobileSidebar} onMobileClose={() => setMobileSidebar(false)} />
      <main className="flex-1 min-w-0 flex flex-col">
        <TopNav model={model} setModel={setModel} agentName={viewName}
          onMenuClick={() => setMobileSidebar(true)} onLogout={logout} userName={user?.name} />
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
              {view === 'dashboard' && <DashboardView onAgentSelect={setView} />}
              {view === 'meta-ads' && (
                <MetaAdsIntelligenceView
                  apiFetch={apiFetch}
                  toast={toast}
                  AgentChat={<AgentView agentKey="meta-ads" model={model} />}
                />
              )}
              {AGENTS[view] && view !== 'meta-ads' && <AgentView agentKey={view} model={model} />}
              {view === 'commerce-hub' && <CommerceHubView apiFetch={apiFetch} toast={toast} />}
              {view === 'analytics' && <AnalyticsView />}
              {view === 'workflows' && <WorkflowsView />}
              {view === 'uploads' && <UploadView />}
              {view === 'settings' && <SettingsView model={model} setModel={setModel} user={user} onLogout={logout} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

// ============================================================================
// ROOT
// ============================================================================
function AppShell() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#050507]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
          <div className="text-xs text-white/40 font-mono tracking-widest">INITIALIZING MISSION CONTROL…</div>
        </div>
      </div>
    );
  }
  if (!user) return <AuthScreen />;
  return <MainApp />;
}

const App = () => (
  <ErrorBoundary>
    <ToastProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ToastProvider>
  </ErrorBoundary>
);

export default App;
