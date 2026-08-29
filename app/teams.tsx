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
  Alert,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import UserProfileModal from '../components/UserProfileModal';
import TeamReportModal, { TeamReportAnalytics } from '../components/TeamReportModal';
import StickyAdBanner from '../components/StickyAdBanner';
import BatchProposalModal from '../components/BatchProposalModal';
import { isActiveTeamStatus } from '../lib/teamStatus';
import {
  resolveTeamName,
  resolveTeamNameOrNull,
  resolveUserName,
  extractRow,
  cleanRegionName,
  getTeamIcon,
  snapshotTeamForState,
  isSameName,
} from '../lib/nameUtils';

interface TeamMemberObj {
  userId: string;
  realName: string;
  maskedName: string;
}

interface PendingMemberReq {
  id: string;
  team_id: string;
  user_id: string;
  full_name: string;
  team_name: string;
}

interface TeamData {
  team_id: string;
  team_name: string;
  region: string;
  team_type: 'school' | 'club' | string;
  youtube_channel_url?: string | null;
  manner_temp?: number;
  leader_id?: string | null;
  hasPassword: boolean;
  memberObjs: TeamMemberObj[];
  memberCount: number;
  isOfficial: boolean;
}

const getMatchSeasonYear = (dateStr: string) => {
  if (!dateStr) return String(new Date().getFullYear());
  const match = dateStr.match(/\d+/g);
  return match && match.length > 0 ? match[0] : String(new Date().getFullYear());
};

const maskName = (name: string) => {
  if (!name || name === '선생님') return '팀*';
  if (name.length === 1) return name;
  if (name.length === 2) return name.charAt(0) + '*';
  const first = name.charAt(0);
  const last = name.charAt(name.length - 1);
  const middle = '*'.repeat(name.length - 2);
  return first + middle + last;
};

