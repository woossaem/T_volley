import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { getCurrentSeasonInfo } from '../lib/season';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);

  // 📅 현재 시즌 정보 자동 연동
  const currentSeason = getCurrentSeasonInfo();

  // 🔗 외부 브라우저에서 앱으로 복귀할 때 전달되는 딥링크 URL 실시간 감지
  const incomingUrl = Linking.useURL();

  // 이미 세션이 존재하면 홈으로 이동
  useEffect(() => {
    if (session) {
      router.replace('/home');
    }
  }, [session]);

  // 딥링크 주소가 들어오면 즉시 인증 토큰 파싱 실행
  useEffect(() => {
    if (incomingUrl) {
      handleUrl(incomingUrl);
    }
  }, [incomingUrl]);

  // 간편 로그인 완료 후 앱으로 돌아왔을 때의 인증 처리
  const handleUrl = async (url: string) => {
    try {
      if (!url) return;

      const sanitizedUrl = url.replace('#', '?');
      const query = sanitizedUrl.split('?')[1];
      if (!query) return;

      const params = new URLSearchParams(query);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const code = params.get('code');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          router.replace('/home');
        }
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error) {
          router.replace('/home');
        }
      }
    } catch (e) {
      console.log('인증 연결 에러:', e);
    }
  };

  // 🟡 카카오톡 간편 시작
  const handleKakaoLogin = async () => {
    try {
      setLoading(true);
      const redirectUrl = Linking.createURL('login');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'kakao',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (result.type === 'success' && result.url) {
          await handleUrl(result.url);
        }
      }
    } catch (err: any) {
      Alert.alert('로그인 안내', '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  // ⚪ 구글 계정으로 계속하기
  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const redirectUrl = Linking.createURL('login');

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true,
        },
      });

      if (error) throw error;

      if (data?.url) {
        const result = await WebBrowser.openAuthSessionAsync(data.url, redirectUrl);
        if (result.type === 'success' && result.url) {
          await handleUrl(result.url);
        }
      }
    } catch (err: any) {
      Alert.alert('로그인 안내', '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      {/* 1. 상단/중앙 메인 영역 (반응형 정렬) */}
      <View style={styles.centerSection}>
        {/* 💡 이모지 대신 앱 공식 로고 이미지로 교체 완료 */}
        <View style={styles.logoCircle}>
          <Image
            source={require('../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="cover"
          />
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.appTitle}>T volley</Text>
          <View style={styles.seasonBadge}>
            <Text style={styles.seasonBadgeText}>
              {currentSeason.year} {currentSeason.seasonCode}
            </Text>
          </View>
        </View>

        <Text style={styles.subTitle}>초등교사 배구 네트워크</Text>
        <Text style={styles.descText}>
          팀 매칭 · 경기 기록 · 내전 통계 · 랭킹
        </Text>
      </View>

      {/* 2. 하단 시작하기 버튼 및 서명 영역 */}
      <View style={styles.bottomSection}>
        {/* 카카오톡 시작하기 */}
        <TouchableOpacity
          style={[styles.oauthBtn, styles.kakaoBtn]}
          onPress={handleKakaoLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#000000" />
          ) : (
            <>
              <View style={styles.kIconCircle}>
                <Text style={styles.kIconText}>💬</Text>
              </View>
              <Text style={styles.kakaoBtnText}>카카오톡으로 3초 만에 시작하기</Text>
            </>
          )}
        </TouchableOpacity>

        {/* 구글 시작하기 */}
        <TouchableOpacity
          style={[styles.oauthBtn, styles.googleBtn]}
          onPress={handleGoogleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#0F172A" />
          ) : (
            <>
              <View style={styles.gIconCircle}>
                <Text style={styles.gIconText}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>Google 계정으로 계속하기</Text>
            </>
          )}
        </TouchableOpacity>

        {/* 💡 하단 서명 (기기별 안쪽 여백 안전 보장) */}
        <View style={styles.signatureBox}>
          <Text style={styles.versionText}>v1.5.0</Text>
          <Text style={styles.developerText}>
            Created by <Text style={styles.authorText}>Rudolfuu</Text>
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'space-between', paddingHorizontal: 24 },
  
  /* 반응형 중앙 정렬 섹션 */
  centerSection: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 20 },
  
  /* 💡 로고 이미지용 스타일 보강 */
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: '#3B82F6',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  appTitle: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  seasonBadge: { backgroundColor: '#FDE047', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  seasonBadgeText: { fontSize: 11, fontWeight: '900', color: '#713F12' },
  
  subTitle: { fontSize: 16, fontWeight: '800', color: '#F8FAFC', marginBottom: 6 },
  descText: { fontSize: 13, fontWeight: '500', color: '#94A3B8', textAlign: 'center' },
  
  /* 하단 버튼 및 서명 섹션 */
  bottomSection: { width: '100%', alignItems: 'center', gap: 10, paddingBottom: 12 },
  
  oauthBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', width: '100%', paddingVertical: 15, borderRadius: 16, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  
  kakaoBtn: { backgroundColor: '#FEE500' },
  kIconCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#000000', justifyContent: 'center', alignItems: 'center' },
  kIconText: { fontSize: 13, fontWeight: '900', color: '#FEE500', textAlign: 'center' },
  kakaoBtnText: { fontSize: 15, fontWeight: '900', color: '#000000' },

  googleBtn: { backgroundColor: '#FFFFFF' },
  gIconCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  gIconText: { fontSize: 16, fontWeight: '900', color: '#4285F4' },
  googleBtnText: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  
  /* 깔끔하고 안 잘리는 하단 서명 */
  signatureBox: { alignItems: 'center', marginTop: 6, gap: 2 },
  versionText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  developerText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  authorText: { fontSize: 13, fontWeight: '900', color: '#3B82F6' },
});