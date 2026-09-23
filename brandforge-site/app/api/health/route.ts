import { NextResponse } from 'next/server';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return NextResponse.json({
    ok: true,
    app: 'BrandForge',
    environment: process.env.NODE_ENV,
    supabaseConfigured: Boolean(supabaseUrl && supabaseKey),
    timestamp: new Date().toISOString(),
  });
}
