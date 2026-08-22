import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import StickyAdBanner from '../components/StickyAdBanner';
import MatchPostgameReportModal from '../components/MatchPostgameReportModal';
import { buildTeamStatusByName, formatTeamDisplayName } from '../lib/teamStatus';

interface MatchHistoryItem {
  id: string;
  host_user_id: string;
  host_team_name: string;
  away_team_name?: string;
  region?: string;
  match_date: string;
  match_time: string;
  location: string;
  format: string;
  description: string;
  status: string;
  winner_team?: string;
  submitted_by_name?: string;
  approved_by_name?: string;
  roster_updated_by_name?: string;
  set_scores?: string | null;
  host_roster?: string;
  away_roster?: string;
  host_mercenary_roster?: string | null;
  away_mercenary_roster?: string | null;
  created_at: string;
}

export default function MyMatchHistoryScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id || '';

  const [rawMatches, setRawMatches] = useState<MatchHistoryItem[]>([]);
  const [myTeams, setMyTeams] = useState<string[]>([]);
  const [teamStatusByName, setTeamStatusByName] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [selectedSeason, setSelectedSeason] = useState<string>(String(new Date().getFullYear()));
  const [seasonPickerModalVisible, setSeasonPickerModalVisible] = useState(false);

  const [matchTypeFilter, setMatchTypeFilter] = useState<'all' | 'official' | 'tournament' | 'intra' | 'mercenary'>('all');
  const [resultFilter, setResultFilter] = useState<'all' | 'win' | 'loss'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportTargetMatch, setReportTargetMatch] = useState<MatchHistoryItem | null>(null);

  const parseTeamName = (rawName: any): string => {
    if (!rawName) return '';
    if (typeof rawName === 'string') return rawName.trim();
    if (Array.isArray(rawName) && rawName.length > 0) return parseTeamName(rawName[0]);
    if (typeof rawName === 'object' && rawName.name) return parseTeamName(rawName.name);
    return '';
  };

  const parseMatchDate = (dateStr: string | undefined | null) => {
    if (!dateStr) return { year: 0, month: 0 };
    const numbers = dateStr.match(/\d+/g);
    if (!numbers || numbers.length < 2) return { year: 0, month: 0 };
    return {
      year: parseInt(numbers[0], 10) || 0,
      month: parseInt(numbers[1], 10) || 0,
    };
  };

  const parseRosterUserIds = (rosterStr: string | null | undefined): string[] => {
    if (!rosterStr) return [];
    try {
      const parsed = JSON.parse(rosterStr);
      if (typeof parsed === 'object' && !Array.isArray(parsed) && parsed !== null) {
        const userIds = new Set<string>();
        Object.values(parsed).forEach((arr: any) => {
          if (Array.isArray(arr)) {
            arr.forEach((id: string) => userIds.add(id));
          }
        });
        return Array.from(userIds);
      }
    } catch (e) {}
    return rosterStr.split(',').filter(Boolean);
  };

  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    const currentYear = new Date().getFullYear();
    yearsSet.add(currentYear);

    rawMatches.forEach((m) => {
      const { year } = parseMatchDate(m.match_date || m.created_at);
      if (year > 2000) yearsSet.add(year);
    });

    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [rawMatches]);

  const fetchData = async () => {
    if (!currentUserId) return setLoading(false);

    try {
      const { data: tmData } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('user_id', currentUserId)
        .eq('is_active', true);

      const teamIds = tmData?.map((tm: any) => tm.team_id) || [];
      let teamNames: string[] = [];
      if (teamIds.length > 0) {
        const { data: tData } = await supabase.from('teams').select('name').in('id', teamIds);
        teamNames = (tData || []).map((t: any) => parseTeamName(t.name)).filter(Boolean);
      }
      setMyTeams(teamNames);

      const { data: teamsData } = await supabase.from('teams').select('id, name, status');
      if (teamsData) {
        const parsed = teamsData.map((t: any) => ({
          name: parseTeamName(t.name),
          status: t.status || 'active',
        })).filter((t: any) => t.name);
        setTeamStatusByName(buildTeamStatusByName(parsed));
      }

      const { data: matchesData, error } = await supabase
        .from('matches')
        .select('*')
        .in('status', ['completed', 'friendly', 'intramural', 'pending_result', 'matched'])
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (matchesData) setRawMatches(matchesData);
    } catch (err) {
      console.error('출전 이력 조회 오류:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [session]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const processedMatches = useMemo(() => {
    return rawMatches.map((match) => {
      const hostList = parseRosterUserIds(match.host_roster);
      const awayList = parseRosterUserIds(match.away_roster);
      const inHost = currentUserId ? hostList.includes(currentUserId) : false;
      const inAway = currentUserId ? awayList.includes(currentUserId) : false;

      const hostMercList = parseRosterUserIds(match.host_mercenary_roster);
      const awayMercList = parseRosterUserIds(match.away_mercenary_roster);
      const isHostMerc = currentUserId ? hostMercList.includes(currentUserId) : false;
      const isAwayMerc = currentUserId ? awayMercList.includes(currentUserId) : false;

      const isMyTeamHost = myTeams.includes(match.host_team_name);
      const isMyTeamAway = match.away_team_name ? myTeams.includes(match.away_team_name) : false;

      const isPlayedByMe = inHost || inAway || isHostMerc || isAwayMerc;
      const isMyTeamPlayed = isMyTeamHost || isMyTeamAway;

      if (!isPlayedByMe && !isMyTeamPlayed) return null;

      const isIntra = match.status === 'intramural';
      const isTournament = match.format?.includes('대회') || match.format?.includes('토너먼트') || match.format?.includes('리그');
      
      // 💡 [핵심] winner_team 데이터가 없으면 'pending' (진행중) 처리
      let result: 'win' | 'loss' | 'draw' | 'pending' = 'pending';

      if (!match.winner_team) {
        result = 'pending';
      } else if (isIntra) {
        let teamA = 'A팀';
        let teamB = 'B팀';
        if (match.description) {
          const m = match.description.match(/^\[(.*?)\ VS (.*?)\]/);
          if (m) {
            teamA = m[1] || 'A팀';
            teamB = m[2] || 'B팀';
          }
        }

        const winner = match.winner_team;
        const isAWin = winner === teamA || winner === 'A팀' || winner === '청팀';
        const isBWin = winner === teamB || winner === 'B팀' || winner === '백팀';

        if (winner === 'draw' || winner === '무승부') {
          result = 'draw';
        } else if (inHost && isAWin) {
          result = 'win';
        } else if (inAway && isBWin) {
          result = 'win';
        } else {
          result = 'loss';
        }
      } else {
        const myPlayedTeam = (inHost || isHostMerc || isMyTeamHost)
          ? match.host_team_name
          : match.away_team_name;

        if (match.winner_team === 'draw' || match.winner_team === '무승부') {
          result = 'draw';
        } else if (match.winner_team === myPlayedTeam) {
          result = 'win';
        } else {
          result = 'loss';
        }
      }

      return {
        ...match,
        isPlayedByMe,
        isMercenary: isHostMerc || isAwayMerc,
        isIntra,
        isTournament,
        myResult: result,
      };
    }).filter(Boolean);
  }, [rawMatches, myTeams, currentUserId]);

  const filteredMatches = useMemo(() => {
    return processedMatches.filter((item: any) => {
      if (selectedSeason !== 'all') {
        const targetYear = Number(selectedSeason);
        const { year } = parseMatchDate(item.match_date || item.created_at);
        if (year !== targetYear) return false;
      }

      if (matchTypeFilter === 'official' && (item.isIntra || item.isMercenary || item.isTournament)) return false;
      if (matchTypeFilter === 'tournament' && !item.isTournament) return false;
      if (matchTypeFilter === 'intra' && !item.isIntra) return false;
      if (matchTypeFilter === 'mercenary' && !item.isMercenary) return false;

      if (resultFilter === 'win' && item.myResult !== 'win') return false;
      if (resultFilter === 'loss' && item.myResult !== 'loss') return false;

      const query = searchQuery.toLowerCase().trim();
      if (query) {
        const hostDisplay = formatTeamDisplayName(item.host_team_name, teamStatusByName[item.host_team_name]).toLowerCase();
        const awayDisplay = formatTeamDisplayName(item.away_team_name, teamStatusByName[item.away_team_name || '']).toLowerCase();
        const passHost = item.host_team_name.toLowerCase().includes(query) || hostDisplay.includes(query);
        const passAway = item.away_team_name?.toLowerCase().includes(query) || awayDisplay.includes(query);
        const passLocation = item.location.toLowerCase().includes(query);
        if (!passHost && !passAway && !passLocation) return false;
      }

      return true;
    });
  }, [processedMatches, selectedSeason, matchTypeFilter, resultFilter, searchQuery, teamStatusByName]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>상세 출전 이력 기록실</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.seasonBar}>
        <Text style={styles.seasonBarTitle}>조회 시즌</Text>
        <TouchableOpacity
          style={styles.seasonPickerBtn}
          onPress={() => setSeasonPickerModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.seasonPickerBtnText}>
            {selectedSeason === 'all' ? '📜 통산 전체' : `📅 ${selectedSeason} 시즌`}
          </Text>
          <Text style={styles.seasonPickerArrow}>▾</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.typeFilterRow}>
        <TouchableOpacity
          style={[styles.typeChip, matchTypeFilter === 'all' && styles.typeChipActive]}
          onPress={() => setMatchTypeFilter('all')}
        >
          <Text style={[styles.typeChipText, matchTypeFilter === 'all' && styles.typeChipTextActive]}>🌐 전체</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.typeChip, matchTypeFilter === 'official' && styles.typeChipActiveOfficial]}
          onPress={() => setMatchTypeFilter('official')}
        >
          <Text style={[styles.typeChipText, matchTypeFilter === 'official' && styles.typeChipTextActiveOfficial]}>🏟️ 교류전</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.typeChip, matchTypeFilter === 'tournament' && styles.typeChipActiveTournament]}
          onPress={() => setMatchTypeFilter('tournament')}
        >
          <Text style={[styles.typeChipText, matchTypeFilter === 'tournament' && styles.typeChipTextActiveTournament]}>🏆 대회·리그</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.typeChip, matchTypeFilter === 'intra' && styles.typeChipActiveIntra]}
          onPress={() => setMatchTypeFilter('intra')}
        >
          <Text style={[styles.typeChipText, matchTypeFilter === 'intra' && styles.typeChipTextActiveIntra]}>⚔️ 내전</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.typeChip, matchTypeFilter === 'mercenary' && styles.typeChipActiveMercenary]}
          onPress={() => setMatchTypeFilter('mercenary')}
        >
          <Text style={[styles.typeChipText, matchTypeFilter === 'mercenary' && styles.typeChipTextActiveMercenary]}>🙋‍♂️ 용병</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.resultFilterRow}>
        <TouchableOpacity
          style={[styles.resultChip, resultFilter === 'all' && styles.resultChipActive]}
          onPress={() => setResultFilter('all')}
        >
          <Text style={[styles.resultChipText, resultFilter === 'all' && styles.resultChipTextActive]}>전체 결과</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resultChip, resultFilter === 'win' && styles.resultChipActiveWin]}
          onPress={() => setResultFilter('win')}
        >
          <Text style={[styles.resultChipText, resultFilter === 'win' && styles.resultChipTextActiveWin]}>🏆 승리 경기만</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.resultChip, resultFilter === 'loss' && styles.resultChipActiveLoss]}
          onPress={() => setResultFilter('loss')}
        >
          <Text style={[styles.resultChipText, resultFilter === 'loss' && styles.resultChipTextActiveLoss]}>❌ 패배 경기만</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          placeholder="상대 팀 이름이나 장소를 검색하세요"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : filteredMatches.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyEmoji}>📜</Text>
            <Text style={styles.emptyText}>
              {selectedSeason === 'all'
                ? '조건에 맞는 경기 출전 이력이 없습니다.'
                : `${selectedSeason} 시즌에 해당 조건의 경기 이력이 없습니다.`}
            </Text>
          </View>
        ) : (
          filteredMatches.map((match: any) => {
            const isWin = match.myResult === 'win';
            const isDraw = match.myResult === 'draw';
            const isPending = match.myResult === 'pending';

            return (
              <View key={match.id} style={styles.historyCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.teamInfo}>
                    <Text style={styles.hostTeamText}>{formatTeamDisplayName(match.host_team_name, teamStatusByName[match.host_team_name])}</Text>
                    <Text style={styles.vsText}>VS</Text>
                    <Text style={styles.awayTeamText}>{match.away_team_name ? formatTeamDisplayName(match.away_team_name, teamStatusByName[match.away_team_name]) : '자체 내전'}</Text>
                  </View>

                  <View
                    style={[
                      styles.resultBadge,
                      isWin ? styles.winBadge : isDraw ? styles.drawBadge : isPending ? styles.pendingBadge : styles.lossBadge,
                    ]}
                  >
                    <Text
                      style={[
                        styles.resultBadgeText,
                        isWin ? styles.winBadgeText : isDraw ? styles.drawBadgeText : isPending ? styles.pendingBadgeText : styles.lossBadgeText,
                      ]}
                    >
                      {isWin ? '🏆 승리' : isDraw ? '🤝 무승부' : isPending ? '⏳ 진행중' : '❌ 패배'}
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                  {match.isIntra ? (
                    <View style={[styles.typeTag, { backgroundColor: '#F3E8FF', borderColor: '#D8B4FE' }]}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#7E22CE' }}>⚔️ 자체 연습경기</Text>
                    </View>
                  ) : match.isTournament ? (
                    <View style={[styles.typeTag, { backgroundColor: '#FEFCE8', borderColor: '#FDE68A' }]}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#B45309' }}>🏆 대회·리그전</Text>
                    </View>
                  ) : match.isMercenary ? (
                    <View style={[styles.typeTag, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#B45309' }}>🙋‍♂️ 용병 출전</Text>
                    </View>
                  ) : (
                    <View style={[styles.typeTag, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#1D4ED8' }}>🏟️ 일반 팀 교류전</Text>
                    </View>
                  )}
                </View>

                <View style={styles.detailsBox}>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailIcon}>📅</Text>
                    <Text style={styles.detailText}>{match.match_date} ({match.match_time})</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailIcon}>📍</Text>
                    <Text style={styles.detailText}>[{match.region || '천안'}] {match.location}</Text>
                  </View>
                  {match.set_scores ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailIcon}>📊</Text>
                      <Text style={[styles.detailText, { fontWeight: '800', color: Colors.primary }]}>
                        세트 점수: {match.set_scores}
                      </Text>
                    </View>
                  ) : null}

                  {(match.submitted_by_name || match.approved_by_name || match.roster_updated_by_name) && (
                    <View style={styles.auditRow}>
                      <Text style={styles.auditText}>
                        🛡️ 책임 기록: {match.submitted_by_name ? `제출(${match.submitted_by_name}) ` : ''}
                        {match.approved_by_name ? `승인(${match.approved_by_name}) ` : ''}
                        {match.roster_updated_by_name ? `명단수정(${match.roster_updated_by_name})` : ''}
                      </Text>
                    </View>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.reportBtn}
                  onPress={() => {
                    setReportTargetMatch(match);
                    setReportModalVisible(true);
                  }}
                  activeOpacity={0.85}
                >
                  <Text style={styles.reportBtnText}>📊 경기 결과 분석 리포트 보기 ›</Text>
                </TouchableOpacity>
              </View>
            );
          })
        )}
      </ScrollView>

      <StickyAdBanner />

      {reportModalVisible && reportTargetMatch && (
        <MatchPostgameReportModal
          visible={reportModalVisible}
          onClose={() => {
            setReportModalVisible(false);
            setReportTargetMatch(null);
          }}
          match={reportTargetMatch}
        />
      )}

      <Modal visible={seasonPickerModalVisible} animationType="fade" transparent={true} onRequestClose={() => setSeasonPickerModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📅 조회 시즌 선택</Text>
            <Text style={styles.modalSub}>출전 기록을 확인할 배구 시즌을 선택하세요.</Text>

            <View style={{ marginVertical: 12, gap: 8 }}>
              <TouchableOpacity
                style={[
                  styles.seasonOptionBtn,
                  selectedSeason === 'all' && styles.seasonOptionBtnActive,
                ]}
                onPress={() => {
                  setSelectedSeason('all');
                  setSeasonPickerModalVisible(false);
                }}
              >
                <Text style={[styles.seasonOptionText, selectedSeason === 'all' && styles.seasonOptionTextActive]}>
                  📜 통산 전체 기록
                </Text>
                {selectedSeason === 'all' && <Text style={styles.checkMark}>✅</Text>}
              </TouchableOpacity>

              {availableYears.map((yrNum) => {
                const yrStr = String(yrNum);
                const isSelected = selectedSeason === yrStr;
                return (
                  <TouchableOpacity
                    key={yrStr}
                    style={[
                      styles.seasonOptionBtn,
                      isSelected && styles.seasonOptionBtnActive,
                    ]}
                    onPress={() => {
                      setSelectedSeason(yrStr);
                      setSeasonPickerModalVisible(false);
                    }}
                  >
                    <Text style={[styles.seasonOptionText, isSelected && styles.seasonOptionTextActive]}>
                      📅 {yrStr} 시즌 기록
                    </Text>
                    {isSelected && <Text style={styles.checkMark}>✅</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.modalCloseBtn} onPress={() => setSeasonPickerModalVisible(false)}>
              <Text style={styles.modalCloseBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },

  seasonBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  seasonBarTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  seasonPickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, gap: 4 },
  seasonPickerBtnText: { fontSize: 13, fontWeight: '800', color: '#1D4ED8' },
  seasonPickerArrow: { fontSize: 13, color: '#1D4ED8', fontWeight: '900' },

  typeFilterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, gap: 4 },
  typeChip: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  typeChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  typeChipActiveOfficial: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  typeChipActiveTournament: { backgroundColor: '#FEFCE8', borderColor: '#F59E0B' },
  typeChipActiveIntra: { backgroundColor: '#F3E8FF', borderColor: '#9333EA' },
  typeChipActiveMercenary: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  typeChipText: { fontSize: 10.5, fontWeight: '700', color: '#64748B' },
  typeChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  typeChipTextActiveOfficial: { color: '#1D4ED8', fontWeight: '800' },
  typeChipTextActiveTournament: { color: '#B45309', fontWeight: '800' },
  typeChipTextActiveIntra: { color: '#6B21A8', fontWeight: '800' },
  typeChipTextActiveMercenary: { color: '#B45309', fontWeight: '800' },

  resultFilterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4, gap: 6 },
  resultChip: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  resultChipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  resultChipActiveWin: { backgroundColor: '#10B981', borderColor: '#059669' },
  resultChipActiveLoss: { backgroundColor: '#EF4444', borderColor: '#DC2626' },
  resultChipText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  resultChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  resultChipTextActiveWin: { color: '#FFFFFF', fontWeight: '800' },
  resultChipTextActiveLoss: { color: '#FFFFFF', fontWeight: '800' },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, marginHorizontal: 16, marginVertical: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: Colors.border },
  searchIcon: { fontSize: 15, marginRight: 6 },
  searchInput: { flex: 1, fontSize: 13, color: Colors.text },

  content: { padding: 16, gap: 10, paddingBottom: 40 },
  historyCard: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: Colors.border, elevation: 1 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  teamInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  hostTeamText: { fontSize: 15, fontWeight: '800', color: Colors.primary },
  vsText: { fontSize: 11, fontWeight: '800', color: '#94A3B8' },
  awayTeamText: { fontSize: 15, fontWeight: '800', color: '#0284C7' },

  resultBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1 },
  winBadge: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  winBadgeText: { color: '#059669', fontSize: 11, fontWeight: '800' },
  drawBadge: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
  drawBadgeText: { color: '#475569', fontSize: 11, fontWeight: '800' },
  pendingBadge: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  pendingBadgeText: { color: '#B45309', fontSize: 11, fontWeight: '800' },
  lossBadge: { backgroundColor: '#FEF2F2', borderColor: '#FECACA' },
  lossBadgeText: { color: '#DC2626', fontSize: 11, fontWeight: '800' },
  resultBadgeText: { fontSize: 11, fontWeight: '800' },

  typeTag: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },

  detailsBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, gap: 4 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  detailIcon: { fontSize: 13 },
  detailText: { fontSize: 12, color: Colors.text, fontWeight: '500' },

  auditRow: { marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  auditText: { fontSize: 10, color: '#1D4ED8', fontWeight: '800' },

  reportBtn: { backgroundColor: '#FEFCE8', borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: '#FDE047' },
  reportBtnText: { color: '#A16207', fontSize: 12, fontWeight: '800' },

  emptyBox: { padding: 30, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, marginTop: 16 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', textAlign: 'center', lineHeight: 18 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 16, padding: 16, width: '100%', elevation: 5 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  modalSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 12 },

  seasonOptionBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  seasonOptionBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  seasonOptionText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  seasonOptionTextActive: { color: '#1D4ED8', fontWeight: '800' },
  checkMark: { fontSize: 14 },

  modalCloseBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  modalCloseBtnText: { color: Colors.text, fontSize: 14, fontWeight: '800' },
});