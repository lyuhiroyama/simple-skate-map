import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { config, isDemo } from '../config';

export const supabase = createClient(
  isDemo ? 'https://example.supabase.co' : config.supabaseUrl,
  isDemo ? 'public-anon-key' : config.supabaseAnonKey,
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: !isDemo,
      persistSession: !isDemo,
      detectSessionInUrl: false,
    },
  },
);
