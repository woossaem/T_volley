import React, { useState, useEffect, memo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const APP_GUIDES = [
  { emoji: '🏐', tag: '티볼리 가이드', text: '부상 없이 즐겁게! 초등교사 배구 네트워크 티볼리에 오신 것을 환영합니다.' },
  { emoji: '📅', tag: '친선 경기 매칭', text: '경기 등록 시 일시, 장소, 모집 조건을 설정하여 다른 학교 팀과 친선 매칭을 신청하세요.' },
  { emoji: '🙋‍♂️', tag: '용병 모집/참가', text: '인원이 부족할 땐 경기 생성 시 용병 모집을 켜고, 혼자 참가하고 싶다면 용병으로 신청하세요.' },
  { emoji: '📺', tag: '비디오 분석', text: '경기 결과 입력 시 세트별 유튜브 영상 링크를 등록해 팀원들과 승패 포인트를 복기해 보세요.' },
  { emoji: '🟦', tag: '공식 팀 승격', text: '같은 학교/동호회 소속 팀원이 3명 이상 모이면 블루리본(🟦) 공식 팀으로 자동 승격됩니다.' },
  { emoji: '⚔️', tag: '팀 내 청백전', text: '팀원끼리 치른 자체 내전 스코어를 입력하면 우리 팀만의 통산 전적과 개인 MVP 랭킹이 집계됩니다.' },
  { emoji: '✨', tag: '특별한 오라', text: "내 초대 코드로 동료가 가입하면 프로필을 화려하게 빛내는 '특별한 오라'가 부여됩니다." },
  { emoji: '📊', tag: '시즌/통산 필터', text: '프로필 및 랭킹 페이지에서 통산 전체 성적과 연도별 시즌 성적을 구분하여 조회할 수 있습니다.' },
  { emoji: '📜', tag: '출전 이력 기록실', text: '마이페이지 하단 이력실에서 내가 그동안 뛰어온 모든 공식 매치 결과를 검색하고 확인해 보세요.' },
  { emoji: '🔀', tag: '3-State 라인업', text: '터치 1번(🔵 코트) ➔ 2번(⚪ 벤치) ➔ 3번(🪑 미참석) 순으로 손쉽게 세트 라인업을 세팅하세요.' },
  { emoji: '🛡️', tag: '오프라인 안심 기록', text: '체육관 와이파이가 끊겨도 걱정 마세요! 세트 스코어가 안전하게 임시 저장됩니다.' },
  { emoji: '🍇', tag: '매너 온도 & 포도알', text: '경기 후 상대팀 매너를 칭찬하면 내 주머니로 포도알 1개가 쏙 들어옵니다.' },
  { emoji: '✉️', tag: '다중 교류전 제안', text: '팀 목록에서 관심 있는 여러 학교 팀을 한 번에 선택해 교류전을 제안해보세요.' },
  { emoji: '🏆', tag: '성적 다각화 분석', text: '일반 교류전, 대회·리그전, 팀 내 청백전 기록을 각각 구분하여 상세히 분석해드립니다.' },
];

interface StickyAdBannerProps {
  isModal?: boolean; // 💡 모달 내부 전용 규격 여부
}

function StickyAdBannerComponent({ isModal = false }: StickyAdBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const insets = useSafeAreaInsets();

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % APP_GUIDES.length);
    }, 5000);
    return () => clearInterval(timer);
  }, []);

  const handleNextSlogan = () => {
    setCurrentIndex((prev) => (prev + 1) % APP_GUIDES.length);
  };

  const currentGuide = APP_GUIDES[currentIndex];

  return (
    <View style={[
      styles.wrapper, 
      { paddingBottom: isModal ? 8 : Math.max(insets.bottom + 4, 8) }
    ]}>
      <TouchableOpacity 
        style={styles.guideContainer} 
        onPress={handleNextSlogan}
        activeOpacity={0.8}
      >
        <View style={styles.topRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{currentGuide.tag}</Text>
          </View>
          <Text style={styles.touchHint}>터치하여 다음 가이드 ({currentIndex + 1}/{APP_GUIDES.length}) ➔</Text>
        </View>
        <View style={styles.contentRow}>
          <Text style={styles.emoji}>{currentGuide.emoji}</Text>
          <Text style={styles.text}>
            {currentGuide.text}
          </Text>
        </View>
      </TouchableOpacity>
    </View>
  );
}

export default memo(StickyAdBannerComponent);

const styles = StyleSheet.create({
  wrapper: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  guideContainer: {
    width: '100%',
    minHeight: 52,
    paddingHorizontal: 12,
    paddingTop: 6,
    gap: 4,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  badge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 6,
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
    alignItems: 'flex-start',
    gap: 8,
  },
  emoji: {
    fontSize: 15,
    marginTop: 1,
  },
  text: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    lineHeight: 17,
  },
});