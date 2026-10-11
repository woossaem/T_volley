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
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import { formatTeamDisplayName, isActiveMembership } from '../lib/teamStatus';
import { addMatchPlayerStats, emptyPlayerCareerStats, formatSetRecordLabel } from '../lib/playerStats';
import { publicProfileName } from '../lib/profilePrivacy';
import MiniAvatar from '../components/MiniAvatar';
import { hydrateMatchesWithSetScores } from '../lib/matchSets';
import { resolveTeamName, resolveTeamNameOrNull, cleanRegionName, getTeamIcon, isSameName, UNSET_REGION } from '../lib/nameUtils';
import UserProfileModal from '../components/UserProfileModal';
import TeamReportModal from '../components/TeamReportModal';
import StickyAdBanner from '../components/StickyAdBanner';
import BadgeCollectionModal from '../components/BadgeCollectionModal';
import { getCurrentSeasonInfo, getSeasonOptions } from '../lib/season';
import { getAllBadgesWithStatus } from '../lib/badgeUtils';
import { isOfficialMatch } from '../lib/officialMatch';
import { getSafeDisplayName, getSafeTeamName } from '../lib/utils';
import { isRankingEligiblePlayer } from '../lib/roster';
import { buildTeamReportAnalytics, listIntramuralTeamMatches, listOfficialTeamMatches } from '../lib/teamReportAnalytics';

interface TeamRankingData {
  team_id: string;
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
  careerWins: number;
  mannerTemp: number;
  status: string;
  created_at?: string;
}

interface PersonalRankingData {
  userId: string;
  fullName: string;
  isPublic: boolean;
  schoolName: string;
  region: string;
  gender: string;
  avatarIcon: string;
  avatarUrl?: string;
  totalMatches: number;
  wins: number;
  losses: number;
  draws: number;
  winRate: number;
  mannerTemp: number;
  points: number;
  faults: number;
  setsPlayed: number;
  setWins: number;
  setDraws: number;
  setLosses: number;
  setWinRate: number;
}

const getMatchSeasonCode = (dateStr: string) => {
  if (!dateStr) return '';
  const numbers = dateStr.match(/\d+/g);
  if (!numbers || numbers.length < 2) return '';
  const year = parseInt(numbers[0], 10) || 0;
  const month = parseInt(numbers[1], 10) || 0;
  if (!year || !month) return '';

  const seasonYear = month === 1 ? year - 1 : year;
  const half = (month >= 2 && month <= 7) ? 1 : 2;
  return `${seasonYear}_${half}`;
};

