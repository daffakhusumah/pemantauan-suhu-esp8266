// lib/supabase.js
// Client Supabase untuk digunakan di API Routes (server-side)

import { createClient } from '@supabase/supabase-js'

const supabaseUrl     = process.env.SUPABASE_URL
const supabaseKey     = process.env.SUPABASE_SERVICE_KEY  // Service Role Key (server only)

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL dan SUPABASE_SERVICE_KEY harus diset di environment variables')
}

export const supabase = createClient(supabaseUrl, supabaseKey)
