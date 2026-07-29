import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Alert } from 'react-native';
import { useRouter } from 'expo-router';

export default function HomeScreen() {
  const router = useRouter();

  const handleNotification = () => {
    Alert.alert("알림", "새로운 알림이 없습니다.");
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* 상단 헤더 */}
        <View style={styles.header}>
          <Text style={styles.logoText}>🏐 T volley</Text>
          <TouchableOpacity style={styles.bellButton} onPress={handleNotification}>
            <Text style={styles.bellIcon}>🔔</Text>
          </TouchableOpacity>
        </View>

        {/* 프로필 카드 */}
        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>🏐</Text>
          </View>
          <View style={styles.profileInfo}>
            <Text style={styles.userName}>김교사 <Text style={styles.userTag}>#1</Text></Text>
            <Text style={styles.userTeam}>서울 초등 배구 동호회</Text>
          </View>
        </View>

        {/* 메인 메뉴 5개 */}
        <Text style={styles.sectionTitle}>주요 메뉴</Text>
        <View style={styles.menuGrid}>
          <TouchableOpacity style={styles.menuCard} onPress={() => router.push('/profile')}>
            <Text style={styles.menuIcon}>👤</Text>
            <Text style={styles.menuText}>내 프로필</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuCard} onPress={() => router.push('/matches')}>
            <Text style={styles.menuIcon}>📅</Text>
            <Text style={styles.menuText}>경기 목록</Text>
          </TouchableOpacity>

          <TouchableOpacity style={[styles.menuCard, styles.highlightCard]} onPress={() => router.push('/create-match')}>
            <Text style={styles.menuIcon}>➕</Text>
            <Text style={[styles.menuText, styles.highlightText]}>경기 등록</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuCard} onPress={() => router.push('/teams')}>
            <Text style={styles.menuIcon}>🏐</Text>
            <Text style={styles.menuText}>팀 목록</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuCard} onPress={() => router.push('/rankings')}>
            <Text style={styles.menuIcon}>🏆</Text>
            <Text style={styles.menuText}>랭킹 보기</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  scrollContent: { padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, marginTop: 10 },
  logoText: { fontSize: 24, fontWeight: 'bold', color: '#1E3A8A' },
  bellButton: { padding: 8, backgroundColor: '#E2E8F0', borderRadius: 20 },
  bellIcon: { fontSize: 18 },
  profileCard: { flexDirection: 'row', backgroundColor: '#1E3A8A', padding: 20, borderRadius: 16, alignItems: 'center', marginBottom: 25 },
  avatar: { width: 50, height: 50, borderRadius: 25, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', marginRight: 15 },
  avatarText: { fontSize: 24 },
  profileInfo: { flex: 1 },
  userName: { fontSize: 20, fontWeight: 'bold', color: '#FFFFFF' },
  userTag: { fontSize: 14, color: '#93C5FD', fontWeight: 'normal' },
  userTeam: { fontSize: 14, color: '#E0E7FF', marginTop: 4 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', color: '#1E293B', marginBottom: 15 },
  menuGrid: { gap: 12 },
  menuCard: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  highlightCard: { backgroundColor: '#2563EB', borderColor: '#2563EB' },
  menuIcon: { fontSize: 22, marginRight: 15 },
  menuText: { fontSize: 16, fontWeight: '600', color: '#334155' },
  highlightText: { color: '#FFFFFF' },
});