import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';

export default function ProfileScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>◀ 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.title}>👤 내 프로필</Text>
      </View>

      <View style={styles.content}>
        <View style={styles.profileBox}>
          <Text style={styles.avatarText}>🏐</Text>
          <Text style={styles.nameText}>김교사 <Text style={styles.tagText}>#1</Text></Text>
          <Text style={styles.roleText}>서울 초등 배구 동호회 (주장)</Text>
        </View>

        <View style={styles.infoGroup}>
          <View style={styles.infoRow}><Text style={styles.label}>지역</Text><Text style={styles.value}>서울특별시</Text></View>
          <View style={styles.infoRow}><Text style={styles.label}>포지션</Text><Text style={styles.value}>세터 / 윙 리베로</Text></View>
          <View style={styles.infoRow}><Text style={styles.label}>구독 상태</Text><Text style={styles.value}>무료 회원</Text></View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { marginRight: 15 },
  backText: { fontSize: 16, color: '#2563EB', fontWeight: 'bold' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1E293B' },
  content: { padding: 20 },
  profileBox: { alignItems: 'center', backgroundColor: '#FFFFFF', padding: 25, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 20 },
  avatarText: { fontSize: 50, marginBottom: 10 },
  nameText: { fontSize: 22, fontWeight: 'bold', color: '#1E293B' },
  tagText: { color: '#2563EB' },
  roleText: { fontSize: 14, color: '#64748B', marginTop: 4 },
  infoGroup: { backgroundColor: '#FFFFFF', borderRadius: 12, padding: 15, borderWidth: 1, borderColor: '#E2E8F0' },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  label: { fontSize: 15, color: '#64748B' },
  value: { fontSize: 15, fontWeight: 'bold', color: '#1E293B' },
});