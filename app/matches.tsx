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
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';

interface MatchData {
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
  contact_info?: string;
  status: string; // 'open', 'matched', 'pending_result', 'completed', 'friendly'
  winner_team?: string;
  result_submitter_team?: string;
  set_scores?: string;
  host_roster?: string;
  away_roster?: string;
  created_at: string;
}

interface ApplicationData {
  id: string;
  match_id: string;
  applicant_user_id: string;
  applicant_team_name: string;
  status: string;
}

interface MemberInfo {
  user_id: string;
  full_name: string;
}

const REGIONS = ['전체', '천안', '아산', '기타'];

export default function MatchesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [myApplications, setMyApplications] = useState<ApplicationData[]>([]);
  const [myTeams, setMyTeams] = useState<string[]>([]);
  const [allTeams, setAllTeams] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('전체');

  const [selectedMatch, setSelectedMatch] = useState<MatchData | null>(null);
  const [matchApplicants, setMatchApplicants] = useState<ApplicationData[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  
  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [selectedMatchForResult, setSelectedMatchForResult] = useState<MatchData | null>(null);

  // 출전 명단 관련 State
  const [hostMembers, setHostMembers] = useState<MemberInfo[]>([]);
  const [awayMembers, setAwayMembers] = useState<MemberInfo[]>([]);
  const [selectedHostRoster, setSelectedHostRoster] = useState<string[]>([]);
  const [selectedAwayRoster, setSelectedAwayRoster] = useState<string[]>([]);

  // 배구 스코어 계산기 State
  const [scores, setScores] = useState({
    s1Host: 25, s1Away: 21,
    s2Host: 21, s2Away: 25,
    s3Host: 15, s3Away: 12,
    useSet3: false,
  });

  const [teamSelectModalVisible, setTeamSelectModalVisible] = useState(false);
  const [matchToApply, setMatchToApply] = useState<MatchData | null>(null);
  const [availableTeamsToApply, setAvailableTeamsToApply] = useState<string[]>([]);

  // 과거 경기 등록 모달 State
  const [pastModalVisible, setPastMatchModalVisible] = useState(false);
  const [pastHostTeam, setPastHostTeam] = useState('');
  const [pastAwayTeam, setPastAwayTeam] = useState('');
  const [pastMatchDate, setPastMatchDate] = useState('');
  const [pastWinner, setPastWinner] = useState('');
  const [pastSetScores, setPastSetScores] = useState('');
  const [showAwayDropdown, setShowAwayDropdown] = useState(false);

  // 달력 상태
  const [showCalendar, setShowCalendar] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);

  const currentUserId = session?.user?.id;

  const fetchData = async () => {
    try {
      if (currentUserId) {
        const { data: teamData } = await supabase.from('team_members').select('teams(name)').eq('user_id', currentUserId).eq('is_active', true);
        const teamNames = teamData?.map((tm: any) => tm.teams?.name).filter(Boolean) || [];
        setMyTeams(teamNames);
        if (teamNames.length > 0 && !pastHostTeam) {
          setPastHostTeam(teamNames[0]);
        }

        const { data: apps } = await supabase.from('match_applications').select('*').eq('applicant_user_id', currentUserId);
        if (apps) setMyApplications(apps);
      }

      const { data: teamsData } = await supabase.from('teams').select('name');
      if (teamsData) setAllTeams(teamsData.map((t: any) => t.name).filter(Boolean));

      const { data: matchData, error } = await supabase.from('matches').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      if (matchData) setMatches(matchData);
    } catch (err) {
      console.error('데이터 조회 오류:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => { fetchData(); }, [session]);
  const onRefresh = () => { setRefreshing(true); fetchData(); };

  const sendTeamNotification = async (teamName: string, title: string, message: string) => {
    try {
      const { data: teamData } = await supabase.from('teams').select('id').eq('name', teamName).maybeSingle();
      if (!teamData) return;
      const { data: members } = await supabase.from('team_members').select('user_id').eq('team_id', teamData.id).eq('is_active', true);
      if (!members || members.length === 0) return;

      const notifications = members.map((m: any) => ({ user_id: m.user_id, title, message, is_read: false }));
      await supabase.from('notifications').insert(notifications);
    } catch (err) { console.error('알림 발송 실패:', err); }
  };

  const fetchMatchTeamMembers = async (hostTeamName: string, awayTeamName?: string) => {
    try {
      let formattedH: MemberInfo[] = [];
      let formattedA: MemberInfo[] = [];

      if (hostTeamName) {
        const { data: hTeam } = await supabase.from('teams').select('id').eq('name', hostTeamName).maybeSingle();
        if (hTeam) {
          const { data: hMembers } = await supabase.from('team_members').select('user_id, profiles(full_name)').eq('team_id', hTeam.id).eq('is_active', true);
          formattedH = (hMembers || []).map((m: any) => ({ user_id: m.user_id, full_name: m.profiles?.full_name || '팀원' }));
          setHostMembers(formattedH);
        }
      }

      if (awayTeamName) {
        const { data: aTeam } = await supabase.from('teams').select('id').eq('name', awayTeamName).maybeSingle();
        if (aTeam) {
          const { data: aMembers } = await supabase.from('team_members').select('user_id, profiles(full_name)').eq('team_id', aTeam.id).eq('is_active', true);
          formattedA = (aMembers || []).map((m: any) => ({ user_id: m.user_id, full_name: m.profiles?.full_name || '팀원' }));
          setAwayMembers(formattedA);
        }
      }

      const hIds = formattedH.map(m => m.user_id);
      const aIds = formattedA.map(m => m.user_id);

      if (currentUserId && hIds.includes(currentUserId) && aIds.includes(currentUserId)) {
        setSelectedHostRoster(hIds);
        setSelectedAwayRoster(aIds.filter(id => id !== currentUserId));
      } else {
        setSelectedHostRoster(hIds);
        setSelectedAwayRoster(aIds);
      }
    } catch (err) {
      console.error('팀원 조회 실패:', err);
    }
  };

  // 상호 배타적 토글
  const toggleRosterMember = (userId: string, isHost: boolean) => {
    if (isHost) {
      setSelectedHostRoster(prev => {
        const isChecking = !prev.includes(userId);
        if (isChecking) {
          setSelectedAwayRoster(aPrev => aPrev.filter(id => id !== userId));
          return [...prev, userId];
        }
        return prev.filter(id => id !== userId);
      });
    } else {
      setSelectedAwayRoster(prev => {
        const isChecking = !prev.includes(userId);
        if (isChecking) {
          setSelectedHostRoster(hPrev => hPrev.filter(id => id !== userId));
          return [...prev, userId];
        }
        return prev.filter(id => id !== userId);
      });
    }
  };

  const filteredMatches = matches.filter(match => {
    const query = searchQuery.toLowerCase();
    const passSearch = !searchQuery || 
      match.host_team_name.toLowerCase().includes(query) ||
      (match.away_team_name && match.away_team_name.toLowerCase().includes(query)) ||
      match.location.toLowerCase().includes(query);

    let passRegion = true;
    if (selectedRegion !== '전체') {
      const matchRegion = match.region || '천안';
      if (selectedRegion === '기타') {
        passRegion = matchRegion !== '천안' && matchRegion !== '아산';
      } else { passRegion = matchRegion === selectedRegion; }
    }
    return passSearch && passRegion;
  });

  const handleApplyMatch = (match: MatchData) => {
    if (!currentUserId || myTeams.length === 0) return Alert.alert('알림', '가입된 소속 팀이 없습니다.');
    const availableTeams = myTeams.filter((t) => t !== match.host_team_name);
    if (availableTeams.length === 0) return Alert.alert('알림', `'${match.host_team_name}' 소속으로는 신청 불가합니다.`);

    if (availableTeams.length === 1) confirmApply(match, availableTeams[0]);
    else { setMatchToApply(match); setAvailableTeamsToApply(availableTeams); setTeamSelectModalVisible(true); }
  };

  const confirmApply = (match: MatchData, teamName: string) => {
    const alreadyApplied = myApplications.some((app) => app.match_id === match.id && app.applicant_team_name === teamName);
    if (alreadyApplied) return Alert.alert('알림', `'${teamName}' 팀으로 이미 신청했습니다.`);

    Alert.alert('참가 신청', `'${teamName}' 소속으로 신청하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '신청하기',
        onPress: async () => {
          setTeamSelectModalVisible(false);
          setActionLoading(true);
          try {
            const { data: insertedApp, error } = await supabase.from('match_applications').insert({ match_id: match.id, applicant_user_id: currentUserId, applicant_team_name: teamName, status: 'pending' }).select().single();
            if (error) throw error;
            if (insertedApp) setMyApplications(prev => [...prev, insertedApp]);

            await sendTeamNotification(match.host_team_name, '🔔 [참가 신청 도착]', `'${teamName}' 팀이 매칭을 신청했습니다.`);
            await sendTeamNotification(teamName, '✅ [신청 완료]', `'${match.host_team_name}' 팀에 참가 신청을 보냈습니다.`);
            Alert.alert('신청 완료!', '주최 팀에 신청이 전달되었습니다.');
          } catch (err: any) { Alert.alert('오류', err.message); } 
          finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const handleCancelApplication = (match: MatchData) => {
    const myApp = myApplications.find(a => a.match_id === match.id && myTeams.includes(a.applicant_team_name));
    if (!myApp) return;

    Alert.alert('신청 취소', `'${myApp.applicant_team_name}' 참가 신청을 취소하시겠습니까?`, [
      { text: '닫기', style: 'cancel' },
      {
        text: '신청 취소', style: 'destructive',
        onPress: async () => {
          setActionLoading(true);
          try {
            await supabase.from('match_applications').delete().eq('id', myApp.id);
            setMyApplications(prev => prev.filter(a => a.id !== myApp.id));
            if (match.status === 'matched' && match.away_team_name === myApp.applicant_team_name) {
              await supabase.from('matches').update({ status: 'open', away_team_name: null }).eq('id', match.id);
              setMatches(prev => prev.map(m => m.id === match.id ? { ...m, status: 'open', away_team_name: undefined } : m));
            }
            await sendTeamNotification(match.host_team_name, '🚨 [참가 신청 취소]', `'${myApp.applicant_team_name}' 팀이 신청을 취소했습니다.`);
            Alert.alert('취소 완료', '참가 신청이 취소되었습니다.');
          } catch (err: any) { Alert.alert('오류', err.message); } 
          finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const openApplicantModal = async (match: MatchData) => {
    setSelectedMatch(match);
    setActionLoading(true);
    try {
      const { data } = await supabase.from('match_applications').select('*').eq('match_id', match.id).eq('status', 'pending');
      setMatchApplicants(data || []);
      setModalVisible(true);
    } finally { setActionLoading(false); }
  };

  const handleAcceptApplicant = async (app: ApplicationData) => {
    if (!selectedMatch) return;
    Alert.alert('매칭 수락', `'${app.applicant_team_name}' 팀의 신청을 수락하시겠습니까?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '수락',
        onPress: async () => {
          setActionLoading(true);
          try {
            await supabase.from('matches').update({ status: 'matched', away_team_name: app.applicant_team_name }).eq('id', selectedMatch.id);
            await supabase.from('match_applications').update({ status: 'accepted' }).eq('id', app.id);
            setMatches(prev => prev.map(m => m.id === selectedMatch.id ? { ...m, status: 'matched', away_team_name: app.applicant_team_name } : m));
            await sendTeamNotification(selectedMatch.host_team_name, '🎉 [매칭 완료]', `'${app.applicant_team_name}' 팀과의 매칭이 확정되었습니다.`);
            await sendTeamNotification(app.applicant_team_name, '🎉 [매칭 완료]', `'${selectedMatch.host_team_name}' 팀과의 매칭이 성사되었습니다!`);
            Alert.alert('매칭 완료! 🏐', '매칭 확정 알림이 전송되었습니다.');
            setModalVisible(false);
          } finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const handleDeleteMatch = (match: MatchData) => {
    Alert.alert(
      '⚠️ 경기 완전 삭제 확인',
      '경기를 삭제하면 상대 팀의 기록과 해당 경기의 모든 데이터가 완전히 지워집니다.\n\n개인 전적만 제외하고 싶다면 결과 수정 팝업에서 명단 체크를 해제하세요.',
      [
        { text: '취소', style: 'cancel' },
        {
          text: '완전 삭제하기',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await supabase.from('matches').delete().eq('id', match.id);
              setMatches(prev => prev.filter(m => m.id !== match.id));
              Alert.alert('삭제 완료', '경기 기록이 완전히 삭제되었습니다.');
            } catch (err: any) { Alert.alert('오류', err.message); } 
            finally { setActionLoading(false); }
          }
        }
      ]
    );
  };

  const updateScore = (field: string, delta: number) => {
    setScores(prev => {
      const current = (prev as any)[field] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [field]: next };
    });
  };

  const setDirectScore = (field: string, val: number) => {
    setScores(prev => ({ ...prev, [field]: val }));
  };

  const generateSetScoreString = () => {
    let str = `${scores.s1Host}:${scores.s1Away}, ${scores.s2Host}:${scores.s2Away}`;
    if (scores.useSet3) {
      str += `, ${scores.s3Host}:${scores.s3Away}`;
    }
    return str;
  };

  const handleSaveResult = async (winner: string) => {
    if (!selectedMatchForResult) return;
    
    const myTeamInMatch = myTeams.includes(selectedMatchForResult.host_team_name)
      ? selectedMatchForResult.host_team_name
      : selectedMatchForResult.away_team_name;

    if (!myTeamInMatch) return Alert.alert('오류', '소속 팀 정보를 확인할 수 없습니다.');

    const otherTeam = myTeamInMatch === selectedMatchForResult.host_team_name
      ? selectedMatchForResult.away_team_name
      : selectedMatchForResult.host_team_name;

    const formattedScores = generateSetScoreString();

    setActionLoading(true);
    try {
      const updateData = {
        status: 'pending_result',
        winner_team: winner,
        result_submitter_team: myTeamInMatch,
        set_scores: formattedScores,
        host_roster: selectedHostRoster.join(','),
        away_roster: selectedAwayRoster.join(','),
      };

      await supabase.from('matches').update(updateData).eq('id', selectedMatchForResult.id);
      
      setMatches(prev => prev.map(m => m.id === selectedMatchForResult.id ? { ...m, ...updateData } : m));

      const resultMsg = winner === 'draw' ? '무승부' : `'${winner}' 승리`;
      
      if (otherTeam) {
        await sendTeamNotification(
          otherTeam, 
          '⚠️ [경기 결과 수정 승인 요청]', 
          `'${myTeamInMatch}'팀이 경기 결과를 [${resultMsg}] (${formattedScores})로 수정했습니다. 동의해 주세요.`
        );
      }

      Alert.alert('수정 전달 완료', '상대 팀에 수정 승인 요청이 전송되었습니다. 상대가 동의하면 변경된 랭킹이 최종 확정됩니다.');
      setResultModalVisible(false);
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally { 
      setActionLoading(false); 
    }
  };

  const handleApproveResult = (match: MatchData, isApproved: boolean) => {
    Alert.alert(
      isApproved ? '결과 승인' : '결과 거절',
      isApproved ? '해당 경기 결과를 공식 전적으로 승인하시겠습니까?' : '결과를 거절하고 기록을 삭제하시겠습니까?',
      [
        { text: '취소', style: 'cancel' },
        {
          text: isApproved ? '승인 (공식 반영)' : '거절 (기록 삭제)',
          style: isApproved ? 'default' : 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              if (isApproved) {
                await supabase.from('matches').update({ status: 'completed' }).eq('id', match.id);
                setMatches(prev => prev.map(m => m.id === match.id ? { ...m, status: 'completed' } : m));
                
                const otherTeam = myTeams.includes(match.host_team_name) ? match.away_team_name : match.host_team_name;
                if (otherTeam) {
                  await sendTeamNotification(otherTeam, '✅ [결과 승인 완료]', `상대 팀이 결과를 승인하여 공식 랭킹에 정식 반영되었습니다.`);
                }
                Alert.alert('승인 완료', '공식 전적으로 랭킹에 반영되었습니다.');
              } else {
                await supabase.from('matches').delete().eq('id', match.id);
                setMatches(prev => prev.filter(m => m.id !== match.id));
                
                const otherTeam = myTeams.includes(match.host_team_name) ? match.away_team_name : match.host_team_name;
                if (otherTeam) {
                  await sendTeamNotification(otherTeam, '❌ [결과 거절]', `상대 팀이 제출된 경기 결과를 거절하여 기록이 삭제되었습니다.`);
                }
                Alert.alert('거절 완료', '상호 합의되지 않아 기록이 삭제되었습니다.');
              }
            } catch (err: any) { Alert.alert('오류', err.message); }
            finally { setActionLoading(false); }
          }
        }
      ]
    );
  };

  const handleRegisterPastMatch = async () => {
    if (!pastHostTeam || !pastAwayTeam || !pastMatchDate || !pastWinner) {
      return Alert.alert('알림', '모든 항목을 입력/선택해 주세요.');
    }
    if (pastHostTeam === pastAwayTeam) return Alert.alert('알림', '주최 팀과 상대 팀은 달라야 합니다.');

    setActionLoading(true);
    try {
      const isRegisteredTeam = allTeams.includes(pastAwayTeam);
      const matchStatus = isRegisteredTeam ? 'pending_result' : 'friendly';
      
      const { data: newMatch, error } = await supabase
        .from('matches')
        .insert({
          host_user_id: currentUserId,
          host_team_name: pastHostTeam,
          away_team_name: pastAwayTeam,
          match_date: pastMatchDate,
          match_time: '과거 경기',
          location: isRegisteredTeam ? '공식 기록 경기' : '비공식 친선 경기',
          format: isRegisteredTeam ? '공식전' : '친선전',
          description: isRegisteredTeam ? '상대팀의 승인을 기다리고 있습니다.' : '미등록 팀과의 비공식 친선 경기입니다. (랭킹 제외)',
          status: matchStatus,
          winner_team: pastWinner,
          result_submitter_team: pastHostTeam,
          set_scores: pastSetScores.trim() || null,
          host_roster: currentUserId ? currentUserId : null,
        })
        .select().single();

      if (error) throw error;

      const resultMsg = pastWinner === 'draw' ? '무승부' : `'${pastWinner}' 승리`;

      if (isRegisteredTeam) {
        await sendTeamNotification(pastAwayTeam, '⚠️ [과거 기록 승인 요청]', `'${pastHostTeam}'팀이 과거 경기 결과를 [${resultMsg}]로 등록했습니다. 앱에서 승인해주세요.`);
        Alert.alert('요청 완료', '상대 팀(등록팀)에게 결과 승인 요청을 보냈습니다.');
      } else {
        Alert.alert('친선 경기 기록 완료', '미등록 팀과의 경기이므로 랭킹 승점에는 포함되지 않는 친선 기록으로 저장되었습니다.');
      }

      if (newMatch) setMatches(prev => [newMatch, ...prev]);

      setPastMatchModalVisible(false);
      setPastHostTeam(''); setPastAwayTeam(''); setPastMatchDate(''); setPastWinner(''); setPastSetScores('');
    } catch (err: any) { Alert.alert('오류', err.message); } 
    finally { setActionLoading(false); }
  };

  const filteredAwayTeams = allTeams.filter((t) => t !== pastHostTeam && t.toLowerCase().includes(pastAwayTeam.toLowerCase()));
  const changeMonth = (delta: number) => {
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
          <TouchableOpacity onPress={() => changeMonth(-1)} style={styles.calNavBtn}><Text style={styles.calNavText}>‹</Text></TouchableOpacity>
          <Text style={styles.calTitleText}>{calYear}년 {calMonth}월</Text>
          <TouchableOpacity onPress={() => changeMonth(1)} style={styles.calNavBtn}><Text style={styles.calNavText}>›</Text></TouchableOpacity>
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
            const isSelected = pastMatchDate === dateStr;
            return (
              <TouchableOpacity key={idx} style={[styles.dayBox, isSelected && styles.selectedDayBox]} onPress={() => { setPastMatchDate(dateStr); setShowCalendar(false); }}>
                <Text style={[styles.dayText, isSelected && styles.selectedDayText]}>{day}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} hitSlop={10}><Text style={styles.backText}>‹</Text></TouchableOpacity>
        <Text style={styles.headerTitle}>경기 목록</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]} onPress={() => setPastMatchModalVisible(true)}>
            <Text style={[styles.addBtnText, { color: '#B45309' }]}>📜 과거기록</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/create-match')}><Text style={styles.addBtnText}>+ 등록</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput style={styles.searchInput} placeholder="검색" value={searchQuery} onChangeText={setSearchQuery} />
      </View>

      <View style={styles.regionTabsContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.regionScroll}>
          {REGIONS.map((region) => (
            <TouchableOpacity key={region} style={[styles.regionTab, selectedRegion === region && styles.regionTabActive]} onPress={() => setSelectedRegion(region)}>
              <Text style={[styles.regionTabText, selectedRegion === region && styles.regionTabTextActive]}>{region}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        {loading ? <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} /> : 
          filteredMatches.map((match) => {
            const isHost = myTeams.includes(match.host_team_name);
            const isAway = match.away_team_name && myTeams.includes(match.away_team_name);
            const myApp = myApplications.find((app) => app.match_id === match.id);
            const isMyMatch = isHost || isAway;
            
            const isCompleted = match.status === 'completed';
            const isFriendly = match.status === 'friendly';
            const isPending = match.status === 'pending_result';
            const isMatched = match.status === 'matched';

            const isBothTeams = isHost && isAway;
            const submitterIsMyHostTeam = match.result_submitter_team === match.host_team_name;
            const submitterIsMyAwayTeam = match.result_submitter_team === match.away_team_name;

            const canApprove = isBothTeams
              ? true
              : (isHost && submitterIsMyAwayTeam) || (isAway && submitterIsMyHostTeam);

            const availableNonHostTeams = myTeams.filter(t => t !== match.host_team_name);

            return (
              <View key={match.id} style={styles.matchCard}>
                <View style={styles.cardHeader}>
                  <View style={styles.teamInfo}>
                    <Text style={styles.hostTeamText}>{match.host_team_name}</Text>
                    <Text style={styles.vsText}>VS</Text>
                    <Text style={[styles.awayTeamText, !match.away_team_name && styles.textMuted]}>{match.away_team_name || '상대 모집중'}</Text>
                  </View>
                  <View style={[
                    styles.statusBadge, 
                    isCompleted ? styles.statusCompleted : isFriendly ? styles.statusFriendly : isPending ? styles.statusPending : isMatched ? styles.statusMatched : styles.statusOpen
                  ]}>
                    <Text style={[
                      styles.statusText, 
                      isCompleted ? styles.statusTextCompleted : isFriendly ? styles.statusTextFriendly : isPending ? styles.statusTextPending : isMatched ? styles.statusTextMatched : styles.statusTextOpen
                    ]}>
                      {isCompleted ? '⚫ 공식종료' : isFriendly ? '⚪ 친선종료' : isPending ? '🟡 결과확인중' : isMatched ? '🔵 매칭완료' : '🟢 모집중'}
                    </Text>
                  </View>
                </View>

                <View style={styles.matchDetails}>
                  <View style={styles.detailRow}><Text style={styles.detailIcon}>📅</Text><Text style={styles.detailText}>{match.match_date} ({match.match_time})</Text></View>
                  <View style={styles.detailRow}><Text style={styles.detailIcon}>📍</Text><Text style={styles.detailText}>[{match.region || '천안'}] {match.location}</Text></View>
                </View>

                {match.description ? (
                  <View style={styles.descriptionBox}>
                    <Text style={styles.descriptionText}>"{match.description}"</Text>
                  </View>
                ) : null}

                <View style={{ marginTop: 16 }}>
                  {/* 공식 종료 카드 */}
                  {isCompleted && (
                    <View style={{ gap: 8 }}>
                      <View style={styles.completedBanner}>
                        <Text style={styles.completedBannerText}>
                          🏆 공식 전적: {match.winner_team === 'draw' ? '무승부' : `${match.winner_team} 승리!`}
                        </Text>
                        {match.set_scores ? (
                          <Text style={styles.setScoreText}>📊 세트 점수: {match.set_scores}</Text>
                        ) : null}
                      </View>
                      {isMyMatch && (
                        <TouchableOpacity style={[styles.resultInputBtn, { backgroundColor: '#475569' }]} onPress={() => { setSelectedMatchForResult(match); fetchMatchTeamMembers(match.host_team_name, match.away_team_name); setResultModalVisible(true); }}>
                          <Text style={styles.resultInputBtnText}>✏️ 경기 결과 / 스코어 재수정 요청</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* 친선 종료 카드 */}
                  {isFriendly && (
                    <View style={{ gap: 8 }}>
                      <View style={[styles.completedBanner, { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' }]}>
                        <Text style={[styles.completedBannerText, { color: '#64748B' }]}>
                          🤝 친선 기록: {match.winner_team === 'draw' ? '무승부' : `${match.winner_team} 승리!`}
                        </Text>
                        {match.set_scores ? (
                          <Text style={styles.setScoreText}>📊 세트 점수: {match.set_scores}</Text>
                        ) : null}
                      </View>
                      {isMyMatch && (
                        <TouchableOpacity style={[styles.resultInputBtn, { backgroundColor: '#475569' }]} onPress={() => { setSelectedMatchForResult(match); fetchMatchTeamMembers(match.host_team_name, match.away_team_name); setResultModalVisible(true); }}>
                          <Text style={styles.resultInputBtnText}>✏️ 친선 스코어 재수정 요청</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* 승인 대기중 */}
                  {isPending && (
                    <View style={{ gap: 8 }}>
                      <View style={styles.pendingBanner}>
                        <Text style={styles.pendingBannerText}>
                          제출된 결과: {match.winner_team === 'draw' ? '무승부' : `'${match.winner_team}' 승리`}
                          {match.set_scores ? ` (${match.set_scores})` : ''}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#B45309', marginTop: 2 }}>
                          (제출 팀: {match.result_submitter_team || '상대팀'})
                        </Text>
                      </View>
                      
                      {canApprove ? (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                          <TouchableOpacity style={[styles.resultInputBtn, { flex: 1.2, backgroundColor: '#10B981' }]} onPress={() => handleApproveResult(match, true)}>
                            <Text style={styles.resultInputBtnText}>✅ 승인</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.resultInputBtn, { flex: 1.2, backgroundColor: '#3B82F6' }]} onPress={() => { setSelectedMatchForResult(match); fetchMatchTeamMembers(match.host_team_name, match.away_team_name); setResultModalVisible(true); }}>
                            <Text style={styles.resultInputBtnText}>✏️ 수정 제출</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={[styles.cancelAppBtn, { flex: 1, paddingVertical: 14 }]} onPress={() => handleApproveResult(match, false)}>
                            <Text style={styles.cancelAppBtnText}>❌ 거절</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        <Text style={{ textAlign: 'center', marginTop: 4, color: '#64748B', fontSize: 13, fontWeight: '700' }}>
                          ⏳ 상대팀의 결과 승인을 기다리고 있습니다.
                        </Text>
                      )}
                    </View>
                  )}

                  {/* 매칭 완료 */}
                  {isMatched && (
                    <View style={{ gap: 10 }}>
                      <View style={styles.matchedBanner}><Text style={styles.matchedBannerText}>🎉 매칭 완료! 경기 후 결과를 입력해 주세요.</Text></View>
                      {isMyMatch && (
                        <TouchableOpacity style={styles.resultInputBtn} onPress={() => { setSelectedMatchForResult(match); fetchMatchTeamMembers(match.host_team_name, match.away_team_name); setResultModalVisible(true); }}>
                          <Text style={styles.resultInputBtnText}>🏆 경기 결과/세트점수 입력하기</Text>
                        </TouchableOpacity>
                      )}
                      {isAway && (
                        <TouchableOpacity style={styles.cancelAppBtn} onPress={() => handleCancelApplication(match)}>
                          <Text style={styles.cancelAppBtnText}>🚨 매칭 취소하기 (포기)</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

                  {/* 모집 중 */}
                  {match.status === 'open' && (
                    <View style={{ gap: 8 }}>
                      {isHost && (
                        <View style={{ flexDirection: 'row', gap: 10 }}>
                          <TouchableOpacity style={styles.hostManageBtn} onPress={() => openApplicantModal(match)}>
                            <Text style={styles.hostManageBtnText}>📋 참가 신청 승인하기</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteMatch(match)}>
                            <Text style={styles.deleteBtnText}>🗑️</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {myApp ? (
                        <View style={styles.appliedRow}>
                          <View style={styles.appliedBadge}>
                            <Text style={styles.appliedBadgeText}>✅ 신청 완료 ({myApp.applicant_team_name})</Text>
                          </View>
                          <TouchableOpacity style={styles.cancelAppBtn} onPress={() => handleCancelApplication(match)}>
                            <Text style={styles.cancelAppBtnText}>🚨 신청 취소</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        availableNonHostTeams.length > 0 && (
                          <TouchableOpacity style={styles.applyBtn} onPress={() => handleApplyMatch(match)}>
                            <Text style={styles.applyBtnText}>
                              {isHost ? '✨ 내 다른 소속 팀으로 참가 신청' : '이 경기에 참가 신청하기'}
                            </Text>
                          </TouchableOpacity>
                        )
                      )}
                    </View>
                  )}
                </View>
              </View>
            );
          })
        }
      </ScrollView>

      {/* 모달: 결과 입력 및 수정 */}
      <Modal visible={resultModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🏆 경기 결과 & 세트 점수 입력</Text>
            <Text style={styles.modalSub}>버튼을 터치하여 스코어를 손쉽게 조절하세요.</Text>
            {selectedMatchForResult && (
              <ScrollView style={{ maxHeight: 420, marginVertical: 10 }} showsVerticalScrollIndicator={false}>
                
                {/* 배구 전용 스코어 계산기 */}
                <View style={styles.scoreCalcBox}>
                  {/* 1세트 */}
                  <View style={styles.setRow}>
                    <Text style={styles.setLabel}>1세트</Text>
                    <View style={styles.teamScoreCol}>
                      <Text style={styles.teamScoreLabel}>{selectedMatchForResult.host_team_name}</Text>
                      <View style={styles.stepperRow}>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => updateScore('s1Host', -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                        <Text style={styles.scoreValText}>{scores.s1Host}</Text>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => updateScore('s1Host', 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                      </View>
                      <View style={styles.quickScoreRow}>
                        <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectScore('s1Host', 25)}><Text style={styles.quickBtnText}>25</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectScore('s1Host', 21)}><Text style={styles.quickBtnText}>21</Text></TouchableOpacity>
                      </View>
                    </View>

                    <Text style={styles.vsColon}>:</Text>

                    <View style={styles.teamScoreCol}>
                      <Text style={styles.teamScoreLabel}>{selectedMatchForResult.away_team_name || '상대팀'}</Text>
                      <View style={styles.stepperRow}>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => updateScore('s1Away', -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                        <Text style={styles.scoreValText}>{scores.s1Away}</Text>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => updateScore('s1Away', 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                      </View>
                      <View style={styles.quickScoreRow}>
                        <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectScore('s1Away', 25)}><Text style={styles.quickBtnText}>25</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectScore('s1Away', 21)}><Text style={styles.quickBtnText}>21</Text></TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* 2세트 */}
                  <View style={[styles.setRow, { marginTop: 10 }]}>
                    <Text style={styles.setLabel}>2세트</Text>
                    <View style={styles.teamScoreCol}>
                      <View style={styles.stepperRow}>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => updateScore('s2Host', -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                        <Text style={styles.scoreValText}>{scores.s2Host}</Text>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => updateScore('s2Host', 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                      </View>
                      <View style={styles.quickScoreRow}>
                        <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectScore('s2Host', 25)}><Text style={styles.quickBtnText}>25</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectScore('s2Host', 21)}><Text style={styles.quickBtnText}>21</Text></TouchableOpacity>
                      </View>
                    </View>

                    <Text style={styles.vsColon}>:</Text>

                    <View style={styles.teamScoreCol}>
                      <View style={styles.stepperRow}>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => updateScore('s2Away', -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                        <Text style={styles.scoreValText}>{scores.s2Away}</Text>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => updateScore('s2Away', 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                      </View>
                      <View style={styles.quickScoreRow}>
                        <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectScore('s2Away', 25)}><Text style={styles.quickBtnText}>25</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectScore('s2Away', 21)}><Text style={styles.quickBtnText}>21</Text></TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  {/* 3세트 토글 */}
                  <TouchableOpacity 
                    style={[styles.toggleSet3Btn, scores.useSet3 && styles.toggleSet3BtnActive]}
                    onPress={() => setScores(prev => ({ ...prev, useSet3: !prev.useSet3 }))}
                  >
                    <Text style={[styles.toggleSet3Text, scores.useSet3 && styles.toggleSet3TextActive]}>
                      {scores.useSet3 ? '✓ 3세트 경기 입력 중' : '+ 3세트 (파이널 세트) 추가하기'}
                    </Text>
                  </TouchableOpacity>

                  {scores.useSet3 && (
                    <View style={[styles.setRow, { marginTop: 10 }]}>
                      <Text style={styles.setLabel}>3세트</Text>
                      <View style={styles.teamScoreCol}>
                        <View style={styles.stepperRow}>
                          <TouchableOpacity style={styles.stepBtn} onPress={() => updateScore('s3Host', -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                          <Text style={styles.scoreValText}>{scores.s3Host}</Text>
                          <TouchableOpacity style={styles.stepBtn} onPress={() => updateScore('s3Host', 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                        </View>
                        <View style={styles.quickScoreRow}>
                          <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectScore('s3Host', 15)}><Text style={styles.quickBtnText}>15</Text></TouchableOpacity>
                        </View>
                      </View>

                      <Text style={styles.vsColon}>:</Text>

                      <View style={styles.teamScoreCol}>
                        <View style={styles.stepperRow}>
                          <TouchableOpacity style={styles.stepBtn} onPress={() => updateScore('s3Away', -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                          <Text style={styles.scoreValText}>{scores.s3Away}</Text>
                          <TouchableOpacity style={styles.stepBtn} onPress={() => updateScore('s3Away', 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                        </View>
                        <View style={styles.quickScoreRow}>
                          <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectScore('s3Away', 15)}><Text style={styles.quickBtnText}>15</Text></TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  )}
                </View>

                {/* 출전 멤버 선택 */}
                <Text style={styles.inputLabel}>👥 [{selectedMatchForResult.host_team_name}] 출전 멤버 (체크)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {hostMembers.map(m => {
                    const isChecked = selectedHostRoster.includes(m.user_id);
                    return (
                      <TouchableOpacity
                        key={m.user_id}
                        style={[styles.rosterChip, isChecked && styles.rosterChipActive]}
                        onPress={() => toggleRosterMember(m.user_id, true)}
                      >
                        <Text style={[styles.rosterChipText, isChecked && styles.rosterChipTextActive]}>
                          {isChecked ? '✅ ' : '⬜ '}{m.full_name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {selectedMatchForResult.away_team_name ? (
                  <>
                    <Text style={styles.inputLabel}>👥 [{selectedMatchForResult.away_team_name}] 출전 멤버 (체크)</Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                      {awayMembers.map(m => {
                        const isChecked = selectedAwayRoster.includes(m.user_id);
                        return (
                          <TouchableOpacity
                            key={m.user_id}
                            style={[styles.rosterChip, isChecked && styles.rosterChipActive]}
                            onPress={() => toggleRosterMember(m.user_id, false)}
                          >
                            <Text style={[styles.rosterChipText, isChecked && styles.rosterChipTextActive]}>
                              {isChecked ? '✅ ' : '⬜ '}{m.full_name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : null}

                <Text style={[styles.inputLabel, { marginTop: 6 }]}>🥇 최종 승리 팀 선택</Text>
                <View style={{ gap: 8, marginBottom: 10 }}>
                  <TouchableOpacity style={styles.winnerSelectBtn} onPress={() => handleSaveResult(selectedMatchForResult.host_team_name)}>
                    <Text style={styles.winnerSelectText}>🥇 {selectedMatchForResult.host_team_name} 승리</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.winnerSelectBtn} onPress={() => handleSaveResult(selectedMatchForResult.away_team_name || '')}>
                    <Text style={styles.winnerSelectText}>🥇 {selectedMatchForResult.away_team_name} 승리</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.winnerSelectBtn, { backgroundColor: '#F1F5F9' }]} onPress={() => handleSaveResult('draw')}>
                    <Text style={[styles.winnerSelectText, { color: '#475569' }]}>🤝 무승부</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setResultModalVisible(false)}><Text style={styles.closeBtnText}>취소</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🔥 과거 기록 생성 모달 (팀 선택 칩 스타일 완벽 수정!) */}
      <Modal visible={pastModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📜 과거 경기 결과 입력</Text>
            <Text style={styles.modalSub}>앱에 미등록된 과거 경기 전적을 기록합니다.</Text>
            <ScrollView style={{ maxHeight: 400, marginVertical: 10 }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
              
              {/* 🔥 핵심 수정: 과거 기록 전용 팀 선택 칩 스타일 적용 */}
              <Text style={styles.inputLabel}>1. 내 출전 팀 선택</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 }}>
                {myTeams.map((t) => {
                  const isSelected = pastHostTeam === t;
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.teamSelectChip, isSelected && styles.teamSelectChipActive]}
                      onPress={() => setPastHostTeam(t)}
                    >
                      <Text style={[styles.teamSelectChipText, isSelected && styles.teamSelectChipTextActive]}>
                        🏐 {t}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              
              <Text style={styles.inputLabel}>2. 상대 팀명</Text>
              <View style={{ position: 'relative', zIndex: 10, marginBottom: 14 }}>
                <TextInput
                  style={styles.textInput}
                  placeholder="미등록 팀 입력 시 친선경기로 분류됩니다"
                  value={pastAwayTeam}
                  onChangeText={(txt) => { setPastAwayTeam(txt); setShowAwayDropdown(true); }}
                  onFocus={() => setShowAwayDropdown(true)}
                />
                {showAwayDropdown && pastAwayTeam.length > 0 && filteredAwayTeams.length > 0 && (
                  <View style={styles.dropdownBox}>
                    <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled={true}>
                      {filteredAwayTeams.map((t) => (
                        <TouchableOpacity key={t} style={styles.dropdownItem} onPress={() => { setPastAwayTeam(t); setShowAwayDropdown(false); }}>
                          <Text style={styles.dropdownItemText}>🏐 {t} (공식 등록팀)</Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>
                )}
              </View>

              <Text style={styles.inputLabel}>3. 경기 날짜</Text>
              <TouchableOpacity style={styles.datePickerBtn} onPress={() => setShowCalendar(!showCalendar)}>
                <Text style={styles.datePickerBtnText}>{pastMatchDate ? `📅 ${pastMatchDate}` : '📅 날짜 선택 (달력 열기)'}</Text>
              </TouchableOpacity>
              {showCalendar && renderCalendarGrid()}

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>4. 세부 세트 스코어 (선택입력)</Text>
              <TextInput
                style={[styles.textInput, { marginBottom: 14 }]}
                placeholder="예: 25:21, 21:25, 15:12"
                value={pastSetScores}
                onChangeText={setPastSetScores}
              />

              {pastHostTeam && pastAwayTeam ? (
                <>
                  <Text style={styles.inputLabel}>5. 경기 승리 팀 선택</Text>
                  <View style={{ gap: 8, marginBottom: 10 }}>
                    <TouchableOpacity style={[styles.winnerSelectBtn, pastWinner === pastHostTeam && { backgroundColor: '#3B82F6' }]} onPress={() => setPastWinner(pastHostTeam)}>
                      <Text style={[styles.winnerSelectText, pastWinner === pastHostTeam && { color: '#FFFFFF' }]}>🥇 {pastHostTeam} 승리</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.winnerSelectBtn, pastWinner === pastAwayTeam && { backgroundColor: '#3B82F6' }]} onPress={() => setPastWinner(pastAwayTeam)}>
                      <Text style={[styles.winnerSelectText, pastWinner === pastAwayTeam && { color: '#FFFFFF' }]}>🥇 {pastAwayTeam} 승리</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.winnerSelectBtn, pastWinner === 'draw' && { backgroundColor: '#64748B' }]} onPress={() => setPastWinner('draw')}>
                      <Text style={[styles.winnerSelectText, pastWinner === 'draw' && { color: '#FFFFFF' }]}>🤝 무승부</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : null}
            </ScrollView>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
              <TouchableOpacity style={[styles.closeBtn, { flex: 1, marginTop: 0 }]} onPress={() => { setPastMatchModalVisible(false); setShowCalendar(false); }}><Text style={styles.closeBtnText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.resultInputBtn, { flex: 2 }]} onPress={handleRegisterPastMatch}><Text style={styles.resultInputBtnText}>🏆 기록 저장</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>참가 신청 현황</Text>
            {matchApplicants.length === 0 ? (
              <Text style={{ textAlign:'center', marginVertical:20, color:'#94A3B8' }}>아직 신청팀이 없습니다.</Text>
            ) : (
              matchApplicants.map(app => (
                <View key={app.id} style={styles.applicantRow}>
                  <Text style={styles.applicantTeamName}>🏐 {app.applicant_team_name}</Text>
                  <TouchableOpacity style={styles.acceptBtn} onPress={() => handleAcceptApplicant(app)}>
                    <Text style={styles.acceptBtnText}>수락</Text>
                  </TouchableOpacity>
                </View>
              ))
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}><Text style={styles.closeBtnText}>닫기</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={teamSelectModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>출전 팀 선택</Text>
            <Text style={styles.modalSub}>어느 팀 소속으로 참가 신청하시겠습니까?</Text>
            <View style={{ marginVertical: 16, gap: 10 }}>
              {availableTeamsToApply.map((teamName) => (
                <TouchableOpacity key={teamName} style={styles.winnerSelectBtn} onPress={() => matchToApply && confirmApply(matchToApply, teamName)}>
                  <Text style={styles.winnerSelectText}>🏐 {teamName}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setTeamSelectModalVisible(false)}><Text style={styles.closeBtnText}>취소</Text></TouchableOpacity>
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
  addBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  addBtnText: { color: '#1D4ED8', fontWeight: '700', fontSize: 14 },
  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, margin: 16, marginBottom: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
  searchIcon: { fontSize: 16, marginRight: 8 },
  searchInput: { flex: 1, fontSize: 15, color: Colors.text },
  regionTabsContainer: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  regionScroll: { gap: 8 },
  regionTab: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: 'transparent' },
  regionTabActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  regionTabText: { fontSize: 14, fontWeight: '600', color: '#64748B' },
  regionTabTextActive: { color: '#1D4ED8', fontWeight: '800' },
  content: { padding: 20, gap: 16, paddingBottom: 40 },
  matchCard: { backgroundColor: Colors.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: Colors.border, elevation: 2 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  teamInfo: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  hostTeamText: { fontSize: 17, fontWeight: '800', color: Colors.primary },
  vsText: { fontSize: 13, fontWeight: '800', color: '#94A3B8' },
  awayTeamText: { fontSize: 17, fontWeight: '800', color: '#0284C7' },
  textMuted: { color: '#94A3B8', fontSize: 15, fontWeight: '600' },
  
  statusBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1 },
  statusOpen: { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' },
  statusMatched: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  statusPending: { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' },
  statusFriendly: { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' },
  statusCompleted: { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
  statusText: { fontSize: 12, fontWeight: '700' },
  statusTextOpen: { color: '#166534' },
  statusTextMatched: { color: '#1D4ED8' },
  statusTextPending: { color: '#B45309' },
  statusTextFriendly: { color: '#64748B' },
  statusTextCompleted: { color: '#334155' },

  matchDetails: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailIcon: { fontSize: 15 },
  detailText: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  descriptionBox: { marginTop: 14, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: '#93C5FD' },
  descriptionText: { fontSize: 13, color: '#64748B', fontStyle: 'italic' },
  
  hostManageBtn: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  hostManageBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  deleteBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5', justifyContent: 'center', alignItems: 'center' },
  deleteBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  resultInputBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  resultInputBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  applyBtn: { backgroundColor: '#0EA5E9', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  applyBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  appliedRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  appliedBadge: { flex: 1, backgroundColor: '#F0FDF4', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#BBF7D0' },
  appliedBadgeText: { color: '#15803D', fontSize: 13, fontWeight: '700' },
  cancelAppBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', paddingHorizontal: 12, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  cancelAppBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '700' },
  matchedBanner: { backgroundColor: '#EFF6FF', padding: 12, borderRadius: 10, alignItems: 'center' },
  matchedBannerText: { color: '#1E40AF', fontSize: 13, fontWeight: '600' },
  completedBanner: { backgroundColor: '#F1F5F9', padding: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0' },
  completedBannerText: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
  setScoreText: { fontSize: 13, fontWeight: '700', color: '#2563EB', marginTop: 4 },
  pendingBanner: { backgroundColor: '#FEFCE8', padding: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1, borderColor: '#FEF08A' },
  pendingBannerText: { color: '#A16207', fontSize: 13, fontWeight: '700' },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, width: '100%', shadowColor: '#000', elevation: 5 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: Colors.text, marginBottom: 4 },
  modalSub: { fontSize: 13, color: Colors.textMuted, marginBottom: 12 },
  applicantRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: Colors.border },
  applicantTeamName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  acceptBtn: { backgroundColor: Colors.primary, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  acceptBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '700' },
  winnerSelectBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  winnerSelectText: { fontSize: 15, fontWeight: '800', color: '#1D4ED8' },
  closeBtn: { backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
  closeBtnText: { color: Colors.text, fontSize: 15, fontWeight: '700' },

  inputLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 6 },
  textInput: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, fontSize: 15 },
  dropdownBox: { position: 'absolute', top: 50, left: 0, right: 0, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 10, zIndex: 1000, elevation: 5 },
  dropdownItem: { paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  dropdownItemText: { fontSize: 14, fontWeight: '700', color: '#1E40AF' },
  datePickerBtn: { backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, padding: 12, alignItems: 'center', marginBottom: 6 },
  datePickerBtnText: { fontSize: 14, fontWeight: '700', color: '#1E293B' },
  calendarContainer: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 12, marginTop: 6, marginBottom: 10 },
  calHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  calTitleText: { fontSize: 15, fontWeight: '800', color: Colors.text },
  calNavBtn: { paddingHorizontal: 12, paddingVertical: 4 },
  calNavText: { fontSize: 20, fontWeight: '800', color: Colors.primary },
  weekRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 6 },
  weekText: { fontSize: 12, fontWeight: '700', width: 32, textAlign: 'center', color: '#64748B' },
  daysGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-start' },
  dayBox: { width: '14.28%', height: 36, justifyContent: 'center', alignItems: 'center', marginVertical: 2 },
  selectedDayBox: { backgroundColor: Colors.primary, borderRadius: 18 },
  dayText: { fontSize: 13, fontWeight: '600', color: Colors.text },
  selectedDayText: { color: '#FFFFFF', fontWeight: '800' },

  rosterChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  rosterChipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  rosterChipText: { fontSize: 12, fontWeight: '600', color: '#64748B' },
  rosterChipTextActive: { color: '#1D4ED8', fontWeight: '800' },

  scoreCalcBox: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14 },
  setRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  setLabel: { fontSize: 13, fontWeight: '800', color: '#1E293B', width: 44 },
  teamScoreCol: { flex: 1, alignItems: 'center' },
  teamScoreLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 4 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', borderRadius: 6, width: 28, height: 28, justifyContent: 'center', alignItems: 'center' },
  stepBtnText: { fontSize: 12, fontWeight: '800', color: '#1D4ED8' },
  scoreValText: { fontSize: 18, fontWeight: '900', color: '#0F172A', minWidth: 26, textAlign: 'center' },
  vsColon: { fontSize: 18, fontWeight: '800', color: '#94A3B8', marginHorizontal: 4 },
  quickScoreRow: { flexDirection: 'row', gap: 4, marginTop: 4 },
  quickBtn: { backgroundColor: '#E2E8F0', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  quickBtnText: { fontSize: 10, fontWeight: '700', color: '#475569' },
  toggleSet3Btn: { backgroundColor: '#FFFFFF', borderStyle: 'dashed', borderWidth: 1, borderColor: '#93C5FD', borderRadius: 8, paddingVertical: 6, alignItems: 'center', marginTop: 10 },
  toggleSet3BtnActive: { backgroundColor: '#EFF6FF', borderStyle: 'solid', borderColor: '#3B82F6' },
  toggleSet3Text: { fontSize: 12, fontWeight: '700', color: '#2563EB' },
  toggleSet3TextActive: { color: '#1D4ED8', fontWeight: '800' },

  // 🔥 과거 기록 모달 전용 칩 스타일 (전면 개편)
  teamSelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginRight: 8,
    marginBottom: 8,
  },
  teamSelectChipActive: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  teamSelectChipText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155', // 미선택 시 짙은 슬레이트 색상 (선명하게 보임!)
  },
  teamSelectChipTextActive: {
    color: '#FFFFFF', // 선택 시 선명한 순백색
  },
});