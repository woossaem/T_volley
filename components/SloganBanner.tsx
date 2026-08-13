import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

const APP_GUIDES = [
  { emoji: '🏐', tag: '티볼리 가이드', text: '부상 없이 즐겁게! 초등교사 배구 네트워크 티볼리에 오신 것을 환영합니다.' },
  { emoji: '📅', tag: '친선 경기 매칭', text: '경기 등록 시 일시, 장소, 모집 조건을 설정하여 다른 학교 팀과 친선 매칭을 신청하세요.' },
  { emoji: '🙋‍♂️', tag: '용병 모집/참가', text: '인원이 부족할 땐 경기 생성 시 용병 모집을 켜고, 혼자 참가하고 싶다면 용병으로 신청하세요.' },
  { emoji: '📺', tag: '비디오 분석', text: '경기 결과 입력 시 세트별 유튜브 영상 링크를 등록해 팀원들과 승패 포인트를 복기해 보세요.' },
  { emoji: '💎', tag: '공식 팀 승격', text: '같은 학교/동호회 소속 팀원이 3명 이상 모이면 공식 팀(💎)으로 자동 승격됩니다.' },
  { emoji: '⚔️', tag: '팀 내 청백전', text: '팀원끼리 치른 자체 내전 스코어를 입력하면 우리 팀만의 통산 전적과 개인 MVP 랭킹이 집계됩니다.' },
  { emoji: '✨', tag: '특별한 오라', text: '내 초대 코드로 동료가 가입하면 프로필을 화려하게 빛내는 \'특별한 오라\'가 부여됩니다. (예정)' },
  { emoji: '🛌', tag: '팀 역사 보존', text: '팀원이 모두 떠나더라도 우리 팀의 소중한 명예와 전적은 \'수면 모드\'로 안전하게 보관됩니다.' },
  { emoji: '📊', tag: '시즌/통산 필터', text: '프로필 및 랭킹 페이지에서 통산 전체 성적과 연도별 시즌 성적을 구분하여 조회할 수 있습니다.' },
  { emoji: '📜', tag: '출전 이력 기록실', text: '마이페이지 하단 이력실에서 내가 그동안 뛰어온 모든 공식 매치 결과를 검색하고 확인해 보세요.' },
  { emoji: '🔀', tag: '3-State 스마트 로스터', text: '터치 1번(🔵 코트) ➔ 2번(⚪ 벤치) ➔ 3번(🪑 미참석) 순으로 손쉽게 라인업을 세팅하세요.' },
  { emoji: '📦', tag: '스마트 명단 압축', text: '2세트부터는 오늘 체육관에 도착한 멤버만 상단에 자동 압축 배치되어 교체가 수월해집니다.' },
  { emoji: '🛡️', tag: '오프라인 안심 기록', text: '체육관 와이파이가 끊겨도 안심하세요! 세트 점수가 휴대폰 내부 저장소에 안전하게 임시 보관됩니다.' },
  { emoji: '🍇', tag: '포도알 & 매너 온도', text: '경기 후 동료의 매너를 칭찬하면 내 주머니로 포도알 1개가 지급되며 매너 온도가 상승합니다.' },
  { emoji: '✉️', tag: '다중 팀 교류전 제안', text: '팀 목록에서 관심 있는 여러 학교 팀을 한 번에 체크하여 교류전을 제안해보세요.' },
  { emoji: '✍️', tag: '책임 기록 실명제', text: '명단 변경 및 스코어 제출 시 작성자 실명이 정직하게 기록되어 무단 조작을 예방합니다.' },
];

export default function SloganBanner() {
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleNextSlogan = () => {
    setCurrentIndex((prev) => (prev + 1) % APP_GUIDES.length);
  };

  const currentGuide = APP_GUIDES[currentIndex];

  return (
    <TouchableOpacity
      style={styles.bannerContainer}
      onPress={handleNextSlogan}
      activeOpacity={0.85}
    >
      <View style={styles.topRow}>
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{currentGuide.tag}</Text>
        </View>
        <Text style={styles.touchHint}>터치하여 다음 가이드 ({currentIndex + 1}/{APP_GUIDES.length}) ➔</Text>
      </View>
      <View style={styles.contentRow}>
        <Text style={styles.emoji}>{currentGuide.emoji}</Text>
        <Text style={styles.sloganText}>
          {currentGuide.text}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  bannerContainer: {
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    marginBottom: 16,
    elevation: 1,
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  badge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
  },
  touchHint: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emoji: {
    fontSize: 18,
  },
  sloganText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    lineHeight: 20,
  },
});