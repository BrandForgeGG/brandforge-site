import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://YOUR_PROJECT.supabase.co';
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'YOUR_ANON_PUBLIC_KEY';

// Supabase client for browser components (auth + realtime-style reads).
// Server-visible session: @supabase/ssr writes the auth cookies that proxy.ts and the API
// routes read, so a founder who signs in here is authenticated everywhere.
// cookieEncoding must match proxy.ts / server clients (base64url).
export const supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
  cookieEncoding: 'base64url',
});
