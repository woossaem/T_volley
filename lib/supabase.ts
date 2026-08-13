import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// 환경 변수가 비어있을 경우 직접 하드코딩된 주소/키를 사용하도록 안전 처리
const supabaseUrl =
  process.env.EXPO_PUBLIC_SUPABASE_URL ||
  'https://ehuyuhxkhhmouvkpsrrp.supabase.co';

const supabaseAnonKey =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  'sb_publishable_U6MtyWdVxX6jQwMiO9oR8w_K5-25uje';

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});