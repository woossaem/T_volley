import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Alert, Image } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Updates from 'expo-updates';
import Constants from 'expo-constants';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { registerForPushNotificationsAsync } from '../lib/notificationService';
import { getCurrentSeasonInfo } from '../lib/season';

// 💡 app.json의 version 정보를 자동으로 동기화
const APP_VERSION = `v${Constants.expoConfig?.version || '2.0.1'}`;

function RootLayoutContent() {
  const { session } = useAuth();
  const [isSplashDone, setIsSplashDone] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();

  const currentSeason = getCurrentSeasonInfo();

  useEffect(() => {
    async function checkAndApplyUpdate() {
      if (__DEV__) return;
      try {
        const update = await Updates.checkForUpdateAsync();
        if (update.isAvailable) {
          await Updates.fetchUpdateAsync();
          Alert.alert(
            '🎉 최신 업데이트 완료',
            '새로운 기능 및 UI 보정이 적용되었습니다.\n최신 버전을 적용하기 위해 앱을 재시작합니다.',
            [
              {
                text: '지금 재시작',
                onPress: async () => {
                  await Updates.reloadAsync();
                },
              },
            ],
            { cancelable: false }
          );
        }
      } catch (e) {
        console.log('업데이트 체크 스킵/실패:', e);
      }
    }
    checkAndApplyUpdate();
  }, []);

  useEffect(() => {
    if (session?.user?.id) {
      registerForPushNotificationsAsync(session.user.id);
    }
  }, [session]);

  useEffect(() => {
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

      {!isSplashDone && (
        <Animated.View style={[styles.splashOverlay, { opacity: fadeAnim }]}>
          <View style={styles.centerContent}>
            <View style={styles.logoCircle}>
              <Image
                source={require('../assets/icon.png')}
                style={styles.logoImage}
                resizeMode="cover"
              />
            </View>

            <View style={styles.titleRow}>
              <Text style={styles.appTitle}>T_VOLLEY</Text>
              <View style={styles.seasonBadge}>
                <Text style={styles.seasonBadgeText}>
                  {currentSeason.year} {currentSeason.seasonCode}
                </Text>
              </View>
            </View>

            <Text style={styles.subTitle}>초등교사 배구 네트워크 • 티볼리</Text>
          </View>

          <View style={[styles.absoluteBottom, { bottom: Math.max(insets.bottom + 24, 60) }]}>
            <View style={styles.splashNoticeChip}>
              <Text style={styles.splashNoticeText}>부상 없이 즐겁게! 깨끗한 교사 배구 문화 🏐</Text>
            </View>
            <Text style={styles.versionText}>{APP_VERSION}</Text>
            <Text style={styles.developerText}>
              Created by <Text style={styles.authorText}>Rudolfuu</Text>
            </Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootLayoutContent />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#0F172A',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 99999,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoCircle: {
    width: 90,
    height: 90,
    borderRadius: 45,
    borderWidth: 2,
    borderColor: '#3B82F6',
    overflow: 'hidden',
    marginBottom: 20,
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  logoImage: {
    width: '100%',
    height: '100%',
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
    fontSize: 14,
    fontWeight: '700',
    color: '#94A3B8',
  },
  absoluteBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    gap: 5,
  },
  splashNoticeChip: {
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 4,
  },
  splashNoticeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#CBD5E1',
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