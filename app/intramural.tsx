import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import { sendNotificationToTeam } from '../lib/notificationService';
import StickyAdBanner from '../components/StickyAdBanner';
import MatchCommentModal from '../components/MatchCommentModal';
import UserProfileModal from '../components/UserProfileModal';
import MatchPostgameReportModal from '../components/MatchPostgameReportModal'; // 💡 신규 임포트
import { parseSetRosterMap, safeIncludes, safeNameText, teamsInclude } from '../lib/roster';
import { getSafeDisplayName, getSafeTeamName } from '../lib/utils';
import { evaluateSetOutcome } from '../lib/playerStats';
import {
  collectLineupPlayerIds,
  collectScoreLogPlayerIds,
  parseMatchScoreLogs,
  resolvePlayerSetPlay,
} from '../lib/rankingService';
import {
  dynamicScoresFromSets,
  fetchMatchSets,
  recordsFromDynamicScores,
  rosterMapFromSets,
  upsertMatchSets,
  hydrateMatchesWithSetScores,
  listMatchSetRows,
  makeDefaultQuickSetScore,
  carrySet1LineupsToEmptySet2And3,
} from '../lib/matchSets';
import IntramuralCard from '../components/IntramuralCard';

interface MatchData {
  id: string;
  host_user_id: string;
  host_team_name: string;
  away_team_name?: string;
  match_date: string;
  match_time: string;
  description?: string;
  status: string;
  winner_team?: string | null;
  set_scores?: string | null;
  host_roster?: string;
  away_roster?: string;
  created_at: string;
}

interface MemberInfo {
  user_id: string;
  full_name: string;
  playedSetCount?: number;
}

interface DynamicSetScore {
  hostScore: number;
  awayScore: number;
}

interface IntraRankingData {
  userId: string;
  fullName: string;
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}

interface CommentData {
  id: string;
  match_id: string;
  user_id: string;
  content: string;
  created_at: string;
  full_name?: string;
  badgeType?: 'host' | 'applicant' | 'mercenary' | 'general';
  badgeLabel?: string;
}

interface BadgeOption {
  type: 'host' | 'applicant' | 'mercenary' | 'general';
  teamName?: string;
  label: string;
}

type SetRosterMap = { [setIndex: number]: string[] };

const getTeamIcon = (type?: 'school' | 'club') => {
  return type === 'school' ? '🏫' : '🛡️';
};

const parseIntraDescription = (desc?: string) => {
  if (!desc) return { teamA: 'A팀', teamB: 'B팀', note: '' };
  const match = desc.match(/^\[(.*?)\ VS (.*?)\]\s*(.*)$/);
  if (match) {
    return {
      teamA: match[1] || 'A팀',
      teamB: match[2] || 'B팀',
      note: match[3] || '',
    };
  }
  return { teamA: 'A팀', teamB: 'B팀', note: desc.startsWith('자체 청백전') ? '' : desc };
};