export default function RankingScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const currentSeason = getCurrentSeasonInfo();
  const periodOptions = useMemo(() => getSeasonOptions(), []);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [rankTab, setRankTab] = useState<'team' | 'personal'>('team');
  const [selectedPeriod, setSelectedPeriod] = useState<string>(currentSeason.periodCode);
  const [selectedRegion, setSelectedRegion] = useState('전체');

  const [genderFilter, setGenderFilter] = useState<'전체' | '남성' | '여성'>('전체');

  const [userPrioritizedRegions, setUserPrioritizedRegions] = useState<string[]>([]);
  const [dbActiveRegions, setDbActiveRegions] = useState<string[]>([]);

  const [selectedUserIdForModal, setSelectedUserIdForModal] = useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  const [selectedTeamForModal, setSelectedTeamForModal] = useState<string | null>(null);
  const [teamReportModalVisible, setTeamReportModalVisible] = useState(false);

  const [badgeModalVisible, setBadgeModalVisible] = useState(false);
  const [selectedBadgeUserParams, setSelectedBadgeUserParams] = useState<any>(null);

  const [sortCriterion, setSortCriterion] = useState<'points' | 'wins' | 'winRate'>('points');
  const [periodModalVisible, setPeriodModalVisible] = useState(false);

  const [rawMatches, setRawMatches] = useState<any[]>([]);
  const [qualifiedTeamRanks, setQualifiedTeamRanks] = useState<TeamRankingData[]>([]);
  const [pendingTeamRanks, setPendingTeamRanks] = useState<TeamRankingData[]>([]);
  const [personalRanks, setPersonalRanks] = useState<PersonalRankingData[]>([]);
  
  const [myTeammatesSet, setMyTeammatesSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (currentUserId) {
      supabase.from('profiles').select('gender, region').eq('id', currentUserId).maybeSingle().then(({ data }) => {
        if (data) {
          if (data.gender) setGenderFilter(data.gender === '여성' ? '여성' : '남성');
          if (data.region) {
            const regs = data.region.split(',').map((r: string) => cleanRegionName(r)).filter(Boolean);
            if (regs.length > 0) {
              setUserPrioritizedRegions(regs);
              setSelectedRegion(regs[0]);
            }
          }
        }
      });
    }
  }, [currentUserId]);

  const dynamicRegionTabs = useMemo(() => {
    const tabs = ['전체', ...userPrioritizedRegions];
    dbActiveRegions.forEach((r) => {
      if (!tabs.includes(r)) tabs.push(r);
    });
    return tabs;
  }, [userPrioritizedRegions, dbActiveRegions]);

  useEffect(() => {
    fetchRankings();
  }, [selectedRegion, selectedPeriod, sortCriterion, rankTab, genderFilter]);

  const fetchRankings = async () => {
    try {
      setLoading(true);

      const { data: allTeams } = await supabase.from('teams').select('*');
      const { data: allMatchesRaw } = await supabase
        .from('matches')
        .select('*, match_sets(*)')
        .eq('is_official', true)
        .eq('status', 'completed');
      const { data: intraMatchesRaw } = await supabase.from('matches').select('*, match_sets(*)').eq('status', 'intramural');
      const allMatches = await hydrateMatchesWithSetScores(allMatchesRaw || []);
      const intraMatches = await hydrateMatchesWithSetScores(intraMatchesRaw || []);
      const { data: allProfiles } = await supabase.from('profiles').select('*');
      
      const { data: tmData } = await supabase
        .from('team_members')
        .select('user_id, team_id, is_primary, is_active');

      setRawMatches([...allMatches, ...intraMatches]);

      const activeTmData = (tmData || []).filter((tm: any) => isActiveMembership(tm.is_active));

      if (currentUserId && activeTmData.length > 0) {
        const myTeamIds = activeTmData.filter((tm: any) => tm.user_id === currentUserId).map((tm: any) => tm.team_id);
        const teammateIds = new Set<string>();
        activeTmData.forEach((tm: any) => {
          if (myTeamIds.includes(tm.team_id)) {
            teammateIds.add(tm.user_id);
          }
        });
        setMyTeammatesSet(teammateIds);
      }

      const memberCountByTeamIdMap = new Map<string, number>();
      const memberCountByTeamNameMap = new Map<string, number>();
      const userSchoolRegionMap = new Map<string, string>();
      const regionsSet = new Set<string>();

      const teamIdToNameMap = new Map<string, string>();
      const teamIdToRegionMap = new Map<string, string>();
      const teamIdToTypeMap = new Map<string, string>();

      (allTeams || []).forEach((t: any) => {
        if (!t.id) return;
        const tName = resolveTeamName(t);
        teamIdToNameMap.set(t.id, tName);
        teamIdToRegionMap.set(t.id, cleanRegionName(t.region, UNSET_REGION));
        teamIdToTypeMap.set(t.id, t.team_type || '');
      });

      activeTmData.forEach((item: any) => {
        const uId = item.user_id;
        if (!isRankingEligiblePlayer(uId)) return;
        const tId = item.team_id;
        
        if (tId) {
          memberCountByTeamIdMap.set(tId, (memberCountByTeamIdMap.get(tId) || 0) + 1);
          const tName = teamIdToNameMap.get(tId);
          if (tName) {
            memberCountByTeamNameMap.set(tName, (memberCountByTeamNameMap.get(tName) || 0) + 1);
          }
          const tRegion = teamIdToRegionMap.get(tId);
          const tType = teamIdToTypeMap.get(tId);

          if (tRegion && tRegion !== UNSET_REGION) {
            regionsSet.add(tRegion);
          }
          if (uId) {
            const currentRegion = userSchoolRegionMap.get(uId);
            if (!currentRegion || tType === 'school' || item.is_primary) {
              if (tRegion) userSchoolRegionMap.set(uId, tRegion);
            }
          }
        }
      });

      (allTeams || []).forEach((t: any) => {
        const cleaned = cleanRegionName(t.region, '');
        if (cleaned) regionsSet.add(cleaned);
      });

      setDbActiveRegions(Array.from(regionsSet));

      const officialMatches = (allMatches || []).filter((m: any) => isOfficialMatch(m) && m.is_guest_match !== true);
      const careerWinsMap = new Map<string, number>();
      officialMatches.forEach((m: any) => {
        const wName = resolveTeamNameOrNull(m.winner_team);
        if (wName && wName !== 'draw' && wName !== '무승부') {
          careerWinsMap.set(wName, (careerWinsMap.get(wName) || 0) + 1);
        }
      });

      const targetMatches = officialMatches.filter((m: any) => {
        if (selectedPeriod === 'hall_of_fame') return true;
        const mSeasonCode = getMatchSeasonCode(m.match_date || m.created_at);
        return mSeasonCode === selectedPeriod;
      });
      const personalTargetMatches = officialMatches.filter((m: any) => {
        if (selectedPeriod === 'hall_of_fame') return true;
        const mSeasonCode = getMatchSeasonCode(m.match_date || m.created_at);
        return mSeasonCode === selectedPeriod;
      });

      const processedTeams: TeamRankingData[] = (allTeams || []).map((t: any) => {
        const pureName = resolveTeamName(t);

        const matches = targetMatches.filter((m: any) => {
          return isSameName(m.host_team_name, pureName) || isSameName(m.away_team_name, pureName);
        });

        let wins = 0, draws = 0, losses = 0;
        matches.forEach((m: any) => {
          if (isSameName(m.winner_team, pureName)) wins++;
          else if (m.winner_team === 'draw' || m.winner_team === '무승부') draws++;
          else losses++;
        });

        const total = wins + draws + losses;
        const count = memberCountByTeamIdMap.get(t.id) || memberCountByTeamNameMap.get(pureName) || 0;
        const points = wins * 3 + draws * 1;
        const careerWins = careerWinsMap.get(pureName) || 0;

        return {
          team_id: t.id,
          team_name: pureName,
          total_games: total,
          total_wins: wins,
          total_losses: losses,
          total_draws: draws,
          points,
          win_rate: total > 0 ? Math.round((wins / total) * 100) : 0,
          memberCount: count,
          isOfficial: count >= 3,
          isQualified: total >= (selectedPeriod === 'hall_of_fame' ? 3 : 2),
          region: cleanRegionName(t.region, UNSET_REGION),
          type: t.team_type || '',
          careerWins,
          mannerTemp: t.manner_temp || 36.5,
          status: t.status || 'active',
          created_at: t.created_at,
        };
      }).filter(Boolean) as TeamRankingData[];

      const filteredTeams = processedTeams.filter((t) => {
        if (selectedRegion === '전체') return true;
        return cleanRegionName(t.region) === selectedRegion || t.region === selectedRegion;
      });

      const qualified = filteredTeams.filter((t) => t.isOfficial && t.isQualified);
      const pending = filteredTeams.filter((t) => !t.isOfficial || !t.isQualified);

      qualified.sort((a, b) => {
        if (sortCriterion === 'points') return b.points - a.points || b.total_wins - a.total_wins || b.win_rate - a.win_rate;
        if (sortCriterion === 'wins') return b.total_wins - a.total_wins || b.points - a.points || b.win_rate - a.win_rate;
        return b.win_rate - a.win_rate || b.points - a.points || b.total_wins - a.total_wins;
      });

      pending.sort((a, b) => {
        if (b.total_games !== a.total_games) return b.total_games - a.total_games;
        if (b.isOfficial !== a.isOfficial) return (b.isOfficial ? 1 : 0) - (a.isOfficial ? 1 : 0);
        if (b.careerWins !== a.careerWins) return b.careerWins - a.careerWins;
        if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
        const dateA = new Date(a.created_at || 0).getTime();
        const dateB = new Date(b.created_at || 0).getTime();
        if (dateB !== dateA) return dateB - dateA;
        return a.team_name.localeCompare(b.team_name, 'ko');
      });

      setQualifiedTeamRanks(qualified);
      setPendingTeamRanks(pending);

      const eventsByMatch = new Map<string, any[]>();
      const targetMatchIds = personalTargetMatches.map((m: any) => m.id).filter(Boolean);
      for (let i = 0; i < targetMatchIds.length; i += 80) {
        const chunk = targetMatchIds.slice(i, i + 80);
        const { data: evRows } = await supabase
          .from('match_events')
          .select('match_id, player_id, player_name, event_type, is_canceled, set_index, host_score, away_score, team_type')
          .in('match_id', chunk)
          .eq('is_canceled', false);
        (evRows || []).forEach((e: any) => {
          const list = eventsByMatch.get(e.match_id) || [];
          list.push(e);
          eventsByMatch.set(e.match_id, list);
        });
      }

      const pRanks: PersonalRankingData[] = (allProfiles || []).filter((p: any) => (
        isRankingEligiblePlayer(p.id, { isGuest: p.is_guest, name: p.full_name })
      )).map((p: any) => {
        const career = emptyPlayerCareerStats();
        personalTargetMatches.forEach((m: any) => {
          addMatchPlayerStats(career, p.id, m, eventsByMatch.get(m.id) || [], p.full_name || getSafeDisplayName(p));
        });

        let userRegion = userSchoolRegionMap.get(p.id);
        if (!userRegion && p.region) {
          const regArr = p.region.split(',').map((r: string) => r.trim()).filter(Boolean);
          if (regArr.length > 0) userRegion = regArr[0];
        }
        if (!userRegion) userRegion = '지역 미설정';

        return {
          userId: p.id,
          fullName: publicProfileName(p),
          isPublic: true,
          schoolName: p.school_name || '소속 학교 미설정',
          region: userRegion,
          gender: p.gender || '남성',
          avatarIcon: p.avatar_icon || '🏐',
          avatarUrl: p.avatar_url,
          totalMatches: career.matchesPlayed,
          wins: career.matchWins,
          losses: career.matchLosses,
          draws: career.matchDraws,
          winRate: career.matchWinRate,
          mannerTemp: p.manner_temp || 36.5,
          points: career.points,
          faults: career.faults,
          setsPlayed: career.setsPlayed,
          setWins: career.setWins,
          setDraws: career.setDraws,
          setLosses: career.setLosses,
          setWinRate: career.setWinRate,
        };
      });

      const filteredPersonal = pRanks.filter((p) => {
        if (p.totalMatches <= 0) return false;
        if (genderFilter !== '전체' && p.gender !== genderFilter) return false;
        if (selectedRegion === '전체') return true;
        return p.region === selectedRegion;
      });

      filteredPersonal.sort((a, b) => {
        if (sortCriterion === 'winRate') return b.winRate - a.winRate || b.wins - a.wins || b.totalMatches - a.totalMatches;
        return b.wins - a.wins || b.winRate - a.winRate || b.totalMatches - a.totalMatches;
      });

      setPersonalRanks(filteredPersonal);
    } catch (err) {
      console.error('랭킹 연산 오류:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}위`;
  };

  const openUserProfile = (uId: string) => {
    setSelectedUserIdForModal(uId);
    setProfileModalVisible(true);
  };

  const selectedTeamAnalytics = useMemo(() => {
    if (!selectedTeamForModal) return null;
    const teamName = selectedTeamForModal;
    const teamData = qualifiedTeamRanks.find((t) => t.team_name === teamName) || pendingTeamRanks.find((t) => t.team_name === teamName);

    const seasonMatches = (rawMatches || []).filter((m: any) => {
      if (selectedPeriod !== 'hall_of_fame') {
        return getMatchSeasonCode(m.match_date || m.created_at) === selectedPeriod;
      }
      return true;
    });

    const officialMatches = listOfficialTeamMatches(seasonMatches, teamName);
    const intraMatches = listIntramuralTeamMatches(seasonMatches, teamName);
    const built = buildTeamReportAnalytics(officialMatches, teamName, 'official');
    const intraBuilt = buildTeamReportAnalytics(intraMatches, teamName, 'intramural');
    const meta = {
      region: teamData?.region || UNSET_REGION,
      teamType: (teamData?.type as 'school' | 'club') || undefined,
      mannerTemp: teamData?.mannerTemp || 36.5,
      isOfficial: teamData?.isOfficial || false,
      memberCount: teamData?.memberCount || 0,
      status: teamData?.status,
      teamId: teamData?.team_id,
    };

    return {
      official: { ...built, ...meta },
      intramural: { ...intraBuilt, ...meta },
    };
  }, [selectedTeamForModal, rawMatches, selectedPeriod, qualifiedTeamRanks, pendingTeamRanks]);

  const openTeamReport = (teamName: string) => {
    setSelectedTeamForModal(teamName);
    setTeamReportModalVisible(true);
  };

  const currentPeriodLabel = periodOptions.find((p) => p.id === selectedPeriod)?.label || '시즌 선택';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>랭킹 보기</Text>
        <View style={{ width: 32 }} />
      </View>

      <View style={styles.tabContainer}>
        <TouchableOpacity style={[styles.tab, rankTab === 'team' && styles.tabActive]} onPress={() => setRankTab('team')} hitSlop={8}>
          <Text style={[styles.tabText, rankTab === 'team' && styles.tabTextActive]}>🛡️ 공식 팀 랭킹</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, rankTab === 'personal' && styles.tabActive]} onPress={() => setRankTab('personal')} hitSlop={8}>
          <Text style={[styles.tabText, rankTab === 'personal' && styles.tabTextActive]}>🏃‍♂️ 개인 다승 랭킹</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.periodSelectorBar}>
        <TouchableOpacity style={styles.periodSelectBtn} onPress={() => setPeriodModalVisible(true)}>
          <Text style={styles.periodSelectBtnText}>{currentPeriodLabel}</Text>
          <Text style={styles.periodSelectArrow}>▼</Text>
        </TouchableOpacity>
      </View>

      {rankTab === 'personal' && (
        <View style={styles.genderFilterRow}>
          <Text style={styles.sortLabel}>성별 구분:</Text>
          {(['전체', '남성', '여성'] as const).map((g) => (
            <TouchableOpacity
              key={g}
              style={[styles.genderChip, genderFilter === g && styles.genderChipActive]}
              onPress={() => setGenderFilter(g)}
            >
              <Text style={[styles.genderChipText, genderFilter === g && styles.genderChipTextActive]}>{g}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.sortFilterRow}>
        <Text style={styles.sortLabel}>정렬 기준:</Text>
        <TouchableOpacity style={[styles.sortChip, sortCriterion === 'points' && styles.sortChipActive]} onPress={() => setSortCriterion('points')}>
          <Text style={[styles.sortChipText, sortCriterion === 'points' && styles.sortChipTextActive]}>📊 승점순</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.sortChip, sortCriterion === 'wins' && styles.sortChipActive]} onPress={() => setSortCriterion('wins')}>
          <Text style={[styles.sortChipText, sortCriterion === 'wins' && styles.sortChipTextActive]}>🏆 다승순</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.sortChip, sortCriterion === 'winRate' && styles.sortChipActive]} onPress={() => setSortCriterion('winRate')}>
          <Text style={[styles.sortChipText, sortCriterion === 'winRate' && styles.sortChipTextActive]}>🔥 승률순</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.filterRow}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {dynamicRegionTabs.map((r) => {
            const isPriority = userPrioritizedRegions.includes(r);
            const prioIdx = userPrioritizedRegions.indexOf(r);
            return (
              <TouchableOpacity key={r} style={[styles.fChip, selectedRegion === r && styles.fChipActive]} onPress={() => setSelectedRegion(r)}>
                <Text style={[styles.fChipText, selectedRegion === r && styles.fChipTextActive]}>
                  {isPriority ? `[${prioIdx + 1}순위] ` : ''}{r}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchRankings(); }} />}>
        <View style={styles.ruleBanner}>
          <Text style={styles.ruleTitle}>📌 랭킹 산정 및 터치 안내</Text>
          <Text style={styles.ruleText}>
            • 전국 개인/팀 랭킹은 <Text style={{ fontWeight: '700', color: '#1D4ED8' }}>다른 팀과의 공식 교류전</Text>만 합산합니다. 팀 안 연습경기(청백전)는 들어가지 않습니다.{'\n'}
            • <Text style={{ fontWeight: '700', color: '#1D4ED8' }}>블루리본(3명 이상)</Text> 인증 팀만 정식 차트에 집계됩니다.{'\n'}
            • 승점제 적용: <Text style={{ fontWeight: '700', color: '#1D4ED8' }}>승리 3점, 무승부 1점, 패배 0점</Text>{'\n'}
            • 개인 다승은 <Text style={{ fontWeight: '700', color: '#1D4ED8' }}>세트 승 / 출전 세트</Text>로 표기합니다.{'\n'}
            • 팀 및 개인 랭킹 카드를 터치하면 <Text style={{ fontWeight: '700', color: '#1D4ED8' }}>상세 전력 분석 프로필</Text>을 보실 수 있습니다.
          </Text>
        </View>

        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : rankTab === 'team' ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🏆 {currentPeriodLabel}</Text>
              <Text style={styles.sectionCount}>{qualifiedTeamRanks.length}개 팀</Text>
            </View>

            {qualifiedTeamRanks.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>선택하신 [{selectedRegion}] 지역에 집계된 정식 팀 기록이 없습니다.</Text>
                <Text style={styles.emptySub}>팀원 3명을 모으고 첫 승리의 주인공이 되어보세요!</Text>
              </View>
            ) : (
              qualifiedTeamRanks.map((item, index) => (
                <TouchableOpacity
                  key={item.team_id || item.team_name}
                  style={[styles.rankCard, index === 0 && styles.rankCardFirst]}
                  onPress={() => openTeamReport(item.team_name)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.rankBadgeText}>{getRankBadge(index)}</Text>
                  
                  <View style={styles.teamInfo}>
                    <View style={styles.teamNameRow}>
                      <Text style={styles.teamName} numberOfLines={1}>
                        {getTeamIcon(item.type)} {formatTeamDisplayName(getSafeTeamName(item), item.status)}
                      </Text>
                      <View style={styles.officialBadge}>
                        <Text style={styles.officialBadgeText}>💎 공식인증</Text>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <Text style={styles.recordText}>
                        {item.total_games}전 {item.total_wins}승 {item.total_draws > 0 ? `${item.total_draws}무 ` : ''}{item.total_losses}패
                      </Text>
                      <View style={styles.mannerTempBadge}>
                        <Text style={styles.mannerTempBadgeText}>🌡️ {item.mannerTemp.toFixed(1)}°C</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.winRateBox}>
                    <Text style={styles.winRateNum}>
                      {sortCriterion === 'points'
                        ? `${item.points}점`
                        : sortCriterion === 'winRate'
                        ? `${item.win_rate}%`
                        : `${item.total_wins}승`}
                    </Text>
                    <Text style={styles.winRateLabel}>
                      {sortCriterion === 'points'
                        ? `승점 (승률 ${item.win_rate}%)`
                        : sortCriterion === 'winRate'
                        ? `승률 (승점 ${item.points}점)`
                        : `다승 (승점 ${item.points}점)`}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))
            )}

            {pendingTeamRanks.length > 0 && (
              <View style={{ marginTop: 24 }}>
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitleMuted}>⏳ 집계 대기 중인 팀</Text>
                  <Text style={styles.sectionCount}>{pendingTeamRanks.length}개 팀</Text>
                </View>

                {pendingTeamRanks.map((item) => {
                  const requiredGames = selectedPeriod === 'hall_of_fame' ? 3 : 2;
                  
                  let pendingReasonStr = '';
                  if (!item.isOfficial) {
                    pendingReasonStr = `인원 부족 (${item.memberCount}/3명)`;
                  } else if (item.total_games === 0) {
                    pendingReasonStr = item.careerWins > 0
                      ? `시즌 0경기 (통산 ${item.careerWins}승 | 팀원 ${item.memberCount}명)`
                      : `시즌 0경기 (신규 대기 | 팀원 ${item.memberCount}명)`;
                  } else {
                    pendingReasonStr = `경기 수 부족 (${item.total_games}/${requiredGames}경기)`;
                  }

                  return (
                    <TouchableOpacity
                      key={item.team_id || item.team_name}
                      style={styles.pendingCard}
                      onPress={() => openTeamReport(item.team_name)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.pendingInfo}>
                        <View style={styles.teamNameRow}>
                          <Text style={styles.pendingTeamName} numberOfLines={1}>
                            {getTeamIcon(item.type)} {formatTeamDisplayName(getSafeTeamName(item), item.status)}
                          </Text>
                          {item.isOfficial ? (
                            <View style={styles.officialBadge}>
                              <Text style={styles.officialBadgeText}>💎 공식인증</Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.pendingReason}>
                          {pendingReasonStr}
                        </Text>
                      </View>
                      
                      <View style={styles.pendingRecordBox}>
                        {item.total_games > 0 ? (
                          <Text style={styles.pendingRecord}>
                            {item.total_wins}승 {item.total_losses}패 ({item.win_rate}%)
                          </Text>
                        ) : (
                          <Text style={[styles.pendingRecord, { color: '#94A3B8' }]}>
                            {item.careerWins > 0 ? `통산 ${item.careerWins}승` : '대기중'}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </>
        ) : (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🏃‍♂️ 개인 차트 [{selectedRegion} · {genderFilter}]</Text>
              <Text style={styles.sectionCount}>{personalRanks.length}명</Text>
            </View>

            {personalRanks.length === 0 ? (
              <View style={styles.emptyBox}>
                <Text style={styles.emptyText}>선택하신 [{selectedRegion} · {genderFilter}] 조건에 해당되는 선수가 없습니다.</Text>
              </View>
            ) : (
              personalRanks.map((item, index) => {
                const userParams = {
                  stats: {
                    wins: item.wins,
                    losses: item.losses,
                    draws: item.draws,
                    total: item.totalMatches,
                    winRate: item.winRate,
                    recent5: [],
                  },
                  userActivityStats: { recordCount: 0, praiseCount: 0 },
                  invitedCount: 0,
                  gender: item.gender,
                };

                const userBadges = getAllBadgesWithStatus(userParams)
                  .filter(b => b.isUnlocked)
                  .slice(0, 2);

                return (
                  <TouchableOpacity key={item.userId} style={styles.rankCard} onPress={() => openUserProfile(item.userId)} activeOpacity={0.8}>
                    <Text style={styles.rankBadgeText}>{getRankBadge(index)}</Text>
                    
                    <MiniAvatar uri={item.avatarUrl} emoji={item.avatarIcon} size={40} />

                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
                        <Text style={styles.teamName}>{item.fullName} 선생님</Text>
                        
                        <View style={[styles.miniGenderTag, item.gender === '여성' ? styles.femaleTag : styles.maleTag]}>
                          <Text style={[styles.miniGenderText, item.gender === '여성' ? styles.femaleText : styles.maleText]}>{item.gender}</Text>
                        </View>

                        <View style={{ flexDirection: 'row', gap: 3, flexWrap: 'wrap', alignItems: 'center' }}>
                          {userBadges.map((badge) => (
                            <TouchableOpacity
                              key={badge.id}
                              activeOpacity={0.8}
                              onPress={(e) => {
                                e.stopPropagation();
                                setSelectedBadgeUserParams(userParams);
                                setBadgeModalVisible(true);
                              }}
                              style={[{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, borderWidth: 1 }, badge.style]}
                            >
                              <Text style={{ fontSize: 9, fontWeight: '800', color: badge.style.color }}>
                                {badge.label}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                      <Text style={styles.recordText}>🏫 {item.schoolName} [{item.region}]</Text>
                    </View>

                    <View style={styles.personalWinBox}>
                      <Text style={[styles.winRateNum, { color: '#0284C7' }]}>
                        {item.wins}승 {item.losses}패
                      </Text>
                      <Text style={styles.winRateLabel}>
                        {formatSetRecordLabel(item.wins, item.draws, item.losses)} · 경기승률 {item.winRate}%
                      </Text>
                      <Text style={styles.personalStatLine}>{item.totalMatches}경기 출전</Text>
                      <Text style={styles.personalStatLine}>득점 {item.points} · 범실 {item.faults}</Text>
                      <Text style={styles.mannerTempTag}>🌡️ {item.mannerTemp.toFixed(1)}°C</Text>
                    </View>
                  </TouchableOpacity>
                );
              })
            )}
          </>
        )}
      </ScrollView>

      <StickyAdBanner />

      {selectedBadgeUserParams && (
        <BadgeCollectionModal
          visible={badgeModalVisible}
          onClose={() => {
            setBadgeModalVisible(false);
            setSelectedBadgeUserParams(null);
          }}
          userParams={selectedBadgeUserParams}
          equippedBadgeIds={[]}
          onSaveEquippedBadges={() => {}}
        />
      )}

      <Modal visible={periodModalVisible} animationType="fade" transparent={true}>
        <View style={[styles.modalOverlay, { paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }]}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📅 랭킹 시즌 선택</Text>
            <Text style={styles.modalSub}>조회하고 싶은 시즌 차트를 선택해 주세요.</Text>
            
            <View style={{ gap: 8, marginVertical: 12 }}>
              {periodOptions.map((p) => {
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

            <TouchableOpacity style={styles.closeBtn} onPress={() => setPeriodModalVisible(false)} hitSlop={8}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <UserProfileModal
        visible={profileModalVisible}
        userId={selectedUserIdForModal}
        isMyTeamMember={selectedUserIdForModal ? myTeammatesSet.has(selectedUserIdForModal) : false}
        officialOnly
        onClose={() => {
          setProfileModalVisible(false);
          setSelectedUserIdForModal(null);
        }}
      />

      <TeamReportModal
        visible={teamReportModalVisible}
        onClose={() => {
          setTeamReportModalVisible(false);
          setSelectedTeamForModal(null);
        }}
        analytics={selectedTeamAnalytics?.official || null}
        intramuralAnalytics={selectedTeamAnalytics?.intramural || null}
        selectedSeason={currentPeriodLabel}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  headerTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: Colors.text, includeFontPadding: false },
  tabContainer: { flexDirection: 'row', backgroundColor: Colors.surface, padding: 6, borderBottomWidth: 1, borderBottomColor: Colors.border },
  tab: { flex: 1, paddingVertical: 12, alignItems: 'center', borderRadius: 10 },
  tabActive: { backgroundColor: '#EFF6FF' },
  tabText: { fontSize: 14, lineHeight: 18, fontWeight: '700', color: '#64748B', includeFontPadding: false },
  tabTextActive: { color: Colors.primary, fontWeight: '800' },
  
  periodSelectorBar: { paddingHorizontal: 16, paddingTop: 12 },
  periodSelectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#EFF6FF', borderWidth: 1.5, borderColor: '#3B82F6', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 12 },
  periodSelectBtnText: { fontSize: 14, fontWeight: '800', color: '#1D4ED8' },
  periodSelectArrow: { fontSize: 12, color: '#1D4ED8', fontWeight: '800' },

  genderFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 10 },
  genderChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  genderChipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  genderChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  genderChipTextActive: { color: '#1D4ED8', fontWeight: '800' },

  sortFilterRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 8 },
  sortLabel: { fontSize: 12, fontWeight: '700', color: '#64748B', marginRight: 2 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  sortChipActive: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  sortChipText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  sortChipTextActive: { color: '#B45309', fontWeight: '800' },

  filterRow: { flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6 },
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
  emptyText: { fontSize: 14, fontWeight: '700', color: Colors.textMuted, textAlign: 'center' },
  emptySub: { fontSize: 12, color: '#94A3B8', marginTop: 4 },

  rankCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 10 },
  rankCardFirst: { borderColor: '#FDE047', backgroundColor: '#FEFCE8', borderWidth: 1.5 },
  rankBadgeText: { fontSize: 18, fontWeight: '800', color: Colors.primary, width: 32, textAlign: 'center' },
  
  avatarMiniCircle: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BFDBFE', overflow: 'hidden' },
  avatarMiniImage: { width: 40, height: 40, borderRadius: 20 },

  teamInfo: { flex: 1, minWidth: 0, paddingHorizontal: 12 },
  teamNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  teamName: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: Colors.text },
  officialBadge: { flexShrink: 0, backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#3B82F6' },
  officialBadgeText: { fontSize: 10, fontWeight: '800', color: '#1D4ED8' },
  recordText: { fontSize: 12, color: Colors.textMuted },
  
  mannerTempBadge: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  mannerTempBadgeText: { fontSize: 10, fontWeight: '800', color: '#D97706' },

  winRateBox: { alignItems: 'flex-end', marginLeft: 8, flexShrink: 0 },
  personalWinBox: { alignItems: 'flex-end', width: 118, flexShrink: 0 },
  winRateNum: { fontSize: 13, lineHeight: 18, fontWeight: '900', color: Colors.primary, includeFontPadding: false, textAlign: 'right' },
  winRateLabel: { fontSize: 11, lineHeight: 14, color: Colors.textMuted, marginTop: 2, includeFontPadding: false },
  personalStatLine: { fontSize: 10, lineHeight: 13, fontWeight: '700', color: '#0369A1', marginTop: 2, includeFontPadding: false },

  mannerTempTag: { fontSize: 10, fontWeight: '800', color: '#D97706', marginTop: 2 },

  miniGenderTag: { paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, borderWidth: 1 },
  miniGenderText: { fontSize: 10, fontWeight: '800' },
  maleTag: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  maleText: { color: '#1D4ED8', fontSize: 10, fontWeight: '800' },
  femaleTag: { backgroundColor: '#FDF2F8', borderColor: '#FBCFE8' },
  femaleText: { color: '#DB2777', fontSize: 10, fontWeight: '800' },

  pendingCard: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  pendingInfo: { flex: 1, minWidth: 0, paddingRight: 8 },
  pendingTeamName: { flexShrink: 1, fontSize: 14, fontWeight: '800', color: Colors.text },
  pendingRecordBox: { alignItems: 'flex-end', flexShrink: 0 },
  pendingReason: { fontSize: 11, color: '#B45309', fontWeight: '700', marginTop: 2 },
  pendingRecord: { fontSize: 12, fontWeight: '700', color: Colors.textMuted },

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