export default function AllTeamsListScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;

  const [teams, setTeams] = useState<TeamData[]>([]);
  const [myTeamIds, setMyTeamIds] = useState<string[]>([]);
  const [myTeamNames, setMyTeamsNames] = useState<string[]>([]);
  const [pendingTeamIds, setPendingTeamIds] = useState<string[]>([]);
  const [pendingRequestsForMyTeams, setPendingRequestsForMyTeams] = useState<PendingMemberReq[]>([]);
  const [allMatches, setAllMatches] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [selectedRegion, setSelectedRegion] = useState('전체');
  const [userPrioritizedRegions, setUserPrioritizedRegions] = useState<string[]>([]);
  const [dbActiveRegions, setDbActiveRegions] = useState<string[]>([]);
  const [sortType, setSortType] = useState<'popular' | 'recruiting'>('popular');
  const [expandedTeamId, setExpandedTeamId] = useState<string | null>(null);

  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);

  const [selectedUserIdForModal, setSelectedUserIdForModal] = useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  const [selectedTeamForReport, setSelectedTeamForReport] = useState<TeamData | null>(null);
  const [teamReportModalVisible, setTeamReportModalVisible] = useState(false);

  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamRegion, setNewTeamRegion] = useState('천안');
  const [newTeamType, setNewTeamType] = useState<'school'|'club'>('school');
  const [newTeamPassword, setNewTeamPassword] = useState('');
  const [newTeamYoutube, setNewTeamYoutube] = useState('');
  const [showCreateDropdown, setShowCreateDropdown] = useState(false);

  const [joinModalVisible, setJoinModalVisible] = useState(false);
  const [selectedJoinTeam, setSelectedJoinTeam] = useState<TeamData | null>(null);
  const [joinPassword, setJoinPassword] = useState('');

  const [proposalModalVisible, setProposalModalVisible] = useState(false);

  useEffect(() => {
    if (currentUserId) {
      supabase.from('profiles').select('region').eq('id', currentUserId).maybeSingle().then(({ data }) => {
        if (data?.region) {
          const regs = data.region.split(',').map((r: string) => cleanRegionName(r)).filter(Boolean);
          if (regs.length > 0) {
            setUserPrioritizedRegions(regs);
            setSelectedRegion(regs[0]);
          }
        }
      });
    }
  }, [currentUserId]);

  const dynamicRegionTabs = useMemo(() => {
    const tabs = ['전체', ...userPrioritizedRegions];
    dbActiveRegions.forEach((r) => {
      const cleaned = cleanRegionName(r);
      if (!tabs.includes(cleaned)) tabs.push(cleaned);
    });
    return tabs;
  }, [userPrioritizedRegions, dbActiveRegions]);

  const fetchTeams = async () => {
    try {
      let activeMyTeams: string[] = [];
      if (currentUserId) {
        const { data: myMems } = await supabase.from('team_members').select('team_id, is_active, teams(*)').eq('user_id', currentUserId);
        if (myMems) {
          activeMyTeams = (myMems || []).filter((m: any) => m.is_active).map((m: any) => m.team_id as string);
          setMyTeamIds(activeMyTeams);
          
          const names = (myMems || []).filter((m: any) => {
            if (!m.is_active) return false;
            const teamObj = extractRow<any>(m.teams);
            return isActiveTeamStatus(teamObj?.status);
          }).map((m: any) => {
            const teamObj = extractRow<any>(m.teams);
            return resolveTeamNameOrNull(teamObj);
          }).filter((n): n is string => !!n);
          setMyTeamsNames(names);

          setPendingTeamIds((myMems || []).filter((m: any) => !m.is_active).map((m: any) => m.team_id as string));
        }
      }

      if (activeMyTeams.length > 0) {
        const { data: pendData } = await supabase
          .from('team_members')
          .select(`id, team_id, user_id, teams(*), profiles(*)`)
          .in('team_id', activeMyTeams)
          .eq('is_active', false);

        if (pendData) {
          const formattedPendings: PendingMemberReq[] = pendData.map((p: any) => {
            const teamObj = extractRow<any>(p.teams);
            const profileObj = extractRow<any>(p.profiles);
            return {
              id: p.id,
              team_id: p.team_id,
              user_id: p.user_id,
              full_name: resolveUserName(profileObj, undefined, '선생님'),
              team_name: resolveTeamName(teamObj, '소속팀'),
            };
          });
          setPendingRequestsForMyTeams(formattedPendings);
        }
      } else {
        setPendingRequestsForMyTeams([]);
      }

      const { data: mData } = await supabase.from('matches').select('*').eq('status', 'completed');
      if (mData) setAllMatches(mData);

      const { data, error } = await supabase
        .from('team_members')
        .select(`
          team_id, user_id,
          teams(*),
          profiles(full_name)
        `)
        .eq('is_active', true);

      if (error) console.error('team_members 조인 에러:', error);

      const teamMap = new Map<string, { name: string; region: string; team_type: 'school' | 'club'; youtube_channel_url?: string | null; manner_temp?: number; leader_id?: string | null; hasPassword: boolean; memberObjs: TeamMemberObj[] }>();
      const regionsSet = new Set<string>();

      data?.forEach((item: any) => {
        const teamObj = extractRow<any>(item.teams);
        const profileObj = extractRow<any>(item.profiles);
        const uId = item.user_id;
        if (!teamObj) return;
        if (!isActiveTeamStatus(teamObj.status)) return;

        const cleanName = resolveTeamName(teamObj);
        const stdRegion = cleanRegionName(teamObj.region);
        if (stdRegion) regionsSet.add(stdRegion);

        const existing = teamMap.get(teamObj.id) || {
          name: cleanName,
          region: stdRegion || '천안',
          team_type: teamObj.team_type || '',
          youtube_channel_url: teamObj.youtube_channel_url || null,
          manner_temp: teamObj.manner_temp || 36.5,
          leader_id: teamObj.leader_id || null,
          hasPassword: !!teamObj.password,
          memberObjs: [] as TeamMemberObj[],
        };

        const realName: string = resolveUserName(profileObj, undefined, '팀원');
        if (!existing.memberObjs.some(m => m.userId === uId)) {
          existing.memberObjs.push({
            userId: uId,
            realName,
            maskedName: maskName(realName),
          });
        }
        teamMap.set(teamObj.id, existing);
      });

      const { data: allTeamsDB } = await supabase
        .from('teams')
        .select('*');
      if (allTeamsDB) {
        allTeamsDB.forEach((t: any) => {
          if (!isActiveTeamStatus(t.status)) return;
          const cleanName = resolveTeamName(t);

          const stdRegion = cleanRegionName(t.region);
          if (stdRegion) regionsSet.add(stdRegion);
          if (!teamMap.has(t.id)) {
            teamMap.set(t.id, {
              name: cleanName,
              region: stdRegion || '천안',
              team_type: t.team_type || '',
              youtube_channel_url: t.youtube_channel_url || null,
              manner_temp: t.manner_temp || 36.5,
              leader_id: t.leader_id || null,
              hasPassword: !!t.password,
              memberObjs: [],
            });
          }
        });
      }

      setDbActiveRegions(Array.from(regionsSet));

      const teamList: TeamData[] = Array.from(teamMap.entries()).map(([team_id, info]) => {
        const sortedMembers = [...info.memberObjs].sort((a, b) => {
          if (a.userId === info.leader_id) return -1;
          if (b.userId === info.leader_id) return 1;
          return a.realName.localeCompare(b.realName, 'ko-KR');
        });

        return {
          team_id,
          team_name: info.name,
          region: info.region,
          team_type: info.team_type,
          youtube_channel_url: info.youtube_channel_url,
          manner_temp: info.manner_temp || 36.5,
          leader_id: info.leader_id,
          hasPassword: info.hasPassword,
          memberObjs: sortedMembers,
          memberCount: info.memberObjs.length,
          isOfficial: info.memberObjs.length >= 3,
        };
      });

      setTeams(teamList);
    } catch (err) {
      console.error('팀 목록 불러오기 전체 오류:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchTeams(); }, []);
  const onRefresh = () => { setRefreshing(true); setExpandedTeamId(null); fetchTeams(); };

  const handleApprovePendingUser = async (req: PendingMemberReq) => {
    setActionLoading(true);
    try {
      const { error } = await supabase.from('team_members').update({ is_active: true }).eq('id', req.id);
      if (error) throw error;

      await supabase.from('notifications').insert({
        user_id: req.user_id,
        title: '🎉 [팀 가입 승인 완료]',
        message: `'${req.team_name}' 팀 가입이 최종 승인되었습니다.`,
        is_read: false,
      });

      Alert.alert('승인 완료 ✅', `'${req.full_name}' 선생님이 정식 멤버로 승인되었습니다.`);
      fetchTeams();
    } catch (err: any) { Alert.alert('오류', err.message); } 
    finally { setActionLoading(false); }
  };

  const handleRejectPendingUser = async (req: PendingMemberReq) => {
    Alert.alert('가입 요청 거절', `'${req.full_name}' 선생님의 가입 요청을 거절하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '거절하기', style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            await supabase.from('team_members').delete().eq('id', req.id);
            Alert.alert('거절 완료', '가입 요청을 거절했습니다.');
            fetchTeams();
          } catch (err: any) { Alert.alert('오류', err.message); } 
          finally { setActionLoading(false); }
        }
      }
    ]);
  };

  // 💡 내 팀을 포함해 모든 팀의 체크박스를 정상 선택 가능
  const toggleSelectTeam = (teamId: string) => {
    setSelectedTeamIds(prev =>
      prev.includes(teamId) ? prev.filter(id => id !== teamId) : [...prev, teamId]
    );
  };

  // 💡 버튼 터치 시 조건 판단
  const handleOpenProposal = () => {
    if (selectedTeamIds.length === 0) return;

    const mySelectedTeamIds = selectedTeamIds.filter(id => myTeamIds.includes(id));
    
    // 경우 1: 내 팀 1개만 고르고 상대팀은 0개 고른 경우
    if (mySelectedTeamIds.length === 1 && selectedTeamIds.length === 1) {
      return Alert.alert(
        '교류전 대상 선택 안내', 
        '상대 팀을 1개 이상 선택하거나, 내 다른 소속팀을 함께 선택해 교류전을 등록하세요.'
      );
    }

    setProposalModalVisible(true);
  };

  const similarTeams = useMemo(() => {
    const query = newTeamName.trim().replace(/\s+/g, '').toLowerCase();
    if (!query) return [];
    return teams.filter(t => resolveTeamName(t).replace(/\s+/g, '').toLowerCase().includes(query));
  }, [teams, newTeamName]);

  const handleSelectSimilarTeam = (team: TeamData) => {
    setCreateModalVisible(false);
    setShowCreateDropdown(false);
    setNewTeamName(''); setNewTeamYoutube('');
    
    if (team.hasPassword) {
      setSelectedJoinTeam(team);
      setJoinModalVisible(true);
    } else {
      handleDirectJoin(team);
    }
  };

  const handleCreateTeam = async () => {
    const trimmedName = newTeamName.trim();
    if (!trimmedName) return Alert.alert('알림', '팀 이름을 입력해 주세요.');

    const cleanInput = trimmedName.replace(/\s+/g, '').toLowerCase();
    const exactDuplicate = teams.find(t => resolveTeamName(t).replace(/\s+/g, '').toLowerCase() === cleanInput);

    if (exactDuplicate) {
      return Alert.alert('이미 존재함', `'${exactDuplicate.team_name}' 팀이 이미 존재합니다.`);
    }
    
    setActionLoading(true);
    try {
      const { data: newTeam, error } = await supabase.from('teams').insert({
        name: trimmedName,
        region: cleanRegionName(newTeamRegion),
        team_type: newTeamType,
        password: newTeamPassword || null,
        youtube_channel_url: newTeamYoutube.trim() || null,
        leader_id: currentUserId,
        status: 'active',
      }).select().single();
      
      if (error) throw error;

      await supabase.from('team_members').insert({
        user_id: currentUserId, team_id: newTeam.id, is_active: true, is_primary: myTeamIds.length === 0,
      });

      Alert.alert('팀 창단 완료! 🎉', `'${trimmedName}' 팀이 새로 등록되었습니다.`);
      setCreateModalVisible(false);
      onRefresh();
    } catch (err: any) { Alert.alert('오류', err.message); } 
    finally { setActionLoading(false); }
  };

  const handleDirectJoin = (team: TeamData) => {
    Alert.alert('공개팀 가입', `'${team.team_name}' 팀에 가입하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '가입하기',
        onPress: async () => {
          setActionLoading(true);
          try {
            await supabase.from('team_members').insert({
              user_id: currentUserId, team_id: team.team_id, is_active: true, is_primary: myTeamIds.length === 0
            });
            Alert.alert('가입 완료! 🚀', `'${team.team_name}' 팀 소속이 되었습니다.`);
            onRefresh();
          } catch (err: any) { Alert.alert('오류', err.message); } 
          finally { setActionLoading(false); }
        }
      }
    ]);
  };

  const handleCancelJoinRequest = (teamId: string) => {
    Alert.alert('요청 취소', '가입 승인 요청을 취소하시겠습니까?', [
      { text: '닫기', style: 'cancel' },
      {
        text: '취소', style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            await supabase.from('team_members').delete().eq('user_id', currentUserId).eq('team_id', teamId).eq('is_active', false);
            Alert.alert('취소 완료', '가입 요청이 취소되었습니다.');
            onRefresh();
          } catch (err: any) { Alert.alert('오류', err.message); } 
          finally { setActionLoading(false); }
        }
      }
    ]);
  };

  const handleJoinWithPassword = async () => {
    if (!joinPassword) return Alert.alert('알림', '비밀번호를 입력하세요.');
    if (!selectedJoinTeam) return;

    setActionLoading(true);
    try {
      const { data } = await supabase.from('teams').select('password').eq('id', selectedJoinTeam.team_id).single();
      if (!data || data.password !== joinPassword) {
        setActionLoading(false);
        return Alert.alert('비밀번호 오류', '비밀번호가 올바르지 않습니다.');
      }

      await supabase.from('team_members').insert({
        user_id: currentUserId, team_id: selectedJoinTeam.team_id, is_active: true, is_primary: myTeamIds.length === 0
      });

      Alert.alert('가입 완료! 🚀', `'${selectedJoinTeam.team_name}' 팀에 가입되었습니다.`);
      setJoinModalVisible(false);
      onRefresh();
    } catch (err: any) { Alert.alert('오류', err.message); } 
    finally { setActionLoading(false); }
  };

  const handleJoinRequest = async () => {
    if (!selectedJoinTeam) return;
    setActionLoading(true);
    try {
      await supabase.from('team_members').insert({ user_id: currentUserId, team_id: selectedJoinTeam.team_id, is_active: false });
      Alert.alert('요청 완료 🔔', '가입 승인 요청을 전달했습니다.');
      setJoinModalVisible(false);
      onRefresh();
    } catch (err: any) { Alert.alert('오류', err.message); } 
    finally { setActionLoading(false); }
  };

  const filteredAndSortedTeams = useMemo(() => {
    let result = [...teams];
    if (selectedRegion !== '전체') {
      result = result.filter((t) => cleanRegionName(t.region) === selectedRegion);
    }
    result.sort((a, b) => {
      if (sortType === 'popular') {
        if (a.isOfficial !== b.isOfficial) return a.isOfficial ? -1 : 1;
        if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
        return a.team_name.localeCompare(b.team_name, 'ko-KR');
      } else {
        if (a.isOfficial !== b.isOfficial) return a.isOfficial ? 1 : -1;
        if (a.memberCount !== b.memberCount) return a.memberCount - b.memberCount;
        return a.team_name.localeCompare(b.team_name, 'ko-KR');
      }
    });
    return result;
  }, [teams, selectedRegion, sortType]);

  const calcStatsForMatches = (matchesList: any[], teamName: string) => {
    let wins = 0, losses = 0, draws = 0;
    let setsWon = 0, setsLost = 0, shutoutWins = 0, fullsetWins = 0;
    const oppMap: { [oppName: string]: { wins: number; losses: number; draws: number; total: number } } = {};

    matchesList.forEach((m: any) => {
      const hName = resolveTeamName(m.host_team_name);
      const aName = resolveTeamName(m.away_team_name);
      const wName = resolveTeamName(m.winner_team);
      const isHost = isSameName(hName, teamName);
      const oppName = isHost ? aName : hName;
      const isWin = isSameName(wName, teamName);
      const isDraw = wName === 'draw' || wName === '무승부';

      if (isWin) wins++;
      else if (isDraw) draws++;
      else losses++;

      if (oppName) {
        if (!oppMap[oppName]) oppMap[oppName] = { wins: 0, losses: 0, draws: 0, total: 0 };
        oppMap[oppName].total++;
        if (isWin) oppMap[oppName].wins++;
        else if (isDraw) oppMap[oppName].draws++;
        else oppMap[oppName].losses++;
      }

      let hostSetWon = 0, awaySetWon = 0;
      if (m.set_scores) {
        m.set_scores.split(', ').forEach((s: string) => {
          const [h, a] = s.split(':').map(Number);
          if (!isNaN(h) && !isNaN(a)) {
            if (h > a) hostSetWon++;
            else if (a > h) awaySetWon++;
          }
        });
      }

      const mySetWon = isHost ? hostSetWon : awaySetWon;
      const oppSetWon = isHost ? awaySetWon : hostSetWon;
      setsWon += mySetWon;
      setsLost += oppSetWon;

      if (isWin) {
        if (oppSetWon === 0) shutoutWins++;
        else fullsetWins++;
      }
    });

    let nemesis = '없음', nemesisStat = '', victim = '없음', victimStat = '';
    let maxLossDiff = -999, maxWinDiff = -999;

    Object.entries(oppMap).forEach(([opp, stat]) => {
      const winDiff = stat.wins - stat.losses;
      const lossDiff = stat.losses - stat.wins;

      if (stat.losses > stat.wins && lossDiff > maxLossDiff) {
        maxLossDiff = lossDiff; nemesis = opp; nemesisStat = `${stat.losses}패 ${stat.wins}승 (${stat.total}전)`;
      }

      if (stat.wins > stat.losses && winDiff > maxWinDiff) {
        maxWinDiff = winDiff; victim = opp; victimStat = `${stat.wins}승 ${stat.losses}패 (${stat.total}전)`;
      }
    });

    const teamRecent5 = matchesList.slice(0, 5).map((m: any) => {
      const isWin = isSameName(m.winner_team, teamName);
      const isDraw = m.winner_team === 'draw' || m.winner_team === '무승부';
      return isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSS';
    });

    const totalMatches = matchesList.length;

    return {
      totalMatches,
      totalWins: wins,
      totalDraws: draws,
      totalLosses: losses,
      winRate: totalMatches > 0 ? Math.round((wins / totalMatches) * 100) : 0,
      setsWon,
      setsLost,
      setDiff: setsWon - setsLost,
      shutoutWins,
      fullsetWins,
      nemesis,
      nemesisStat,
      victim,
      victimStat,
      teamRecent5,
    };
  };

  const selectedTeamAnalytics = useMemo<TeamReportAnalytics | null>(() => {
    if (!selectedTeamForReport) return null;
    const teamName = resolveTeamName(selectedTeamForReport);

    const teamMatches = allMatches.filter((m: any) => isSameName(m.host_team_name, teamName) || isSameName(m.away_team_name, teamName));

    const careerStats = calcStatsForMatches(teamMatches, teamName);

    const seasonMap: { [yr: string]: any[] } = {};
    teamMatches.forEach((m: any) => {
      const yr = getMatchSeasonYear(m.match_date || m.created_at);
      if (!seasonMap[yr]) seasonMap[yr] = [];
      seasonMap[yr].push(m);
    });

    const seasonsStats: { [yr: string]: any } = {};
    Object.entries(seasonMap).forEach(([yr, mList]) => {
      seasonsStats[yr] = calcStatsForMatches(mList, teamName);
    });

    return {
      teamName,
      region: cleanRegionName(selectedTeamForReport.region),
      teamType: selectedTeamForReport.team_type === 'school' || selectedTeamForReport.team_type === '학교'
        ? 'school'
        : selectedTeamForReport.team_type === 'club' || selectedTeamForReport.team_type === '동호회'
        ? 'club'
        : undefined,
      mannerTemp: selectedTeamForReport.manner_temp,
      isOfficial: selectedTeamForReport.isOfficial,
      memberCount: selectedTeamForReport.memberCount,
      status: 'active',
      teamId: selectedTeamForReport.team_id,
      totalMatches: careerStats.totalMatches,
      setsWon: careerStats.setsWon,
      setsLost: careerStats.setsLost,
      setDiff: careerStats.setDiff,
      shutoutWins: careerStats.shutoutWins,
      fullsetWins: careerStats.fullsetWins,
      nemesis: careerStats.nemesis,
      nemesisStat: careerStats.nemesisStat,
      victim: careerStats.victim,
      victimStat: careerStats.victimStat,
      teamRecent5: careerStats.teamRecent5,
      career: careerStats,
      seasons: seasonsStats,
    };
  }, [selectedTeamForReport, allMatches]);

  const openTeamReport = (team: TeamData) => {
    setSelectedTeamForReport(snapshotTeamForState(team));
    setTeamReportModalVisible(true);
  };

  const openUserProfile = (uId: string) => {
    setSelectedUserIdForModal(uId);
    setProfileModalVisible(true);
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <View style={styles.headerLeftGroup}>
          <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.backText}>‹</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>전체 팀 목록</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => { setShowCreateDropdown(false); setCreateModalVisible(true); }}>
          <Text style={styles.addBtnText}>+ 팀 등록</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.regionTabWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.regionTabScroll}>
          {dynamicRegionTabs.map((region) => {
            const isPriority = userPrioritizedRegions.includes(region);
            const prioIdx = userPrioritizedRegions.indexOf(region);
            return (
              <TouchableOpacity key={region} style={[styles.regionTab, selectedRegion === region && styles.regionTabActive]} onPress={() => { setSelectedRegion(region); setExpandedTeamId(null); }}>
                <Text style={[styles.regionTabText, selectedRegion === region && styles.regionTabTextActive]}>
                  {isPriority ? `[${prioIdx + 1}순위] ` : ''}{region}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <View style={styles.sortWrapper}>
        <TouchableOpacity style={[styles.sortBtn, sortType === 'popular' && styles.sortBtnActive]} onPress={() => setSortType('popular')}>
          <Text style={[styles.sortBtnText, sortType === 'popular' && styles.sortBtnTextActive]}>🔥 대형·공식 팀 우선</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.sortBtn, sortType === 'recruiting' && styles.sortBtnActive]} onPress={() => setSortType('recruiting')}>
          <Text style={[styles.sortBtnText, sortType === 'recruiting' && styles.sortBtnTextActive]}>🌱 신규·모집 팀 우선</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
          <View style={styles.infoBanner}>
            <Text style={styles.infoBannerIcon}>💡</Text>
            <Text style={styles.infoBannerText}>
              팀에 <Text style={{ fontWeight: '800' }}>3명 이상</Text> 모이면 <Text style={{ color: '#0284C7', fontWeight: '800' }}>💎 공식 인증팀</Text>으로 승격되며, <Text style={{ fontWeight: '800', color: '#2563EB' }}>상세 리포트</Text>가 제공됩니다!
            </Text>
          </View>

          {loading ? (
            <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
          ) : filteredAndSortedTeams.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>👀</Text>
              <Text style={styles.emptyText}>선택하신 [{selectedRegion}] 지역에 아직 등록된 팀이 없습니다.</Text>
            </View>
          ) : (
            filteredAndSortedTeams.map((team) => {
              const isSchool = team.team_type === 'school' || team.team_type === '학교';
              const isClub = team.team_type === 'club' || team.team_type === '동호회';
              const isExpanded = expandedTeamId === team.team_id;
              const MAX_DISPLAY = 3;
              const extraCount = team.memberCount - MAX_DISPLAY;
              
              const isMyTeam = myTeamIds.includes(team.team_id);
              const isPending = pendingTeamIds.includes(team.team_id);
              const isChecked = selectedTeamIds.includes(team.team_id);

              const pendingUsersForThisTeam = pendingRequestsForMyTeams.filter(p => p.team_id === team.team_id);
              const displayMemberObjs = isExpanded ? team.memberObjs : team.memberObjs.slice(0, MAX_DISPLAY);

              return (
                <View 
                  key={team.team_id} 
                  style={[
                    styles.teamCard, 
                    team.isOfficial ? styles.teamCardOfficial : styles.teamCardUnofficial, 
                    isChecked && styles.teamCardSelected
                  ]}
                >
                  <TouchableOpacity onPress={() => openTeamReport(team)} activeOpacity={0.8}>
                    <View style={styles.cardMainHeaderTopRow}>
                      <TouchableOpacity onPress={() => toggleSelectTeam(team.team_id)} style={styles.checkboxTouch} hitSlop={6}>
                        <View style={[styles.customCheckbox, isChecked && styles.customCheckboxChecked]}>
                          {isChecked && <Text style={styles.checkmarkText}>✓</Text>}
                        </View>
                      </TouchableOpacity>

                      <Text style={styles.teamName} numberOfLines={1}>
                        {getTeamIcon(team.team_type)} {resolveTeamName(team)}
                      </Text>

                      <View style={styles.rightBadgeContainer}>
                        <View style={styles.countBadge}>
                          <Text style={styles.countText}>{team.memberCount}명</Text>
                        </View>
                        <View style={styles.mannerTempBadge}>
                          <Text style={styles.mannerTempBadgeText}>🌡️ {(team.manner_temp || 36.5).toFixed(1)}°C</Text>
                        </View>
                      </View>
                    </View>

                    <View style={styles.cardHeaderSubRow}>
                      <View style={styles.regionTagChip}>
                        <Text style={styles.regionTagChipText}>📍 {cleanRegionName(team.region)}</Text>
                      </View>

                      <View style={[styles.typeBadge, isSchool ? styles.schoolTypeBadge : isClub ? styles.clubTypeBadge : styles.regionTagChip]}>
                        <Text style={[styles.typeBadgeText, isSchool ? styles.schoolTypeBadgeText : isClub ? styles.clubTypeBadgeText : styles.regionTagChipText]}>
                          {isSchool ? '학교' : isClub ? '동호회' : '팀'}
                        </Text>
                      </View>

                      <View style={[styles.privacyBadge, team.hasPassword ? styles.privateBadge : styles.publicBadge]}>
                        <Text style={[styles.privacyBadgeText, team.hasPassword ? styles.privateBadgeText : styles.publicBadgeText]}>
                          {team.hasPassword ? '🔒 비공개' : '🔓 공개'}
                        </Text>
                      </View>
                      
                      {team.isOfficial && (
                        <View style={styles.officialBadge}>
                          <Text style={styles.officialBadgeText}>💎 공식인증</Text>
                        </View>
                      )}

                      {team.youtube_channel_url && (
                        <TouchableOpacity
                          style={styles.youtubeMiniBtn}
                          onPress={() => Linking.openURL(team.youtube_channel_url!).catch(() => Alert.alert('오류', '올바른 유튜브 링크가 아닙니다.'))}
                        >
                          <Text style={styles.youtubeMiniBtnText}>📺 유튜브</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </TouchableOpacity>

                  <View style={styles.membersArea}>
                    <View style={styles.membersAreaHeader}>
                      <Text style={styles.membersLabel}>
                        소속 팀원 {isMyTeam ? '(실명)' : '(익명)'}
                      </Text>
                      {!team.isOfficial && (
                        <Text style={styles.needMoreText}>🌱 공식팀까지 {Math.max(1, 3 - team.memberCount)}명</Text>
                      )}
                    </View>

                    {team.memberCount === 0 ? (
                      <Text style={{ fontSize: 12, color: '#94A3B8' }}>등록된 소속 팀원이 없습니다.</Text>
                    ) : (
                      <View style={styles.membersList}>
                        {displayMemberObjs.map((mObj) => {
                          const isLeader = team.leader_id === mObj.userId;
                          const nameToShow = isMyTeam ? mObj.realName : mObj.maskedName;

                          return (
                            <TouchableOpacity
                              key={mObj.userId}
                              style={[styles.memberTag, isLeader && styles.memberTagLeader]}
                              onPress={() => openUserProfile(mObj.userId)}
                            >
                              <Text style={[styles.memberTagText, isLeader && styles.memberTagTextLeader]}>
                                {isLeader ? `🚩 ${nameToShow}` : nameToShow}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                        {extraCount > 0 && !isExpanded && (
                          <TouchableOpacity style={styles.moreChip} onPress={() => setExpandedTeamId(team.team_id)}>
                            <Text style={styles.moreChipText}>+{extraCount}명 더보기</Text>
                          </TouchableOpacity>
                        )}
                        {isExpanded && extraCount > 0 && (
                          <TouchableOpacity style={styles.moreChip} onPress={() => setExpandedTeamId(null)}>
                            <Text style={styles.moreChipText}>접기 ▲</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>

                  {isMyTeam && pendingUsersForThisTeam.length > 0 && (
                    <View style={styles.pendingApprovalBox}>
                      <Text style={styles.pendingApprovalTitle}>
                        🔔 신규 가입 신청 승인 대기 ({pendingUsersForThisTeam.length}명)
                      </Text>
                      {pendingUsersForThisTeam.map((pReq) => (
                        <View key={pReq.id} style={styles.pendingUserRow}>
                          <Text style={styles.pendingUserName}>👤 {pReq.full_name} 선생님</Text>
                          <View style={styles.pendingBtnGroup}>
                            <TouchableOpacity
                              style={styles.approveBtn}
                              onPress={() => handleApprovePendingUser(pReq)}
                              disabled={actionLoading}
                            >
                              <Text style={styles.approveBtnText}>승인 ✅</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={styles.rejectBtn}
                              onPress={() => handleRejectPendingUser(pReq)}
                              disabled={actionLoading}
                            >
                              <Text style={styles.rejectBtnText}>거절 ✕</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}

                  <View style={styles.actionFooter}>
                    {isMyTeam ? (
                      <View style={styles.badgeSuccess}><Text style={styles.badgeSuccessText}>✅ 내 소속 팀</Text></View>
                    ) : isPending ? (
                      <TouchableOpacity style={styles.badgePendingTouch} onPress={() => handleCancelJoinRequest(team.team_id)}>
                        <Text style={styles.badgePendingText}>⏳ 승인 대기중 (터치하여 취소)</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity 
                        style={styles.joinBtn} 
                        onPress={() => { 
                          if (team.hasPassword) {
                            setSelectedJoinTeam(team); 
                            setJoinModalVisible(true); 
                          } else {
                            handleDirectJoin(team);
                          }
                        }}
                      >
                        <Text style={styles.joinBtnText}>+ 이 팀에 가입하기</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>

        {selectedTeamIds.length > 0 && (
          <View style={styles.multiProposalBar}>
            <Text style={styles.multiProposalCount}>선택된 {selectedTeamIds.length}개 팀</Text>
            <TouchableOpacity style={styles.multiProposalBtn} onPress={handleOpenProposal} disabled={actionLoading}>
              <Text style={styles.multiProposalBtnText}>✉️ 교류전 일괄 제안하기</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <StickyAdBanner />

      <BatchProposalModal
        visible={proposalModalVisible}
        onClose={() => setProposalModalVisible(false)}
        selectedTeamIds={selectedTeamIds}
        allTeams={teams}
        myTeamNames={myTeamNames}
        currentUserId={currentUserId}
        onSuccess={() => {
          setProposalModalVisible(false);
          setSelectedTeamIds([]);
        }}
      />

      <Modal visible={createModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🛡️ 새 팀 등록 (창단)</Text>
            <Text style={styles.modalSub}>앱에 없는 팀을 직접 등록하고 리더가 되세요.</Text>
            
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }} nestedScrollEnabled={true}>
              <Text style={styles.inputLabel}>1. 팀 이름</Text>
              <View style={{ position: 'relative', zIndex: 100, marginBottom: 12 }}>
                <TextInput
                  style={styles.textInput}
                  placeholder="예: 삼은초, 교사배구사랑"
                  value={newTeamName}
                  onChangeText={(txt) => { setNewTeamName(txt); setShowCreateDropdown(true); }}
                  onFocus={() => setShowCreateDropdown(true)}
                />
                
                {showCreateDropdown && similarTeams.length > 0 && (
                  <View style={styles.dropdownBox}>
                    <View style={styles.dropdownHeader}>
                      <Text style={styles.dropdownHeaderText}>💡 혹시 이 팀을 찾으시나요?</Text>
                    </View>
                    <ScrollView style={{ maxHeight: 130 }} nestedScrollEnabled={true}>
                      {similarTeams.map((t) => (
                        <TouchableOpacity
                          key={t.team_id}
                          style={styles.dropdownItem}
                          onPress={() => handleSelectSimilarTeam(t)}
                        >
                          <Text style={styles.dropdownItemText}>
                            {getTeamIcon(t.team_type)} {resolveTeamName(t)} [{cleanRegionName(t.region)}] (터치 시 가입)
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <Text style={styles.inputLabel}>2. 소속 지역</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {dynamicRegionTabs.filter(r => r !== '전체').map(reg => (
                  <TouchableOpacity key={reg} style={[styles.chipBtn, newTeamRegion === reg && styles.chipBtnActive]} onPress={() => setNewTeamRegion(reg)}>
                    <Text style={[styles.chipBtnText, newTeamRegion === reg && styles.chipBtnTextActive]}>{reg}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.inputLabel}>3. 팀 성격</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                <TouchableOpacity style={[styles.chipBtn, { flex: 1, paddingVertical: 10 }, newTeamType === 'school' && styles.chipBtnActive]} onPress={() => setNewTeamType('school')}>
                  <Text style={[styles.chipBtnText, newTeamType === 'school' && styles.chipBtnTextActive]}>🏫 학교 팀</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.chipBtn, { flex: 1, paddingVertical: 10 }, newTeamType === 'club' && styles.chipBtnActive]} onPress={() => setNewTeamType('club')}>
                  <Text style={[styles.chipBtnText, newTeamType === 'club' && styles.chipBtnTextActive]}>🛡️ 동호회 팀</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.inputLabel}>4. 팀 비밀번호 (선택)</Text>
              <TextInput style={styles.textInput} placeholder="비워두시면 누구나 즉시 가입 가능한 공개팀이 됩니다." value={newTeamPassword} onChangeText={setNewTeamPassword} secureTextEntry />

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>5. 팀 공식 유튜브 채널 URL (선택)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="예: https://www.youtube.com/@팀채널"
                placeholderTextColor="#94A3B8"
                value={newTeamYoutube}
                onChangeText={setNewTeamYoutube}
                autoCapitalize="none"
              />
            </ScrollView>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.closeBtn, { flex: 1, marginTop: 0 }]} onPress={() => { setCreateModalVisible(false); setShowCreateDropdown(false); }}><Text style={styles.closeBtnText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.submitBtn, { flex: 2 }]} onPress={handleCreateTeam} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>✨ 팀 창단 완료</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={joinModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {selectedJoinTeam && (
              <>
                <Text style={styles.modalTitle}>🤝 '{selectedJoinTeam.team_name}' 가입</Text>
                <Text style={styles.modalSub}>이 팀은 비공개팀입니다. 비밀번호를 입력해 주세요.</Text>
                
                <View style={{ marginVertical: 10 }}>
                  <Text style={styles.inputLabel}>팀 비밀번호</Text>
                  <TextInput style={[styles.textInput, { marginBottom: 14, backgroundColor: '#F8FAFC' }]} placeholder="비밀번호 입력" value={joinPassword} onChangeText={setJoinPassword} secureTextEntry autoFocus />
                  
                  <TouchableOpacity style={styles.submitBtn} onPress={handleJoinWithPassword} disabled={actionLoading}>
                    {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.submitBtnText}>🚀 비밀번호로 즉시 가입</Text>}
                  </TouchableOpacity>
                </View>

                <View style={styles.dividerRow}>
                  <View style={styles.dividerLine} />
                  <Text style={styles.dividerText}>또는</Text>
                  <View style={styles.dividerLine} />
                </View>

                <View style={styles.infoNoticeBox}>
                  <Text style={styles.infoNoticeText}>비밀번호를 모르시나요? 기존 팀원들에게 가입 승인을 요청할 수 있습니다.</Text>
                </View>

                <TouchableOpacity style={styles.requestBtn} onPress={handleJoinRequest} disabled={actionLoading}>
                  <Text style={styles.requestBtnText}>🙋‍♂️ 가입 승인 요청 보내기</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.closeBtn} onPress={() => { setJoinModalVisible(false); setJoinPassword(''); }}>
                  <Text style={styles.closeBtnText}>취소</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      <UserProfileModal
        visible={profileModalVisible}
        userId={selectedUserIdForModal}
        onClose={() => {
          setProfileModalVisible(false);
          setSelectedUserIdForModal(null);
        }}
      />

      <TeamReportModal
        visible={teamReportModalVisible}
        onClose={() => {
          setTeamReportModalVisible(false);
          setSelectedTeamForReport(null);
        }}
        analytics={selectedTeamAnalytics}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerLeftGroup: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  backBtn: { width: 30, height: 30, justifyContent: 'center', alignItems: 'center' },
  backText: { fontSize: 28, color: Colors.text, lineHeight: 28 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  addBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  addBtnText: { color: '#1D4ED8', fontWeight: '800', fontSize: 12.5 },

  regionTabWrapper: { backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingVertical: 8 },
  regionTabScroll: { paddingHorizontal: 16, gap: 6 },
  regionTab: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F1F5F9' },
  regionTabActive: { backgroundColor: Colors.primary },
  regionTabText: { fontSize: 12.5, fontWeight: '600', color: '#64748B' },
  regionTabTextActive: { color: '#FFFFFF', fontWeight: '700' },

  sortWrapper: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 10, gap: 6 },
  sortBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center' },
  sortBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  sortBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  sortBtnTextActive: { color: '#1D4ED8', fontWeight: '800' },

  content: { padding: 14, gap: 10, paddingBottom: 20 },
  infoBanner: { flexDirection: 'row', backgroundColor: '#F0F9FF', padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#BAE6FD', alignItems: 'center', marginBottom: 2 },
  infoBannerIcon: { fontSize: 18, marginRight: 8 },
  infoBannerText: { fontSize: 12, color: '#0369A1', lineHeight: 17, flex: 1 },

  emptyContainer: { alignItems: 'center', paddingTop: 40 },
  emptyEmoji: { fontSize: 36, marginBottom: 10 },
  emptyText: { fontSize: 13, color: Colors.textMuted, fontWeight: '600' },

  teamCard: { borderRadius: 14, padding: 12, elevation: 1 },
  teamCardOfficial: { backgroundColor: '#F0F9FF', borderColor: '#93C5FD', borderWidth: 1.5 },
  teamCardUnofficial: { backgroundColor: '#FFFFFF', borderColor: '#E2E8F0', borderWidth: 1 },
  teamCardSelected: { backgroundColor: '#E0F2FE', borderColor: '#2563EB', borderWidth: 2 },
  
  checkboxTouch: { paddingRight: 6, paddingTop: 1 },
  customCheckbox: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, borderColor: '#94A3B8', backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  customCheckboxChecked: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  checkmarkText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900', lineHeight: 12 },

  cardMainHeaderTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  teamName: { fontSize: 15.5, fontWeight: '800', color: '#0F172A', flex: 1, marginRight: 6 },

  cardHeaderSubRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  regionTagChip: { backgroundColor: '#F0F9FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#BAE6FD' },
  regionTagChipText: { fontSize: 10.5, fontWeight: '800', color: '#0369A1' },

  typeBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  typeBadgeText: { fontSize: 10, fontWeight: '800' },
  schoolTypeBadge: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  schoolTypeBadgeText: { color: '#166534' },
  clubTypeBadge: { backgroundColor: '#FEFCE8', borderColor: '#FDE047' },
  clubTypeBadgeText: { color: '#B45309' },

  privacyBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1 },
  privacyBadgeText: { fontSize: 10, fontWeight: '800' },
  publicBadge: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  publicBadgeText: { color: '#166534' },
  privateBadge: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' },
  privateBadgeText: { color: '#475569' },
  
  officialBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#3B82F6' },
  officialBadgeText: { fontSize: 10, fontWeight: '800', color: '#1D4ED8' },

  youtubeMiniBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1, borderColor: '#FECACA' },
  youtubeMiniBtnText: { fontSize: 10, fontWeight: '800', color: '#DC2626' },

  rightBadgeContainer: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  countBadge: { backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12 },
  countText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  mannerTempBadge: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  mannerTempBadgeText: { fontSize: 10.5, fontWeight: '800', color: '#D97706' },

  membersArea: { marginTop: 10, paddingTop: 6, borderTopWidth: 1, borderTopColor: '#E2E8F0' },
  membersAreaHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 },
  membersLabel: { fontSize: 11, fontWeight: '700', color: '#64748B' },
  needMoreText: { fontSize: 10.5, color: '#10B981', fontWeight: '700' },
  membersList: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  memberTag: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  memberTagLeader: { backgroundColor: '#FAF5FF', borderColor: '#D8B4FE' },
  memberTagText: { fontSize: 11, fontWeight: '600', color: '#334155' },
  memberTagTextLeader: { color: '#6B21A8', fontWeight: '800' },
  moreChip: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  moreChipText: { fontSize: 10.5, fontWeight: '800', color: '#1D4ED8' },

  pendingApprovalBox: { backgroundColor: '#FEFCE8', borderRadius: 10, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#FDE047' },
  pendingApprovalTitle: { fontSize: 11.5, fontWeight: '800', color: '#A16207', marginBottom: 6 },
  pendingUserRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FFFFFF', padding: 8, borderRadius: 8, borderWidth: 1, borderColor: '#FEF08A', marginBottom: 4 },
  pendingUserName: { fontSize: 12, fontWeight: '800', color: '#1E293B' },
  pendingBtnGroup: { flexDirection: 'row', gap: 6 },
  approveBtn: { backgroundColor: '#2563EB', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  approveBtnText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  rejectBtn: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#CBD5E1', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  rejectBtnText: { fontSize: 11, fontWeight: '800', color: '#64748B' },

  actionFooter: { marginTop: 8 },
  joinBtn: { backgroundColor: '#2563EB', paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  joinBtnText: { color: '#FFF', fontSize: 12, fontWeight: '800' },
  badgeSuccess: { backgroundColor: '#F0FDF4', paddingVertical: 7, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#BBF7D0' },
  badgeSuccessText: { color: '#166534', fontSize: 11.5, fontWeight: '800' },
  
  badgePendingTouch: { backgroundColor: '#FEFCE8', paddingVertical: 7, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#FDE047' },
  badgePendingText: { color: '#A16207', fontSize: 11.5, fontWeight: '800' },

  multiProposalBar: { backgroundColor: '#0F172A', padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  multiProposalCount: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  multiProposalBtn: { backgroundColor: '#2563EB', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  multiProposalBtnText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 18, padding: 18, width: '100%', elevation: 5 },
  modalTitle: { fontSize: 16, fontWeight: '800', color: Colors.text, marginBottom: 2 },
  modalSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 10 },
  inputLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4, marginTop: 8 },
  textInput: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 8, padding: 10, fontSize: 13 },

  dropdownBox: { position: 'absolute', top: 46, left: 0, right: 0, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 8, zIndex: 9999 },
  dropdownHeader: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  dropdownHeaderText: { fontSize: 10, fontWeight: '800', color: '#1D4ED8' },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  dropdownItemText: { fontSize: 12, fontWeight: '700', color: '#1E40AF' },

  chipBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: 'transparent', alignItems: 'center' },
  chipBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  chipBtnText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  chipBtnTextActive: { color: '#1D4ED8', fontWeight: '800' },

  submitBtn: { backgroundColor: '#2563EB', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  submitBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  closeBtnText: { color: Colors.text, fontSize: 13, fontWeight: '700' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 14 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E2E8F0' },
  dividerText: { marginHorizontal: 10, fontSize: 11, color: '#94A3B8', fontWeight: '600' },

  infoNoticeBox: { backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, marginBottom: 10 },
  infoNoticeText: { fontSize: 11, color: '#64748B', lineHeight: 16 },
  
  requestBtn: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#94A3B8', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  requestBtnText: { color: '#475569', fontSize: 13, fontWeight: '800' },
});