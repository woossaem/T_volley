import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Modal,
  TextInput,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import { parseRosterUserIds, safeIncludes } from '../lib/roster';
import { addMatchPlayerStats, emptyPlayerCareerStats } from '../lib/playerStats';
import { hydrateMatchesWithSetScores } from '../lib/matchSets';

interface MyTeam {
  id: string;
  name: string;
  region: string;
  pin_code: string | null;
  team_type?: 'school' | 'club';
  youtube_channel_url?: string | null;
  is_primary?: boolean;
  leader_id?: string | null;
  status?: string;
  deleted_at?: string | null;
}

interface TeamMember {
  id: string;
  full_name: string;
  school_name: string | null;
  position?: string;
}

interface TeamStats {
  totalMatches: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  winRate: number;
}

interface MemberIntraStat {
  userId: string;
  fullName: string;
  schoolName: string | null;
  total: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}

const getTeamIcon = (type?: string) => (type === 'club' ? '🛡️' : '🏫');

export default function MyTeamDetailScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const { teamId } = useLocalSearchParams<{ teamId?: string }>();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [myTeams, setMyTeams] = useState<MyTeam[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<MyTeam | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);

  const [dbRegions, setDbRegions] = useState<string[]>(['천안', '아산', '세종', '대전', '서울/경기']);

  const [seasonStats, setSeasonStats] = useState<TeamStats>({ totalMatches: 0, wins: 0, draws: 0, losses: 0, points: 0, winRate: 0 });
  const [totalStats, setTotalStats] = useState<TeamStats>({ totalMatches: 0, wins: 0, draws: 0, losses: 0, points: 0, winRate: 0 });
  const [memberIntraRankings, setMemberIntraRankings] = useState<MemberIntraStat[]>([]);

  const [leaderModalVisible, setLeaderModalVisible] = useState(false);
  const [leaderActionTab, setLeaderActionTab] = useState<'claim' | 'transfer' | 'recommend'>('claim');
  const [selectedTargetMember, setSelectedTargetMember] = useState<TeamMember | null>(null);

  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [newPinCode, setNewPinCode] = useState('');

  const [youtubeModalVisible, setYoutubeModalVisible] = useState(false);
  const [newYoutubeUrl, setNewYoutubeUrl] = useState('');

  const [regionModalVisible, setRegionModalVisible] = useState(false);
  const [selectedRegionOption, setSelectedRegionOption] = useState('천안');
  const [customRegionText, setCustomRegionText] = useState('');

  const userId = session?.user?.id;
  const currentUserName = session?.user?.user_metadata?.full_name || '선생님';

  const parseTeamName = (rawName: any): string => {
    if (!rawName) return '동호회 팀';
    if (typeof rawName === 'string') {
      const trimmed = rawName.trim();
      if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return '동호회 팀';
      if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
        try { return parseTeamName(JSON.parse(trimmed)); } catch (e) {}
      }
      return trimmed;
    }
    if (Array.isArray(rawName)) {
      if (rawName.length === 0) return '동호회 팀';
      return parseTeamName(rawName[0]);
    }
    if (typeof rawName === 'object') {
      const candidate = rawName.name || rawName.team_name || rawName.title || rawName.formatted;
      if (candidate && candidate !== rawName) {
        const parsedCand = parseTeamName(candidate);
        if (parsedCand && parsedCand !== '동호회 팀') return parsedCand;
      }
    }
    return '동호회 팀';
  };

  useEffect(() => {
    fetchMyTeams();
    fetchDbRegions();
  }, [session]);

  useEffect(() => {
    if (teamId && myTeams.length > 0) {
      const target = myTeams.find(t => t.id === teamId);
      if (target) setSelectedTeam(target);
    }
  }, [teamId, myTeams]);

  useEffect(() => {
    if (selectedTeam) {
      fetchTeamMembersAndIntraStats(selectedTeam.id, selectedTeam.name);
      fetchTeamStats(selectedTeam.name);
    }
  }, [selectedTeam]);

  const fetchDbRegions = async () => {
    try {
      const { data } = await supabase.from('official_schools').select('region').eq('is_active', true);
      if (data) {
        const unique = Array.from(new Set(data.map(d => d.region).filter(Boolean)));
        if (unique.length > 0) setDbRegions(unique);
      }
    } catch (err) {
      console.error('DB 지역 조회 오류:', err);
    }
  };

  const fetchMyTeams = async () => {
    if (!userId) return setLoading(false);
    try {
      setLoading(true);

      const { data: tmData, error: tmError } = await supabase
        .from('team_members')
        .select('team_id, is_primary')
        .eq('user_id', userId)
        .eq('is_active', true);

      if (tmError) throw tmError;

      if (!tmData || tmData.length === 0) {
        setMyTeams([]);
        setSelectedTeam(null);
        return;
      }

      const teamIds = tmData.map(t => t.team_id);

      const { data: teamsData, error: tError } = await supabase
        .from('teams')
        .select('*')
        .in('id', teamIds);

      if (tError) throw tError;

      const teamsList: MyTeam[] = (teamsData || [])
        .filter((t: any) => t.status !== 'deleted')
        .map((t: any) => {
          const tm = tmData.find(x => x.team_id === t.id);
          const nameCandidate = parseTeamName(t.name) !== '동호회 팀' ? parseTeamName(t.name) : parseTeamName(t);
          return {
            id: t.id,
            name: nameCandidate,
            region: t.region || '천안',
            pin_code: t.pin_code || null,
            team_type: t.team_type || 'club',
            youtube_channel_url: t.youtube_channel_url || null,
            is_primary: tm?.is_primary || false,
            leader_id: t.leader_id || null,
            status: t.status || 'active',
            deleted_at: t.deleted_at || null,
          };
        });

      teamsList.sort((a, b) => (b.is_primary ? 1 : 0) - (a.is_primary ? 1 : 0));
      setMyTeams(teamsList);

      if (teamsList.length > 0) {
        const paramTeam = teamId ? teamsList.find(t => t.id === teamId) : null;
        if (paramTeam) {
          setSelectedTeam(paramTeam);
        } else if (!selectedTeam || !teamsList.some((t) => t.id === selectedTeam.id)) {
          setSelectedTeam(teamsList[0]);
        } else {
          const updated = teamsList.find((t) => t.id === selectedTeam.id);
          if (updated) setSelectedTeam(updated);
        }
      } else {
        setSelectedTeam(null);
      }
    } catch (err) {
      console.error('팀 목록 조회 오류:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchTeamMembersAndIntraStats = async (teamId: string, teamName: string) => {
    try {
      const { data: memData } = await supabase
        .from('team_members')
        .select(`user_id, profiles (id, full_name, school_name, position)`)
        .eq('team_id', teamId)
        .eq('is_active', true);

      const memList: TeamMember[] = (memData || []).map((item: any) => item.profiles).filter((m: any) => m && m.id);

      const currentLeaderId = selectedTeam?.leader_id;
      memList.sort((a, b) => {
        if (a.id === currentLeaderId) return -1;
        if (b.id === currentLeaderId) return 1;
        return a.full_name.localeCompare(b.full_name, 'ko-KR');
      });

      setMembers(memList);

      const { data: intraMatchesRaw } = await supabase
        .from('matches')
        .select('*, match_sets(*)')
        .eq('host_team_name', teamName)
        .eq('status', 'intramural');
      const intraMatches = await hydrateMatchesWithSetScores(intraMatchesRaw || []);

      const rankMap: { [key: string]: MemberIntraStat } = {};
      memList.forEach(m => {
        rankMap[m.id] = { userId: m.id, fullName: m.full_name, schoolName: m.school_name, total: 0, wins: 0, draws: 0, losses: 0, winRate: 0 };
      });

      memList.forEach(mUser => {
        const career = emptyPlayerCareerStats();
        intraMatches.forEach((m: any) => {
          addMatchPlayerStats(career, mUser.id, m, []);
        });
        rankMap[mUser.id].total = career.setsPlayed;
        rankMap[mUser.id].wins = career.setWins;
        rankMap[mUser.id].draws = career.setDraws;
        rankMap[mUser.id].losses = career.setLosses;
      });

      const rankList = Object.values(rankMap).map(item => {
        item.winRate = item.total > 0 ? Math.round((item.wins / item.total) * 100) : 0;
        return item;
      }).sort((a, b) => b.wins - a.wins || b.winRate - a.winRate);

      setMemberIntraRankings(rankList);
    } catch (err) {
      console.error('팀원 및 내전 랭킹 조회 오류:', err);
    }
  };

  const fetchTeamStats = async (teamName: string) => {
    try {
      const { data: matches } = await supabase
        .from('matches')
        .select('*')
        .or(`host_team_name.eq."${teamName}",away_team_name.eq."${teamName}"`)
        .eq('status', 'completed');

      let sWins = 0, sDraws = 0, sLosses = 0;
      let tWins = 0, tDraws = 0, tLosses = 0;
      const currentYear = new Date().getFullYear().toString();

      (matches || []).forEach((m) => {
        const isWin = m.winner_team === teamName;
        const isDraw = m.winner_team === 'draw' || m.winner_team === '무승부';
        const isCurrentSeason = m.match_date && m.match_date.includes(currentYear);

        if (isWin) {
          tWins++;
          if (isCurrentSeason) sWins++;
        } else if (isDraw) {
          tDraws++;
          if (isCurrentSeason) sDraws++;
        } else {
          tLosses++;
          if (isCurrentSeason) sLosses++;
        }
      });

      const sTotal = sWins + sDraws + sLosses;
      setSeasonStats({
        totalMatches: sTotal,
        wins: sWins,
        draws: sDraws,
        losses: sLosses,
        points: sWins * 3 + sDraws,
        winRate: sTotal > 0 ? Math.round((sWins / sTotal) * 100) : 0,
      });

      const tTotal = tWins + tDraws + tLosses;
      setTotalStats({
        totalMatches: tTotal,
        wins: tWins,
        draws: tDraws,
        losses: tLosses,
        points: tWins * 3 + tDraws,
        winRate: tTotal > 0 ? Math.round((tWins / tTotal) * 100) : 0,
      });
    } catch (err) {
      console.error('팀 성적 집계 오류:', err);
    }
  };

  const handleDeleteTeam = () => {
    if (!selectedTeam || !userId) return;

    if (selectedTeam.leader_id !== userId) {
      return Alert.alert('권한 없음', '팀 해체 및 삭제는 팀 회장만 수행할 수 있습니다.');
    }

    if (members.length > 1) {
      return Alert.alert(
        '팀 해체 불가 ⚠️',
        `현재 팀원이 본인 외에 ${members.length - 1}명 더 남아있습니다.\n\n팀을 해체하려면 팀원 명단에서 팀원들을 먼저 모두 '방출'하신 뒤 시도해 주세요.`
      );
    }

    const hasMatches = totalStats.totalMatches > 0;

    Alert.alert(
      '🚨 팀 해체 및 삭제',
      hasMatches
        ? `'${selectedTeam.name}' 팀을 정말로 해체하시겠습니까?\n\n공식 전적이 존재하는 팀이므로 30일간 휴면 상태로 보존되며, 기존 팀원 및 상대 팀의 전적 기록은 '(휴면) ${selectedTeam.name}' 이름으로 유지됩니다.`
        : `'${selectedTeam.name}' 팀을 정말로 삭제하시겠습니까?\n\n공식 전적이 없으므로 데이터베이스에서 완전히 삭제됩니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '해체/삭제 실행',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              if (hasMatches) {
                const newDormantName = selectedTeam.name.startsWith('(휴면)')
                  ? selectedTeam.name
                  : `(휴면) ${selectedTeam.name}`;

                await supabase.from('teams').update({
                  status: 'dormant',
                  deleted_at: new Date().toISOString(),
                  name: newDormantName,
                }).eq('id', selectedTeam.id);

                Alert.alert('팀 해체 완료 💤', `'${selectedTeam.name}' 팀이 30일 휴면 상태로 전환되었습니다.`);
              } else {
                await supabase.from('team_members').delete().eq('team_id', selectedTeam.id);
                await supabase.from('teams').delete().eq('id', selectedTeam.id);

                Alert.alert('삭제 완료 🗑️', `'${selectedTeam.name}' 팀이 완전히 삭제되었습니다.`);
              }

              await fetchMyTeams();
            } catch (err: any) {
              Alert.alert('오류', err.message);
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleRestoreTeam = async () => {
    if (!selectedTeam) return;

    setActionLoading(true);
    try {
      const restoredName = selectedTeam.name.replace(/^\(휴면\)\s*/, '');

      await supabase.from('teams').update({
        status: 'active',
        deleted_at: null,
        name: restoredName,
      }).eq('id', selectedTeam.id);

      Alert.alert('복원 완료 ✨', `'${restoredName}' 팀이 다시 정상 팀으로 복원되었습니다!`);
      await fetchMyTeams();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const openLeaderManagementModal = () => {
    if (!selectedTeam) return;
    const isLeader = selectedTeam.leader_id === userId;
    setLeaderActionTab(isLeader ? 'transfer' : 'claim');
    setSelectedTargetMember(null);
    setLeaderModalVisible(true);
  };

  const confirmClaimLeadership = async () => {
    if (!selectedTeam || !userId) return;

    setActionLoading(true);
    try {
      await supabase.from('teams').update({
        leader_id: userId,
      }).eq('id', selectedTeam.id);

      const { data: teamMems } = await supabase.from('team_members').select('user_id').eq('team_id', selectedTeam.id).eq('is_active', true);
      if (teamMems && teamMems.length > 0) {
        const otherMems = teamMems.filter((m: any) => m.user_id !== userId);
        if (otherMems.length > 0) {
          const notis = otherMems.map((m: any) => ({
            user_id: m.user_id,
            title: `🚩 [${selectedTeam.name}] 팀 대표/회장 변경 알림`,
            message: `🚩 '${currentUserName}' 선생님이 [${selectedTeam.name}] 팀의 새로운 회장으로 등록되었습니다.`,
            is_read: false,
          }));
          await supabase.from('notifications').insert(notis);
        }
      }

      Alert.alert('등록 완료 🚩', `'${selectedTeam.name}' 팀의 대표/회장 권한이 새로 등록되었습니다.`);
      setLeaderModalVisible(false);
      await fetchMyTeams();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const confirmTransferLeadership = async () => {
    if (!selectedTeam || !selectedTargetMember) return Alert.alert('알림', '이양받을 팀원을 선택해 주세요.');

    setActionLoading(true);
    try {
      await supabase.from('notifications').insert({
        user_id: selectedTargetMember.id,
        title: `🚩 [${selectedTeam.name}] 팀 회장직 이양 제안`,
        message: `🚩 현 회장 '${currentUserName}' 선생님이 선생님께 [${selectedTeam.name}] 팀의 대표/회장직 이양을 제안하셨습니다.`,
        is_read: false,
      });

      Alert.alert('제안 완료 🚩', `'${selectedTargetMember.full_name}' 선생님에게 회장직 이양 제안을 전달했습니다.`);
      setLeaderModalVisible(false);
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const confirmRecommendLeadership = async () => {
    if (!selectedTeam || !selectedTargetMember) return Alert.alert('알림', '추천할 팀원을 선택해 주세요.');

    const hasLeader = !!selectedTeam.leader_id;

    setActionLoading(true);
    try {
      if (hasLeader) {
        await supabase.from('notifications').insert({
          user_id: selectedTeam.leader_id!,
          title: `💡 [${selectedTeam.name}] 팀 회장 추천 도착`,
          message: `💡 '${currentUserName}' 선생님이 '${selectedTargetMember.full_name}' 선생님을 [${selectedTeam.name}] 팀의 차기 회장으로 추천하셨습니다.`,
          is_read: false,
        });
      } else {
        await supabase.from('notifications').insert({
          user_id: selectedTargetMember.id,
          title: `💡 [${selectedTeam.name}] 팀 회장 추천 도착`,
          message: `💡 '${currentUserName}' 선생님이 선생님을 [${selectedTeam.name}] 팀 대표/회장으로 추천하셨습니다.`,
          is_read: false,
        });
      }

      Alert.alert('추천 완료 💡', `'${selectedTargetMember.full_name}' 선생님 추천 알림이 전달되었습니다.`);
      setLeaderModalVisible(false);
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleKickMember = (targetMember: TeamMember) => {
    if (!selectedTeam || !userId) return;

    if (selectedTeam.leader_id !== userId) {
      return Alert.alert('권한 없음', '팀원 방출은 팀 회장만 수행할 수 있습니다.');
    }

    if (targetMember.id === userId) {
      return Alert.alert('알림', '자기 자신은 방출할 수 없습니다.');
    }

    Alert.alert(
      '⚠️ 팀원 방출 확인',
      `'${targetMember.full_name}' 선생님을 '${selectedTeam.name}' 팀에서 정말로 방출하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '방출하기',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await supabase.from('team_members').update({ is_active: false }).eq('team_id', selectedTeam.id).eq('user_id', targetMember.id);

              await supabase.from('notifications').insert({
                user_id: targetMember.id,
                title: `🚨 [${selectedTeam.name}] 소속 변경`,
                message: `🚨 [${selectedTeam.name}] 회장에 의해 팀 소속에서 제외되었습니다.`,
                is_read: false,
              });

              Alert.alert('방출 완료', `'${targetMember.full_name}' 선생님이 팀에서 제외되었습니다.`);
              await fetchTeamMembersAndIntraStats(selectedTeam.id, selectedTeam.name);
            } catch (err: any) {
              Alert.alert('오류', err.message);
            } finally {
              setActionLoading(false);
            }
          }
        }
      ]
    );
  };

  const handleSetPrimaryTeam = async (targetTeamId: string) => {
    if (!userId) return;
    try {
      setActionLoading(true);
      await supabase.from('team_members').update({ is_primary: false }).eq('user_id', userId);
      await supabase.from('team_members').update({ is_primary: true }).eq('user_id', userId).eq('team_id', targetTeamId);
      
      Alert.alert('대표팀 변경 완료 ⭐', '1순위 대표팀이 새롭게 지정되었습니다.');
      await fetchMyTeams();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleChangePinCode = async () => {
    if (!selectedTeam) return;
    if (!newPinCode || newPinCode.trim().length < 4) {
      return Alert.alert('알림', '4자리 숫자의 새로운 비밀번호를 입력해 주세요.');
    }

    try {
      setActionLoading(true);
      await supabase.from('teams').update({ pin_code: newPinCode.trim() }).eq('id', selectedTeam.id);
      Alert.alert('설정 완료 🔒', '팀 가입 비밀번호가 적용되었습니다.');
      setPinModalVisible(false);
      setNewPinCode('');
      await fetchMyTeams();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const disablePinCode = async () => {
    if (!selectedTeam) return;
    try {
      setActionLoading(true);
      await supabase.from('teams').update({ pin_code: null }).eq('id', selectedTeam.id);
      Alert.alert('보호 해제 🔓', '비밀번호가 삭제되어 누구나 바로 가입할 수 있는 공개 팀으로 전환되었습니다.');
      await fetchMyTeams();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveYoutubeUrl = async () => {
    if (!selectedTeam) return;

    try {
      setActionLoading(true);
      await supabase
        .from('teams')
        .update({ youtube_channel_url: newYoutubeUrl.trim() || null })
        .eq('id', selectedTeam.id);

      Alert.alert('저장 완료 ✨', '우리 팀 공식 유튜브 채널 링크가 업데이트되었습니다.');
      setYoutubeModalVisible(false);
      setNewYoutubeUrl('');
      await fetchMyTeams();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveTeamRegion = async () => {
    if (!selectedTeam) return;

    const finalRegion = selectedRegionOption === '직접 입력' ? customRegionText.trim() : selectedRegionOption;
    if (!finalRegion) {
      return Alert.alert('입력 확인', '변경할 연고 지역을 선택하거나 입력해 주세요.');
    }

    try {
      setActionLoading(true);
      await supabase
        .from('teams')
        .update({ region: finalRegion })
        .eq('id', selectedTeam.id);

      Alert.alert('지역 변경 완료 📍', `'${selectedTeam.name}' 팀의 활동 지역이 [${finalRegion}] (으)로 설정되었습니다.`);
      setRegionModalVisible(false);
      setCustomRegionText('');
      await fetchMyTeams();
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const isCurrentLeader = selectedTeam?.leader_id === userId;
  const isDormant = selectedTeam?.status === 'dormant';

  const getRemainingDays = () => {
    if (!selectedTeam?.deleted_at) return 30;
    const deletedDate = new Date(selectedTeam.deleted_at).getTime();
    const now = new Date().getTime();
    const diffDays = Math.floor((now - deletedDate) / (1000 * 60 * 60 * 24));
    return Math.max(0, 30 - diffDays);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>내 소속 팀 관리</Text>
        <TouchableOpacity style={styles.addTeamBtn} onPress={() => router.push('/team-management')}>
          <Text style={styles.addTeamBtnText}>+ 팀 가입/창단</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={fetchMyTeams} tintColor={Colors.primary} />}>
        
        {/* 팀 스위퍼 탭 */}
        <View style={styles.switcherSection}>
          <Text style={styles.sectionLabel}>내 소속 팀 선택 ({myTeams.length}개 활동 중)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll}>
            {myTeams.map((team) => {
              const isSelected = selectedTeam?.id === team.id;
              const icon = getTeamIcon(team.team_type);
              const displayName = team.name || '동호회 팀';
              const teamIsDormant = team.status === 'dormant';

              return (
                <TouchableOpacity
                  key={team.id}
                  style={[
                    styles.teamTabBase,
                    {
                      backgroundColor: teamIsDormant ? '#FEF2F2' : isSelected ? '#2563EB' : '#F1F5F9',
                      borderColor: teamIsDormant ? '#EF4444' : team.is_primary ? '#F59E0B' : isSelected ? '#1D4ED8' : '#CBD5E1',
                      borderWidth: team.is_primary || teamIsDormant ? 2 : 1.5,
                    }
                  ]}
                  onPress={() => setSelectedTeam(team)}
                >
                  <Text style={{ fontSize: 13, fontWeight: '800', color: teamIsDormant ? '#DC2626' : isSelected ? '#FFFFFF' : '#0F172A' }}>
                    {teamIsDormant ? '💤 ' : team.is_primary ? '⭐ ' : ''}{icon} {displayName}
                  </Text>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity style={styles.addTeamChip} onPress={() => router.push('/team-management')}>
              <Text style={styles.addTeamChipText}>+ 팀 추가 가입/창단</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {myTeams.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>현재 가입되어 활동 중인 소속 팀이 없습니다.</Text>
          </View>
        ) : selectedTeam && (
          <>
            {isDormant && (
              <View style={styles.dormantBanner}>
                <Text style={styles.dormantTitle}>💤 해체 유예 (휴면) 중인 팀입니다.</Text>
                <Text style={styles.dormantSub}>
                  이 팀은 전체 팀 목록에서 숨김 처리되어 있습니다.{'\n'}
                  <Text style={{ fontWeight: '800', color: '#DC2626' }}>{getRemainingDays()}일 내에</Text> 복원하지 않으면 데이터가 최종 정제됩니다.
                </Text>
                <TouchableOpacity style={styles.restoreBtn} onPress={handleRestoreTeam} disabled={actionLoading}>
                  {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.restoreBtnText}>✨ 지금 즉시 팀 복원하기</Text>}
                </TouchableOpacity>
              </View>
            )}

            <View style={styles.teamHeaderCard}>
              <View style={styles.teamHeaderTop}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={styles.regionBadge}>{getTeamIcon(selectedTeam.team_type)} {selectedTeam.team_type === 'club' ? '동호회 팀' : '학교 팀'} • {selectedTeam.region}</Text>
                    
                    <TouchableOpacity style={styles.editRegionBtn} onPress={() => setRegionModalVisible(true)}>
                      <Text style={styles.editRegionBtnText}>📍 지역 변경</Text>
                    </TouchableOpacity>

                    {!selectedTeam.is_primary && !isDormant && (
                      <TouchableOpacity style={styles.setPrimaryBtn} onPress={() => handleSetPrimaryTeam(selectedTeam.id)}>
                        <Text style={styles.setPrimaryBtnText}>⭐ 1순위 대표팀 설정</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  <Text style={styles.teamTitle}>{selectedTeam.name}</Text>
                </View>

                {members.length >= 3 ? (
                  <View style={styles.blueRibbonBadge}><Text style={styles.blueRibbonText}>💎 공식 팀 (3명+)</Text></View>
                ) : (
                  <View style={styles.pendingBadge}><Text style={styles.pendingBadgeText}>🌱 모집 중 ({members.length}/3)</Text></View>
                )}
              </View>

              <View style={styles.leaderBarContainer}>
                <View style={styles.leaderBarInfo}>
                  <Text style={styles.leaderBarTitle}>
                    🚩 현 회장: {selectedTeam.leader_id ? (members.find(m => m.id === selectedTeam.leader_id)?.full_name || '등록됨') + ' 선생님' : '대표 공석'}
                  </Text>
                </View>
                <TouchableOpacity style={styles.claimLeaderBtn} onPress={openLeaderManagementModal}>
                  <Text style={styles.claimLeaderBtnText}>🚩 팀 대표/회장 변경·등록 ▾</Text>
                </TouchableOpacity>
              </View>

              {selectedTeam.youtube_channel_url ? (
                <TouchableOpacity
                  style={styles.youtubeChannelBtn}
                  onPress={() => Linking.openURL(selectedTeam.youtube_channel_url!).catch(() => Alert.alert('오류', '올바른 유튜브 링크가 아닙니다.'))}
                >
                  <Text style={styles.youtubeChannelBtnText}>📺 우리 팀 유튜브 채널 구경하기 ▶</Text>
                </TouchableOpacity>
              ) : null}

              <View style={{ gap: 8, marginTop: 10 }}>
                <View style={[styles.pinBox, !selectedTeam.pin_code && { borderColor: '#CBD5E1', backgroundColor: '#F1F5F9' }]}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%' }}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Text style={styles.pinBoxLabel}>
                          {selectedTeam.pin_code ? '🔒 비밀번호 보호 켜짐' : '🔓 비밀번호 보호 꺼짐'}
                        </Text>
                        <View style={[styles.pinStatusDot, { backgroundColor: selectedTeam.pin_code ? '#10B981' : '#94A3B8' }]} />
                      </View>
                      <Text style={{ fontSize: 11, color: Colors.textMuted, marginTop: 4 }}>
                        {selectedTeam.pin_code 
                          ? '이 암호를 아는 분만 우리 팀에 가입할 수 있습니다.' 
                          : '현재 비밀번호 없이 누구나 검색해서 바로 가입할 수 있는 공개 팀입니다.'}
                      </Text>
                    </View>

                    <TouchableOpacity 
                      style={[styles.changePinBtn, !selectedTeam.pin_code && { backgroundColor: Colors.primary }]} 
                      onPress={() => {
                        if (selectedTeam.pin_code) {
                          Alert.alert('보호 해제 🔓', '비밀번호를 없애고 누구나 가입 가능한 공개 팀으로 전환하시겠습니까?', [
                            { text: '취소', style: 'cancel' },
                            { text: '공개로 전환', onPress: () => disablePinCode() }
                          ]);
                        } else {
                          setNewPinCode('');
                          setPinModalVisible(true);
                        }
                      }}
                    >
                      <Text style={[styles.changePinBtnText, !selectedTeam.pin_code && { color: '#FFFFFF' }]}>
                        {selectedTeam.pin_code ? '끄기/변경' : '켜기'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {selectedTeam.pin_code ? (
                    <Text style={styles.pinCodeText}>{selectedTeam.pin_code}</Text>
                  ) : null}
                </View>

                <TouchableOpacity
                  style={styles.editYoutubeBarBtn}
                  onPress={() => { setNewYoutubeUrl(selectedTeam.youtube_channel_url || ''); setYoutubeModalVisible(true); }}
                >
                  <Text style={styles.editYoutubeBarBtnText}>
                    📺 {selectedTeam.youtube_channel_url ? '팀 유튜브 채널 링크 수정' : '+ 우리 팀 유튜브 채널 링크 등록'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.statsSection}>
              <Text style={styles.sectionTitle}>⚔️ [{selectedTeam.name}] 팀 내전 개인 MVP 랭킹</Text>
              <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 12, marginTop: 4 }}>팀 내 청백전 결과를 바탕으로 매겨진 팀원 랭킹표입니다.</Text>

              {memberIntraRankings.length === 0 ? (
                <Text style={{ textAlign: 'center', color: Colors.textMuted, marginVertical: 14 }}>아직 기록된 팀 내전이 없습니다.</Text>
              ) : (
                <View style={{ gap: 8 }}>
                  {memberIntraRankings.map((rank, idx) => (
                    <View key={rank.userId} style={[styles.rankRow, idx === 0 && styles.rankRowFirst]}>
                      <Text style={[styles.rankNumber, idx === 0 && { color: '#B45309', fontWeight: '900' }]}>
                        {idx === 0 ? '🥇 1위' : idx === 1 ? '🥈 2위' : idx === 2 ? '🥉 3위' : `${idx + 1}위`}
                      </Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.rankName}>{rank.fullName} 선생님 {rank.userId === userId && '(나)'}</Text>
                        <Text style={styles.rankDetail}>{rank.wins}승 {rank.draws}무 {rank.losses}패 (총 {rank.total}전)</Text>
                      </View>
                      <View style={styles.rankBadge}>
                        <Text style={styles.rankBadgeText}>승률 {rank.winRate}%</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.statsSection}>
              <Text style={styles.sectionTitle}>📊 소속 팀 공식 전적실</Text>
              
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#2563EB', marginTop: 12, marginBottom: 6 }}>
                📅 2026 하반기 시즌 성적 (F/W)
              </Text>
              <View style={styles.statsGrid}>
                <View style={[styles.statBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Text style={[styles.statValue, { color: '#1D4ED8' }]}>{seasonStats.wins}승 {seasonStats.losses}패</Text>
                  <Text style={[styles.statLabel, { color: '#1E40AF' }]}>시즌 전적 ({seasonStats.winRate}%)</Text>
                </View>
                <View style={[styles.statBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <Text style={[styles.statValue, { color: '#1D4ED8' }]}>{seasonStats.points}점</Text>
                  <Text style={[styles.statLabel, { color: '#1E40AF' }]}>시즌 승점 ({seasonStats.totalMatches}전)</Text>
                </View>
              </View>

              <Text style={{ fontSize: 13, fontWeight: '800', color: '#475569', marginTop: 16, marginBottom: 6 }}>
                📜 팀 통산 전체 전적
              </Text>
              <View style={styles.statsGrid}>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{totalStats.wins}승 {totalStats.losses}패</Text>
                  <Text style={styles.statLabel}>통산 전적 ({totalStats.winRate}%)</Text>
                </View>
                <View style={styles.statBox}>
                  <Text style={styles.statValue}>{totalStats.points}점</Text>
                  <Text style={styles.statLabel}>통산 승점 ({totalStats.totalMatches}전)</Text>
                </View>
              </View>
            </View>

            <View style={styles.rosterSection}>
              <Text style={styles.sectionTitle}>👥 팀원 명단 ({members.length}명)</Text>
              <View style={{ gap: 8, marginTop: 10 }}>
                {members.map((m) => {
                  const isLeader = selectedTeam.leader_id === m.id;
                  const isMe = m.id === userId;

                  return (
                    <View key={m.id} style={[styles.memberCard, isLeader && styles.memberCardLeader]}>
                      <View style={{ flex: 1, marginRight: 6 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <Text style={styles.memberName}>
                            {m.full_name} 선생님 {isMe && '(나)'}
                          </Text>
                          {isLeader && (
                            <View style={styles.leaderBadge}>
                              <Text style={styles.leaderBadgeText}>🚩 회장</Text>
                            </View>
                          )}
                        </View>
                        <Text style={styles.memberSchool}>🏫 {m.school_name || '미설정'}</Text>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        {m.position && (
                          <View style={styles.memberPosBadge}>
                            <Text style={styles.memberPosText}>{m.position}</Text>
                          </View>
                        )}

                        {isCurrentLeader && !isMe && (
                          <TouchableOpacity style={styles.kickBtn} onPress={() => handleKickMember(m)}>
                            <Text style={styles.kickBtnText}>🚫 방출</Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
              </View>
            </View>

            {isCurrentLeader && (
              <View style={styles.dangerZoneBox}>
                <Text style={styles.dangerZoneTitle}>🚨 위험 구역 (Danger Zone)</Text>
                <Text style={styles.dangerZoneDesc}>
                  팀을 해체하거나 완전 삭제합니다. 다른 팀원이 남아있는 경우 방출 후 1인 상태에서만 해체할 수 있습니다.
                </Text>
                <TouchableOpacity
                  style={styles.deleteTeamBtn}
                  onPress={handleDeleteTeam}
                  disabled={actionLoading}
                >
                  <Text style={styles.deleteTeamBtnText}>🚨 팀 해체 및 삭제하기</Text>
                </TouchableOpacity>
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* 회장/대표 모달 */}
      <Modal visible={leaderModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🚩 [{selectedTeam?.name}] 대표/회장 관리</Text>
            <Text style={styles.modalSub}>원하시는 팀 회장 관리 메뉴를 선택해 주세요.</Text>

            <View style={styles.actionTabRow}>
              <TouchableOpacity
                style={[styles.actionTabBtn, leaderActionTab === 'claim' && styles.actionTabBtnActive]}
                onPress={() => { setLeaderActionTab('claim'); setSelectedTargetMember(null); }}
              >
                <Text style={[styles.actionTabText, leaderActionTab === 'claim' && styles.actionTabTextActive]}>🚩 내가 직접 등록</Text>
              </TouchableOpacity>

              {isCurrentLeader && (
                <TouchableOpacity
                  style={[styles.actionTabBtn, leaderActionTab === 'transfer' && styles.actionTabBtnActive]}
                  onPress={() => { setLeaderActionTab('transfer'); setSelectedTargetMember(null); }}
                >
                  <Text style={[styles.actionTabText, leaderActionTab === 'transfer' && styles.actionTabTextActive]}>🚩 회장직 이양</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                style={[styles.actionTabBtn, leaderActionTab === 'recommend' && styles.actionTabBtnActive]}
                onPress={() => { setLeaderActionTab('recommend'); setSelectedTargetMember(null); }}
              >
                <Text style={[styles.actionTabText, leaderActionTab === 'recommend' && styles.actionTabTextActive]}>💡 팀원 추천</Text>
              </TouchableOpacity>
            </View>

            {leaderActionTab === 'claim' && (
              <View style={styles.policyNoticeBox}>
                <Text style={styles.policyNoticeTitle}>📜 회장 등록 시 정책 안내</Text>
                <Text style={styles.policyNoticeText}>
                  • 등록 즉시 팀원 전체에게 알림이 발송됩니다.
                </Text>

                <TouchableOpacity style={[styles.confirmBtn, { marginTop: 14 }]} onPress={confirmClaimLeadership} disabled={actionLoading}>
                  {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmBtnText}>🚩 내가 팀 회장으로 등록하기</Text>}
                </TouchableOpacity>
              </View>
            )}

            {(leaderActionTab === 'transfer' || leaderActionTab === 'recommend') && (
              <View style={{ marginVertical: 10 }}>
                <Text style={styles.inputLabel}>
                  {leaderActionTab === 'transfer' ? '이양받을 팀원 선택' : '회장으로 추천할 동료 선택'}
                </Text>
                
                <ScrollView style={{ maxHeight: 180, marginVertical: 6 }} showsVerticalScrollIndicator={false}>
                  {members.filter(m => m.id !== userId).map((m) => {
                    const isSelected = selectedTargetMember?.id === m.id;
                    return (
                      <TouchableOpacity
                        key={m.id}
                        style={[styles.memberPickerItem, isSelected && styles.memberPickerItemActive]}
                        onPress={() => setSelectedTargetMember(m)}
                      >
                        <Text style={[styles.memberPickerText, isSelected && styles.memberPickerTextActive]}>
                          👤 {m.full_name} 선생님 ({m.school_name || '학교 미설정'})
                        </Text>
                        {isSelected && <Text style={{ color: '#2563EB', fontWeight: '900' }}>✓ 선택됨</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {leaderActionTab === 'transfer' ? (
                  <TouchableOpacity style={styles.confirmBtn} onPress={confirmTransferLeadership} disabled={actionLoading}>
                    {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmBtnText}>🚩 선택한 팀원에게 이양 제안</Text>}
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[styles.confirmBtn, { backgroundColor: '#2563EB' }]} onPress={confirmRecommendLeadership} disabled={actionLoading}>
                    {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmBtnText}>💡 선택한 팀원 추천 알림 보내기</Text>}
                  </TouchableOpacity>
                )}
              </View>
            )}

            <TouchableOpacity style={styles.closeBtn} onPress={() => setLeaderModalVisible(false)}>
              <Text style={styles.closeBtnText}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* PIN 비밀번호 모달 */}
      <Modal visible={pinModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🔒 팀 보호 비밀번호 설정</Text>
            <Text style={styles.modalSub}>4자리 숫자를 설정하면 해당 번호를 아는 분만 가입할 수 있습니다.</Text>
            <TextInput 
              style={styles.pinInput} 
              value={newPinCode} 
              onChangeText={setNewPinCode} 
              keyboardType="number-pad" 
              maxLength={4}
              placeholder="예: 1234"
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
              <TouchableOpacity style={[styles.closeBtn, { flex: 1 }]} onPress={() => setPinModalVisible(false)}>
                <Text style={styles.closeBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { flex: 2, backgroundColor: '#1D4ED8' }]} onPress={handleChangePinCode} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmBtnText}>보호 켜기 (저장)</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 유튜브 URL 모달 */}
      <Modal visible={youtubeModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📺 팀 공식 유튜브 채널 링크 설정</Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 12 }}>
              팀의 공식 유튜브 채널 링크를 등록하면 다른 팀들이 팀 프로필에서 바로 이동하여 영상을 볼 수 있습니다.
            </Text>
            <TextInput
              style={styles.textInput}
              placeholder="예: https://www.youtube.com/@팀채널"
              placeholderTextColor="#94A3B8"
              value={newYoutubeUrl}
              onChangeText={setNewYoutubeUrl}
              autoCapitalize="none"
              autoFocus
            />
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.closeBtn, { flex: 1 }]} onPress={() => setYoutubeModalVisible(false)}>
                <Text style={styles.closeBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { flex: 2 }]} onPress={handleSaveYoutubeUrl} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmBtnText}>저장하기</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 지역 모달 */}
      <Modal visible={regionModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📍 [{selectedTeam?.name}] 연고 지역 변경</Text>
            <Text style={{ fontSize: 12, color: Colors.textMuted, marginBottom: 12 }}>
              팀이 주 활동지로 등록할 지역을 선택하거나 직접 입력해 주세요.
            </Text>

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
              {[...dbRegions, '직접 입력'].map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[
                    styles.regionChip,
                    selectedRegionOption === r && styles.regionChipActive
                  ]}
                  onPress={() => setSelectedRegionOption(r)}
                >
                  <Text style={[styles.regionChipText, selectedRegionOption === r && styles.regionChipTextActive]}>
                    {selectedRegionOption === r ? '✓ ' : ''}{r}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {selectedRegionOption === '직접 입력' && (
              <TextInput
                style={[styles.textInput, { marginTop: 4 }]}
                placeholder="신규 지역명 입력 (예: 당진, 서산)"
                placeholderTextColor="#94A3B8"
                value={customRegionText}
                onChangeText={setCustomRegionText}
              />
            )}

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              <TouchableOpacity style={[styles.closeBtn, { flex: 1 }]} onPress={() => setRegionModalVisible(false)}>
                <Text style={styles.closeBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.confirmBtn, { flex: 2 }]} onPress={handleSaveTeamRegion} disabled={actionLoading}>
                {actionLoading ? <ActivityIndicator color="#FFF" /> : <Text style={styles.confirmBtnText}>지역 변경 저장</Text>}
              </TouchableOpacity>
            </View>
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
  addTeamBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  addTeamBtnText: { color: '#1D4ED8', fontWeight: '800', fontSize: 13 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  switcherSection: { marginBottom: 16 },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, marginBottom: 8 },
  tabScroll: { flexDirection: 'row' },
  teamTabBase: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 16, marginRight: 8 },
  addTeamChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderStyle: 'dashed' },
  addTeamChipText: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  
  dormantBanner: { backgroundColor: '#FEF2F2', padding: 14, borderRadius: 14, borderWidth: 1.5, borderColor: '#FCA5A5', marginBottom: 16 },
  dormantTitle: { fontSize: 15, fontWeight: '900', color: '#DC2626', marginBottom: 4 },
  dormantSub: { fontSize: 12, color: '#991B1B', lineHeight: 18, marginBottom: 10 },
  restoreBtn: { backgroundColor: '#DC2626', paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  restoreBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  teamHeaderCard: { backgroundColor: '#FFFFFF', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  teamHeaderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  regionBadge: { fontSize: 12, fontWeight: '700', color: '#0284C7' },
  
  editRegionBtn: { backgroundColor: '#F0F9FF', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#BAE6FD' },
  editRegionBtnText: { fontSize: 10, fontWeight: '800', color: '#0284C7' },

  setPrimaryBtn: { backgroundColor: '#FEF3C7', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: '#FDE68A' },
  setPrimaryBtnText: { fontSize: 10, fontWeight: '800', color: '#B45309' },

  teamTitle: { fontSize: 24, fontWeight: '900', color: Colors.primary, marginVertical: 4 },
  blueRibbonBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  blueRibbonText: { fontSize: 11, fontWeight: '800', color: '#2563EB' },
  pendingBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  pendingBadgeText: { fontSize: 11, fontWeight: '700', color: '#D97706' },

  leaderBarContainer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#FAF5FF', borderWidth: 1, borderColor: '#E9D5FF', borderRadius: 12, padding: 10, marginTop: 10 },
  leaderBarInfo: { flex: 1, marginRight: 8 },
  leaderBarTitle: { fontSize: 12.5, fontWeight: '800', color: '#6B21A8' },
  claimLeaderBtn: { backgroundColor: '#6B21A8', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  claimLeaderBtnText: { color: '#FFFFFF', fontSize: 11.5, fontWeight: '800' },

  youtubeChannelBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 12 },
  youtubeChannelBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '800' },
  editYoutubeBarBtn: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  editYoutubeBarBtnText: { color: '#475569', fontSize: 13, fontWeight: '700' },

  pinBox: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0', marginTop: 6 },
  pinBoxLabel: { fontSize: 12, fontWeight: '800', color: '#334155' },
  pinStatusDot: { width: 8, height: 8, borderRadius: 4, marginTop: 2 },
  changePinBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
  changePinBtnText: { fontSize: 11, fontWeight: '800', color: '#2563EB' },
  pinCodeText: { fontSize: 20, fontWeight: '900', color: Colors.primary, letterSpacing: 4, textAlign: 'center', marginTop: 6 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  statsSection: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  statsGrid: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, backgroundColor: '#F8FAFC', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#F1F5F9', alignItems: 'center' },
  statValue: { fontSize: 15, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  
  rankRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  rankRowFirst: { backgroundColor: '#FEFCE8', borderColor: '#FDE68A' },
  rankNumber: { fontSize: 14, fontWeight: '800', color: Colors.text, width: 44 },
  rankName: { fontSize: 14, fontWeight: '800', color: Colors.text },
  rankDetail: { fontSize: 12, color: Colors.textMuted, marginTop: 2 },
  rankBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  rankBadgeText: { fontSize: 12, fontWeight: '800', color: '#1D4ED8' },

  rosterSection: { marginTop: 6 },
  memberCard: { backgroundColor: '#FFFFFF', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E2E8F0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  memberCardLeader: { backgroundColor: '#FAF5FF', borderColor: '#D8B4FE' },
  memberName: { fontSize: 14, fontWeight: '800', color: Colors.text },
  leaderBadge: { backgroundColor: '#F3E8FF', borderWidth: 1, borderColor: '#D8B4FE', paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4 },
  leaderBadgeText: { color: '#6B21A8', fontSize: 10.5, fontWeight: '800' },
  memberSchool: { fontSize: 11.5, color: Colors.textMuted, fontWeight: '500', marginTop: 2 },
  memberPosBadge: { backgroundColor: '#F0FDF4', borderWidth: 1, borderColor: '#BBF7D0', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 3 },
  memberPosText: { color: '#166534', fontSize: 10.5, fontWeight: '700' },

  kickBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6 },
  kickBtnText: { color: '#DC2626', fontSize: 10.5, fontWeight: '800' },

  dangerZoneBox: { backgroundColor: '#FEF2F2', borderRadius: 16, padding: 16, borderWidth: 1.5, borderColor: '#FECACA', marginTop: 20 },
  dangerZoneTitle: { fontSize: 14, fontWeight: '800', color: '#DC2626', marginBottom: 4 },
  dangerZoneDesc: { fontSize: 11.5, color: '#991B1B', lineHeight: 16, marginBottom: 12 },
  deleteTeamBtn: { backgroundColor: '#DC2626', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  deleteTeamBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },

  emptyBox: { backgroundColor: Colors.surface, borderRadius: 14, padding: 24, alignItems: 'center', borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  emptyText: { fontSize: 13, fontWeight: '700', color: Colors.textMuted, textAlign: 'center' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, width: '100%' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  modalSub: { fontSize: 12, color: Colors.textMuted, marginBottom: 12 },

  actionTabRow: { flexDirection: 'row', gap: 6, marginBottom: 12 },
  actionTabBtn: { flex: 1, paddingVertical: 8, borderRadius: 8, backgroundColor: '#F1F5F9', alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  actionTabBtnActive: { backgroundColor: '#6B21A8', borderColor: '#581C87' },
  actionTabText: { fontSize: 11.5, fontWeight: '700', color: '#475569' },
  actionTabTextActive: { color: '#FFFFFF', fontWeight: '800' },

  policyNoticeBox: { backgroundColor: '#FAF5FF', padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#E9D5FF', marginVertical: 6 },
  policyNoticeTitle: { fontSize: 12, fontWeight: '800', color: '#6B21A8', marginBottom: 4 },
  policyNoticeText: { fontSize: 11, color: '#7E22CE', lineHeight: 16 },

  inputLabel: { fontSize: 12.5, fontWeight: '700', color: '#475569', marginBottom: 6, marginTop: 4 },

  memberPickerItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 6 },
  memberPickerItemActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  memberPickerText: { fontSize: 12.5, fontWeight: '700', color: '#334155' },
  memberPickerTextActive: { color: '#1D4ED8', fontWeight: '800' },

  textInput: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, fontSize: 14, backgroundColor: '#F8FAFC', color: Colors.text },
  pinInput: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  closeBtnText: { color: Colors.text, fontWeight: '700' },
  confirmBtn: { backgroundColor: '#6B21A8', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  confirmBtnText: { color: '#FFFFFF', fontWeight: '800' },

  regionChip: { backgroundColor: '#F1F5F9', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: '#CBD5E1' },
  regionChipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  regionChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  regionChipTextActive: { color: '#1D4ED8', fontWeight: '800' },
});