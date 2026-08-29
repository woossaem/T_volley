import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, AppState, Easing, Platform, StyleSheet, Text, View } from 'react-native';
import { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import {
  AUTH_REDIRECT_URL,
  describeAuthRedirectError,
  describeSessionError,
  parseAuthRedirectUrl,
} from '../lib/authRedirect';

// 웹 팝업 전용 API. 네이티브에서는 no-op이므로 앱 전체에서 이 한 곳에서만 호출한다.
WebBrowser.maybeCompleteAuthSession();

export type SocialProvider = 'kakao' | 'google';

type AuthContextType = {
  session: Session | null;
  /** 최초 세션 복원이 끝나기 전까지 true */
  loading: boolean;
  /** 현재 인증 진행 중인 제공자. 버튼 스피너 표시에 사용한다. */
  signingIn: SocialProvider | null;
  signIn: (provider: SocialProvider) => Promise<void>;
  signOut: () => Promise<void>;
  /** 앱 하단 토스트 안내 */
  notify: (message: string) => void;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  loading: true,
  signingIn: null,
  signIn: async () => {},
  signOut: async () => {},
  notify: () => {},
});

type AuthOutcome = 'signed-in' | 'failed' | 'timeout';

/**
 * 브라우저 세션이 닫힌 뒤 딥링크를 기다리는 시간. 앱이 포그라운드에 있는 동안에만
 * 흐른다. 구글 2단계 인증처럼 사용자가 외부 화면에 머무는 동안에는 카운트가 멈춘다.
 */
const FOREGROUND_GRACE_MS = 5000;
/** 어떤 경우에도 스피너가 영구히 남지 않도록 하는 상한 */
const ABSOLUTE_TIMEOUT_MS = 3 * 60 * 1000;

