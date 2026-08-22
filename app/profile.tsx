import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Modal,
  Image,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import StickyAdBanner from '../components/StickyAdBanner';

import PersonalReportModal from '../components/PersonalReportModal';
import TeamReportModal from '../components/TeamReportModal';
import MercenaryReportModal from '../components/MercenaryReportModal';

interface ProfileData {
  full_name: string;
  school_name?: string;
  position?: string;
  gender?: string;
  region?: string;
  avatar_icon?: string;
  avatar_url?: string;
  invite_code?: string;
  grape_count?: number;
  manner_temp?: number;
}

interface RawMatchData {
  id: string;
  winner_team?: string;
  host_team_name: string;
  away_team_name?: string;
  host_roster?: string;
  away_roster?: string;
  host_mercenary_roster?: string | null;
  away_mercenary_roster?: string | null;
  status: string;
  set_scores?: string | null;
  match_date?: string;
  created_at?: string;
  format?: string;
}

interface PersonalMatch {
  id: string;
  winner_team?: string;
  host_team_name: string;
  away_team_name?: string;
  isMyWin: boolean;
  isDraw: boolean;
  isIntramural: boolean;
  isTournament: boolean;
}

interface TeamStats {
  teamId: string;
  teamName: string;
  teamType: string;
  region?: string;
  mannerTemp?: number;
  memberCount?: number;
  status?: string;
  wins: number;
  draws: number;
  losses: number;
  total: number;
  winRate: number;
}

interface TeamMyStat {
  teamName: string;
  teamType: string;
  myAppearedCount: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
}

