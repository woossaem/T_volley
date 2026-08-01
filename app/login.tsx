import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export default function LoginScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (session) {
      router.replace('/home');
    }
  }, [session]);

  // Deep Link로 들어온 URL에서 로그인 토큰 추출
  const handleUrl = async (url: string) => {
    try {
      if (!url.includes('access_token') && !url.includes('code')) return;

      const sanitizedUrl = url.replace('#', '?');
      const query = sanitizedUrl.split('?')[1];
      if (!query) return;

      const params = new URLSearchParams(query);
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (!error) {
          router.replace('/home');
        }
      }
    } catch (e) {
      console.log('URL 파싱 에러:', e);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);

      // Expo Go에서 번들 다운로드 착각을 방지하는 경로 설정
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
      Alert.alert('로그인 안내', '게스트 모드로 진입하거나 다시 시도해 주세요.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* 정중앙 고정 레이아웃 */}
      <View style={styles.absoluteCenter}>
        <View style={styles.logoCircle}>
          <Text style={styles.logoEmoji}>🏐</Text>
        </View>

        <View style={styles.titleRow}>
          <Text style={styles.appTitle}>T volley</Text>
          <View style={styles.seasonBadge}>
            <Text style={styles.seasonBadgeText}>2026 SS</Text>
          </View>
        </View>

        <Text style={styles.subTitle}>초등교사 배구 네트워크</Text>
        <Text style={styles.descText}>
          팀 매칭 · 경기 기록 · 내전 통계 · 랭킹
        </Text>
      </View>

      {/* 하단 로그인 영역 */}
      <View style={styles.absoluteBottom}>
        <TouchableOpacity
          style={styles.googleBtn}
          onPress={handleGoogleLogin}
          disabled={loading}
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#0F172A" />
          ) : (
            <>
              <View style={styles.gIconCircle}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: '#4285F4' }}>G</Text>
              </View>
              <Text style={styles.googleBtnText}>Google 계정으로 시작하기</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.guestBtn}
          onPress={() => router.replace('/home')}
        >
          <Text style={styles.guestBtnText}>구글 로그인 없이 게스트로 둘러보기</Text>
        </TouchableOpacity>

        <View style={styles.signatureBox}>
          <Text style={styles.versionText}>v1.0.0</Text>
          <Text style={styles.developerText}>
            Created by <Text style={styles.authorText}>Rudolfuu</Text>
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A' },
  absoluteCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 1 },
  logoCircle: { width: 90, height: 90, borderRadius: 45, backgroundColor: '#1E293B', borderWidth: 1.5, borderColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', marginBottom: 20, shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  logoEmoji: { fontSize: 44, includeFontPadding: false, textAlignVertical: 'center', textAlign: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  appTitle: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  seasonBadge: { backgroundColor: '#FDE047', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  seasonBadgeText: { fontSize: 11, fontWeight: '900', color: '#713F12' },
  subTitle: { fontSize: 16, fontWeight: '800', color: '#F8FAFC', marginBottom: 6 },
  descText: { fontSize: 13, fontWeight: '500', color: '#94A3B8', textAlign: 'center' },
  absoluteBottom: { position: 'absolute', bottom: 40, left: 24, right: 24, alignItems: 'center', gap: 12, zIndex: 999, elevation: 10 },
  googleBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', width: '100%', paddingVertical: 16, borderRadius: 16, gap: 12, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 },
  gIconCircle: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  googleBtnText: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  guestBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  guestBtnText: { color: '#94A3B8', fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  signatureBox: { alignItems: 'center', marginTop: 8, gap: 2 },
  versionText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  developerText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  authorText: { fontSize: 13, fontWeight: '900', color: '#3B82F6' },
});