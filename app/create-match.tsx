import React, { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, SafeAreaView, Alert } from 'react-native';
import { useRouter } from 'expo-router';

export default function CreateMatchScreen() {
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [awayTeam, setAwayTeam] = useState('');

  const handleSubmit = () => {
    Alert.alert("등록 완료", "경기가 성공적으로 생성되었습니다!", [
      { text: "확인", onPress: () => router.back() }
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Text style={styles.backText}>◀ 뒤로</Text>
        </TouchableOpacity>
        <Text style={styles.title}>➕ 경기 등록</Text>
      </View>

      <View style={styles.form}>
        <Text style={styles.label}>경기 제목</Text>
        <TextInput 
          style={styles.input} 
          placeholder="예: 2026 1학기 서울 리그전" 
          value={title} 
          onChangeText={setTitle} 
        />

        <Text style={styles.label}>상대 팀 이름</Text>
        <TextInput 
          style={styles.input} 
          placeholder="예: 경기초 B팀" 
          value={awayTeam} 
          onChangeText={setAwayTeam} 
        />

        <TouchableOpacity style={styles.submitBtn} onPress={handleSubmit}>
          <Text style={styles.submitText}>경기 생성하기</Text>
        </TouchableOpacity>
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
  form: { padding: 20 },
  label: { fontSize: 15, fontWeight: 'bold', color: '#1E293B', marginBottom: 8, marginTop: 15 },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 12, fontSize: 16 },
  submitBtn: { backgroundColor: '#2563EB', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 30 },
  submitText: { color: '#FFFFFF', fontSize: 16, fontWeight: 'bold' },
});