export default function ProfileScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id || '';

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [myTeamsList, setMyTeamsList] = useState<any[]>([]);
  const [rawMatches, setRawMatches] = useState<RawMatchData[]>([]);
  const [profilesMap, setProfilesMap] = useState<{ [id: string]: string }>({});
  
  const [invitedCount, setInvitedCount] = useState<number>(0);
  const [grapeBoardModalVisible, setGrapeBoardModalVisible] = useState(false);

  const [selectedSeason, setSelectedSeason] = useState<string>(String(new Date().getFullYear()));
  const [seasonPickerModalVisible, setSeasonPickerModalVisible] = useState(false);

  const [personalModalVisible, setPersonalModalVisible] = useState(false);
  const [selectedPersonalTeam, setSelectedPersonalTeam] = useState<string | null>(null);

  const [teamModalVisible, setTeamModalVisible] = useState(false);
  const [selectedOfficialTeam, setSelectedOfficialTeam] = useState<string | null>(null);

  const [mercenaryModalVisible, setMercenaryModalVisible] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

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

    rawMatches.forEach((m) => {
      const { year } = parseMatchDate(m.match_date || m.created_at);
      if (year > 2000) yearsSet.add(year);
    });

    return Array.from(yearsSet).sort((a, b) => b - a);
  }, [rawMatches]);

  const generateInviteCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = 'TV-';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  };

  const fetchProfileData = async () => {
    if (!currentUserId) return setLoading(false);

    try {
      setLoading(true);

      const { data: allProfs } = await supabase.from('profiles').select('id, full_name');
      if (allProfs) {
        const pMap: { [id: string]: string } = {};
        allProfs.forEach(p => { pMap[p.id] = p.full_name || '팀원'; });
        setProfilesMap(pMap);
      }

      let { data: prof } = await supabase.from('profiles').select('*').eq('id', currentUserId).maybeSingle();
      if (prof) {
        if (!prof.invite_code || prof.invite_code.length < 9) {
          const newCode = generateInviteCode();
          await supabase.from('profiles').update({ invite_code: newCode }).eq('id', currentUserId);
          prof.invite_code = newCode;
        }
        setProfile(prof);
      }

      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('invited_by', currentUserId);
      setInvitedCount(count || 0);

      const { data: tmData } = await supabase
        .from('team_members')
        .select('is_primary, team_id, teams(id, name, team_type, region, manner_temp, status)')
        .eq('user_id', currentUserId)
        .eq('is_active', true)
        .order('is_primary', { ascending: false });

      const myTeamIds = tmData?.map(t => t.team_id).filter(Boolean) || [];
      let memberCountsMap: { [teamId: string]: number } = {};
      
      if (myTeamIds.length > 0) {
        const { data: membersCountData } = await supabase
          .from('team_members')
          .select('team_id')
          .in('team_id', myTeamIds)
          .eq('is_active', true);

        (membersCountData || []).forEach(m => {
          if (m.team_id) {
            memberCountsMap[m.team_id] = (memberCountsMap[m.team_id] || 0) + 1;
          }
        });
      }

      const teamsList: any[] = [];
      const addedIds = new Set<string>();

      (tmData || []).forEach((tm: any) => {
        const teamObj = Array.isArray(tm.teams) ? tm.teams[0] : tm.teams;
        // 💡 [핵심 해결] status가 'deleted'이거나 없는 팀은 내 프로필 팀 목록에 아예 넣지 않음!
        if (teamObj && teamObj.id && teamObj.status !== 'deleted' && !addedIds.has(teamObj.id)) {
          let pureName = teamObj.name;
          if (teamObj.status === 'dormant' && !pureName?.startsWith('(휴면)')) {
            pureName = `(휴면) ${pureName?.replace(/^\(해체\)\s*/, '')}`;
          }

          if (pureName) {
            addedIds.add(teamObj.id);
            teamsList.push({
              id: teamObj.id,
              name: pureName,
              region: teamObj.region || '지역 미설정',
              team_type: teamObj.team_type || 'school',
              manner_temp: teamObj.manner_temp || 36.5,
              member_count: memberCountsMap[teamObj.id] || 1,
              status: teamObj.status || 'active',
              is_primary: tm.is_primary,
            });
          }
        }
      });

      setMyTeamsList(teamsList);

      const { data: allMatches } = await supabase.from('matches').select('*').in('status', ['completed', 'friendly', 'intramural']);
      if (allMatches) setRawMatches(allMatches);

    } catch (err) {
      console.error('프로필 조회 오류:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchProfileData();
    }, [currentUserId, session])
  );

  useEffect(() => {
    if (currentUserId) {
      fetchProfileData();
    }
  }, [currentUserId]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchProfileData();
  };

  const handleLogout = () => {
    Alert.alert('로그아웃', '정말 로그아웃 하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '로그아웃',
        style: 'destructive',
        onPress: async () => {
          await supabase.auth.signOut();
          router.replace('/login');
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      '회원 탈퇴',
      '정말 탈퇴하시겠습니까?\n탈퇴 시 프로필 정보가 완전히 삭제됩니다.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '탈퇴하기',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              const { error } = await supabase.from('profiles').delete().eq('id', currentUserId);
              if (error) throw error;

              await supabase.auth.signOut();
              Alert.alert('탈퇴 완료', '회원 탈퇴가 성공적으로 완료되었습니다.');
              router.replace('/login');
            } catch (err: any) {
              Alert.alert('탈퇴 오류', err.message || '처리 중 오류가 발생했습니다.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const auraInfo = useMemo(() => {
    if (invitedCount >= 10) return { tier: 'platinum', title: '티볼리의 개국공신', nextGauge: 100, nextMsg: '최상위 플래티넘 오라 달성 완료!', style: styles.auraPlatinum };
    if (invitedCount >= 5) return { tier: 'gold', title: '티볼리의 인도자', nextGauge: Math.round((invitedCount / 10) * 100), nextMsg: `플래티넘(10명)까지 ${10 - invitedCount}명 남음`, style: styles.auraGold };
    if (invitedCount >= 3) return { tier: 'silver', title: '티볼리의 수호자', nextGauge: Math.round((invitedCount / 5) * 100), nextMsg: `골드(5명)까지 ${5 - invitedCount}명 남음`, style: styles.auraSilver };
    if (invitedCount >= 1) return { tier: 'bronze', title: '티볼리의 전령', nextGauge: Math.round((invitedCount / 3) * 100), nextMsg: `실버(3명)까지 ${3 - invitedCount}명 남음`, style: styles.auraBronze };
    return { tier: 'none', title: '일반 프로필', nextGauge: 0, nextMsg: '브론즈 오라(1명)까지 1명 남음', style: null };
  }, [invitedCount]);

  const handleAvatarPress = () => {
    if (auraInfo.tier !== 'none') {
      Alert.alert('✨ 프로필 오라 효과', `[${auraInfo.title}] 오라가 적용되어 프로필 테두리가 영롱하게 빛나고 있습니다!`);
    } else {
      Alert.alert('✨ 프로필 오라 효과', '동료 교사를 초대하여 가입하면 프로필에 멋진 오라 테두리가 형성됩니다.');
    }
  };

  const handleCopyInviteCode = async () => {
    if (!profile?.invite_code) return;
    await Clipboard.setStringAsync(profile.invite_code);
    Alert.alert('📋 복사 완료!', `초대 코드 [ ${profile.invite_code} ] 가 클립보드에 복사되었습니다.`);
  };

  const computedData = useMemo(() => {
    const targetMatches = rawMatches.filter(m => {
      if (selectedSeason !== 'all') {
        const targetYear = Number(selectedSeason);
        const { year } = parseMatchDate(m.match_date || m.created_at);
        return year === targetYear;
      }
      return true;
    });

    const myPlayedMatches: PersonalMatch[] = [];
    const statsMap: { [key: string]: TeamStats } = {};
    const myTeamStatMap: { [key: string]: TeamMyStat } = {};

    let mercenaryWins = 0, mercenaryDraws = 0, mercenaryLosses = 0, mercenaryTotal = 0;
    let tournamentWins = 0, tournamentDraws = 0, tournamentLosses = 0, tournamentTotal = 0;

    myTeamsList.forEach(t => {
      const tName = t.name;
      if (tName) {
        statsMap[tName] = {
          teamId: t.id,
          teamName: tName,
          teamType: t.team_type || 'school',
          region: t.region,
          mannerTemp: t.manner_temp,
          memberCount: t.member_count,
          status: t.status,
          wins: 0, draws: 0, losses: 0, total: 0, winRate: 0
        };
        myTeamStatMap[tName] = { teamName: tName, teamType: t.team_type || 'school', myAppearedCount: 0, wins: 0, draws: 0, losses: 0, winRate: 0 };
      }
    });

    targetMatches.forEach((m: any) => {
      const hostList = m.host_roster ? m.host_roster.split(',') : [];
      const awayList = m.away_roster ? m.away_roster.split(',') : [];
      const inHost = currentUserId ? hostList.includes(currentUserId) : false;
      const inAway = currentUserId ? awayList.includes(currentUserId) : false;

      const hostMercList = m.host_mercenary_roster ? m.host_mercenary_roster.split(',') : [];
      const awayMercList = m.away_mercenary_roster ? m.away_mercenary_roster.split(',') : [];
      const isHostMerc = currentUserId ? hostMercList.includes(currentUserId) : false;
      const isAwayMerc = currentUserId ? awayMercList.includes(currentUserId) : false;

      const isTournament = m.format?.includes('대회') || m.format?.includes('토너먼트') || m.format?.includes('리그');

      const hostNameRaw = m.host_team_name;
      const awayNameRaw = m.away_team_name;
      const winnerNameRaw = m.winner_team;

      // 💡 [핵심] 삭제된 팀과의 경기여도 내가 출전한 경기라면 상단 통합 승무패/경기수에는 100% 정상 합산됨!
      if (inHost || inAway) {
        const isIntra = m.status === 'intramural';
        let isMyWin = false;
        let isDraw = m.winner_team === 'draw' || m.winner_team === '무승부';

        if (isIntra) {
          let teamA = 'A팀';
          let teamB = 'B팀';
          if (m.description) {
            const matchDesc = m.description.match(/^\[(.*?)\ VS (.*?)\]/);
            if (matchDesc) {
              teamA = matchDesc[1] || 'A팀';
              teamB = matchDesc[2] || 'B팀';
            }
          }
          if (inHost && (winnerNameRaw === teamA || winnerNameRaw === 'A팀')) isMyWin = true;
          if (inAway && (winnerNameRaw === teamB || winnerNameRaw === 'B팀')) isMyWin = true;
        } else {
          const myPlayedTeam = inHost ? hostNameRaw : awayNameRaw;
          if (winnerNameRaw && winnerNameRaw === myPlayedTeam) isMyWin = true;

          if (myPlayedTeam && myTeamStatMap[myPlayedTeam]) {
            myTeamStatMap[myPlayedTeam].myAppearedCount++;
            if (isMyWin) myTeamStatMap[myPlayedTeam].wins++;
            else if (isDraw) myTeamStatMap[myPlayedTeam].draws++;
            else myTeamStatMap[myPlayedTeam].losses++;
          }

          if (isTournament) {
            tournamentTotal++;
            if (isMyWin) tournamentWins++;
            else if (isDraw) tournamentDraws++;
            else tournamentLosses++;
          }
        }

        myPlayedMatches.push({
          id: m.id,
          host_team_name: hostNameRaw,
          away_team_name: awayNameRaw,
          winner_team: m.winner_team,
          isMyWin,
          isDraw,
          isIntramural: isIntra,
          isTournament,
        });
      }

      if (isHostMerc || isAwayMerc) {
        const hiredTeam = isHostMerc ? hostNameRaw : awayNameRaw;
        const isWin = winnerNameRaw === hiredTeam;
        const isDraw = m.winner_team === 'draw' || m.winner_team === '무승부';

        mercenaryTotal++;
        if (isWin) mercenaryWins++;
        else if (isDraw) mercenaryDraws++;
        else mercenaryLosses++;
      }

      if (m.status === 'completed' || m.status === 'friendly') {
        myTeamsList.forEach(t => {
          const pureTName = t.name;
          if (pureTName && (hostNameRaw === pureTName || awayNameRaw === pureTName)) {
            if (statsMap[pureTName]) {
              statsMap[pureTName].total++;
              if (winnerNameRaw === pureTName) statsMap[pureTName].wins++;
              else if (m.winner_team === 'draw' || m.winner_team === '무승부') statsMap[pureTName].draws++;
              else statsMap[pureTName].losses++;
            }
          }
        });
      }
    });

    const officialMatches = myPlayedMatches.filter(m => !m.isIntramural && !m.isTournament);
    const officialTotal = officialMatches.length;
    const officialWins = officialMatches.filter(m => m.isMyWin).length;
    const officialDraws = officialMatches.filter(m => m.isDraw).length;
    const officialLosses = officialTotal - officialWins - officialDraws;
    const officialWinRate = officialTotal > 0 ? Math.round((officialWins / officialTotal) * 100) : 0;

    const intraMatches = myPlayedMatches.filter(m => m.isIntramural);
    const intraTotal = intraMatches.length;
    const intraWins = intraMatches.filter(m => m.isMyWin).length;
    const intraDraws = intraMatches.filter(m => m.isDraw).length;
    const intraLosses = intraTotal - intraWins - intraDraws;
    const intraWinRate = intraTotal > 0 ? Math.round((intraWins / intraTotal) * 100) : 0;

    const tournamentWinRate = tournamentTotal > 0 ? Math.round((tournamentWins / tournamentTotal) * 100) : 0;
    const mercenaryWinRate = mercenaryTotal > 0 ? Math.round((mercenaryWins / mercenaryTotal) * 100) : 0;

    // 💡 [핵심 해결] 하단 박스 생성 시 '삭제된 팀' 박스는 완전히 제외!
    const teamMyStatsArr = Object.values(myTeamStatMap)
      .filter(s => s.teamName !== '(삭제된 팀)')
      .map(s => {
        s.winRate = s.myAppearedCount > 0 ? Math.round((s.wins / s.myAppearedCount) * 100) : 0;
        return s;
      })
      .sort((a, b) => b.myAppearedCount - a.myAppearedCount);

    const teamOfficialStatsArr = Object.values(statsMap)
      .filter(s => s.teamName !== '(삭제된 팀)' && s.status !== 'deleted')
      .map(s => {
        s.winRate = s.total > 0 ? Math.round((s.wins / s.total) * 100) : 0;
        return s;
      });

    return {
      officialWins, officialDraws, officialLosses, officialTotal, officialWinRate,
      tournamentWins, tournamentDraws, tournamentLosses, tournamentTotal, tournamentWinRate,
      intraWins, intraDraws, intraLosses, intraTotal, intraWinRate,
      mercenaryWins, mercenaryDraws, mercenaryLosses, mercenaryTotal, mercenaryWinRate,
      teamMyStatsArr,
      teamOfficialStatsArr
    };
  }, [rawMatches, myTeamsList, selectedSeason, currentUserId]);

  const autoTitleBadge = useMemo(() => {
    const totalMatches = computedData.officialTotal + computedData.tournamentTotal + computedData.intraTotal + computedData.mercenaryTotal;
    const totalWins = computedData.officialWins + computedData.tournamentWins + computedData.intraWins + computedData.mercenaryWins;

    if (totalWins >= 30) return { label: '🌟 배구 마스터', style: { backgroundColor: '#FDF4FF', borderColor: '#D8B4FE', color: '#9333EA' } };
    if (totalWins >= 15) return { label: '👑 승리의 화신', style: { backgroundColor: '#FEFCE8', borderColor: '#FDE047', color: '#B45309' } };
    if (totalWins >= 5) return { label: '⚡ 승리 요정', style: { backgroundColor: '#FEFCE8', borderColor: '#FDE047', color: '#B45309' } };
    if (totalMatches >= 30) return { label: '🏆 코트의 전설', style: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', color: '#334155' } };
    if (totalMatches >= 10) return { label: '🔥 코트의 베테랑', style: { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', color: '#475569' } };
    if (totalMatches >= 1) return { label: '🌱 배구 루키', style: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0', color: '#64748B' } };
    
    return { label: '🐣 배구 병아리', style: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', color: '#94A3B8' } };
  }, [computedData]);

  const teamOfficialAnalytics = useMemo(() => {
    if (!selectedOfficialTeam) return null;
    
    const teamName = selectedOfficialTeam;
    const teamData = myTeamsList.find(t => t.name === teamName);

    const targetMatches = rawMatches.filter(m => {
      if (m.status !== 'completed') return false;
      if (selectedSeason !== 'all') {
        const targetYear = Number(selectedSeason);
        const { year } = parseMatchDate(m.match_date || m.created_at);
        return year === targetYear;
      }
      return true;
    });

    const teamMatches = targetMatches.filter(m => {
      return m.host_team_name === teamName || m.away_team_name === teamName;
    });

    let setsWon = 0, setsLost = 0, shutoutWins = 0, fullsetWins = 0;
    const oppMap: { [oppName: string]: { wins: number; losses: number; draws: number; total: number } } = {};

    teamMatches.forEach(m => {
      const hName = m.host_team_name;
      const aName = m.away_team_name;
      const wName = m.winner_team;
      const isHost = hName === teamName;
      const oppName = isHost ? aName : hName;
      const isWin = wName === teamName;
      const isDraw = wName === 'draw' || wName === '무승부';

      if (oppName) {
        if (!oppMap[oppName]) oppMap[oppName] = { wins: 0, losses: 0, draws: 0, total: 0 };
        oppMap[oppName].total++;
        if (isWin) oppMap[oppName].wins++;
        else if (isDraw) oppMap[oppName].draws++;
        else oppMap[oppName].losses++;
      }

      let hostSetWon = 0, awaySetWon = 0;
      if (m.set_scores) {
        m.set_scores.split(', ').forEach(s => {
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

    const teamRecent5 = teamMatches.slice(0, 5).map(m => {
      const wName = m.winner_team;
      const isWin = wName === teamName;
      const isDraw = wName === 'draw' || wName === '무승부';
      return isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSS';
    });

    const memCount = teamData?.member_count || 0;

    return {
      teamName,
      region: teamData?.region || '지역 미설정',
      teamType: (teamData?.team_type || 'school') as 'school' | 'club',
      mannerTemp: teamData?.manner_temp || 36.5,
      isOfficial: memCount >= 3,
      memberCount: memCount,
      totalMatches: teamMatches.length,
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
  }, [selectedOfficialTeam, rawMatches, selectedSeason, myTeamsList]);

  const personalAnalytics = useMemo(() => {
    if (!selectedPersonalTeam) return null;
    const teamName = selectedPersonalTeam;

    const targetMatches = rawMatches.filter(m => {
      if (m.status === 'intramural') return false;
      if (selectedSeason !== 'all') {
        const targetYear = Number(selectedSeason);
        const { year } = parseMatchDate(m.match_date || m.created_at);
        return year === targetYear;
      }
      return true;
    });

    const teamAllMatches = targetMatches.filter(m => {
      return m.host_team_name === teamName || m.away_team_name === teamName;
    });
    const totalTeamGames = teamAllMatches.length;

    const myPlayedForTeam = teamAllMatches.filter(m => {
      const hostList = m.host_roster ? m.host_roster.split(',') : [];
      const awayList = m.away_roster ? m.away_roster.split(',') : [];
      const inHost = currentUserId ? (m.host_team_name === teamName && hostList.includes(currentUserId)) : false;
      const inAway = currentUserId ? (m.away_team_name === teamName && awayList.includes(currentUserId)) : false;
      return inHost || inAway;
    });

    const myGames = myPlayedForTeam.length;
    const attendanceRate = totalTeamGames > 0 ? Math.round((myGames / totalTeamGames) * 100) : 0;

    const recent5 = myPlayedForTeam.slice(0, 5).map(m => {
      const isWin = m.winner_team === teamName;
      const isDraw = m.winner_team === 'draw' || m.winner_team === '무승부';
      return isWin ? 'WIN' : isDraw ? 'DRAW' : 'LOSS';
    });

    let setsWon = 0, setsLost = 0;
    const partnerWinsMap: { [userId: string]: number } = {};

    myPlayedForTeam.forEach(m => {
      const isHost = m.host_team_name === teamName;
      const myRosterStr = isHost ? m.host_roster : m.away_roster;
      const myRoster = myRosterStr ? myRosterStr.split(',') : [];
      const isWin = m.winner_team === teamName;

      if (m.set_scores) {
        m.set_scores.split(', ').forEach(s => {
          const [h, a] = s.split(':').map(Number);
          if (!isNaN(h) && !isNaN(a)) {
            if (isHost) { if (h > a) setsWon++; else if (a > h) setsLost++; } 
            else { if (a > h) setsWon++; else if (h > a) setsLost++; }
          }
        });
      }

      if (isWin && myRoster.length > 0) {
        myRoster.forEach(id => {
          if (id && id !== currentUserId) {
            partnerWinsMap[id] = (partnerWinsMap[id] || 0) + 1;
          }
        });
      }
    });

    let bestPartnerName = '데이터 없음', maxPartnerWins = 0;
    Object.entries(partnerWinsMap).forEach(([id, wins]) => {
      if (wins > maxPartnerWins) {
        maxPartnerWins = wins; bestPartnerName = profilesMap[id] || '팀원';
      }
    });

    return { teamName, totalTeamGames, myGames, attendanceRate, recent5, setsWon, setsLost, bestPartnerName, maxPartnerWins };
  }, [selectedPersonalTeam, rawMatches, selectedSeason, currentUserId, profilesMap]);

  const mercenaryAnalytics = useMemo(() => {
    if (!currentUserId) return null;

    const targetMatches = rawMatches.filter(m => {
      if (m.status === 'intramural') return false;
      if (selectedSeason !== 'all') {
        const targetYear = Number(selectedSeason);
        const { year } = parseMatchDate(m.match_date || m.created_at);
        return year === targetYear;
      }
      return true;
    });

    const myMercMatches = targetMatches.filter(m => {
      const hList = m.host_mercenary_roster ? m.host_mercenary_roster.split(',') : [];
      const aList = m.away_mercenary_roster ? m.away_mercenary_roster.split(',') : [];
      return hList.includes(currentUserId) || aList.includes(currentUserId);
    });

    const totalGames = myMercMatches.length;
    let wins = 0, draws = 0, losses = 0, setsWon = 0, setsLost = 0;
    const hiredCountMap: { [team: string]: number } = {};

    myMercMatches.forEach(m => {
      const isHostMerc = m.host_mercenary_roster?.split(',').includes(currentUserId);
      const hiredTeam = isHostMerc ? m.host_team_name : m.away_team_name;
      const isWin = m.winner_team === hiredTeam;
      const isDraw = m.winner_team === 'draw' || m.winner_team === '무승부';

      if (isWin) wins++; else if (isDraw) draws++; else losses++;
      if (hiredTeam) hiredCountMap[hiredTeam] = (hiredCountMap[hiredTeam] || 0) + 1;

      if (m.set_scores) {
        m.set_scores.split(', ').forEach(s => {
          const [h, a] = s.split(':').map(Number);
          if (!isNaN(h) && !isNaN(a)) {
            if (isHostMerc) { if (h > a) setsWon++; else if (a > h) setsLost++; } 
            else { if (a > h) setsWon++; else if (h > a) setsLost++; }
          }
        });
      }
    });

    let bestHiredTeam = '데이터 없음', maxHiredCount = 0;
    Object.entries(hiredCountMap).forEach(([t, count]) => {
      if (count > maxHiredCount) { maxHiredCount = count; bestHiredTeam = t; }
    });

    const recent5 = myMercMatches.slice(0, 5).map(m => {
      const isHostMerc = m.host_mercenary_roster?.split(',').includes(currentUserId);
      const hiredTeam = isHostMerc ? m.host_team_name : m.away_team_name;
      if (m.winner_team === hiredTeam) return 'WIN';
      if (m.winner_team === 'draw' || m.winner_team === '무승부') return 'DRAW';
      return 'LOSS';
    });

    return { totalGames, wins, draws, losses, winRate: totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0, recent5, setsWon, setsLost, bestHiredTeam, maxHiredCount };
  }, [rawMatches, selectedSeason, currentUserId]);

  const displayName = profile?.full_name || session?.user?.user_metadata?.full_name || '선생님';
  const avatarIco = profile?.avatar_icon || '🏐';
  const avatarUrl = profile?.avatar_url;
  const myGender = profile?.gender || '남성';
  const myTeamsNameList = myTeamsList.map(t => t.name).filter(Boolean);
  const grapeCount = profile?.grape_count || 0;
  const mannerTemp = profile?.manner_temp || 36.5;

  const grapeClusters = Math.floor(grapeCount / 10);
  const grapeRemainder = grapeCount % 10;

  const formattedRegions = useMemo(() => {
    if (!profile?.region) return '미설정';
    const regList = profile.region.split(',').map(r => r.trim()).filter(Boolean);
    if (regList.length === 0) return '미설정';
    return regList.join(', ');
  }, [profile]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}>
          <Text style={styles.backText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>내 프로필</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}
      >
        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : (
          <>
            <View style={styles.businessCard}>
              <View style={styles.bcTop}>
                <TouchableOpacity onPress={handleAvatarPress} activeOpacity={0.8} style={styles.bcAvatarContainer}>
                  <View style={[styles.bcAvatarCircle, auraInfo.style]}>
                    {avatarUrl ? (
                      <Image source={{ uri: avatarUrl }} style={styles.bcAvatarImage} />
                    ) : (
                      <Text style={styles.bcAvatarEmoji}>{avatarIco}</Text>
                    )}
                  </View>
                </TouchableOpacity>
                
                <View style={styles.bcInfoContainer}>
                  <View style={styles.bcNameRow}>
                    <Text style={styles.bcName}>{displayName} 선생님</Text>
                    <View style={[styles.bcGenderBadge, myGender === '여성' ? styles.bcFemaleBadge : styles.bcMaleBadge]}>
                      <Text style={[styles.bcGenderText, myGender === '여성' ? styles.bcFemaleText : styles.bcMaleText]}>{myGender}</Text>
                    </View>
                  </View>
                  
                  <View style={[styles.bcTitleBadge, autoTitleBadge.style]}>
                    <Text style={[styles.bcTitleText, { color: autoTitleBadge.style.color }]}>{autoTitleBadge.label}</Text>
                  </View>
                  
                  <Text style={styles.bcDetailText}>🏫 {profile?.school_name || '학교 미설정'} · 👟 {profile?.position || '포지션 미설정'}</Text>
                  <Text style={styles.bcDetailText}>📍 주 활동: {formattedRegions}</Text>
                </View>
              </View>

              <View style={styles.assetMannerRow}>
                <TouchableOpacity 
                  style={styles.grapeBox} 
                  onPress={() => setGrapeBoardModalVisible(true)}
                  activeOpacity={0.8}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={styles.grapeTitle}>🍇 칭찬 포도알</Text>
                    <Text style={{ fontSize: 10, color: '#9333EA', fontWeight: '800' }}>판 보기 ›</Text>
                  </View>
                  <Text style={styles.grapeVal}>
                    {grapeClusters > 0 ? `${grapeClusters}송이 + ${grapeRemainder}알` : `${grapeRemainder}알`}
                  </Text>
                  
                  <View style={styles.miniGrapeDotsRow}>
                    {Array.from({ length: 10 }).map((_, idx) => (
                      <View 
                        key={idx} 
                        style={[
                          styles.miniGrapeDot, 
                          idx < grapeRemainder && styles.miniGrapeDotFilled
                        ]} 
                      />
                    ))}
                  </View>
                </TouchableOpacity>

                <View style={styles.mannerTempBox}>
                  <View style={styles.mannerHeaderRow}>
                    <Text style={styles.mannerTitle}>🌡️ 매너 온도</Text>
                    <Text style={styles.mannerVal}>{mannerTemp.toFixed(1)}°C</Text>
                  </View>
                  <View style={styles.mannerGaugeBg}>
                    <View style={[styles.mannerGaugeFill, { width: `${Math.min(100, (mannerTemp / 99) * 100)}%` }]} />
                  </View>
                </View>
              </View>
              
              <View style={styles.bcDivider} />
              
              <View style={styles.bcBottom}>
                <Text style={styles.bcBottomLabel}>소속팀</Text>
                <View style={styles.bcTeamsWrapper}>
                  {myTeamsNameList.length > 0 ? (
                    myTeamsNameList.map(t => (
                      <View key={t} style={styles.bcTeamChip}><Text style={styles.bcTeamChipText}>{t}</Text></View>
                    ))
                  ) : (
                    <Text style={styles.bcNoTeamText}>가입된 소속팀이 없습니다.</Text>
                  )}
                </View>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, width: '100%', marginBottom: 16 }}>
              <TouchableOpacity
                style={[styles.editProfileBtn, { flex: 1 }]}
                onPress={() => router.push('/profile-setup?mode=profile')}
                activeOpacity={0.8}
              >
                <Text style={styles.editProfileBtnText}>⚙️ 개인 프로필 설정</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editProfileBtn, { flex: 1, backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                onPress={() => router.push('/team-management')}
                activeOpacity={0.8}
              >
                <Text style={[styles.editProfileBtnText, { color: '#1D4ED8' }]}>👥 소속 팀 관리/가입</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.seasonSelectorWrapper}>
              <Text style={styles.seasonSelectorLabel}>조회 시즌 선택</Text>
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

            <Text style={styles.sectionTitle}>
              🏆 경기 성격별 출전 성적표 ({selectedSeason === 'all' ? '통산 전체' : `${selectedSeason} 시즌`})
            </Text>
            <View style={styles.statsContainer}>
              <View style={styles.statCard}>
                <Text style={styles.statCardTitle}>🏟️ 1. 일반 팀 교류전</Text>
                <Text style={styles.statMainVal}>
                  {computedData.officialWins}승 {computedData.officialDraws}무 {computedData.officialLosses}패
                </Text>
                <View style={styles.statRow}>
                  <Text style={styles.statSubText}>총 {computedData.officialTotal}경기 출전</Text>
                  <Text style={styles.statRateText}>승률 {computedData.officialWinRate}%</Text>
                </View>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#FEFCE8', borderColor: '#FDE68A' }]}>
                <Text style={[styles.statCardTitle, { color: '#B45309' }]}>🏆 2. 대회 · 리그전</Text>
                <Text style={[styles.statMainVal, { color: '#92400E' }]}>
                  {computedData.tournamentWins}승 {computedData.tournamentDraws}무 {computedData.tournamentLosses}패
                </Text>
                <View style={styles.statRow}>
                  <Text style={[styles.statSubText, { color: '#B45309' }]}>총 {computedData.tournamentTotal}경기 출전</Text>
                  <Text style={[styles.statRateText, { color: '#D97706' }]}>승률 {computedData.tournamentWinRate}%</Text>
                </View>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}>
                <Text style={[styles.statCardTitle, { color: '#7E22CE' }]}>⚔️ 3. 팀 내 연습경기 (청백전)</Text>
                <Text style={[styles.statMainVal, { color: '#6B21A8' }]}>
                  {computedData.intraWins}승 {computedData.intraDraws}무 {computedData.intraLosses}패
                </Text>
                <View style={styles.statRow}>
                  <Text style={[styles.statSubText, { color: '#7E22CE' }]}>총 {computedData.intraTotal}경기 출전</Text>
                  <Text style={[styles.statRateText, { color: '#9333EA' }]}>승률 {computedData.intraWinRate}%</Text>
                </View>
              </View>

              <View style={[styles.statCard, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={[styles.statCardTitle, { color: '#475569' }]}>🙋‍♂️ 용병(게스트) 출전</Text>
                  <TouchableOpacity onPress={() => setMercenaryModalVisible(true)} style={{ padding: 4 }}>
                    <Text style={{ fontSize: 12, fontWeight: '800', color: Colors.primary, textDecorationLine: 'underline' }}>상세 분석 ›</Text>
                  </TouchableOpacity>
                </View>
                <Text style={[styles.statMainVal, { color: '#334155' }]}>
                  {computedData.mercenaryWins}승 {computedData.mercenaryDraws}무 {computedData.mercenaryLosses}패
                </Text>
                <View style={styles.statRow}>
                  <Text style={[styles.statSubText, { color: '#64748B' }]}>총 {computedData.mercenaryTotal}경기 출전</Text>
                  <Text style={[styles.statRateText, { color: Colors.primary }]}>승률 {computedData.mercenaryWinRate}%</Text>
                </View>
              </View>
            </View>

            <Text style={styles.sectionTitle}>
              📊 소속팀별 내 출전 성적 (참여 많은 순)
            </Text>
            {computedData.teamMyStatsArr.length === 0 ? (
              <View style={styles.emptyBox}><Text style={styles.emptyText}>소속된 팀이 없습니다.</Text></View>
            ) : (
              <View style={styles.teamStatsWrapper}>
                {computedData.teamMyStatsArr.map((item) => {
                  return (
                    <View key={item.teamName} style={styles.teamRowCard}>
                      <View style={styles.teamRowHeader}>
                        <Text style={styles.teamRowName}>{item.teamType === 'club' ? '🛡️' : '🏫'} [{item.teamName}]</Text>
                        <TouchableOpacity onPress={() => { setSelectedPersonalTeam(item.teamName); setPersonalModalVisible(true); }} style={{ padding: 4 }}>
                          <Text style={styles.teamRowLink}>분석 리포트 ›</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.teamRowBody}>
                        <Text style={styles.teamRowValText}>
                          • 내 출전: <Text style={{ fontWeight: '800', color: Colors.text }}>{item.myAppearedCount}경기</Text> ({item.wins}승 {item.draws}무 {item.losses}패)
                        </Text>
                        <View style={styles.teamRowBadge}>
                          <Text style={styles.teamRowBadgeText}>승률 {item.winRate}%</Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}

            <Text style={styles.sectionTitle}>
              🎖️ 소속 팀 공식 전적 ({selectedSeason === 'all' ? '통산 전체' : `${selectedSeason} 시즌`})
            </Text>
            {computedData.teamOfficialStatsArr.length === 0 ? (
              <View style={styles.emptyBox}><Text style={styles.emptyText}>소속된 팀이 없습니다.</Text></View>
            ) : (
              <View style={styles.teamStatsWrapper}>
                {computedData.teamOfficialStatsArr.map((team) => {
                  return (
                    <View key={team.teamId || team.teamName} style={styles.teamRowCard}>
                      <View style={styles.teamRowHeader}>
                        <Text style={styles.teamRowName}>{team.teamType === 'club' ? '🛡️' : '🏫'} [{team.teamName}] 팀 성적</Text>
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedOfficialTeam(team.teamName);
                            setTeamModalVisible(true);
                          }}
                          style={{ padding: 4 }}
                        >
                          <Text style={styles.teamRowLink}>전력 분석 ›</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.teamRowVal}>
                        {team.wins}승 {team.draws}무 {team.losses}패 (승률 {team.winRate}%)
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            <TouchableOpacity
              style={styles.historyNavBtn}
              onPress={() => router.push('/my-match-history')}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ fontSize: 20 }}>📜</Text>
                <View>
                  <Text style={styles.historyNavTitle}>상세 출전 이력 기록실 보기</Text>
                  <Text style={styles.historyNavSub}>전체 경기 검색 및 승패 필터링</Text>
                </View>
              </View>
              <Text style={styles.historyNavArrow}>›</Text>
            </TouchableOpacity>

            <View style={styles.inviteCard}>
              <View style={styles.inviteHeader}>
                <View>
                  <Text style={styles.inviteCardTitle}>🔑 내 전용 초대 코드 (6자리)</Text>
                  <Text style={styles.inviteCardSub}>동료 교사를 초대하여 프로필 오라를 해금해보세요!</Text>
                </View>
                <TouchableOpacity style={styles.copyBtn} onPress={handleCopyInviteCode}>
                  <Text style={styles.copyBtnText}>📋 코드 복사</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.inviteStatRow}>
                <Text style={styles.inviteStatText}>
                  초대 실적: <Text style={{ color: '#2563EB', fontWeight: '900' }}>{invitedCount}명</Text>
                </Text>
                <Text style={styles.auraLevelText}>{auraInfo.title}</Text>
              </View>

              <View style={styles.gaugeBarBg}>
                <View style={[styles.gaugeBarFill, { width: `${auraInfo.nextGauge}%` }]} />
              </View>

              <Text style={styles.gaugeSubText}>{auraInfo.nextMsg}</Text>
            </View>

            <View style={styles.accountActionSection}>
              <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
                <Text style={styles.logoutBtnText}>로그아웃</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteAccountBtn} onPress={handleDeleteAccount} activeOpacity={0.8}>
                <Text style={styles.deleteAccountBtnText}>회원 탈퇴</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      <StickyAdBanner />

      <Modal visible={seasonPickerModalVisible} animationType="fade" transparent={true} onRequestClose={() => setSeasonPickerModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📅 조회 시즌 선택</Text>
            <Text style={styles.modalSubTag}>확인하고 싶은 배구 시즌을 선택하세요.</Text>

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

      <Modal visible={grapeBoardModalVisible} animationType="fade" transparent={true} onRequestClose={() => setGrapeBoardModalVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF', borderWidth: 1.5 }]}>
            <Text style={{ fontSize: 18, fontWeight: '900', color: '#6B21A8', textAlign: 'center', marginBottom: 4 }}>
              🍇 칭찬 포도알 판
            </Text>
            <Text style={{ fontSize: 12, color: '#7E22CE', textAlign: 'center', fontWeight: '600', marginBottom: 16 }}>
              상대팀의 매너 칭찬을 모아 10알을 채우면 1송이가 완성됩니다!
            </Text>

            <View style={styles.grapeBoardContainer}>
              <Text style={styles.grapeStemText}>🌿</Text>
              
              <View style={styles.grapeRow}>
                {[0, 1, 2, 3].map(idx => (
                  <View key={idx} style={[styles.grapeSticker, idx < grapeRemainder && styles.grapeStickerFilled]}>
                    <Text style={styles.grapeStickerText}>{idx < grapeRemainder ? '🍇' : '⚪'}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.grapeRow}>
                {[4, 5, 6].map(idx => (
                  <View key={idx} style={[styles.grapeSticker, idx < grapeRemainder && styles.grapeStickerFilled]}>
                    <Text style={styles.grapeStickerText}>{idx < grapeRemainder ? '🍇' : '⚪'}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.grapeRow}>
                {[7, 8].map(idx => (
                  <View key={idx} style={[styles.grapeSticker, idx < grapeRemainder && styles.grapeStickerFilled]}>
                    <Text style={styles.grapeStickerText}>{idx < grapeRemainder ? '🍇' : '⚪'}</Text>
                  </View>
                ))}
              </View>

              <View style={styles.grapeRow}>
                {[9].map(idx => (
                  <View key={idx} style={[styles.grapeSticker, idx < grapeRemainder && styles.grapeStickerFilled]}>
                    <Text style={styles.grapeStickerText}>{idx < grapeRemainder ? '🍇' : '⚪'}</Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.grapeBoardStatusBox}>
              <Text style={styles.grapeBoardStatusText}>
                현재 누적: <Text style={{ fontWeight: '900', color: '#7E22CE' }}>{grapeCount}알</Text> ({grapeClusters}송이 완판 + {grapeRemainder}/10알 진행 중)
              </Text>
            </View>

            <TouchableOpacity style={[styles.modalCloseBtn, { backgroundColor: '#E9D5FF' }]} onPress={() => setGrapeBoardModalVisible(false)}>
              <Text style={[styles.modalCloseBtnText, { color: '#6B21A8' }]}>닫기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <PersonalReportModal
        visible={personalModalVisible}
        onClose={() => setPersonalModalVisible(false)}
        analytics={personalAnalytics}
        selectedSeason={selectedSeason}
      />

      <TeamReportModal
        visible={teamModalVisible}
        onClose={() => {
          setTeamModalVisible(false);
          setSelectedOfficialTeam(null);
        }}
        analytics={teamOfficialAnalytics}
        selectedSeason={selectedSeason}
      />

      <MercenaryReportModal
        visible={mercenaryModalVisible}
        onClose={() => setMercenaryModalVisible(false)}
        analytics={mercenaryAnalytics}
        selectedSeason={selectedSeason}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, backgroundColor: Colors.surface, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { width: 32, height: 32, justifyContent: 'center' },
  backText: { fontSize: 32, color: Colors.text, lineHeight: 32 },
  headerTitle: { fontSize: 16, fontWeight: '800', color: Colors.text },
  
  content: { padding: 16, paddingBottom: 20 },

  businessCard: { backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 12, elevation: 2 },
  bcTop: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  bcAvatarContainer: { position: 'relative' },
  bcAvatarCircle: { width: 66, height: 66, borderRadius: 33, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', borderWidth: 2, overflow: 'hidden' },
  bcAvatarImage: { width: 62, height: 62, borderRadius: 31 },
  bcAvatarEmoji: { fontSize: 30 },
  bcInfoContainer: { flex: 1, justifyContent: 'center' },
  bcNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  bcName: { fontSize: 17, fontWeight: '900', color: '#0F172A' },
  
  bcGenderBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1 },
  bcGenderText: { fontSize: 10, fontWeight: '800' },
  bcMaleBadge: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  bcMaleText: { color: '#1D4ED8' },
  bcFemaleBadge: { backgroundColor: '#FDF2F8', borderColor: '#FBCFE8' },
  bcFemaleText: { color: '#DB2777' },

  bcTitleBadge: { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, borderWidth: 1, marginBottom: 6 },
  bcTitleText: { fontSize: 10, fontWeight: '800' },

  bcDetailText: { fontSize: 11.5, color: '#475569', fontWeight: '600', marginBottom: 2 },

  assetMannerRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  grapeBox: { flex: 1, backgroundColor: '#FAF5FF', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#E9D5FF', justifyContent: 'center' },
  grapeTitle: { fontSize: 11, fontWeight: '800', color: '#7E22CE' },
  grapeVal: { fontSize: 12.5, fontWeight: '900', color: '#6B21A8', marginTop: 2 },
  miniGrapeDotsRow: { flexDirection: 'row', gap: 2, marginTop: 6 },
  miniGrapeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#E9D5FF' },
  miniGrapeDotFilled: { backgroundColor: '#9333EA' },

  mannerTempBox: { flex: 1, backgroundColor: '#FFFBEB', borderRadius: 12, padding: 10, borderWidth: 1, borderColor: '#FDE68A', justifyContent: 'center' },
  mannerHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  mannerTitle: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  mannerVal: { fontSize: 12.5, fontWeight: '900', color: '#D97706' },
  mannerGaugeBg: { height: 6, backgroundColor: '#FEF3C7', borderRadius: 3, overflow: 'hidden', marginTop: 4 },
  mannerGaugeFill: { height: '100%', backgroundColor: '#F59E0B', borderRadius: 3 },

  bcDivider: { height: 1, backgroundColor: '#F1F5F9', marginVertical: 12 },
  
  bcBottom: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bcBottomLabel: { fontSize: 12, fontWeight: '800', color: '#64748B' },
  bcTeamsWrapper: { flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  bcTeamChip: { backgroundColor: '#F8FAFC', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#E2E8F0' },
  bcTeamChipText: { fontSize: 11.5, fontWeight: '800', color: '#334155' },
  bcNoTeamText: { fontSize: 11.5, color: '#94A3B8' },

  auraBronze: { borderColor: '#CD7F32', borderWidth: 3 },
  auraSilver: { borderColor: '#94A3B8', borderWidth: 3.5 },
  auraGold: { borderColor: '#F59E0B', borderWidth: 4 },
  auraPlatinum: { borderColor: '#A855F7', borderWidth: 4 },

  editProfileBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  editProfileBtnText: { color: Colors.primary, fontSize: 13, fontWeight: '800' },

  inviteCard: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 16 },
  inviteHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  inviteCardTitle: { fontSize: 13, fontWeight: '800', color: Colors.text },
  inviteCardSub: { fontSize: 10, color: Colors.textMuted, fontWeight: '600', marginTop: 2 },
  copyBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 8 },
  copyBtnText: { fontSize: 11, fontWeight: '800', color: '#1D4ED8' },

  inviteStatRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  inviteStatText: { fontSize: 12, color: '#334155', fontWeight: '700' },
  auraLevelText: { fontSize: 11, fontWeight: '800', color: '#A855F7' },

  gaugeBarBg: { height: 6, backgroundColor: '#E2E8F0', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  gaugeBarFill: { height: '100%', backgroundColor: '#3B82F6', borderRadius: 3 },
  gaugeSubText: { fontSize: 10, color: '#64748B', fontWeight: '600', textAlign: 'right' },

  seasonSelectorWrapper: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  seasonSelectorLabel: { fontSize: 13, fontWeight: '800', color: Colors.text },
  seasonPickerBtn: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, gap: 4 },
  seasonPickerBtnText: { fontSize: 12, fontWeight: '800', color: '#1D4ED8' },
  seasonPickerArrow: { fontSize: 12, color: '#1D4ED8', fontWeight: '900' },

  seasonOptionBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 10, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  seasonOptionBtnActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  seasonOptionText: { fontSize: 14, fontWeight: '700', color: '#475569' },
  seasonOptionTextActive: { color: '#1D4ED8', fontWeight: '800' },
  checkMark: { fontSize: 14 },

  sectionTitle: { fontSize: 15, fontWeight: '800', color: Colors.text, marginBottom: 8, marginTop: 4 },
  statsContainer: { gap: 8, marginBottom: 16 },
  statCard: { backgroundColor: '#EFF6FF', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#BFDBFE' },
  statCardTitle: { fontSize: 13, fontWeight: '800', color: '#1D4ED8', marginBottom: 4 },
  statMainVal: { fontSize: 20, fontWeight: '900', color: '#1E40AF', marginBottom: 4 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  statSubText: { fontSize: 12, color: '#3B82F6', fontWeight: '600' },
  statRateText: { fontSize: 13, fontWeight: '800', color: '#1E40AF' },

  teamStatsWrapper: { gap: 8, marginBottom: 16 },
  teamRowCard: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' },
  teamRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  teamRowName: { fontSize: 14, fontWeight: '800', color: Colors.primary },
  teamRowLink: { fontSize: 12, fontWeight: '800', color: '#2563EB', textDecorationLine: 'underline' },
  teamRowVal: { fontSize: 15, fontWeight: '800', color: Colors.text },
  teamRowBody: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamRowValText: { fontSize: 12, color: '#475569' },
  teamRowBadge: { backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#BFDBFE' },
  teamRowBadgeText: { fontSize: 11, fontWeight: '800', color: '#1D4ED8' },

  emptyBox: { padding: 16, backgroundColor: '#F8FAFC', borderRadius: 10, alignItems: 'center', marginBottom: 16 },
  emptyText: { color: Colors.textMuted },

  historyNavBtn: { backgroundColor: Colors.surface, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: Colors.border, marginBottom: 16 },
  historyNavTitle: { fontSize: 14, fontWeight: '800', color: Colors.text },
  historyNavSub: { fontSize: 11, color: Colors.textMuted, marginTop: 2, fontWeight: '600' },
  historyNavArrow: { fontSize: 20, color: Colors.textMuted, fontWeight: '300' },

  accountActionSection: { flexDirection: 'row', gap: 10, marginTop: 8, marginBottom: 20 },
  logoutBtn: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  logoutBtnText: { color: '#475569', fontSize: 13, fontWeight: '800' },
  deleteAccountBtn: { flex: 1, backgroundColor: '#FEF2F2', borderRadius: 12, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: '#FECACA' },
  deleteAccountBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '800' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 16, width: '100%', maxHeight: '90%', elevation: 5 },
  modalTitle: { fontSize: 16, fontWeight: '900', color: Colors.text },
  modalSubTag: { fontSize: 11, fontWeight: '700', color: Colors.primary, marginTop: 2 },

  modalCloseBtn: { backgroundColor: '#F1F5F9', borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 8 },
  modalCloseBtnText: { color: Colors.text, fontSize: 14, fontWeight: '800' },

  grapeBoardContainer: { alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#E9D5FF', marginVertical: 10 },
  grapeStemText: { fontSize: 24, marginBottom: -4 },
  grapeRow: { flexDirection: 'row', gap: 8, marginVertical: 2 },
  grapeSticker: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F3E8FF', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E9D5FF' },
  grapeStickerFilled: { backgroundColor: '#FAF5FF', borderColor: '#C084FC' },
  grapeStickerText: { fontSize: 20 },
  grapeBoardStatusBox: { backgroundColor: '#F3E8FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, marginVertical: 8, alignItems: 'center' },
  grapeBoardStatusText: { fontSize: 12, color: '#6B21A8', fontWeight: '700' },
});