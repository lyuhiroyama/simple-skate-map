import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';

/**
 * Service-role client: bypasses RLS. All authorization checks are
 * done explicitly in route handlers (see routes/).
 */
export const supabaseAdmin = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export const MEDIA_BUCKET = 'spot-media';
