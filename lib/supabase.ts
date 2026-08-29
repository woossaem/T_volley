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
    // 네이티브 앱에는 브라우저 주소창이 없으므로 URL 자동 감지를 끄고,
    // 딥링크 처리는 AuthProvider가 단독으로 담당한다.
    detectSessionInUrl: false,
    // PKCE는 code_verifier를 AsyncStorage에 저장하므로, 카카오/구글 인증 중
    // 앱 프로세스가 종료되어도 재실행 후 code 교환을 이어서 완료할 수 있다.
    flowType: 'pkce',
  },
});