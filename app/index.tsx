import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { getCurrentSeasonInfo } from '../lib/season';
import { APP_VERSION } from '../constants/Version';

export default function IndexScreen() {
  const router = useRouter();
  const { session, loading } = useAuth();
  const currentSeason = getCurrentSeasonInfo();

  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => {
        if (session) {
          router.replace('/home');
        } else {
          router.replace('/login');
        }
      }, 1200);
      return () => clearTimeout(timer);
    }
  }, [session, loading]);

  return (
    <View style={styles.container}>
      <View style={styles.centerBox}>
        <Image
          source={require('../assets/icon.png')}
          style={styles.logoImage}
          resizeMode="contain"
        />

        <View style={styles.titleRow}>
          <Text style={styles.mainTitle}>T_VOLLEY</Text>
          <View style={styles.seasonBadge}>
            <Text style={styles.seasonBadgeText}>{currentSeason.year} {currentSeason.seasonCode}</Text>
          </View>
        </View>

        <Text style={styles.subTitle}>초등교사 배구 네트워크 • 티볼리</Text>
      </View>

      <View style={styles.bottomBox}>
        <View style={styles.sloganTag}>
          <Text style={styles.sloganText}>부상 없이 즐겁게! 깨끗한 교사 배구 문화 🏐</Text>
        </View>
        <Text style={styles.versionText}>{APP_VERSION}</Text>
        <Text style={styles.developerText}>Created by Rudolfuu</Text>
        {loading && <ActivityIndicator color="#3B82F6" style={{ marginTop: 10 }} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F172A', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 60 },
  centerBox: { alignItems: 'center', marginTop: 120 },
  logoImage: { width: 112, height: 112, marginBottom: 20 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  mainTitle: { fontSize: 32, fontWeight: '900', color: '#FFFFFF', letterSpacing: 2 },
  seasonBadge: { backgroundColor: '#F59E0B', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
  seasonBadgeText: { fontSize: 12, fontWeight: '900', color: '#0F172A' },
  subTitle: { fontSize: 14, color: '#94A3B8', fontWeight: '600' },
  bottomBox: { alignItems: 'center', gap: 6 },
  sloganTag: { backgroundColor: 'rgba(255,255,255,0.08)', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)' },
  sloganText: { color: '#CBD5E1', fontSize: 12, fontWeight: '700' },
  versionText: { fontSize: 11, color: '#64748B', fontWeight: '600', marginTop: 4 },
  developerText: { fontSize: 13, color: '#3B82F6', fontWeight: '800' },
});