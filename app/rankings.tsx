import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';

export default function RankingsScreen() {
  const router = useRouter();

  const rankData = [
    { rank: '1위', team: '서울 초등 배구 동호회', points: '1,250 pt', winRate: '85%' },
    { rank: '2위', team: '경기 교사 배구 클럽', points: '1,120 pt', winRate: '78%' },
    { rank: '3위', team: '인천 초등 스파이커스', points: '980 pt', winRate: '65%' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>◀ 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🏆 시즌 랭킹 (2026)</Text>
      </View>

      <FlatList
        data={rankData}
        keyExtractor={(item) => item.rank}
        contentContainerStyle={{ padding: 20 }}
        renderItem={({ item }) => (
          <View style={styles.rankRow}>
            <Text style={[styles.rankBadge, item.rank === '1위' && styles.goldBadge]}>{item.rank}</Text>
            <View style={{ flex: 1, marginLeft: 15 }}>
              <Text style={styles.teamName}>{item.team}</Text>
              <Text style={styles.subText}>승률 {item.winRate}</Text>
            </View>
            <Text style={styles.points}>{item.points}</Text>
          </View>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },
  header: { flexDirection: 'row', alignItems: 'center', padding: 20, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  backBtn: { marginRight: 15 },
  backText: { fontSize: 16, color: '#2563EB', fontWeight: 'bold' },
  title: { fontSize: 20, fontWeight: 'bold', color: '#1E293B' },
  rankRow: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  rankBadge: { fontSize: 16, fontWeight: 'bold', color: '#475569', width: 40, textAlign: 'center' },
  goldBadge: { color: '#D97706', fontSize: 18 },
  teamName: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  subText: { fontSize: 12, color: '#64748B', marginTop: 2 },
  points: { fontSize: 16, fontWeight: 'bold', color: '#2563EB' },
});