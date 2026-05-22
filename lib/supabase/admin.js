// Server-only Supabase admin client (uses service_role key)
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';

let _admin = null;

export function getSupabaseAdmin() {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw new Error('Supabase admin env missing');
  _admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: ws },
  });
  return _admin;
}

// Verify a user JWT from the Authorization header
export async function verifySupabaseToken(token) {
  if (!token) return null;
  try {
    const admin = getSupabaseAdmin();
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data?.user) return null;
    return { id: data.user.id, email: data.user.email, name: data.user.user_metadata?.name || data.user.email?.split('@')[0] };
  } catch (e) {
    return null;
  }
}
