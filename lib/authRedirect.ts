// URLSearchParams는 React Native 기본 구현이 불완전하므로 폴리필이 선행되어야 한다.
import 'react-native-url-polyfill/auto';
import { makeRedirectUri } from 'expo-auth-session';

/** app.json의 expo.scheme과 반드시 일치해야 한다. */
export const APP_SCHEME = 't-volley';

/**
 * 카카오/구글이 공통으로 사용하는 단일 Redirect URL.
 * 개발 빌드/스토어 빌드: t-volley://login
 * Expo Go: exp://<host>/--/login
 *
 * Supabase 대시보드의 Redirect URLs 허용 목록에 등록된 값과 동일해야 한다.
 */
export const AUTH_REDIRECT_URL = makeRedirectUri({
  scheme: APP_SCHEME,
  path: 'login',
});

export type AuthRedirectParams = {
  code: string | null;
  accessToken: string | null;
  refreshToken: string | null;
  error: string | null;
  errorCode: string | null;
  errorDescription: string | null;
};

const AUTH_KEYS = [
  'code',
  'access_token',
  'refresh_token',
  'error',
  'error_code',
  'error_description',
];

/**
 * 콜백 URL에서 인증 파라미터를 추출한다.
 *
 * PKCE는 `?code=`(query), 암시적 플로우는 `#access_token=`(fragment)로 돌아오고
 * 기기·브라우저에 따라 둘이 섞여 오는 경우도 있다. 둘 중 하나만 읽으면 인증 정보를
 * 놓치므로 query와 fragment를 모두 합쳐서 파싱한다.
 *
 * 인증과 무관한 딥링크(푸시 알림 등)라면 null을 반환한다.
 */
export function parseAuthRedirectUrl(url: string | null | undefined): AuthRedirectParams | null {
  if (!url) return null;

  const firstDelimiter = url.search(/[?#]/);
  if (firstDelimiter === -1) return null;

  const merged = url
    .substring(firstDelimiter)
    .replace(/[?#]/g, '&')
    .replace(/^&+/, '');

  if (!merged) return null;

  let params: URLSearchParams;
  try {
    params = new URLSearchParams(merged);
  } catch {
    return null;
  }

  const hasAuthParam = AUTH_KEYS.some((key) => params.get(key));
  if (!hasAuthParam) return null;

  return {
    code: params.get('code'),
    accessToken: params.get('access_token'),
    refreshToken: params.get('refresh_token'),
    error: params.get('error'),
    errorCode: params.get('error_code'),
    errorDescription: params.get('error_description'),
  };
}

export type AuthRedirectFailure = {
  cancelled: boolean;
  message: string;
};

/** 콜백 URL에 담겨온 오류 코드를 사용자용 안내 문구로 변환한다. */
export function describeAuthRedirectError(params: AuthRedirectParams): AuthRedirectFailure {
  const raw = `${params.error || ''} ${params.errorCode || ''} ${params.errorDescription || ''}`.toLowerCase();

  if (raw.includes('access_denied') || raw.includes('cancel') || raw.includes('denied')) {
    return { cancelled: true, message: '로그인이 취소되었습니다.' };
  }

  if (raw.includes('expired') || raw.includes('otp_expired')) {
    return { cancelled: false, message: '인증 시간이 만료되었습니다. 다시 로그인해 주세요.' };
  }

  if (raw.includes('server_error') || raw.includes('unexpected_failure')) {
    return { cancelled: false, message: '인증 서버가 응답하지 않았습니다. 잠시 후 다시 시도해 주세요.' };
  }

  const description = params.errorDescription?.trim();
  return {
    cancelled: false,
    message: description
      ? `로그인에 실패했습니다. (${description})`
      : '로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  };
}

/** Supabase 세션 교환 단계에서 발생한 오류를 사용자용 안내 문구로 변환한다. */
export function describeSessionError(error: unknown): string {
  const message = (error instanceof Error ? error.message : String(error || '')).toLowerCase();

  if (message.includes('code verifier') || message.includes('code_verifier')) {
    return '인증 정보가 만료되었습니다. 다시 로그인해 주세요.';
  }
  if (message.includes('expired') || message.includes('invalid grant') || message.includes('invalid_grant')) {
    return '인증 정보가 만료되었습니다. 다시 로그인해 주세요.';
  }
  if (message.includes('network') || message.includes('fetch') || message.includes('timeout')) {
    return '네트워크 연결이 불안정합니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.';
  }
  return '로그인 처리 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.';
}
