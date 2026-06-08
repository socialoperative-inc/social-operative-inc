// Browser-side Supabase client (uses anon key)
'use client';

import { createClient } from '@supabase/supabase-js';

let _client = null;

export function getSupabaseClient() {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    console.warn('Supabase env not configured');
    return null;
  }
  _client = createClient(url, anon, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'so-auth',
    },
  });
  return _client;
}
