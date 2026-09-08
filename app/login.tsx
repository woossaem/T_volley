import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { getCurrentSeasonInfo } from '../lib/season';
import { APP_VERSION } from '../constants/Version';

export default function LoginScreen() {
  const router = useRouter();
  // OAuth 실행, 딥링크 콜백, 세션 교환은 모두 AuthProvider가 단독으로 담당한다.
  const { session, signingIn, signIn } = useAuth();
  const loading = signingIn !== null;

  const currentSeason = getCurrentSeasonInfo();

  useEffect(() => {
    if (session) {
      router.replace('/home');
    }
  }, [session]);

  const handleKakaoLogin = () => signIn('kakao');
  const handleGoogleLogin = () => signIn('google');

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <View style={styles.centerSection}>
        <View style={styles.logoBadge}>
          <Image
            source={require('../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
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

      <View style={styles.bottomSection}>
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

        <View style={styles.signatureBox}>
          <Text style={styles.versionText}>{APP_VERSION}</Text>
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
  centerSection: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 20 },
  logoBadge: {
    width: 112,
    height: 112,
    borderRadius: 24,
    borderWidth: 2,
    borderColor: '#3B82F6',
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    backgroundColor: '#0F172A',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  logoImage: { width: '100%', height: '100%' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  appTitle: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', letterSpacing: 1 },
  seasonBadge: { backgroundColor: '#FDE047', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  seasonBadgeText: { fontSize: 11, fontWeight: '900', color: '#713F12' },
  subTitle: { fontSize: 16, fontWeight: '800', color: '#F8FAFC', marginBottom: 6 },
  descText: { fontSize: 13, fontWeight: '500', color: '#94A3B8', textAlign: 'center' },
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
  signatureBox: { alignItems: 'center', marginTop: 6, gap: 2 },
  versionText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  developerText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  authorText: { fontSize: 13, fontWeight: '900', color: '#3B82F6' },
});