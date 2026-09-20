export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  apiUrl: process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:4000',
};

/** No live backend yet — use in-memory sample spots so Simulator/web still run. */
export const isDemo =
  process.env.EXPO_PUBLIC_PREVIEW === '1' ||
  !config.supabaseUrl ||
  !config.supabaseAnonKey ||
  config.supabaseUrl.includes('YOUR_PROJECT_REF') ||
  config.supabaseUrl.includes('preview.invalid');
