import React from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, SafeAreaView } from 'react-native';
import { useRouter } from 'expo-router';

export default function TeamsScreen() {
  const router = useRouter();

  const dummyTeams = [
    { id: '1', name: '서울 초등 배구 동호회', region: '서울', members: '18명', gender: '혼성' },
    { id: '2', name: '경기 교사 배구 클럽', region: '경기', members: '14명', gender: '남성' },
    { id: '3', name: '인천 초등 스파이커스', region: '인천', members: '12명', gender: '여성' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>◀ 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.title}>🏐 팀 목록</Text>
      </View>

      <FlatList
        data={dummyTeams}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 20 }}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardInfo}>
              <Text style={styles.teamName}>{item.name}</Text>
              <Text style={styles.teamSub}>지역: {item.region} | 인원: {item.members} ({item.gender})</Text>
            </View>
            <TouchableOpacity style={styles.joinBtn}>
              <Text style={styles.joinText}>보기</Text>
            </TouchableOpacity>
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
  card: { backgroundColor: '#FFFFFF', padding: 18, borderRadius: 12, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  cardInfo: { flex: 1 },
  teamName: { fontSize: 16, fontWeight: 'bold', color: '#1E293B' },
  teamSub: { fontSize: 13, color: '#64748B', marginTop: 4 },
  joinBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 },
  joinText: { color: '#2563EB', fontWeight: 'bold', fontSize: 13 },
});