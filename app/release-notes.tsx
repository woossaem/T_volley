import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Colors } from '../constants/Colors';

const RELEASE_LOGS = [
  {
    version: 'v1.0.0 (2026 SS)',
    date: '2026.08.01',
    title: '🎉 T volley (티볼리) 정식 리뉴얼',
    changes: [
      '✨ 성함 / 소속 학교 / 활동 지역 설정 기능',
      '🏫 학교팀 vs 🏐 동호회팀 분기 및 ⭐ 1순위 대표팀 설정',
      '🏆 팀 전체 전적 vs 내 실제 출전 전적 정밀 이원화 스탯',
      '📊 2026 상반기 시즌 랭킹 및 🏛️ 명예의 전당 (승점제 정렬)',
      '🔑 팀별 가입 비밀번호 동적 변경 및 팝업 안내',
      '📜 미등록 과거 경기 및 친선 경기 기록 기능',
    ],
  },
];

export default function ReleaseNotesScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>개발 패치노트</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.introBox}>
          <Text style={styles.introTitle}>🛠️ 티볼리 업데이트 히스토리</Text>
          <Text style={styles.introSub}>
            티볼리는 선생님들의 더 쾌적한 배구 활동을 위해 지속적으로 기능이 추가/개선되고 있습니다.
          </Text>
        </View>

        {RELEASE_LOGS.map((log, index) => (
          <View key={log.version} style={[styles.logCard, index === 0 && styles.latestCard]}>
            <View style={styles.logHeader}>
              <View style={styles.versionBadge}>
                <Text style={styles.versionText}>{log.version}</Text>
              </View>
              <Text style={styles.dateText}>{log.date}</Text>
            </View>

            <Text style={styles.logTitle}>{log.title}</Text>

            <View style={styles.changeList}>
              {log.changes.map((item, idx) => (
                <Text key={idx} style={styles.changeItem}>
                  {item}
                </Text>
              ))}
            </View>
          </View>
        ))}

        <View style={styles.developerBox}>
          <Text style={styles.developerText}>Designed & Developed by</Text>
          <Text style={styles.signatureText}>Rudolfuu</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justify: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: Colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  content: { padding: 20, gap: 16 },
  introBox: {
    backgroundColor: '#EFF6FF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  introTitle: { fontSize: 16, fontWeight: '800', color: '#1E40AF', marginBottom: 4 },
  introSub: { fontSize: 13, color: '#1E3A8A', lineHeight: 18 },
  logCard: {
    backgroundColor: Colors.surface,
    borderRadius: 16,
    padding: 18,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  latestCard: {
    borderColor: '#3B82F6',
    borderWidth: 1.5,
  },
  logHeader: {
    flexDirection: 'row',
    justify: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  versionBadge: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  versionText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  dateText: { fontSize: 12, color: Colors.textMuted, fontWeight: '600' },
  logTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 12 },
  changeList: { gap: 6 },
  changeItem: { fontSize: 13, color: '#334155', lineHeight: 20, fontWeight: '500' },
  developerBox: {
    alignItems: 'center',
    marginTop: 24,
    paddingVertical: 16,
  },
  developerText: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  signatureText: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.primary,
    letterSpacing: 2,
    marginTop: 2,
  },
});