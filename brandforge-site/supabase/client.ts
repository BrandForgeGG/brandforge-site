// Supabase Client Configuration
// These values should be filled in with your Supabase project credentials
// The anon key is safe to expose to the browser
// The service_role key should NEVER be exposed to the browser

import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'https://ylyyrwppzqjnxpskvqor.supabase.co';
export const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? 'sb_publishable_i1UIfPaziXEr_AZKFENANA_D3QVbCE9';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
});