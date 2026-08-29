import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import StickyAdBanner from './StickyAdBanner';
import ScoreTimeline, { MatchEvent } from './ScoreTimeline';

interface MatchPostgameReportModalProps {
  visible: boolean;
  onClose: () => void;
  match: any;
  initialEvents?: MatchEvent[];
}

export default function MatchPostgameReportModal({
  visible,
  onClose,
  match,
  initialEvents,
}: MatchPostgameReportModalProps) {
  const [loading, setLoading] = useState(false);
  const [events, setEvents] = useState<MatchEvent[]>(initialEvents || []);
  const [activeTab, setActiveTab] = useState<'highlight' | 'timeline'>('highlight');
  const [activeSetIndex, setActiveSetIndex] = useState(0);

  // 💡 [핵심 버그 수정] 의존성 배열에서 initialEvents 제거하여 무한 루프 차단
  useEffect(() => {
    if (visible && match?.id) {
      if (initialEvents && initialEvents.length > 0) {
        setEvents(initialEvents);
      } else {
        fetchEvents();
      }
    }
  }, [visible, match?.id]);

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('match_events')
        .select('*')
        .eq('match_id', match.id)
        .order('created_at', { ascending: true });
      if (data) setEvents(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const parsedIntraNames = useMemo(() => {
    if (!match?.description) return { teamA: 'A팀', teamB: 'B팀' };
    const m = match.description.match(/^\[(.*?)\ VS (.*?)\]/);
    if (m) return { teamA: m[1] || 'A팀', teamB: m[2] || 'B팀' };
    return { teamA: 'A팀', teamB: 'B팀' };
  }, [match?.description]);

  const isIntramural = match?.status === 'intramural';
  const displayHostName = isIntramural ? parsedIntraNames.teamA : match?.host_team_name || '홈팀';
  const displayAwayName = isIntramural ? parsedIntraNames.teamB : match?.away_team_name || '어웨이팀';

  const analytics = useMemo(() => {
    const validScores = events.filter(e => e.event_type === 'score' && !e.is_canceled);
    
    // 1. 오늘의 득점왕 (MVP)
    const scoreCounts: { [name: string]: number } = {};
    validScores.forEach(e => {
      if (e.player_name) {
        scoreCounts[e.player_name] = (scoreCounts[e.player_name] || 0) + 1;
      }
    });
    
    let mvpName = '기록 없음';
    let maxPoints = 0;
    Object.entries(scoreCounts).forEach(([name, count]) => {
      if (count > maxPoints) {
        maxPoints = count;
        mvpName = name;
      }
    });

    // 2. 클러치 요정 (세트 종결자)
    const clutchPlayers = new Set<string>();
    const setsPlayed = [...new Set(validScores.map(e => e.set_index))];
    setsPlayed.forEach(setIdx => {
      const setEvents = validScores.filter(e => e.set_index === setIdx);
      if (setEvents.length > 0) {
        const lastEvent = setEvents[setEvents.length - 1];
        if (lastEvent.player_name) clutchPlayers.add(lastEvent.player_name);
      }
    });

    // 3. 연속 득점 흐름 분석
    let currentStreakTeam = '';
    let currentStreak = 0;
    let maxHostStreak = 0;
    let maxAwayStreak = 0;

    validScores.forEach(e => {
      if (e.team_type === currentStreakTeam) {
        currentStreak++;
      } else {
        currentStreakTeam = e.team_type;
        currentStreak = 1;
      }
      if (currentStreakTeam === 'host') maxHostStreak = Math.max(maxHostStreak, currentStreak);
      if (currentStreakTeam === 'away') maxAwayStreak = Math.max(maxAwayStreak, currentStreak);
    });

    return {
      mvpName: maxPoints > 0 ? `${mvpName} (${maxPoints}점)` : '없음',
      clutchNames: clutchPlayers.size > 0 ? Array.from(clutchPlayers).join(', ') : '없음',
      maxHostStreak,
      maxAwayStreak,
      setsPlayedCount: setsPlayed.length > 0 ? Math.max(...setsPlayed) + 1 : 1,
    };
  }, [events]);

  if (!match) return null;

  return (
    <Modal visible={visible} animationType="slide" transparent={true} onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>📊 경기 결과 & 리뷰 리포트</Text>
          <Text style={styles.modalSub}>
            {displayHostName} VS {displayAwayName}
          </Text>

          <View style={styles.tabRow}>
            <TouchableOpacity style={[styles.tabBtn, activeTab === 'highlight' && styles.tabBtnActive]} onPress={() => setActiveTab('highlight')}>
              <Text style={[styles.tabText, activeTab === 'highlight' && styles.tabTextActive]}>🏆 오늘의 하이라이트</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.tabBtn, activeTab === 'timeline' && styles.tabBtnActive]} onPress={() => setActiveTab('timeline')}>
              <Text style={[styles.tabText, activeTab === 'timeline' && styles.tabTextActive]}>📈 세트별 흐름</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={Colors.primary} />
            </View>
          ) : (
            <ScrollView style={styles.scrollArea} showsVerticalScrollIndicator={false}>
              {activeTab === 'highlight' ? (
                <View style={styles.highlightContainer}>
                  <View style={styles.scoreSummaryBox}>
                    <Text style={styles.scoreSummaryTitle}>최종 결과</Text>
                    <Text style={styles.scoreSummaryWinner}>
                      {match.winner_team === 'draw' ? '🤝 무승부' : match.winner_team ? `🥇 ${match.winner_team} 승리` : '진행 중'}
                    </Text>
                    <Text style={styles.scoreSummarySets}>{match.set_scores || '기록 없음'}</Text>
                  </View>

                  <View style={styles.recordGrid}>
                    <View style={styles.recordCard}>
                      <Text style={styles.recordEmoji}>👑</Text>
                      <Text style={styles.recordTitle}>오늘의 득점왕 (MVP)</Text>
                      <Text style={styles.recordValue}>{analytics.mvpName}</Text>
                      <Text style={styles.recordSub}>최다 점수를 획득한 폭격기</Text>
                    </View>

                    <View style={styles.recordCard}>
                      <Text style={styles.recordEmoji}>🎯</Text>
                      <Text style={styles.recordTitle}>클러치 요정</Text>
                      <Text style={styles.recordValue}>{analytics.clutchNames}</Text>
                      <Text style={styles.recordSub}>세트를 끝낸 결정적 득점자</Text>
                    </View>

                    <View style={[styles.recordCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                      <Text style={styles.recordEmoji}>🔥</Text>
                      <Text style={[styles.recordTitle, { color: '#B91C1C' }]}>폭풍 연속 득점</Text>
                      <Text style={[styles.recordValue, { color: '#991B1B' }]}>최대 {Math.max(analytics.maxHostStreak, analytics.maxAwayStreak)}점 연속</Text>
                      <Text style={[styles.recordSub, { color: '#DC2626' }]}>상대 득점 없이 몰아친 기록</Text>
                    </View>

                    <View style={[styles.recordCard, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                      <Text style={styles.recordEmoji}>📉</Text>
                      <Text style={[styles.recordTitle, { color: '#475569' }]}>뼈아픈 연속 실점</Text>
                      <Text style={[styles.recordValue, { color: '#334155' }]}>최대 {Math.max(analytics.maxHostStreak, analytics.maxAwayStreak)}점 헌납</Text>
                      <Text style={[styles.recordSub, { color: '#64748B' }]}>집중력이 흔들렸던 순간</Text>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.timelineContainer}>
                  <Text style={styles.timelineHint}>※ 전광판에 기록된 점수 흐름만 표시됩니다.</Text>
                  
                  <View style={styles.setTabNavRow}>
                    {Array.from({ length: analytics.setsPlayedCount }).map((_, idx) => (
                      <TouchableOpacity
                        key={idx}
                        style={[styles.setNavPill, activeSetIndex === idx && styles.setNavPillActive]}
                        onPress={() => setActiveSetIndex(idx)}
                      >
                        <Text style={[styles.setNavPillText, activeSetIndex === idx && styles.setNavPillTextActive]}>
                          {idx + 1}세트
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.timelineBox}>
                    <ScoreTimeline 
                      events={events} 
                      canControl={false} 
                      displayHostName={displayHostName} 
                      displayAwayName={displayAwayName}
                      currentSetIndex={activeSetIndex}
                      onEditEvent={() => {}} 
                    />
                  </View>
                </View>
              )}
            </ScrollView>
          )}

          <View style={styles.adWrapper}>
            <StickyAdBanner isModal={true} />
          </View>

          <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.closeBtnText}>닫기</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, width: '100%', maxHeight: '88%', elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: '900', color: Colors.text, marginBottom: 2 },
  modalSub: { fontSize: 13, color: Colors.textMuted, marginBottom: 12 },
  
  tabRow: { flexDirection: 'row', backgroundColor: '#F1F5F9', borderRadius: 10, padding: 4, marginBottom: 12 },
  tabBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabBtnActive: { backgroundColor: '#FFFFFF', elevation: 1 },
  tabText: { fontSize: 13, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: Colors.primary, fontWeight: '900' },

  loadingBox: { padding: 40, alignItems: 'center' },
  scrollArea: { flexShrink: 1, flexGrow: 0 },
  
  highlightContainer: { gap: 10 },
  scoreSummaryBox: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 16, alignItems: 'center', borderWidth: 1, borderColor: '#BFDBFE' },
  scoreSummaryTitle: { fontSize: 11, fontWeight: '800', color: '#3B82F6', marginBottom: 4 },
  scoreSummaryWinner: { fontSize: 20, fontWeight: '900', color: '#1E40AF', marginBottom: 6 },
  scoreSummarySets: { fontSize: 14, fontWeight: '800', color: '#1D4ED8' },

  recordGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  recordCard: { width: '48.5%', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 12, alignItems: 'center' },
  recordEmoji: { fontSize: 24, marginBottom: 4 },
  recordTitle: { fontSize: 11, fontWeight: '800', color: '#D97706', marginBottom: 4 },
  recordValue: { fontSize: 14, fontWeight: '900', color: '#92400E', textAlign: 'center', marginBottom: 4 },
  recordSub: { fontSize: 9.5, color: '#B45309', fontWeight: '600', textAlign: 'center' },

  timelineContainer: { gap: 8 },
  timelineHint: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginBottom: 4 },
  setTabNavRow: { flexDirection: 'row', gap: 6, flexWrap: 'wrap' },
  setNavPill: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  setNavPillActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  setNavPillText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  setNavPillTextActive: { color: '#FFFFFF', fontWeight: '900' },
  timelineBox: { backgroundColor: '#0F172A', borderRadius: 12, padding: 12, marginTop: 8 },

  adWrapper: { marginTop: 8, borderRadius: 12, overflow: 'hidden' },
  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  closeBtnText: { color: Colors.text, fontSize: 14, fontWeight: '800' },
});