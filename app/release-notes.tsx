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
    version: `v2.0.4 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.09.06',
    title: '🎯 미가입 유저/팀 소급 연동(Viral Hook) & 스코어 동기화 패치',
    changes: [
      '🔗 [선수/팀 기록 소급 연동] 미가입 유저 포지션 기반 임시 기록 및 종료 경기 리포트 사후 가입/승인 소급 귀속 파이프라인 구축',
      '🛡️ [미등록 팀 교류전 승격] 미등록 상대 팀과의 비공식 경기 후 사후 가입 & 주최자 상호 승인 시 공식 교류전 승격 및 랭킹 정산',
      '🔄 [1세트 라인업 Deep Copy 승계] 빠른 결과 입력 시 1세트 라인업 2·3세트 자동 복사 이관으로 세트 출전 누락 원천 차단',
      '📊 [출전 판정 이중 폴백 Engine] 라인업 미배정 상태여도 score_logs 및 match_events 득점 기록 존재 시 출전 세트 자동 인정',
      '⚡ [점수 취소/삭제 DB 실시간 동기화] 타임라인 취소 및 수동 삭제 시 DB 스코어 즉시 커밋 및 포커스 리프레시 패치',
      '📱 [라이브 전광판 순정 원복] 전광판 개발자 용어 전면 삭제 및 세트 마감 시 DB 커밋 완료 동기화 보장',
    ],
  },
  {
    version: `v2.0.3 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.31',
    title: '📱 스코어보드 전광판 대형화 & 세로네트 포메이션 및 인증·데이터 자가치유 패치',
    changes: [
      '🔒 [소셜 로그인 & 세션 안정화] 카카오/구글 OAuth 로그인 세션 유실 방지, Redirect URI 토큰 재발급 및 백그라운드 재진입 튕김 완전 해결',
      '👤 [프로필 실명 & 소속팀 정규화] 구글/카카오 계정명 대신 DB 프로필 한글 실명 우선 연동 및 소속팀 파편화 자동 통일',
      '📊 [스코어보드 가시성 대폭 확장] 상단 여백 다이어트, 중복 세트 텍스트 전면 삭제 및 72pt+ 초대형 점수판 확보',
      '🏐 [세로 네트 3줄 코트 포메이션] 가로모드 최적화 세로 네트 중심 A/B팀 좌우 대칭 3x3(전/중/후위) 코트 뷰 도입',
      '🎯 [코트 터치 기반 득점/범실 귀속] 점수판 터치 시 양팀 코트 팝업 연동 ➔ 터치 위치별 개인 득점/상대 범실 정밀 자동 귀속',
      '🗑️ [세트 삭제 연동 & SSOT 재인덱싱] 세트 삭제 시 DB/State 완전 삭제 및 1, 2, 3... 순차 번호 자동 재인덱싱',
      '🔄 [세트 라인업 자동 이월 & 벤치 스크롤] 이전 세트 최종 라인업 다음 세트 자동 승계 및 20명+ 대기 로스터 독립 ScrollView 적용',
      '🤝 [기록자 권한별 포메이션 제어] 내전(통합) 양팀 교체 허용, 교류전 상대팀 포메이션 현황 노출 & 교체 터치 보안 제한',
      '🛡️ [무승부 세트 스코어 & DB 자가치유] 무승부 카드 세트 상자 복원 및 match_sets DB 자동 자가치유(Auto-healing) 파이프라인 구축',
      '🥇 [세트 단위 개인 승패 독립 집계] 경기 최종 결과와 분리된 실질 세트 점수 기반 개인 승/패 및 출전 세트 수 완전 정복',
    ],
  },
  {
    version: `v2.0.2 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.18',
    title: '📊 경기 결과 전력 분석 리포트 & 내전 정밀 시스템 개편',
    changes: [
      '📊 [경기 결과 분석 리포트] 오늘의 MVP(득점왕), 클러치 요정, 폭풍 연속 득점/실점 등 이색 스탯 리포트 신설',
      '⚔️ [팀 내전 진행중 상태 정밀화] 승패 미선택 시 무승부 자동 저장 버그 수정 (진행 중 상태 정밀 분기)',
      '🏆 [스코어보드 경기 최종 종료] 세트 마감 외 전체 경기 원터치 마감 및 결과 승인 요청/즉시 확정 지원',
      '🥇 [팀 내전 개인 랭킹 산정 개편] 경기 단위가 아닌 실질적 출전 세트 기준(세트승수 > 세트승률 > 출전세트) 정밀 산정',
      '📢 [스티커 광고 배너 스폿 이식] 스코어보드 청정 구역 유지 및 주요 모달/화면 최하단 안전 배너 이식',
      '🛡️ [동호회 팀명 & 연고지 완벽 패치] DB 파편화/JSON 포맷 자동 정규화로 랭킹·프로필 팀명 누락 완전 해결',
    ],
  },
  {
    version: `v2.0.1 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.17',
    title: '⚡ 전광판 UI/UX 대폭 개편 & 소통방 권한 세분화',
    changes: [
      '📊 [전광판 시야 확보] 대형 점수(195px) 위치 상단 이동 및 중단 자물쇠/가림막 전면 삭제',
      '⚡ [낙관적 업데이트] 서버 동기화 대기 없는 0초 지연 실시간 점수 반영',
      '📺 [2단 중계형 타임라인] A/B팀 2단 레일 타임라인 및 득점 시 최신 위치 자동 스크롤 포커싱',
      '🏐 [9인 출전선수 필터링] 득점/교체 시 현재 코트 출전 멤버만 정밀 필터링하여 노출',
      '👤 [프로필 실명 연동] 구글/카카오 ID 대신 DB 프로필 한글 실명 및 접속 전 기록자 현황판 제공',
      '🧼 [매칭 확정 시 연습 기록 백지화] 모집 중 조작했던 전광판 기록이 매칭 수락 시 0:0으로 자동 리셋',
      '📝 [경기 등록 퀵 불러오기] 남기고 싶은 말과 대표자 연락처 개별 최근 작성 내용 불러오기 버튼 추가',
      '💬 [소통방 권한 & 안전 기능] 내 댓글 삭제, 상대 댓글 신고/차단 및 [소속팀] 이름 통합 뱃지 표기',
      '◀▶ [세트 이동 & 요약 바] 상단 세트 탭을 통한 세트별 점수 보정 및 튕김 없는 고정 뷰 제공',
    ],
  },
  {
    version: `v2.0.0 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.17',
    title: '🚀 V2.0 개인 득점 모드 & 다원화 커뮤니티 투표 신설',
    changes: [
      '📊 [V2.0 스코어보드] 9인제 최적화 선수별 개인 득점 기록 모드 도입',
      '🔄 실시간 선수 교체(Sub) 및 기록 타임라인 연동 (음영 취소선 지원)',
      '📱 스코어보드 진입 시 체육관 전광판용 가로모드(Landscape) 자동 전환',
      '🔒 앱 이탈(백그라운드 전환) 시 스코어보드 기록자 권한 자동 반납 시스템 구축',
    ],
  },
  {
    version: `v1.6.3 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.16',
    title: '🗳️ 커뮤니티 투표 시스템 & 💬 매치 소통 댓글방 오픈',
    changes: [
      '🗳️ 투표 3원화 시스템: 공식(🟡), 팀내(🟠), 공개(🌐) 3가지 범위의 투표/설문 기능 신설',
      '📅 투표 템플릿 다양화: 일반 텍스트, 날짜 달력 픽, 참석 여부(참석/불참/미정) 스페셜 모드 지원',
      '💬 카톡식 항목 추가 옵션: 투표 생성 시 다른 유저가 새로운 후보를 추가할 수 있는 권한 허용/제한 가능',
      '🗣️ 매치 소통 댓글방 오픈: 교류전 및 내전 진행 시 주차, 네트 높이 등을 사전 조율할 수 있는 공개 댓글 기능 추가 (소속 배지 자동 부여)',
      '🛡️ 클린 커뮤니티 보호: 무분별한 어그로 방지를 위해 [공개 투표] 작성은 매너 온도 37.0°C 및 공식전 출전 경험자만 가능토록 제한',
    ],
  },
  {
    version: `v1.6.2 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.15',
    title: '🔥 스마트 실시간 스코어보드 (전광판) 출시',
    changes: [
      '📊 LIVE 2분할 스코어보드 신설: 현장에서 스마트폰/태블릿으로 즉시 점수판 활용 가능',
      '🔄 코트 체인지 지원: 세트/점수 교대 시 원터치로 점수판 좌우 반전',
      '🤝 1인/2인 동시 기록 모드: 양 팀 기록자 접속 시 상대 코트 UI 🔒 잠금 및 분리 조작 지원',
      '⏱️ 득점 흐름 타임라인: 하단 드로어에서 세트별 득점 모멘텀 시각화 및 직전 득점 취소(Undo) 지원',
      '✍️ 수동 보정 기능: 타임라인 원터치 삭제 및 대형 점수 클릭 시 직접 수정 기능',
      '🙋‍♂️ 기록자 책임 실명제: 스코어보드 상단에 기록 중인 선생님 실명 표기',
      '🚀 진행 중인 공식전 및 자체 내전 경기 1초 전광판 직행 라우팅 연동',
    ],
  },
  {
    version: `v1.6.1 (${currentSeason.year} ${currentSeason.seasonCode})`,
    date: '2026.08.15',
    title: '⚡ 팀 가입/승인 UX 전면 개편 & 홈 2단 LIVE 전광판 구축',
    changes: [
      '🔓 공개/비공개 팀 가입 로직 개편: 비밀번호 없는 공개팀 1초 만에 즉시 가입 완료',
      '🔔 팀 가입 승인/거절 전용 박스 신설: 팀 목록 카드에서 승인 신청자를 직관적으로 [승인/거절] 처리',
      '⏳ 가입 승인 대기중 취소 기능: 신청자가 대기중 버튼을 터치하여 언제든 요청 취소 지원',
      '🔴+💜 홈화면 2단 LIVE 전광판 연동: 공식 매치(🔴)와 팀 내전(💜 세트 점수 중심)을 동시 노출',
      '🎯 알림 1초 스마트 이동: 가입 요청/교류전/내전 알림 터치 시 해당 기능 화면으로 즉시 직행',
      '✍️ 한글 실명 입력 타이핑 조합 수정: 성함 변경 시 자음/모음 조합 중 글자 삭제 현상 완전 해결',
      '🔒 카카오 로그인 안정화: Redirect URI 패치 및 클라이언트 시크릿 토글 제어로 로그인 튕김 차단',
    ],
  },
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
  content: {
    padding: 20,
    paddingBottom: 60, // 💡 하단 툴바/시스템바 가림 방지를 위해 여백 확장 (끝까지 시원하게 스크롤됨)
    gap: 16,
  },
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