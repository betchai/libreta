import { createClient } from '@supabase/supabase-js'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
}

// Single client for the whole app. Auth + RLS + storage are handled by Supabase;
// business rows are scoped by tenant_id which resolves from the profile below.
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
