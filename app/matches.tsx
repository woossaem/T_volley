import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';

export default function MatchesScreen() {
  const router = useRouter();
  const [matches, setMatches] = useState<any[]>([]);

  useEffect(() => {
    async function fetchMatches() {
      if (supabase) {
        const { data } = await supabase.from('matches').select('*');
        if (data && data.length > 0) {
          setMatches(data);
          return;
        }
      }
      setMatches([
        { id: '1', title: '서울 교사 리그 1라운드', home: '서울초 A팀', away: '경기초 B팀', score: '2 : 1', status: '확정' },
        { id: '2', title: '주말 친선전', home: '마포 배구회', away: '강남 배구회', score: '3 : 0', status: '확정' },
      ]);
    }
    fetchMatches();
  }, []);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>◀ 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.title}>📅 경기 목록</Text>
      </View>

      <FlatList
        data={matches}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.badge}>{item.status}</Text>
            </View>
            <View style={styles.scoreRow}>
              <Text style={styles.teamText}>{item.home || '홈팀'}</Text>
              <Text style={styles.scoreText}>{item.score || '0 : 0'}</Text>
              <Text style={styles.teamText}>{item.away || '원정팀'}</Text>
            </View>
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
  card: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 12, marginBottom: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  cardTitle: { fontSize: 15, color: '#64748B', fontWeight: '500' },
  badge: { backgroundColor: '#DCFCE7', color: '#15803D', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, fontSize: 12, fontWeight: 'bold' },
  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamText: { fontSize: 16, fontWeight: 'bold', color: '#1E293B', flex: 1, textAlign: 'center' },
  scoreText: { fontSize: 20, fontWeight: 'bold', color: '#2563EB', marginHorizontal: 10 },
});