export default function IntramuralScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openMatchId?: string }>();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const currentUserName = getSafeDisplayName(session?.user?.user_metadata);

  const [matches, setMatches] = useState<MatchData[]>([]);
  const [myTeams, setMyTeams] = useState<string[]>([]);
  const [teamTypeMap, setTeamTypeMap] = useState<{ [teamName: string]: 'school' | 'club' }>({});
  
  const [selectedTeamFilter, setSelectedTeamFilter] = useState<string>(''); 
  const [selectedSeason, setSelectedSeason] = useState<string>(String(new Date().getFullYear())); 
  const [seasonPickerVisible, setSeasonPickerVisible] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [mainTab, setMainTab] = useState<'list' | 'ranking'>('list');

  const [listYear, setListYear] = useState(new Date().getFullYear());
  const [listMonth, setListMonth] = useState(new Date().getMonth() + 1);

  const [intraModalVisible, setIntraModalVisible] = useState(false);
  const [intraTeam, setIntraTeam] = useState('');
  const [intraDate, setIntraDate] = useState('');
  const [teamAName, setTeamAName] = useState('A팀');
  const [teamBName, setTeamBName] = useState('B팀');
  const [intraNote, setIntraNote] = useState('');
  
  const [intraMembers, setIntraMembers] = useState<MemberInfo[]>([]);
  
  const [intraActiveSetTab, setIntraActiveSetTab] = useState(0);
  const [intraRostersA, setIntraRostersA] = useState<SetRosterMap>({});
  const [intraRostersB, setIntraRostersB] = useState<SetRosterMap>({});
  
  const [intraDynamicScores, setIntraDynamicScores] = useState<DynamicSetScore[]>([]);
  const [intraWinner, setIntraWinner] = useState<string | null>(null);
  const [editingIntraId, setEditingIntraId] = useState<string | null>(null);

  const [showCalendar, setShowCalendar] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);

  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [targetCommentMatch, setTargetCommentMatch] = useState<MatchData | null>(null);
  const [fetchingComments, setFetchingComments] = useState(false);
  const [commentsList, setCommentsList] = useState<CommentData[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [availableBadges, setAvailableBadges] = useState<BadgeOption[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeOption | null>(null);

  const [selectedUserIdForModal, setSelectedUserIdForModal] = useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  // 💡 [신규] 분석 리포트 모달 State
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [reportTargetMatch, setReportTargetMatch] = useState<MatchData | null>(null);

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

  const availableYears = useMemo(() => {
    const yearsSet = new Set<number>();
    const currentYear = new Date().getFullYear();
    yearsSet.add(currentYear);

    matches.forEach((m) => {
      const { year } = parseMatchDate(m.match_date || m.created_at);
      if (year > 2000) yearsSet.add(year);
    });

    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [matches]);

  const fetchData = async () => {
    try {
      setLoading(true);
      if (currentUserId) {
        const { data: tmData } = await supabase.from('team_members').select('team_id').eq('user_id', currentUserId).eq('is_active', true);
        const teamIds = tmData?.map((tm: any) => tm.team_id) || [];
        
        let teamNames: string[] = [];
        const typeMap: { [teamName: string]: 'school' | 'club' } = {};

        if (teamIds.length > 0) {
          const { data: tData } = await supabase.from('teams').select('name, team_type').in('id', teamIds);
          (tData || []).forEach((t: any) => {
            const parsedName = parseTeamName(t.name);
            if (parsedName) {
              teamNames.push(parsedName);
              typeMap[parsedName] = (t.team_type as 'school' | 'club') || 'school';
            }
          });
        }
        setMyTeams(teamNames);
        setTeamTypeMap(typeMap);

        if (teamNames.length > 0) {
          if (!selectedTeamFilter) setSelectedTeamFilter(teamNames[0]);
          if (!intraTeam) setIntraTeam(teamNames[0]);
        }
      }

      const { data: matchData, error } = await supabase.from('matches').select('*, match_sets(*)').eq('status', 'intramural').order('created_at', { ascending: false });
      if (error) throw error;
      if (matchData) {
        const hydrated = await hydrateMatchesWithSetScores(matchData);
        setMatches(hydrated);
        if (params.openMatchId) {
          const target = hydrated.find(m => m.id === params.openMatchId);
          if (target) {
            openIntraModal(target);
          }
        }
      }

    } catch (err) {
      console.error('데이터 조회 오류:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(useCallback(() => { fetchData(); }, [session, params.openMatchId]));
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const fetchIntraMembers = async (tName: string) => {
    try {
      const { data: teamData } = await supabase.from('teams').select('id').eq('name', tName).maybeSingle();
      if (!teamData) return;
      const { data: members } = await supabase.from('team_members').select('user_id, profiles(*)').eq('team_id', teamData.id).eq('is_active', true);
      setIntraMembers((members || []).map((m: any) => ({ user_id: m.user_id, full_name: getSafeDisplayName(m.profiles || m) })));
    } catch (err) {}
  };

  useEffect(() => {
    if (intraTeam) {
      setIntraRostersA({}); setIntraRostersB({});
      setIntraActiveSetTab(0);
      fetchIntraMembers(intraTeam);
    }
  }, [intraTeam]);

  useEffect(() => {
    if (selectedTeamFilter) {
      fetchIntraMembers(selectedTeamFilter);
    }
  }, [selectedTeamFilter]);

  const openCommentModal = async (match: MatchData) => {
    setTargetCommentMatch(match);
    setCommentModalVisible(true);
    setFetchingComments(true);
    setCommentInput('');

    const badges: BadgeOption[] = [];
    if (teamsInclude(myTeams, match.host_team_name)) {
      badges.push({ type: 'host', teamName: match.host_team_name, label: `⚔️ 소속팀 (${match.host_team_name})` });
    }
    setAvailableBadges(badges);
    setSelectedBadge(badges[0]);

    try {
      const { data, error } = await supabase
        .from('match_comments')
        .select('*, profiles(full_name)')
        .eq('match_id', match.id)
        .order('created_at', { ascending: true });

      if (data) {
        setCommentsList(data.map((item: any) => ({
          id: item.id,
          match_id: item.match_id,
          user_id: item.user_id,
          content: item.content,
          created_at: item.created_at,
          full_name: getSafeDisplayName(item.profiles || item),
          badgeType: item.badge_type,
          badgeLabel: item.badge_label,
        })));
      }
    } catch (err) {
      console.error(err);
    } finally {
      setFetchingComments(false);
    }
  };

  const handlePostComment = async () => {
    if (!commentInput.trim() || !targetCommentMatch || !currentUserId || !selectedBadge) return;
    setActionLoading(true);
    try {
      const payload = {
        match_id: targetCommentMatch.id,
        user_id: currentUserId,
        content: commentInput.trim(),
        badge_type: selectedBadge.type,
        badge_label: selectedBadge.label,
      };
      const { data, error } = await supabase.from('match_comments').insert(payload).select('*, profiles(full_name)').single();
      if (error) throw error;

      if (data) {
        const newComment: CommentData = {
          id: data.id,
          match_id: data.match_id,
          user_id: data.user_id,
          content: data.content,
          created_at: data.created_at,
          full_name: getSafeDisplayName(data.profiles || { full_name: currentUserName }),
          badgeType: data.badge_type,
          badgeLabel: data.badge_label,
        };
        setCommentsList(prev => [...prev, newComment]);
      }
      setCommentInput('');
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const parseRoster = (rosterStr: string | null | undefined): SetRosterMap => parseSetRosterMap(rosterStr);

  const toggleIntraSetRoster = (userId: string) => {
    const mapA = { ...intraRostersA };
    const mapB = { ...intraRostersB };
    const currA = mapA[intraActiveSetTab] || [];
    const currB = mapB[intraActiveSetTab] || [];

    let updatedA = [...currA];
    let updatedB = [...currB];

    if (safeIncludes(currA, userId)) {
      updatedA = updatedA.filter(id => id !== userId);
      updatedB.push(userId);
    } else if (safeIncludes(currB, userId)) {
      updatedB = updatedB.filter(id => id !== userId);
    } else {
      updatedA.push(userId);
    }

    mapA[intraActiveSetTab] = updatedA;
    mapB[intraActiveSetTab] = updatedB;

    if (intraActiveSetTab === 0) {
      intraDynamicScores.forEach((_, idx) => {
        if (idx > 0) {
          if (!mapA[idx] || mapA[idx].length === 0) mapA[idx] = JSON.parse(JSON.stringify(updatedA));
          if (!mapB[idx] || mapB[idx].length === 0) mapB[idx] = JSON.parse(JSON.stringify(updatedB));
        }
      });
    }

    setIntraRostersA(mapA);
    setIntraRostersB(mapB);
  };

  const parseScoresToArray = (scoreStr: string | null | undefined): DynamicSetScore[] => {
    if (!scoreStr) return [];
    return scoreStr.split(', ').map(s => {
      const [h, a] = s.split(':').map(Number);
      return { hostScore: h || 0, awayScore: a || 0 };
    });
  };

  const convertScoresToString = (scoresArray: DynamicSetScore[]): string | null => {
    if (scoresArray.length === 0) return null;
    return scoresArray.map(s => `${s.hostScore}:${s.awayScore}`).join(', ');
  };

  const openIntraModal = async (match?: MatchData) => {
    if (!currentUserId || myTeams.length === 0) return Alert.alert('알림', '가입된 팀이 없습니다.');
    const today = new Date().toISOString().split('T')[0];
    setShowCalendar(false);
    
    if (match) {
      const { teamA, teamB, note } = parseIntraDescription(match.description);
      setEditingIntraId(match.id);
      setIntraTeam(match.host_team_name);
      setIntraDate(match.match_date);
      setTeamAName(teamA);
      setTeamBName(teamB);
      setIntraNote(note);
      setIntraRostersA(parseRoster(match.host_roster));
      setIntraRostersB(parseRoster(match.away_roster));
      setIntraActiveSetTab(0);
      setIntraWinner(match.winner_team || null);

      try {
        const snapshot = await fetchMatchSets(match.id);
        setIntraRostersA(rosterMapFromSets(snapshot.sets, 'host'));
        setIntraRostersB(rosterMapFromSets(snapshot.sets, 'away'));
        const scores = dynamicScoresFromSets(snapshot.sets);
        setIntraDynamicScores(scores);
      } catch {
        const parsedScores = parseScoresToArray(match.set_scores);
        setIntraDynamicScores(parsedScores.length > 0 ? parsedScores : []);
      }
      setIntraModalVisible(true);
    } else {
      setEditingIntraId(null);
      setIntraDate(today);
      setTeamAName('A팀');
      setTeamBName('B팀');
      setIntraNote('');
      setIntraRostersA({}); setIntraRostersB({});
      setIntraActiveSetTab(0);
      
      setIntraDynamicScores([]); 
      setIntraWinner(null); 
      if (!intraTeam && myTeams.length > 0) setIntraTeam(selectedTeamFilter || myTeams[0]);
      setIntraModalVisible(true);
    }
  };

  const addIntraDynamicSet = () => {
    if (intraDynamicScores.length >= 7) return Alert.alert('알림', '최대 7세트까지만 입력 가능합니다.');
    setIntraDynamicScores(prev => [...prev, makeDefaultQuickSetScore()]);
  };
  const removeIntraDynamicSet = (index: number) => {
    setIntraDynamicScores(prev => prev.filter((_, i) => i !== index));
  };
  const updateIntraDynamicScore = (index: number, isHost: boolean, delta: number) => {
    setIntraDynamicScores(prev => {
      const newScores = [...prev];
      if (isHost) newScores[index].hostScore = Math.max(0, newScores[index].hostScore + delta);
      else newScores[index].awayScore = Math.max(0, newScores[index].awayScore + delta);
      return newScores;
    });
  };

  const saveIntramuralMatch = async () => {
    const formattedScores = convertScoresToString(intraDynamicScores);
    const { hostRosters, awayRosters } = carrySet1LineupsToEmptySet2And3(intraRostersA, intraRostersB);

    const tA = teamAName.trim() || 'A팀';
    const tB = teamBName.trim() || 'B팀';
    const formattedDescription = `[${tA} VS ${tB}] ${intraNote.trim()}`;

    setActionLoading(true);
    try {
      const payload = {
        host_user_id: currentUserId || '',
        host_team_name: intraTeam,
        away_team_name: intraTeam,
        match_date: intraDate,
        match_time: '내전',
        location: '팀 자체 훈련',
        format: '팀 내전',
        description: formattedDescription,
        status: 'intramural',
        winner_team: intraWinner || null, 
        result_submitter_team: intraTeam,
        set_scores: formattedScores,
        host_roster: JSON.stringify(hostRosters),
        away_roster: JSON.stringify(awayRosters),
      };

      if (editingIntraId) {
        await supabase.from('matches').update(payload).eq('id', editingIntraId);
        if (intraDynamicScores.length > 0) {
          await upsertMatchSets(
            editingIntraId,
            recordsFromDynamicScores(intraDynamicScores, hostRosters, awayRosters, !!intraWinner),
          );
        }
        setMatches(prev => prev.map(m => m.id === editingIntraId ? { ...m, ...payload } : m));
        Alert.alert('수정 완료', '내전 기록이 수정되었습니다.');
      } else {
        const { data: newMatch } = await supabase.from('matches').insert(payload).select().single();
        if (newMatch) {
          setMatches(prev => [newMatch, ...prev]);
          if (intraDynamicScores.length > 0) {
            await upsertMatchSets(
              newMatch.id,
              recordsFromDynamicScores(intraDynamicScores, hostRosters, awayRosters, !!intraWinner),
            );
          }
        }

        await sendNotificationToTeam(
          intraTeam,
          '⚔️ [팀 내전 기록 등록]',
          `'${intraTeam}' 팀의 새로운 자체 내전 기록이 등록되었습니다. (${intraDate})`,
          currentUserId
        );

        Alert.alert('기록 완료 ⚡', '팀 내전 기록이 생성되었습니다! 0:0 전광판에서 경기를 이어가세요.');
      }
      setIntraModalVisible(false);
    } catch (err: any) { Alert.alert('오류', err.message); }
    finally { setActionLoading(false); }
  };

  const deleteIntraMatch = (matchId: string) => {
    Alert.alert('내전 기록 삭제', '이 내전 기록을 완전히 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
          setActionLoading(true);
          try {
            await supabase.from('matches').delete().eq('id', matchId);
            setMatches(prev => prev.filter(m => m.id !== matchId));
            Alert.alert('삭제 완료', '내전 기록이 삭제되었습니다.');
          } catch (err: any) { Alert.alert('오류', err.message); }
          finally { setActionLoading(false); setIntraModalVisible(false); }
        }
      }
    ]);
  };

  const filteredMatches = matches.filter(match => {
    const { year, month } = parseMatchDate(match.match_date || match.created_at);
    if (year !== listYear || month !== listMonth) return false;
    return selectedTeamFilter ? safeNameText(match.host_team_name) === selectedTeamFilter : teamsInclude(myTeams, match.host_team_name);
  });

  const intramuralRankings = useMemo(() => {
    const userStats: { [userId: string]: { wins: number; draws: number; losses: number; total: number } } = {};
    const nameById: { [userId: string]: string } = {};

    intraMembers.forEach(m => {
      userStats[m.user_id] = { wins: 0, draws: 0, losses: 0, total: 0 };
      nameById[m.user_id] = m.full_name;
    });

    matches.forEach(match => {
      if (selectedTeamFilter && safeNameText(match.host_team_name) !== selectedTeamFilter) return;

      if (selectedSeason !== 'all') {
        const targetYear = Number(selectedSeason);
        const { year } = parseMatchDate(match.match_date || match.created_at);
        if (year !== targetYear) return;
      }

      const winner = match.winner_team;
      if (!winner) return;

      const parsedScores = listMatchSetRows(match);
      const extraLogs = parseMatchScoreLogs(match);
      const candidateIds = new Set<string>([
        ...Object.keys(userStats),
        ...collectLineupPlayerIds(match),
        ...collectScoreLogPlayerIds(match, extraLogs),
      ]);

      parsedScores.forEach((score) => {
        const hostOutcome = evaluateSetOutcome(score.host_score, score.away_score, 'host');
        const awayOutcome = evaluateSetOutcome(score.host_score, score.away_score, 'away');
        const credited = new Set<string>();

        candidateIds.forEach((uId) => {
          const appearance = resolvePlayerSetPlay(match, score.setNumber, uId, nameById[uId], extraLogs);
          if (!appearance.played || credited.has(uId)) return;
          credited.add(uId);

          if (!userStats[uId]) userStats[uId] = { wins: 0, draws: 0, losses: 0, total: 0 };
          userStats[uId].total++;
          const side = appearance.side || 'host';
          const outcome = side === 'away' ? awayOutcome : hostOutcome;
          if (outcome === 'win') userStats[uId].wins++;
          else if (outcome === 'draw') userStats[uId].draws++;
          else userStats[uId].losses++;
        });
      });
    });

    const list: IntraRankingData[] = Object.entries(userStats)
      .filter(([_, stat]) => stat.total > 0)
      .map(([uId, stat]) => {
        const memberObj = intraMembers.find(m => m.user_id === uId);
        const fullName = memberObj?.full_name || (uId === currentUserId ? '나' : '팀원');
        const winRate = stat.total > 0 ? Math.round((stat.wins / stat.total) * 100) : 0;
        return {
          userId: uId,
          fullName,
          totalMatches: stat.total,
          wins: stat.wins,
          draws: stat.draws,
          losses: stat.losses,
          winRate,
        };
      });

    list.sort((a, b) => b.wins - a.wins || b.winRate - a.winRate || b.totalMatches - a.totalMatches);
    return list;
  }, [matches, intraMembers, selectedTeamFilter, selectedSeason, currentUserId]);

  const changeListMonth = (delta: number) => {
    let newM = listMonth + delta; let newY = listYear;
    if (newM > 12) { newM = 1; newY += 1; }
    if (newM < 1) { newM = 12; newY -= 1; }
    setListYear(newY); setListMonth(newM);
  };

  const changeCalMonth = (delta: number) => {
    let newM = calMonth + delta; let newY = calYear;
    if (newM > 12) { newM = 1; newY += 1; }
    if (newM < 1) { newM = 12; newY -= 1; }
    setCalYear(newY); setCalMonth(newM);
  };
  
  const renderCalendarGrid = () => {
    const daysInMonth = new Date(calYear, calMonth, 0).getDate();
    const firstDayIndex = new Date(calYear, calMonth - 1, 1).getDay();
    const days = [];
    for (let i = 0; i < firstDayIndex; i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(i);

    return (
      <View style={styles.calendarContainer}>
        <View style={styles.calHeader}>
          <TouchableOpacity onPress={() => changeCalMonth(-1)} style={styles.calNavBtn}><Text style={styles.calNavText}>‹</Text></TouchableOpacity>
          <Text style={styles.calTitleText}>{calYear}년 {calMonth}월</Text>
          <TouchableOpacity onPress={() => changeCalMonth(1)} style={styles.calNavBtn}><Text style={styles.calNavText}>›</Text></TouchableOpacity>
        </View>
        <View style={styles.weekRow}>
          {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
            <Text key={idx} style={[styles.weekText, idx === 0 && { color: '#EF4444' }, idx === 6 && { color: '#2563EB' }]}>{day}</Text>
          ))}
        </View>
        <View style={styles.daysGrid}>
          {days.map((day, idx) => {
            if (day === null) return <View key={idx} style={styles.dayBox} />;
            const dateStr = `${calYear}-${String(calMonth).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const isSelected = intraDate === dateStr;
            return (
              <TouchableOpacity key={idx} style={[styles.dayBox, isSelected && styles.selectedDayBox]} onPress={() => { setIntraDate(dateStr); setShowCalendar(false); }}>
                <Text style={[styles.dayText, isSelected && styles.selectedDayText]}>{day}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  const getRankBadge = (index: number) => {
    if (index === 0) return '🥇';
    if (index === 1) return '🥈';
    if (index === 2) return '🥉';
    return `${index + 1}위`;
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>팀 내전 기록실</Text>
        <TouchableOpacity style={styles.addBtn} onPress={() => openIntraModal()} hitSlop={8}>
          <Text style={styles.addBtnText}>+ 내전 기록</Text>
        </TouchableOpacity>
      </View>

      {myTeams.length > 0 && (
        <View style={styles.teamSwiperBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 14 }}>
            {myTeams.map((tName) => {
              const isSelected = selectedTeamFilter === tName;
              const teamIcon = getTeamIcon(teamTypeMap[tName]);
              return (
                <TouchableOpacity
                  key={tName}
                  style={[styles.teamSwiperChip, isSelected && styles.teamSwiperChipActive]}
                  onPress={() => setSelectedTeamFilter(tName)}
                  hitSlop={8}
                >
                  <Text style={[styles.teamSwiperChipText, isSelected && styles.teamSwiperChipTextActive]} numberOfLines={1}>
                    {teamIcon} {tName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      <View style={styles.segmentedContainer}>
        <TouchableOpacity style={[styles.segmentBtn, mainTab === 'list' && styles.segmentBtnActive]} onPress={() => setMainTab('list')} hitSlop={8}>
          <Text style={[styles.segmentText, mainTab === 'list' && styles.segmentTextActive]}>📜 내전 기록 목록</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.segmentBtn, mainTab === 'ranking' && styles.segmentBtnActive]} onPress={() => setMainTab('ranking')} hitSlop={8}>
          <Text style={[styles.segmentText, mainTab === 'ranking' && styles.segmentTextActive]}>🔥 팀 내전 랭킹</Text>
        </TouchableOpacity>
      </View>

      {mainTab === 'list' ? (
        <>
          <View style={styles.monthSelectorBar}>
            <TouchableOpacity onPress={() => changeListMonth(-1)} style={styles.monthSelectorBtn} hitSlop={8}>
              <Text style={styles.monthSelectorArrow}>‹</Text>
            </TouchableOpacity>
            <Text style={styles.monthSelectorText}>{listYear}년 {listMonth}월 내전</Text>
            <TouchableOpacity onPress={() => changeListMonth(1)} style={styles.monthSelectorBtn} hitSlop={8}>
              <Text style={styles.monthSelectorArrow}>›</Text>
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
            {loading ? (
              <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
            ) : filteredMatches.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyEmoji}>⚔️</Text>
                <Text style={styles.emptyText}>[{selectedTeamFilter || '소속팀'}]의 이번 달 내전 기록이 없습니다.</Text>
                <Text style={styles.emptySub}>상단 [+ 내전 기록] 버튼을 눌러 첫 연습경기를 저장해보세요!</Text>
              </View>
            ) : (
              filteredMatches.map((match) => {
                const { teamA, teamB, note } = parseIntraDescription(match.description);
                const currentTeamIcon = getTeamIcon(teamTypeMap[match.host_team_name]);

                return (
                  <IntramuralCard
                    key={match.id}
                    match={match}
                    teamA={teamA}
                    teamB={teamB}
                    note={note}
                    teamIcon={currentTeamIcon}
                    onOpenScoreboard={() => router.push({ pathname: '/scoreboard', params: { matchId: match.id } })}
                    onOpenReport={() => {
                      setReportTargetMatch(match);
                      setReportModalVisible(true);
                    }}
                    onOpenComment={() => openCommentModal(match)}
                    onOpenQuickResult={() => openIntraModal(match)}
                  />
                );
              })
            )}
          </ScrollView>
        </>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
          <View style={styles.ruleBanner}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <Text style={styles.ruleTitle} numberOfLines={1}>
                🔥 [{selectedTeamFilter}] 개인 내전 다승차트
              </Text>
              
              <TouchableOpacity
                style={styles.seasonPickerBtn}
                onPress={() => setSeasonPickerVisible(true)}
                activeOpacity={0.8}
              >
                <Text style={styles.seasonPickerBtnText}>
                  {selectedSeason === 'all' ? '📜 통산 전체' : `📅 ${selectedSeason} 시즌`} ▾
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.ruleText}>
              • 팀 자체 내전 기록을 기반으로 자동 산정되는 세트별 개인 순위입니다.{'\n'}
              • <Text style={{ fontWeight: '800' }}>세트 승수 &gt; 세트 승률 &gt; 출전 세트 수</Text> 순으로 랭킹이 정렬됩니다.
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
          ) : intramuralRankings.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyEmoji}>📊</Text>
              <Text style={styles.emptyText}>아직 [{selectedTeamFilter}] 팀의 마감된 내전 출전 기록이 없습니다.</Text>
            </View>
          ) : (
            intramuralRankings.map((item, index) => (
              <View 
                key={item.userId} 
                style={[
                  styles.rankCard, 
                  index === 0 && styles.rankCardFirst,
                  index === 1 && styles.rankCardSecond,
                  index === 2 && styles.rankCardThird
                ]}
              >
                <Text style={styles.rankBadgeText}>{getRankBadge(index)}</Text>
                <View style={{ flex: 1, marginHorizontal: 10 }}>
                  <Text style={styles.rankUserName}>👤 {item.fullName} 선생님</Text>
                  <Text style={styles.rankRecordText}>
                    {item.totalMatches}세트 출전 ({item.wins}승 {item.draws > 0 ? `${item.draws}무 ` : ''}{item.losses}패)
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.rankWinNum}>{item.wins}승</Text>
                  <Text style={styles.rankWinRateLabel}>승률 {item.winRate}%</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}

      <StickyAdBanner />

      {/* 💡 [신규] 분석 리포트 모달 렌더링 */}
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

      <Modal visible={intraModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>⚡ 빠른 결과 입력</Text>
            <Text style={styles.modalSub}>생성 후 바로 0:0 전광판으로 진입하거나 점수를 먼저 입력할 수 있습니다.</Text>
            <ScrollView style={{ maxHeight: 440, marginVertical: 8 }} showsVerticalScrollIndicator={false}>
              
              <View style={styles.modalSectionBox}>
                <Text style={styles.inputLabel}>1. 주최 팀 및 날짜 선택</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, marginBottom: 8 }}>
                  {myTeams.map(tName => {
                    const isSelected = intraTeam === tName;
                    const teamIcon = getTeamIcon(teamTypeMap[tName]);
                    return (
                      <TouchableOpacity
                        key={tName}
                        style={[styles.teamSelectChip, isSelected && styles.teamSelectChipActive]}
                        onPress={() => setIntraTeam(tName)}
                      >
                        <Text style={[styles.teamSelectChipText, isSelected && styles.teamSelectChipTextActive]} numberOfLines={1}>
                          {teamIcon} {tName}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowCalendar(!showCalendar)}>
                  <Text style={styles.datePickerBtnText}>📅 경기 일자: {intraDate} (달력 열기)</Text>
                </TouchableOpacity>
                {showCalendar && renderCalendarGrid()}
              </View>

              <View style={styles.modalSectionBox}>
                <Text style={styles.inputLabel}>2. 대결 팀 명칭 설정</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subInputLabel}>🔵 A팀 명칭</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="예: A팀, 선배팀, 주전"
                      value={teamAName}
                      onChangeText={setTeamAName}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.subInputLabel}>🔴 B팀 명칭</Text>
                    <TextInput
                      style={styles.textInput}
                      placeholder="예: B팀, 후배팀, 비주전"
                      value={teamBName}
                      onChangeText={setTeamBName}
                    />
                  </View>
                </View>
              </View>

              <View style={styles.modalSectionBox}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={styles.inputLabel}>3. 비고 (내기 및 특이사항)</Text>
                  <Text style={styles.charCountText}>{intraNote.length}/35자</Text>
                </View>
                <TextInput
                  style={styles.textInput}
                  placeholder="예: 체육관 청소 내기, 음료수 쏘기"
                  value={intraNote}
                  onChangeText={setIntraNote}
                  maxLength={35}
                />
              </View>

              <View style={styles.modalSectionBox}>
                <Text style={styles.inputLabel}>4. 세트별 명단 터치 배정 (🔵 ➔ 🔴 ➔ 🪑)</Text>
                
                <View style={styles.setTabContainer}>
                  {intraDynamicScores.map((_, idx) => (
                    <TouchableOpacity
                      key={idx}
                      style={[styles.setTab, intraActiveSetTab === idx && styles.setTabActive]}
                      onPress={() => setIntraActiveSetTab(idx)}
                    >
                      <Text style={[styles.setTabText, intraActiveSetTab === idx && styles.setTabTextActive]}>
                        {idx + 1}세트
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {intraDynamicScores.length === 0 && (
                    <TouchableOpacity style={[styles.setTab, styles.setTabActive]}>
                      <Text style={styles.setTabTextActive}>1세트 명단</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                  {intraMembers.map(m => {
                    const currentA = intraRostersA[intraActiveSetTab] || [];
                    const currentB = intraRostersB[intraActiveSetTab] || [];
                    const isA = safeIncludes(currentA, m.user_id);
                    const isB = safeIncludes(currentB, m.user_id);
                    const displayTeamA = teamAName.trim() || 'A팀';
                    const displayTeamB = teamBName.trim() || 'B팀';
                    return (
                      <TouchableOpacity
                        key={m.user_id}
                        style={[
                          styles.rosterChip,
                          isA && { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
                          isB && { backgroundColor: '#FFF1F2', borderColor: '#F43F5E' }
                        ]}
                        onPress={() => toggleIntraSetRoster(m.user_id)}
                      >
                        <Text style={[styles.rosterChipText, isA && { color: '#1D4ED8', fontWeight: '800' }, isB && { color: '#BE123C', fontWeight: '800' }]}>
                          {isA ? `🔵 ${getSafeTeamName(displayTeamA)} ` : isB ? `🔴 ${getSafeTeamName(displayTeamB)} ` : '🪑 대기 '}{getSafeDisplayName(m)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              <View style={styles.modalSectionBox}>
                <Text style={styles.inputLabel}>5. 세트 스코어 빠른 입력 (생략 가능)</Text>
                <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 6 }}>
                  ※ 스코어를 빈칸으로 남겨두고 하단 저장 시, 0:0 상태로 전광판을 시작할 수 있습니다.
                </Text>
                {intraDynamicScores.length > 0 && (
                  <View style={styles.scoreCalcBox}>
                    {intraDynamicScores.map((ds, idx) => (
                      <View key={idx} style={[styles.setRow, idx > 0 && { marginTop: 12 }]}>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={styles.setLabel}>{idx + 1}세트</Text>
                          {intraDynamicScores.length > 1 && (
                            <TouchableOpacity style={{ marginTop: 2 }} onPress={() => removeIntraDynamicSet(idx)}>
                              <Text style={{ fontSize: 10, color: '#EF4444', fontWeight: '800' }}>[X 삭제]</Text>
                            </TouchableOpacity>
                          )}
                        </View>

                        <View style={styles.teamScoreCol}>
                          <Text style={styles.teamScoreLabel}>🔵 {teamAName || 'A팀'}</Text>
                          <View style={styles.stepperRow}>
                            <TouchableOpacity style={styles.stepBtn} onPress={() => updateIntraDynamicScore(idx, true, -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                            <Text style={styles.scoreValText}>{ds.hostScore}</Text>
                            <TouchableOpacity style={styles.stepBtn} onPress={() => updateIntraDynamicScore(idx, true, 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                          </View>
                        </View>

                        <Text style={styles.vsColon}>:</Text>

                        <View style={styles.teamScoreCol}>
                          <Text style={styles.teamScoreLabel}>🔴 {teamBName || 'B팀'}</Text>
                          <View style={styles.stepperRow}>
                            <TouchableOpacity style={styles.stepBtn} onPress={() => updateIntraDynamicScore(idx, false, -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                            <Text style={styles.scoreValText}>{ds.awayScore}</Text>
                            <TouchableOpacity style={styles.stepBtn} onPress={() => updateIntraDynamicScore(idx, false, 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity style={styles.toggleSet3Btn} onPress={addIntraDynamicSet}>
                  <Text style={styles.toggleSet3Text}>➕ 세트 점수칸 추가하기</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.modalSectionBox}>
                <Text style={styles.inputLabel}>6. 최종 승패 선택 (경기 전 생략 가능)</Text>
                <Text style={{ fontSize: 11, color: '#64748B', marginBottom: 8 }}>
                  ※ 스코어보드에서 경기를 진행하려면 승패 선택을 해제(빈칸)하고 저장하세요.
                </Text>

                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.winnerGridBtn, intraWinner === (teamAName || 'A팀') && styles.winnerGridBtnActiveA]}
                    onPress={() => setIntraWinner(prev => prev === (teamAName || 'A팀') ? null : (teamAName || 'A팀'))}
                  >
                    <Text style={[styles.winnerGridText, intraWinner === (teamAName || 'A팀') && styles.winnerGridTextActive]}>
                      🥇 {teamAName || 'A팀'} 승
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.winnerGridBtn, intraWinner === (teamBName || 'B팀') && styles.winnerGridBtnActiveB]}
                    onPress={() => setIntraWinner(prev => prev === (teamBName || 'B팀') ? null : (teamBName || 'B팀'))}
                  >
                    <Text style={[styles.winnerGridText, intraWinner === (teamBName || 'B팀') && styles.winnerGridTextActive]}>
                      🥇 {teamBName || 'B팀'} 승
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.winnerGridBtn, intraWinner === 'draw' && styles.winnerGridBtnActiveDraw]}
                    onPress={() => setIntraWinner(prev => prev === 'draw' ? null : 'draw')}
                  >
                    <Text style={[styles.winnerGridText, intraWinner === 'draw' && styles.winnerGridTextActive]}>
                      🤝 무승부
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity style={[styles.closeBtn, { flex: 1 }]} onPress={() => setIntraModalVisible(false)}>
                <Text style={styles.closeBtnText}>취소</Text>
              </TouchableOpacity>
              {editingIntraId && (
                <TouchableOpacity style={[styles.closeBtn, { flex: 1, backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 1 }]} onPress={() => deleteIntraMatch(editingIntraId)}>
                  <Text style={[styles.closeBtnText, { color: '#DC2626' }]}>삭제</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.submitModalBtn, { flex: 2, backgroundColor: '#9333EA' }]} onPress={saveIntramuralMatch} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitModalBtnText}>⚡ 경기 저장 / 시작</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <MatchCommentModal
        visible={commentModalVisible}
        onClose={() => setCommentModalVisible(false)}
        targetMatch={targetCommentMatch}
        fetchingComments={fetchingComments}
        commentsList={commentsList}
        availableBadges={availableBadges}
        selectedBadge={selectedBadge}
        onSelectBadge={setSelectedBadge}
        commentInput={commentInput}
        onChangeCommentInput={setCommentInput}
        onPostComment={handlePostComment}
        actionLoading={actionLoading}
        onOpenUserProfile={(uId) => {
          setSelectedUserIdForModal(uId);
          setProfileModalVisible(true);
        }}
      />

      <UserProfileModal
        visible={profileModalVisible}
        userId={selectedUserIdForModal}
        onClose={() => {
          setProfileModalVisible(false);
          setSelectedUserIdForModal(null);
        }}
      />

      <Modal visible={seasonPickerVisible} animationType="fade" transparent={true} onRequestClose={() => setSeasonPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📅 내전 랭킹 시즌 선택</Text>
            <Text style={styles.modalSub}>조회할 내전 랭킹의 시즌 연도를 선택하세요.</Text>

            <View style={{ marginVertical: 12, gap: 8 }}>
              <TouchableOpacity
                style={[styles.seasonOptionBtn, selectedSeason === 'all' && styles.seasonOptionBtnActive]}
                onPress={() => {
                  setSelectedSeason('all');
                  setSeasonPickerVisible(false);
                }}
              >
                <Text style={[styles.seasonOptionText, selectedSeason === 'all' && styles.seasonOptionTextActive]}>
                  📜 통산 전체 내전 기록
                </Text>
                {selectedSeason === 'all' && <Text style={{ color: '#2563EB', fontWeight: '800' }}>✓</Text>}
              </TouchableOpacity>

              {availableYears.map((yrNum) => {
                const yrStr = String(yrNum);
                const isSelected = selectedSeason === yrStr;
                return (
                  <TouchableOpacity
                    key={yrStr}
                    style={[styles.seasonOptionBtn, isSelected && styles.seasonOptionBtnActive]}
                    onPress={() => {
                      setSelectedSeason(yrStr);
                      setSeasonPickerVisible(false);
                    }}
                  >
                    <Text style={[styles.seasonOptionText, isSelected && styles.seasonOptionTextActive]}>
                      📅 {yrStr} 시즌 내전 기록
                    </Text>
                    {isSelected && <Text style={{ color: '#2563EB', fontWeight: '800' }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.closeBtn} onPress={() => setSeasonPickerVisible(false)}>
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
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 28, color: Colors.text, lineHeight: 28, includeFontPadding: false },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, lineHeight: 22, includeFontPadding: false },
  
  addBtn: { height: 36, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#F3E8FF', borderWidth: 1, borderColor: '#D8B4FE', justifyContent: 'center', alignItems: 'center' },
  addBtnText: { color: '#7E22CE', fontWeight: '600', fontSize: 14, lineHeight: 18, includeFontPadding: false },

  teamSwiperBar: { backgroundColor: '#F1F5F9', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#CBD5E1' },
  teamSwiperChip: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center' },
  teamSwiperChipActive: { backgroundColor: '#7E22CE', borderColor: '#6B21A8' },
  teamSwiperChipText: { fontSize: 13, fontWeight: '600', color: '#475569', lineHeight: 16, includeFontPadding: false },
  teamSwiperChipTextActive: { color: '#FFFFFF', fontWeight: '600' },

  segmentedContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, padding: 2, marginHorizontal: 14, marginTop: 8, marginBottom: 8, borderRadius: 16, borderWidth: 1, borderColor: Colors.border, height: 36 },
  segmentBtn: { flex: 1, height: 32, alignItems: 'center', justifyContent: 'center', borderRadius: 16 },
  segmentBtnActive: { backgroundColor: '#FAF5FF', borderWidth: 1, borderColor: '#D8B4FE' },
  segmentText: { fontSize: 13, fontWeight: '600', color: '#64748B', lineHeight: 16, includeFontPadding: false },
  segmentTextActive: { color: '#6B21A8', fontWeight: '600' },

  monthSelectorBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', paddingHorizontal: 16, height: 44, borderBottomWidth: 1, borderBottomColor: '#E2E8F0', gap: 8 },
  monthSelectorBtn: { height: 32, paddingHorizontal: 14, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', justifyContent: 'center', alignItems: 'center' },
  monthSelectorArrow: { fontSize: 16, fontWeight: '600', color: Colors.primary, lineHeight: 18, includeFontPadding: false },
  monthSelectorText: { fontSize: 13, fontWeight: '600', color: Colors.text, lineHeight: 16, includeFontPadding: false },

  content: { padding: 14, gap: 10, paddingBottom: 40 },

  emptyCard: { padding: 30, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 14, borderWidth: 1, borderColor: Colors.border, marginTop: 10 },
  emptyEmoji: { fontSize: 32, marginBottom: 8 },
  emptyText: { color: Colors.textMuted, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  emptySub: { color: '#94A3B8', fontSize: 11, marginTop: 4, textAlign: 'center' },
  
  ruleBanner: { backgroundColor: '#FAF5FF', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E9D5FF', marginBottom: 6 },
  ruleTitle: { fontSize: 13, fontWeight: '800', color: '#6B21A8' },
  ruleText: { fontSize: 11.5, color: '#7E22CE', lineHeight: 16, marginTop: 4 },

  seasonPickerBtn: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', justifyContent: 'center', alignItems: 'center' },
  seasonPickerBtnText: { fontSize: 13, fontWeight: '600', color: '#1D4ED8', lineHeight: 16, includeFontPadding: false },

  seasonOptionBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  seasonOptionBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  seasonOptionText: { fontSize: 13, fontWeight: '700', color: '#475569' },
  seasonOptionTextActive: { color: '#1D4ED8', fontWeight: '800' },

  rankCard: { backgroundColor: Colors.surface, borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 8 },
  rankCardFirst: { borderColor: '#FBBF24', backgroundColor: '#FFFBEB', borderWidth: 1.5 },
  rankCardSecond: { borderColor: '#CBD5E1', backgroundColor: '#F8FAFC' },
  rankCardThird: { borderColor: '#F97316', backgroundColor: '#FFF7ED' },
  rankBadgeText: { fontSize: 16, fontWeight: '900', color: '#6B21A8', width: 32, textAlign: 'center' },
  rankUserName: { fontSize: 14, fontWeight: '800', color: Colors.text },
  rankRecordText: { fontSize: 11.5, color: Colors.textMuted, marginTop: 2 },
  rankWinNum: { fontSize: 16, fontWeight: '900', color: '#6B21A8' },
  rankWinRateLabel: { fontSize: 10.5, color: Colors.textMuted },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 18, padding: 16, width: '100%', elevation: 5 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: Colors.text, marginBottom: 2 },
  modalSub: { fontSize: 11.5, color: Colors.textMuted, marginBottom: 8 },

  modalSectionBox: { backgroundColor: '#F8FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 8 },

  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  closeBtnText: { color: Colors.text, fontSize: 13, fontWeight: '800' },
  submitModalBtn: { backgroundColor: '#6B21A8', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  submitModalBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  inputLabel: { fontSize: 12, fontWeight: '800', color: '#1E293B', marginBottom: 4 },
  subInputLabel: { fontSize: 11, fontWeight: '700', color: '#64748B', marginBottom: 3 },
  charCountText: { fontSize: 10, color: '#94A3B8', fontWeight: '600' },
  textInput: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 8, fontSize: 13, backgroundColor: '#FFFFFF' },

  datePickerBtn: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10, alignItems: 'center' },
  datePickerBtnText: { fontSize: 12.5, fontWeight: '700', color: '#1E293B' },
  
  calendarContainer: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, padding: 10, marginTop: 6 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  calTitleText: { fontSize: 14, fontWeight: '800', color: Colors.text },
  calNavBtn: { paddingHorizontal: 10, paddingVertical: 2 },
  calNavText: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  weekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 4 },
  weekText: { fontSize: 11, fontWeight: '700', width: 28, textAlign: 'center', color: '#64748B' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  dayBox: { width: '14.28%', height: 32, justifyContent: 'center', alignItems: 'center', marginVertical: 1 },
  selectedDayBox: { backgroundColor: Colors.primary, borderRadius: 16 },
  dayText: { fontSize: 12, fontWeight: '600', color: Colors.text },
  selectedDayText: { color: '#FFFFFF', fontWeight: '800' },
  
  setTabContainer: { flexDirection: 'row', gap: 4, marginBottom: 8 },
  setTab: { flex: 1, paddingVertical: 6, borderRadius: 6, backgroundColor: '#F1F5F9', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  setTabActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  setTabText: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  setTabTextActive: { color: '#FFFFFF', fontWeight: '800' },

  rosterChip: { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 6, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1' },
  rosterChipText: { fontSize: 11.5, fontWeight: '600', color: '#64748B' },
  scoreCalcBox: { backgroundColor: '#FFFFFF', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#CBD5E1' },
  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  setLabel: { fontSize: 12, fontWeight: '800', color: '#1E293B', width: 40 },
  teamScoreCol: { flex: 1, alignItems: 'center' },
  teamScoreLabel: { fontSize: 11, fontWeight: '700', color: '#475569', marginBottom: 2 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  stepBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 4, width: 26, height: 26, justifyContent: 'center', alignItems: 'center' },
  stepBtnText: { fontSize: 11, fontWeight: '800', color: '#1D4ED8' },
  scoreValText: { fontSize: 16, fontWeight: '900', color: '#0F172A', minWidth: 22, textAlign: 'center' },
  vsColon: { fontSize: 16, fontWeight: '800', color: '#94A3B8', marginHorizontal: 2 },
  toggleSet3Btn: { backgroundColor: '#FFFFFF', borderStyle: 'dashed', borderWidth: 1, borderColor: '#93C5FD', borderRadius: 6, paddingVertical: 8, alignItems: 'center', marginTop: 8 },
  toggleSet3Text: { fontSize: 11.5, fontWeight: '800', color: '#2563EB' },
  
  teamSelectChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1' },
  teamSelectChipActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  teamSelectChipText: { fontSize: 12, fontWeight: '800', color: '#334155' },
  teamSelectChipTextActive: { color: '#FFFFFF' },

  winnerGridBtn: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  winnerGridBtnActiveA: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  winnerGridBtnActiveB: { backgroundColor: '#475569', borderColor: '#334155' },
  winnerGridBtnActiveDraw: { backgroundColor: '#0F172A', borderColor: '#020617' },
  winnerGridText: { fontSize: 12, fontWeight: '800', color: '#475569' },
  winnerGridTextActive: { color: '#FFFFFF', fontWeight: '900' },
});