// Standalone health check route — survives even if the catch-all handler crashes.
// Returns plain JSON; never throws; safe under Vercel serverless runtime.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 10;

function safeStr(v) {
  return typeof v === 'string' ? v : '';
}

export async function GET() {
  try {
    const rawKey = safeStr(process.env.OPENROUTER_API_KEY).trim();
    const mongoUrl = safeStr(process.env.MONGO_URL).trim();
    const supaUrl = safeStr(process.env.NEXT_PUBLIC_SUPABASE_URL).trim();
    const supaKey = safeStr(process.env.SUPABASE_SERVICE_ROLE_KEY).trim();

    const missing = [];
    if (!rawKey) missing.push('OPENROUTER_API_KEY');
    if (!supaUrl) missing.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!supaKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!mongoUrl) missing.push('MONGO_URL');

    const isVercel = !!process.env.VERCEL;
    const mongoLooksLocal =
      mongoUrl.includes('localhost') ||
      mongoUrl.includes('127.0.0.1') ||
      mongoUrl.includes('::1');

    return NextResponse.json({
      status: missing.length === 0 ? 'operational' : 'degraded',
      platform: 'Social Operative Inc.',
      version: '1.0.0',
      services: {
        api: 'up',
        ai: !rawKey
          ? 'missing-key'
          : rawKey.startsWith('sk-or-')
          ? 'configured'
          : 'invalid-key-format',
        auth: supaKey ? 'configured' : 'missing-key',
        storage: supaUrl ? 'configured' : 'missing-url',
        db: !mongoUrl
          ? 'missing-url'
          : isVercel && mongoLooksLocal
          ? 'invalid-localhost-on-vercel'
          : 'configured',
      },
      missingEnv: missing,
      runtime: {
        node: process.version,
        vercel: isVercel,
        platform: safeStr(process.env.VERCEL_ENV) || 'local',
        region: safeStr(process.env.VERCEL_REGION) || null,
      },
      ts: new Date().toISOString(),
    });
  } catch (e) {
    return NextResponse.json(
      { status: 'error', error: safeStr(e?.message) || 'unknown' },
      { status: 500 }
    );
  }
}
