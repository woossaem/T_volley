import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  SafeAreaView,
  RefreshControl,
  Modal,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';

interface TeamRankingData {
  team_name: string;
  total_games: number;
  total_wins: number;
  total_losses: number;
  total_draws: number;
  points: number;
  win_rate: number;
  memberCount: number;
  isOfficial: boolean;
  isQualified: boolean;
  region: string;
  type: string;
}

interface PersonalRankingData {
  userId: string;
  fullName: string;
  isPublic: boolean;
  schoolName: string;
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
}

const PERIOD_OPTIONS = [
  { id: '2026_1', label: '📅 2026 상반기 시즌' },
  { id: '2025_2', label: '📅 2025 하반기 시즌' },
  { id: '2025_1', label: '📅 2025 상반기 시즌' },
  { id: 'hall_of_fame', label: '🏛️ 명예의 전당 (역대 통산)' },
];

export default function RankingScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [rankTab, setRankTab] = useState<'team' | 'personal'>('team');
  const [selectedPeriod, setSelectedPeriod] = useState('2026_1');
  const [selectedRegion, setSelectedRegion] = useState('전체');

  // 🔥 유저 편의성 정렬 기준 State (기본값: 승점순)
  const [sortCriterion, setSortCriterion] = useState<'points' | 'wins' | 'winRate'>('points');

  // 시즌 선택 팝업 모달 State
  const [periodModalVisible, setPeriodModalVisible] = useState(false);

  const [qualifiedTeamRanks, setQualifiedTeamRanks] = useState<TeamRankingData[]>([]);
  const [pendingTeamRanks, setPendingTeamRanks] = useState<TeamRankingData[]>([]);
  const [personalRanks, setPersonalRanks] = useState<PersonalRankingData[]>([]);

  useEffect(() => {
    fetchRankings();
  }, [selectedRegion, selectedPeriod, sortCriterion, rankTab]);

  const fetchRankings = async () => {
    try {
      setLoading(true);

      const { data: allTeams } = await supabase.from('teams').select('*');
      const { data: allMatches } = await supabase.from('matches').select('*').eq('status', 'completed');
      const { data: allProfiles } = await supabase.from('profiles').select('*');

      // 시즌별 날짜 스크리닝
      const targetMatches = (allMatches || []).filter((m: any) => {
        if (selectedPeriod === '2026_1') return m.match_date && m.match_date.includes('2026');
        if (selectedPeriod === '2025_2') return m.match_date && m.match_date.includes('2025');
        if (selectedPeriod === '2025_1') return m.match_date && m.match_date.includes('2025');
        return true; // 명예의 전당 (통산)
      });

      // 1. 활성 팀원 수 집계 (블루리본 3명 판별)
      const { data: tmData } = await supabase.from('team_members').select('teams(name)').eq('is_active', true);
      const memberMap = new Map<string, number>();
      tmData?.forEach((item: any) => {
        const tName = item.teams?.name;
        if (tName) memberMap.set(tName, (memberMap.get(tName) || 0) + 1);
      });

      // 2. 팀 랭킹 데이터 연산
      const processedTeams: TeamRankingData[] = (allTeams || []).map((t: any) => {
        const matches = targetMatches.filter((m: any) => m.host_team_name === t.name || m.away_team_name === t.name);

        let wins = 0, draws = 0, losses = 0;
        matches.forEach((m: any) => {
          if (m.winner_team === t.name) wins++;
          else if (m.winner_team === 'draw' || m.winner_team === '무승부') draws++;
          else losses++;
        });

        const total = wins + draws + losses;
        const count = memberMap.get(t.name) || 0;
        const points = wins * 3 + draws * 1; // 승점: 승3 / 무1 / 패0

        return {
          team_name: t.name,
          total_games: total,
          total_wins: wins,
          total_losses: losses,
          total_draws: draws,
          points,
          win_rate: total > 0 ? Math.round((wins / total) * 100) : 0,
          memberCount: count,
          isOfficial: count >= 3, // 블루리본 3명 이상
          isQualified: total >= (selectedPeriod === 'hall_of_fame' ? 3 : 2), // 최소 경기 수 달성
          region: t.region || '천안',
          type: t.team_type || 'school',
        };
      });

      const filteredTeams = processedTeams.filter((t) => selectedRegion === '전체' || t.region === selectedRegion);

      // 정식 차트 vs 대기 차트 분리
      const qualified = filteredTeams.filter((t) => t.isOfficial && t.isQualified);
      const pending = filteredTeams.filter((t) => !t.isOfficial || !t.isQualified);

      // 🔥 선택한 정렬 기준에 따른 팀 랭킹 동적 정렬
      qualified.sort((a, b) => {
        if (sortCriterion === 'points') {
          return b.points - a.points || b.total_wins - a.total_wins || b.win_rate - a.win_rate;
        } else if (sortCriterion === 'wins') {
          return b.total_wins - a.total_wins || b.points - a.points || b.win_rate - a.win_rate;
        } else {
          return b.win_rate - a.win_rate || b.points - a.points || b.total_wins - a.total_wins;
        }
      });

      setQualifiedTeamRanks(qualified);
      setPendingTeamRanks(pending);

      // 3. 개인 다승 랭킹 연산
      const pRanks: PersonalRankingData[] = (allProfiles || []).map((p: any) => {
        let wins = 0, losses = 0, draws = 0;

        targetMatches.forEach((m: any) => {
          const inHost = m.host_roster?.split(',').includes(p.id);
          const inAway = m.away_roster?.split(',').includes(p.id);

          if (inHost || inAway) {
            const myTeamInMatch = inHost ? m.host_team_name : m.away_team_name;
            if (m.winner_team === myTeamInMatch) wins++;
            else if (m.winner_team === 'draw' || m.winner_team === '무승부') draws++;
            else losses++;
          }
        });

        const total = wins + losses + draws;
        return {
          userId: p.id,
          fullName: p.full_name || '선생님',
          isPublic: p.is_name_public ?? false,
          schoolName: p.school_name || '소속 학교 미설정',
          totalMatches: total,
          wins,
          losses,
          draws,
          winRate: total > 0 ? Math.round((wins / total) * 100) : 0,
        };
      });

      // 🔥 선택한 정렬 기준에 따른 개인 랭킹 동적 정렬
      pRanks.sort((a, b) => {
        if (sortCriterion === 'winRate') {
          return b.winRate - a.winRate || b.wins - a.wins || b.totalMatches - a.totalMatches;
        } else {
          // 다승순/승점순 기본값: 다승 우선
          return b.wins - a.wins || b.winRate - a.winRate || b.totalMatches - a.totalMatches;
        }
      });

      setPersonalRanks(pRanks.filter((p) => p.totalMatches > 0));

    } catch (err) {
      console.error('랭킹 연산 오류:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const maskName = (name: string) => {
    if (!name) return '선생님';
    if (name.length <= 2) return name[0] + '*';
    return name[0] + '*'.repeat(name.length - 2) + name[name.length - 1];
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}위`;
  };

  const currentPeriodLabel = PERIOD_OPTIONS.find(p => p.id === selectedPeriod)?.label || '시즌 선택';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>랭킹 보기</Text>
        <View style={{ width: 32 }} />
      </View>

      {/* 랭킹 탭 (팀 vs 개인) */}
      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, rankTab === 'team' && styles.tabActive]} onPress={() => setRankTab('team')}>
          <Text style={[styles.tabText, rankTab === 'team' && styles.tabTextActive]}>🛡️ 공식 팀 랭킹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, rankTab === 'personal' && styles.tabActive]} onPress={() => setRankTab('personal')}>
          <Text style={[styles.tabText, rankTab === 'personal' && styles.tabTextActive]}>🏃‍♂️ 개인 다승 랭킹</Text>
        </TouchableOpacity>
      </View>

      {/* 스마트 시즌 선택 드롭다운 버튼 */}
      <View style={styles.periodSelectorBar}>
        <TouchableOpacity style={styles.periodSelectBtn} onPress={() => setPeriodModalVisible(true)}>
          <Text style={styles.periodSelectBtnText}>{currentPeriodLabel}</Text>
          <Text style={styles.periodSelectArrow}>▼</Text>
        </TouchableOpacity>
      </View>

      {/* 🔥 유저 편의성 정렬 기준 선택 칩 (승점순 / 다승순 / 승률순) */}
      <View style={styles.sortFilterRow}>
        <Text style={styles.sortLabel}>정렬 기준:</Text>
        <TouchableOpacity
          style={[styles.sortChip, sortCriterion === 'points' && styles.sortChipActive]}
          onPress={() => setSortCriterion('points')}
        >
          <Text style={[styles.sortChipText, sortCriterion === 'points' && styles.sortChipTextActive]}>📊 승점순</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortChip, sortCriterion === 'wins' && styles.sortChipActive]}
          onPress={() => setSortCriterion('wins')}
        >
          <Text style={[styles.sortChipText, sortCriterion === 'wins' && styles.sortChipTextActive]}>🏆 다승순</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sortChip, sortCriterion === 'winRate' && styles.sortChipActive]}
          onPress={() => setSortCriterion('winRate')}
        >
          <Text style={[styles.sortChipText, sortCriterion === 'winRate' && styles.sortChipTextActive]}>🔥 승률순</Text>
        </TouchableOpacity>
      </View>

      {/* 지역 필터 */}
      <View style={styles.filterRow}>
        {['전체', '천안', '아산', '기타'].map((r) => (
          <TouchableOpacity key={r} style={[styles.fChip, selectedRegion === r && styles.fChipActive]} onPress={() => setSelectedRegion(r)}>
            <Text style={[styles.fChipText, selectedRegion === r && styles.fChipTextActive]}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRankings(); }} />}>
        
        {/* 📌 랭킹 산정 기준 안내 배너 */}
        <View style={styles.ruleBanner}>
          <Text style={styles.ruleTitle}>📌 랭킹 산정 기준</Text>
          <Text style={styles.ruleText}>
            • <Text style={{ fontWeight: '700', color: '#1D4ED8' }}>블루리본(3명 이상)</Text> 인증 팀만 정식 차트에 집계됩니다.{'\n'}
            • 승점제 적용: <Text style={{ fontWeight: '700', color: '#1D4ED8' }}>승리 3점, 무승부 1점, 패배 0점</Text>{'\n'}
            • 상단 정렬 버튼으로 <Text style={{ fontWeight: '700' }}>승점순 / 다승순 / 승률순</Text> 조회가 가능합니다.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : rankTab === 'team' ? (
          <>
            {/* 정식 랭킹 차트 Header */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🏆 {currentPeriodLabel}</Text>
              <Text style={styles.sectionCount}>{qualifiedTeamRanks.length}개 팀</Text>
            </View>

            {qualifiedTeamRanks.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>해당 기간에 집계된 정식 팀 기록이 없습니다.</Text>
                <Text style={styles.emptySub}>팀원 3명을 모으고 경기 기록을 쌓아보세요!</Text>
              </View>
            ) : (
              qualifiedTeamRanks.map((item, index) => (
                <View key={item.team_name} style={[styles.rankCard, index === 0 && styles.rankCardFirst]}>
                  <Text style={styles.rankBadgeText}>{getRankBadge(index)}</Text>
                  
                  <View style={styles.teamInfo}>
                    <View style={styles.teamNameRow}>
                      <Text style={styles.teamName}>{item.type === 'club' ? '🏐' : '🏫'} {item.team_name}</Text>
                      <View style={styles.blueRibbonMini}><Text style={{ fontSize: 12 }}>🟦</Text></View>
                    </View>
                    <Text style={styles.recordText}>
                      {item.total_games}전 {item.total_wins}승 {item.total_draws > 0 ? `${item.total_draws}무 ` : ''}{item.total_losses}패 (승점 {item.points}점)
                    </Text>
                  </View>

                  <View style={styles.winRateBox}>
                    <Text style={styles.winRateNum}>{item.win_rate}%</Text>
                    <Text style={styles.winRateLabel}>승률 ({item.points}pt)</Text>
                  </View>
                </View>
              ))
            )}

            {/* ⏳ 집계 대기 중인 팀 섹션 */}
            {pendingTeamRanks.length > 0 && (
              <View style={{ marginTop: 24 }}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitleMuted}>⏳ 집계 대기 중인 팀</Text>
                  <Text style={styles.sectionCount}>{pendingTeamRanks.length}개 팀</Text>
                </View>

                {pendingTeamRanks.map((item) => (
                  <View key={item.team_name} style={styles.pendingCard}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pendingTeamName}>{item.team_name}</Text>
                      <Text style={styles.pendingReason}>
                        {!item.isOfficial
                          ? `인원 부족 (${item.memberCount}/3명)`
                          : `경기 수 부족 (${item.total_games}/${selectedPeriod === 'hall_of_fame' ? 3 : 2}경기)`}
                      </Text>
                    </View>
                    <Text style={styles.pendingRecord}>
                      {item.total_wins}승 {item.total_losses}패 ({item.win_rate}%)
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        ) : (
          /* 개인 다승 랭킹 차트 */
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🏃‍♂️ {currentPeriodLabel} 개인 차트</Text>
              <Text style={styles.sectionCount}>{personalRanks.length}명</Text>
            </View>

            {personalRanks.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>해당 기간에 출전 기록이 있는 선수가 없습니다.</Text>
              </View>
            ) : (
              personalRanks.map((item, index) => (
                <View key={item.userId} style={styles.rankCard}>
                  <Text style={styles.rankBadgeText}>{getRankBadge(index)}</Text>
                  <View style={{ flex: 1, marginHorizontal: 12 }}>
                    <Text style={styles.teamName}>👤 {item.isPublic ? item.fullName : maskName(item.fullName)} 선생님</Text>
                    <Text style={styles.recordText}>🏫 {item.schoolName}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.winRateNum, { color: '#0284C7' }]}>{item.wins}승</Text>
                    <Text style={styles.winRateLabel}>{item.totalMatches}전 (승률 {item.winRate}%)</Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}
      </ScrollView>

      {/* 시즌 / 명예의 전당 선택 팝업 모달 */}
      <Modal visible={periodModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📅 랭킹 시즌 / 명예의 전당 선택</Text>
            <Text style={styles.modalSub}>조회하고 싶은 시즌 차트를 선택해 주세요.</Text>
            
            <View style={{ gap: 8, marginVertical: 12 }}>
              {PERIOD_OPTIONS.map((p) => {
                const isSelected = selectedPeriod === p.id;
                return (
                  <TouchableOpacity
                    key={p.id}
                    style={[styles.periodOptionBtn, isSelected && styles.periodOptionBtnActive]}
                    onPress={() => {
                      setSelectedPeriod(p.id);
                      setPeriodModalVisible(false);
                    }}
                  >
                    <Text style={[styles.periodOptionText, isSelected && styles.periodOptionTextActive]}>
                      {p.label}
                    </Text>
                    {isSelected && <Text style={{ color: '#2563EB', fontWeight: '800' }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setPeriodModalVisible(false)}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  headerTitle: { fontSize: 18, fontWeight: '700', color: Colors.text },
  tabContainer: { flexDirection: 'row', backgroundColor: Colors.surface, padding: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#EFF6FF' },
  tabText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  tabTextActive: { color: Colors.primary, fontWeight: '800' },
  
  periodSelectorBar: { paddingHorizontal: 16, paddingTop: 12 },
  periodSelectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#3B82F6', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  periodSelectBtnText: { fontSize: 14, fontWeight: '800', color: '#1D4ED8' },
  periodSelectArrow: { fontSize: 12, color: '#1D4ED8', fontWeight: '800' },

  // 🔥 정렬 기준 칩 바 스타일
  sortFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 10 },
  sortLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginRight: 2 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  sortChipActive: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  sortChipText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  sortChipTextActive: { color: '#B45309', fontWeight: '800' },

  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
  fChip: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F1F5F9' },
  fChipActive: { backgroundColor: Colors.primary },
  fChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  fChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  content: { padding: 16, paddingBottom: 40 },
  
  ruleBanner: { backgroundColor: '#EFF6FF', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#BFDBFE', marginBottom: 16 },
  ruleTitle: { fontSize: 14, fontWeight: '800', color: '#1E40AF', marginBottom: 6 },
  ruleText: { fontSize: 13, color: '#1E3A8A', lineHeight: 18 },

  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  sectionTitleMuted: { fontSize: 15, fontWeight: '700', color: Colors.textMuted },
  sectionCount: { fontSize: 12, color: Colors.textMuted },
  emptyBox: { backgroundColor: Colors.surface, borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  emptyText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted },
  emptySub: { fontSize: 12, color: '#94A3B8', marginTop: 4 },

  rankCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  rankCardFirst: { borderColor: '#FDE047', backgroundColor: '#FEFCE8', borderWidth: 1.5 },
  rankBadgeText: { fontSize: 18, fontWeight: '800', color: Colors.primary, width: 36, textAlign: 'center' },
  teamInfo: { flex: 1, paddingHorizontal: 12 },
  teamNameRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  teamName: { fontSize: 15, fontWeight: '800', color: Colors.text },
  blueRibbonMini: { paddingHorizontal: 2 },
  recordText: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  winRateBox: { alignItems: 'flex-end', minWidth: 60 },
  winRateNum: { fontSize: 18, fontWeight: '900', color: Colors.primary },
  winRateLabel: { fontSize: 11, color: Colors.textMuted },

  pendingCard: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  pendingTeamName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  pendingReason: { fontSize: 12, color: '#D97706', fontWeight: '600', marginTop: 2 },
  pendingRecord: { fontSize: 13, fontWeight: '600', color: Colors.textMuted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, width: '100%' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  modalSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 12 },
  periodOptionBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 14, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  periodOptionBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  periodOptionText: { fontSize: 14, fontWeight: '700', color: '#334155' },
  periodOptionTextActive: { color: '#1D4ED8', fontWeight: '800' },
  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  closeBtnText: { color: Colors.text, fontWeight: '700' },
});