const TOAST_DURATION_MS = 3200;

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const router = useRouter();

  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState<SocialProvider | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const sessionRef = useRef<Session | null>(null);
  /** 이미 소비한 code/access_token. 동일 콜백이 두 경로로 들어와도 한 번만 교환한다. */
  const consumedRef = useRef<Set<string>>(new Set());
  const exchangingRef = useRef(false);
  const signingInRef = useRef(false);
  /** 직전에 안내한 콜백 오류. 같은 오류의 중복 안내를 막는다. */
  const lastErrorKeyRef = useRef<string | null>(null);
  /** 사용자가 직접 누른 로그아웃과 토큰 만료로 인한 강제 로그아웃을 구분한다. */
  const manualSignOutRef = useRef(false);
  const outcomeWaitersRef = useRef<((outcome: AuthOutcome) => void)[]>([]);

  const notify = useCallback((message: string) => {
    setToastMessage(message);
  }, []);

  const resolveOutcomeWaiters = useCallback((outcome: AuthOutcome) => {
    const waiters = outcomeWaitersRef.current;
    outcomeWaitersRef.current = [];
    waiters.forEach((waiter) => waiter(outcome));
  }, []);

  /**
   * 인증 세션이 열려 있다면 닫는다. dismissAuthSession은 iOS 전용 API이고
   * 안드로이드에서는 커스텀 탭을 앱에서 닫을 수 없으므로 플랫폼을 구분한다.
   */
  const closeAuthBrowser = useCallback(() => {
    if (Platform.OS !== 'ios') return;
    try {
      WebBrowser.dismissAuthSession();
    } catch {
      // 이미 닫혀 있는 경우
    }
  }, []);

  /**
   * 앱으로 들어온 URL 하나를 인증 콜백으로 처리한다.
   * 딥링크 수신, 콜드 스타트, 브라우저 반환값 등 모든 경로가 이 함수로 수렴한다.
   */
  const completeAuthFromUrl = useCallback(
    async (url: string | null | undefined): Promise<'ignored' | 'signed-in' | 'failed'> => {
      const params = parseAuthRedirectUrl(url);
      if (!params) return 'ignored';

      closeAuthBrowser();

      if (params.error || params.errorCode || params.errorDescription) {
        // 동일한 실패 콜백이 딥링크와 브라우저 반환값으로 두 번 들어와도 한 번만 안내한다.
        // 시도마다 초기화되므로 다음 로그인의 같은 오류는 다시 안내된다.
        const errorKey = `${params.error}:${params.errorCode}:${params.errorDescription}`;
        if (lastErrorKeyRef.current === errorKey) return 'failed';
        lastErrorKeyRef.current = errorKey;

        const { message } = describeAuthRedirectError(params);
        notify(message);
        resolveOutcomeWaiters('failed');
        return 'failed';
      }

      const consumeKey = params.code || params.accessToken;
      if (!consumeKey) return 'ignored';
      if (exchangingRef.current || consumedRef.current.has(consumeKey)) return 'ignored';

      consumedRef.current.add(consumeKey);
      exchangingRef.current = true;

      try {
        let sessionError: unknown = null;

        if (params.code) {
          // PKCE: code_verifier가 저장소에 있으므로 앱이 재시작된 뒤에도 교환할 수 있다.
          const { error } = await supabase.auth.exchangeCodeForSession(params.code);
          sessionError = error;
        } else if (params.accessToken && params.refreshToken) {
          // 암시적 플로우로 돌아온 경우에 대한 하위 호환 경로
          const { error } = await supabase.auth.setSession({
            access_token: params.accessToken,
            refresh_token: params.refreshToken,
          });
          sessionError = error;
        } else {
          consumedRef.current.delete(consumeKey);
          return 'ignored';
        }

        if (sessionError) {
          consumedRef.current.delete(consumeKey);
          // 이미 로그인된 상태에서 흘러든 낡은 링크라면 조용히 무시한다.
          if (!sessionRef.current) {
            notify(describeSessionError(sessionError));
            resolveOutcomeWaiters('failed');
            return 'failed';
          }
          return 'ignored';
        }

        // 세션 반영은 onAuthStateChange가 단독으로 담당한다.
        resolveOutcomeWaiters('signed-in');
        return 'signed-in';
      } catch (err) {
        consumedRef.current.delete(consumeKey);
        if (!sessionRef.current) {
          notify(describeSessionError(err));
          resolveOutcomeWaiters('failed');
          return 'failed';
        }
        return 'ignored';
      } finally {
        exchangingRef.current = false;
      }
    },
    [closeAuthBrowser, notify, resolveOutcomeWaiters]
  );

  /**
   * 브라우저 세션이 먼저 닫힌 뒤 인증 결과를 기다린다.
   *
   * 안드로이드의 openAuthSessionAsync는 AppState가 active로 바뀌는 순간 dismiss로
   * 먼저 종료된다. 구글 2단계 인증에서 숫자 선택 화면이 잠깐 앱을 포그라운드로
   * 끌어올릴 때가 그렇다. 그래서 브라우저 반환값을 완료 신호로 신뢰하지 않고,
   * 딥링크나 인증 상태 변경이 도착할 때까지 별도로 기다린다.
   */
  const waitForAuthOutcome = useCallback(() => {
    return new Promise<AuthOutcome>((resolve) => {
      let settled = false;
      let graceTimer: ReturnType<typeof setTimeout> | null = null;

      const waiter = (outcome: AuthOutcome) => settle(outcome);

      const stopGraceTimer = () => {
        if (graceTimer) {
          clearTimeout(graceTimer);
          graceTimer = null;
        }
      };

      const startGraceTimer = () => {
        if (graceTimer) return;
        graceTimer = setTimeout(() => settle('timeout'), FOREGROUND_GRACE_MS);
      };

      const appStateSub = AppState.addEventListener('change', (state) => {
        if (state === 'active') startGraceTimer();
        else stopGraceTimer();
      });

      const absoluteTimer = setTimeout(() => settle('timeout'), ABSOLUTE_TIMEOUT_MS);

      function settle(outcome: AuthOutcome) {
        if (settled) return;
        settled = true;
        stopGraceTimer();
        clearTimeout(absoluteTimer);
        appStateSub.remove();
        outcomeWaitersRef.current = outcomeWaitersRef.current.filter((w) => w !== waiter);
        resolve(outcome);
      }

      outcomeWaitersRef.current.push(waiter);
      if (AppState.currentState === 'active') startGraceTimer();
    });
  }, []);

  const signIn = useCallback(
    async (provider: SocialProvider) => {
      if (signingInRef.current) return;
      signingInRef.current = true;
      lastErrorKeyRef.current = null;
      setSigningIn(provider);

      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            redirectTo: AUTH_REDIRECT_URL,
            // 브라우저 실행은 앱이 직접 제어한다.
            skipBrowserRedirect: true,
          },
        });

        if (error) throw error;
        if (!data?.url) throw new Error('인증 주소를 받지 못했습니다.');

        const result = await WebBrowser.openAuthSessionAsync(data.url, AUTH_REDIRECT_URL, {
          // 커스텀 탭을 별도 태스크로 띄워 2단계 인증 중 앱이 백그라운드로
          // 내려가도 인증 화면이 파괴되지 않게 한다.
          createTask: true,
          showInRecents: true,
          // 기존 로그인 쿠키를 재사용해야 구글 계정 선택/2FA가 매끄럽게 이어진다.
          preferEphemeralSession: false,
        });

        if (result.type === 'success' && 'url' in result && result.url) {
          const outcome = await completeAuthFromUrl(result.url);
          if (outcome !== 'ignored') return;
        }

        if (sessionRef.current) return;

        // 취소로 단정할 수 없는 상태(2FA 진행 중 등)이므로 결과를 기다린다.
        const outcome = await waitForAuthOutcome();

        // iOS는 사용자가 실제로 인증 창을 닫은 경우에만 cancel을 반환하므로
        // 이때만 취소로 안내한다. 안드로이드의 dismiss는 판별이 불가능해
        // 조용히 스피너만 해제한다.
        if (
          outcome === 'timeout' &&
          Platform.OS === 'ios' &&
          result.type === WebBrowser.WebBrowserResultType.CANCEL
        ) {
          notify('로그인이 취소되었습니다.');
        }
      } catch (err: any) {
        const message = String(err?.message || '');
        if (message.includes('already open')) {
          notify('이전 로그인 창이 아직 닫히지 않았습니다. 잠시 후 다시 시도해 주세요.');
        } else {
          notify(describeSessionError(err));
        }
      } finally {
        signingInRef.current = false;
        setSigningIn(null);
      }
    },
    [completeAuthFromUrl, notify, waitForAuthOutcome]
  );

  const signOut = useCallback(async () => {
    manualSignOutRef.current = true;
    try {
      const { error } = await supabase.auth.signOut();
      // 토큰이 이미 만료·폐기된 경우 서버 호출이 실패해도 로컬 세션은 반드시 비운다.
      if (error) await supabase.auth.signOut({ scope: 'local' });
    } catch {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // 로컬 정리까지 실패한 경우는 아래 상태 리스너에서 처리된다.
      }
    }
  }, []);

  // 앱 전체에서 유일한 인증 상태 구독. 로그인/로그아웃/토큰갱신은 모두 이 리스너를
  // 통해서만 앱 State에 반영된다.
  useEffect(() => {
    let mounted = true;

    const applySession = (next: Session | null) => {
      sessionRef.current = next;
      setSession(next);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        applySession(data.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!mounted) return;

      const previousSession = sessionRef.current;
      applySession(nextSession);
      setLoading(false);

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        resolveOutcomeWaiters('signed-in');
        return;
      }

      if (event === 'SIGNED_OUT') {
        consumedRef.current.clear();
        resolveOutcomeWaiters('failed');

        // 앱 시작 시점의 '세션 없음'은 INITIAL_SESSION으로 전달되므로,
        // 여기서는 실제로 세션이 있었던 경우만 로그인 화면으로 돌려보낸다.
        if (previousSession) {
          if (!manualSignOutRef.current) {
            notify('로그인 정보가 만료되었습니다. 다시 로그인해 주세요.');
          }
          router.replace('/login');
        }
        manualSignOutRef.current = false;
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [notify, resolveOutcomeWaiters, router]);

  // 앱 전체에서 유일한 딥링크 수신부. 어떤 화면이 떠 있든, 앱이 새로 실행된
  // 직후이든 동일하게 인증 콜백을 처리한다.
  useEffect(() => {
    const subscription = Linking.addEventListener('url', ({ url }) => {
      void completeAuthFromUrl(url);
    });

    Linking.getInitialURL()
      .then((url) => {
        if (url) void completeAuthFromUrl(url);
      })
      .catch(() => {
        // 초기 URL을 못 읽어도 로그인 화면은 정상 동작해야 한다.
      });

    return () => subscription.remove();
  }, [completeAuthFromUrl]);

  const value = useMemo(
    () => ({ session, loading, signingIn, signIn, signOut, notify }),
    [session, loading, signingIn, signIn, signOut, notify]
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthToast message={toastMessage} onHide={() => setToastMessage(null)} />
    </AuthContext.Provider>
  );
};

function AuthToast({ message, onHide }: { message: string | null; onHide: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  const [visibleMessage, setVisibleMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!message) return;

    setVisibleMessage(message);

    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    Animated.timing(anim, {
      toValue: 1,
      duration: 220,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(() => {
      hideTimer = setTimeout(() => {
        Animated.timing(anim, {
          toValue: 0,
          duration: 220,
          easing: Easing.in(Easing.quad),
          useNativeDriver: true,
        }).start(() => {
          setVisibleMessage(null);
          onHide();
        });
      }, TOAST_DURATION_MS);
    });

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
    };
  }, [message]);

  if (!visibleMessage) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.toastWrap,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }),
            },
          ],
        },
      ]}
    >
      <View style={styles.toastCard}>
        <Text style={styles.toastText}>{visibleMessage}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toastWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 60,
    alignItems: 'center',
    zIndex: 100000,
  },
  toastCard: {
    maxWidth: '100%',
    backgroundColor: 'rgba(30, 41, 59, 0.97)',
    borderWidth: 1,
    borderColor: '#334155',
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 10,
  },
  toastText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#E2E8F0',
    textAlign: 'center',
    lineHeight: 19,
  },
});

export const useAuth = () => useContext(AuthContext);
