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
import { getCurrentSeasonInfo } from '../lib/season';

const currentSeason = getCurrentSeasonInfo();

const RELEASE_LOGS = [
  {
    version: `v1.6.0 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.12',
    title: '✨ 칭호 도감 신설 & 교류전 UI 전면 개편',
    changes: [
      '🏆 칭호 수집 도감 신설 및 프로필 대표 칭호 2개 선택 기능 추가',
      '🏟️ 교류전 매치 카드 전광판 스타일 UI 디자인 전면 리팩토링',
      '🔑 팀 창단/관리 시 가입 비밀번호 선택 보호(자유 가입 / 🔒 비밀번호) 지원',
      '📍 충남 15개 시·군 및 주요 광역시 정식 연고지 파편화 완벽 자동 정규화',
      '🎁 상대 팀 매너 평가 & 칭찬 포도알 보내기 시스템 안정화',
    ],
  },
  {
    version: `v1.5.0 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.09',
    title: '🚀 v1.5.0 메이저 업데이트 및 UX 대폭 강화',
    changes: [
      `📅 시즌 자동 연동: 8월 1일 자로 [${currentSeason.fullLabel}] 자동 전환 및 적용`,
      '🔴 On Ground (라이브 퀵인): 진행 중인 내 경기를 최상단에서 1초 만에 바로 진입 및 기록',
      '🔀 3-State 스마트 라인업: 코트 스타팅(🔵) ➔ 오늘의 벤치(⚪) ➔ 미참석(🪑) 3단계 순환 터치',
      '📦 2세트 명단 자동 압축: 체육관 참석자만 상단에 자동 압축 노출되어 교체 수월화',
      '🙋‍♂️ 지각생 1초 초성 검색: 뒤늦게 도착한 멤버를 초성 검색으로 찾아 즉시 코트/벤치 투입',
      '✍️ 출전 명단 즉시 수정 & 책임 실명제: 상대 승인 없이 라인업 즉시 변경 및 작성자 실명 기록',
      '🍇 포도알 자산 & 🌡️ 매너 온도: 1초 원터치 매너 평가 시 포도알 1개 즉시 보상 및 익명성 보장',
      '✉️ 다중 팀 교류전 제안: 팀 목록에서 여러 관심 학교 팀을 동시에 체크하여 매칭 제안 발송',
      '🏆 3단계 경기 성격 분리: 일반 교류전, 공식 대회·리그전, 팀 내 연습경기 통계 완벽 분리',
      '🛡️ 오프라인 안심 기록: 와이파이 단절 시 세트 스코어 휴대폰 내부 안전 임시 보관',
    ],
  },
  {
    version: 'v1.0.0 (2026 S/S)',
    date: '2026.02.01',
    title: '🎉 T volley (티볼리) 정식 출시',
    changes: [
      '✨ 성함 / 소속 학교 / 활동 지역 설정 기능',
      '🏫 학교팀 vs 🛡️ 동호회팀 분기 및 ⭐ 대표팀 설정',
      '🏆 팀 전체 전적 vs 내 실제 출전 전적 정밀 이원화 스탯',
      '📊 시즌 랭킹 및 🏛️ 명예의 전당 (승점제 정렬)',
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
                  • {item}
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
    justifyContent: 'space-between',
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
    justifyContent: 'space-between',
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