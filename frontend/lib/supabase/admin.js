// Server-only Supabase admin client (uses service_role key)
// Hardened for Vercel serverless runtime
import { createClient } from '@supabase/supabase-js';

let _admin = null;

export function getSupabaseAdmin() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || typeof url !== 'string' || !serviceKey || typeof serviceKey !== 'string') {
    throw new Error('Supabase admin env missing (NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY)');
  }
  // On Vercel/Node 20, supabase-js can crash trying to init realtime websockets.
  // We don't use realtime here — disable it by setting no transport-dependent params.
  _admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    realtime: { params: { eventsPerSecond: 0 } },
    global: { headers: { 'X-Client-Info': 'social-operative-server' } },
  });
  return _admin;
}

// Verify a user JWT from the Authorization header
export async function verifySupabaseToken(token) {
  if (!token || typeof token !== 'string' || token.length < 10) return null;
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    return {
      id: data.user.id,
      email: data.user.email,
      name: data.user.user_metadata?.name || (data.user.email ? data.user.email.split('@')[0] : 'user'),
    };
  } catch (e) {
    console.error('[verifySupabaseToken]', e?.message || e);
    return null;
  }
}
