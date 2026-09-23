import { NextResponse, NextRequest } from 'next/server';
import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getAuthenticatedUser } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

// Auth diagnostics for the signed-in account. Reports which Supabase cookies reached the
// request and the session outcome (headers/local getSession — never network getUser),
// so 401s can be diagnosed without reading Vercel logs. Values are names/lengths only -
// never cookie contents or tokens.
export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const all = cookieStore.getAll();
  const supabaseCookies = all
    .filter((entry) => entry.name.startsWith('sb-'))
    .map((entry) => ({ name: entry.name, length: entry.value.length }));

  const user = await getAuthenticatedUser(request);
  const supabase = await createSupabaseServerClient(request);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  return NextResponse.json({
    authenticated: Boolean(user),
    email: user?.email ?? null,
    error: null,
    session: Boolean(session),
    cookies: {
      total: all.length,
      supabase: supabaseCookies,
    },
  });
}
