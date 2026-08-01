import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { Stack } from 'expo-router';
import { AuthProvider } from '../contexts/AuthContext';

export default function RootLayout() {
  const [isSplashDone, setIsSplashDone] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // 1.8초 후 부드럽게 메인 화면 진입
    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 350,
        useNativeDriver: true,
      }).start(() => {
        setIsSplashDone(true);
      });
    }, 1800);

    return () => clearTimeout(timer);
  }, []);

  return (
    <AuthProvider>
      <View style={{ flex: 1, backgroundColor: '#0F172A' }}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="home" />
          <Stack.Screen name="profile" />
          <Stack.Screen name="my-team-detail" />
          <Stack.Screen name="matches" />
          <Stack.Screen name="my-matches" />
          <Stack.Screen name="create-match" />
          <Stack.Screen name="teams" />
          <Stack.Screen name="rankings" />
          <Stack.Screen name="profile-setup" />
          <Stack.Screen name="release-notes" />
          <Stack.Screen name="feedback" />
        </Stack>

        {/* 오프닝 스플래시 오버레이 */}
        {!isSplashDone && (
          <Animated.View style={[styles.splashOverlay, { opacity: fadeAnim }]}>
            
            {/* 🔥 절대 좌표 정중앙 고정 (천장 뚫림 원천 차단) */}
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

            {/* 하단 서명 (바닥 절대 좌표 고정) */}
            <View style={styles.absoluteBottom}>
              <Text style={styles.versionText}>v1.0.0</Text>
              <Text style={styles.developerText}>
                Created by <Text style={styles.authorText}>Rudolfuu</Text>
              </Text>
            </View>

          </Animated.View>
        )}
      </View>
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
    zIndex: 99999,
  },
  absoluteCenter: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: '#1E293B',
    borderWidth: 1.5,
    borderColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  logoEmoji: {
    fontSize: 44,
    marginTop: -2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  appTitle: {
    fontSize: 32,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1,
  },
  seasonBadge: {
    backgroundColor: '#FDE047',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  seasonBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#713F12',
  },
  subTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#F8FAFC',
    marginBottom: 6,
  },
  descText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
    textAlign: 'center',
  },
  absoluteBottom: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 2,
  },
  versionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 1,
  },
  developerText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  authorText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#3B82F6',
    letterSpacing: 0.5,
  },
});