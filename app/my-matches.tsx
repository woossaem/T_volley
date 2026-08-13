import React, { useEffect, useState, useMemo } from 'react';
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
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { Colors } from '../constants/Colors';
import { sendNotificationToTeam } from '../lib/notificationService';
import { getCurrentSeasonInfo } from '../lib/season';
import MatchEvaluationModal from '../components/MatchEvaluationModal';
import UserProfileModal from '../components/UserProfileModal';
import StickyAdBanner from '../components/StickyAdBanner';

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
  status: string;
  winner_team?: string;
  result_submitter_team?: string;
  submitted_by_name?: string;
  approved_by_name?: string;
  roster_updated_by_name?: string;
  roster_updated_at?: string;
  set_scores?: string | null;
  host_roster?: string;
  away_roster?: string;
  created_at: string;
  need_mercenary?: boolean;
  mercenary_details?: string;
  host_youtube_url?: string | null;
  away_youtube_url?: string | null;
}

interface ApplicationData {
  id: string;
  match_id: string;
  applicant_user_id: string;
  applicant_team_name: string;
  status: string;
  application_type?: 'team' | 'mercenary';
  applicant_contact?: string;
}

interface MemberInfo {
  user_id: string;
  full_name: string;
}

const REGIONS = ['전체', '천안', '아산', '기타'];

interface DynamicSetScore {
  hostScore: number;
  awayScore: number;
}

export default function MyMatchesScreen() {
  const router = useRouter();
  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const currentUserName = session?.user?.user_metadata?.full_name || '선생님';

  const currentSeason = getCurrentSeasonInfo();
  
  const [matches, setMatches] = useState<MatchData[]>([]);
  const [myApplications, setMyApplications] = useState<ApplicationData[]>([]);
  const [myTeams, setMyTeams] = useState<string[]>([]);
  const [allTeams, setAllTeams] = useState<string[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  
  const [mainTab, setMainTab] = useState<'active' | 'completed'>('active');
  const [completedFilter, setCompletedFilter] = useState<'all' | 'myTeam'>('all');
  const [matchFilterType, setMatchFilterType] = useState<'all' | 'teamOnly' | 'mercenary'>('all');

  const [listYear, setListYear] = useState(new Date().getFullYear());
  const [listMonth, setListMonth] = useState(new Date().getMonth() + 1);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('전체');

  const [selectedMatch, setSelectedMatch] = useState<MatchData | null>(null);
  const [matchApplicants, setMatchApplicants] = useState<ApplicationData[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  const [mercenaryModalVisible, setMercenaryModalVisible] = useState(false);
  const [targetMercenaryMatch, setTargetMercenaryMatch] = useState<MatchData | null>(null);
  const [mercenaryContactInput, setMercenaryContactInput] = useState('');

  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [selectedMatchForResult, setSelectedMatchForResult] = useState<MatchData | null>(null);
  const [hostMembers, setHostMembers] = useState<MemberInfo[]>([]);
  const [awayMembers, setAwayMembers] = useState<MemberInfo[]>([]);
  const [selectedHostRoster, setSelectedHostRoster] = useState<string[]>([]);
  const [selectedAwayRoster, setSelectedAwayRoster] = useState<string[]>([]);
  const [dynamicScores, setDynamicScores] = useState<DynamicSetScore[]>([]);
  const [hostYoutube, setHostYoutube] = useState('');
  const [awayYoutube, setAwayYoutube] = useState('');

  const [teamSelectModalVisible, setTeamSelectModalVisible] = useState(false);
  const [matchToApply, setMatchToApply] = useState<MatchData | null>(null);
  const [availableTeamsToApply, setAvailableTeamsToApply] = useState<string[]>([]);

  const [pastModalVisible, setPastMatchModalVisible] = useState(false);
  const [pastHostTeam, setPastHostTeam] = useState('');
  const [pastAwayTeam, setPastAwayTeam] = useState('');
  const [pastMatchDate, setPastMatchDate] = useState('');
  const [pastWinner, setPastWinner] = useState('');
  const [showAwayDropdown, setShowAwayDropdown] = useState(false);
  const [pastDynamicScores, setPastDynamicScores] = useState<DynamicSetScore[]>([]);
  const [pastHostYoutube, setPastHostYoutube] = useState('');
  const [pastAwayYoutube, setPastAwayYoutube] = useState('');

  const [showCalendar, setShowCalendar] = useState(false);
  const [calYear, setCalYear] = useState(new Date().getFullYear());
  const [calMonth, setCalMonth] = useState(new Date().getMonth() + 1);

  // 🎁 매너 평가 모달 관련 State
  const [evalModalVisible, setEvalModalVisible] = useState(false);
  const [evalTargetMatchId, setEvalTargetMatchId] = useState('');
  const [evalTargetTeamName, setEvalTargetTeamName] = useState('');
  const [evalMatchMembers, setEvalMatchMembers] = useState<MemberInfo[]>([]);

  // 상대방 프로필 조회용 State
  const [selectedUserIdForModal, setSelectedUserIdForModal] = useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

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

  const fetchData = async () => {
    try {
      if (currentUserId) {
        const { data: tmData } = await supabase.from('team_members').select('team_id').eq('user_id', currentUserId).eq('is_active', true);
        const teamIds = tmData?.map((tm: any) => tm.team_id) || [];
        
        let teamNames: string[] = [];
        if (teamIds.length > 0) {
          const { data: tData } = await supabase.from('teams').select('name').in('id', teamIds);
          teamNames = (tData || []).map(t => parseTeamName(t.name)).filter(Boolean);
        }

        setMyTeams(teamNames);
        if (teamNames.length > 0 && !pastHostTeam) setPastHostTeam(teamNames[0]);

        const { data: apps } = await supabase.from('match_applications').select('*').eq('applicant_user_id', currentUserId);
        if (apps) setMyApplications(apps);
      }

      const { data: teamsData } = await supabase.from('teams').select('name');
      if (teamsData) setAllTeams(teamsData.map((t: any) => parseTeamName(t.name)).filter(Boolean));

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

  // 🎁 매너 평가 모달 열기
  const openEvaluationModal = async (match: MatchData) => {
    if (!currentUserId) return;
    const isHost = myTeams.includes(match.host_team_name);
    const targetTeam = isHost ? (match.away_team_name || '') : match.host_team_name;
    
    if (!targetTeam) return Alert.alert('알림', '평가할 상대 팀 정보를 찾을 수 없습니다.');

    try {
      setActionLoading(true);
      const { data: tData } = await supabase.from('teams').select('id').eq('name', targetTeam).maybeSingle();
      let members: MemberInfo[] = [];

      if (tData) {
        const { data: mData } = await supabase
          .from('team_members')
          .select('user_id, profiles(full_name)')
          .eq('team_id', tData.id)
          .eq('is_active', true);

        members = (mData || []).map((m: any) => ({
          user_id: m.user_id,
          full_name: m.profiles?.full_name || '팀원',
        }));
      }

      setEvalTargetMatchId(match.id);
      setEvalTargetTeamName(targetTeam);
      setEvalMatchMembers(members);
      setEvalModalVisible(true);
    } catch (e: any) {
      Alert.alert('오류', '상대 팀원 명단을 불러오지 못했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenYoutube = (url?: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => Alert.alert('오류', '올바른 유튜브 링크가 아니거나 연결할 수 없습니다.'));
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
    } catch (err) { console.error('팀원 조회 실패:', err); }
  };

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

  const parseScoresToArray = (scoreStr: string | null | undefined): DynamicSetScore[] => {
    if (!scoreStr) return [];
    const sets = scoreStr.split(', ');
    return sets.map(s => {
      const [h, a] = s.split(':').map(Number);
      return { hostScore: h || 0, awayScore: a || 0 };
    });
  };

  const convertScoresToString = (scoresArray: DynamicSetScore[]): string | null => {
    if (scoresArray.length === 0) return null;
    return scoresArray.map(s => `${s.hostScore}:${s.awayScore}`).join(', ');
  };

  const externalMatches = matches.filter(m => m.status !== 'intramural');

  const currentMonthMatches = externalMatches.filter(match => {
    const { year, month } = parseMatchDate(match.match_date || match.created_at);
    return year === listYear && month === listMonth;
  });

  const activeCount = currentMonthMatches.filter(m => ['open', 'matched', 'pending_result'].includes(m.status)).length;
  const completedCount = currentMonthMatches.filter(m => ['completed', 'friendly'].includes(m.status)).length;

  const filteredMatches = currentMonthMatches.filter(match => {
    const { year, month } = parseMatchDate(match.match_date || match.created_at);
    if (year !== listYear || month !== listMonth) return false;

    const isHost = myTeams.includes(match.host_team_name);
    const isAway = match.away_team_name ? myTeams.includes(match.away_team_name) : false;
    const isMyMatch = isHost || isAway;

    if (mainTab === 'active') {
      if (!['open', 'matched', 'pending_result'].includes(match.status)) return false;
      if (matchFilterType === 'mercenary' && !match.need_mercenary) return false;
      if (matchFilterType === 'teamOnly' && match.need_mercenary) return false;
    } else {
      if (!['completed', 'friendly'].includes(match.status)) return false;
      if (completedFilter === 'myTeam' && !isMyMatch) return false;
    }

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

  const changeListMonth = (delta: number) => {
    let newM = listMonth + delta; let newY = listYear;
    if (newM > 12) { newM = 1; newY += 1; }
    if (newM < 1) { newM = 12; newY -= 1; }
    setListYear(newY); setListMonth(newM);
  };

  const handleOpenMercenaryModal = (match: MatchData) => {
    if (!currentUserId) return Alert.alert('알림', '로그인이 필요합니다.');
    const alreadyAppliedMercenary = myApplications.some(
      (app) => app.match_id === match.id && app.applicant_user_id === currentUserId && app.application_type === 'mercenary'
    );
    if (alreadyAppliedMercenary) return Alert.alert('알림', '이미 이 경기에 용병 신청을 완료하셨습니다.');

    setTargetMercenaryMatch(match);
    setMercenaryContactInput('');
    setMercenaryModalVisible(true);
  };

  const handleSubmitMercenaryApplication = async () => {
    if (!targetMercenaryMatch || !currentUserId) return;
    if (!mercenaryContactInput.trim()) return Alert.alert('알림', '노쇼 방지를 위해 연락처(전화번호 또는 카카오톡 ID)를 반드시 입력해 주세요.');

    setActionLoading(true);
    try {
      const { data: insertedApp, error } = await supabase.from('match_applications').insert({
        match_id: targetMercenaryMatch.id,
        applicant_user_id: currentUserId,
        applicant_team_name: `개인 용병 (${currentUserName})`,
        application_type: 'mercenary',
        applicant_contact: mercenaryContactInput.trim(),
        status: 'pending',
      }).select().single();

      if (error) throw error;
      if (insertedApp) setMyApplications(prev => [...prev, insertedApp]);

      await sendNotificationToTeam(
        targetMercenaryMatch.host_team_name,
        '🙋‍♂️ [용병 참가 신청 도착]',
        `'${currentUserName}' 선생님이 용병(게스트) 참가를 신청하셨습니다. (연락처 첨부됨)`
      );

      Alert.alert('신청 완료! 🎉', `'${targetMercenaryMatch.host_team_name}' 팀 주최자에게 연락처와 함께 용병 신청이 전달되었습니다.`);
      setMercenaryModalVisible(false);
      setTargetMercenaryMatch(null);
    } catch (err: any) { Alert.alert('오류', err.message); } 
    finally { setActionLoading(false); }
  };

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
            const { data: insertedApp, error } = await supabase.from('match_applications').insert({
              match_id: match.id, applicant_user_id: currentUserId, applicant_team_name: teamName, application_type: 'team', status: 'pending'
            }).select().single();
            if (error) throw error;
            if (insertedApp) setMyApplications(prev => [...prev, insertedApp]);

            await sendNotificationToTeam(match.host_team_name, '🔔 [참가 신청 도착]', `'${teamName}' 팀이 매칭을 신청했습니다.`);
            await sendNotificationToTeam(teamName, '✅ [신청 완료]', `'${match.host_team_name}' 팀에 참가 신청을 보냈습니다.`);
            Alert.alert('신청 완료!', '주최 팀에 신청이 전달되었습니다.');
          } catch (err: any) { Alert.alert('오류', err.message); } 
          finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const handleCancelApplication = (match: MatchData) => {
    const myApp = myApplications.find(a => a.match_id === match.id && (myTeams.includes(a.applicant_team_name) || a.applicant_user_id === currentUserId));
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
            await sendNotificationToTeam(match.host_team_name, '🚨 [참가 신청 취소]', `'${myApp.applicant_team_name}' 측이 신청을 취소했습니다.`);
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
    const isMercenaryApp = app.application_type === 'mercenary';
    const alertTitle = isMercenaryApp ? '용병 수락' : '매칭 수락';
    const alertMsg = isMercenaryApp
      ? `'${app.applicant_team_name}' 선생님을 용병으로 확정하시겠습니까?\n📞 연락처: ${app.applicant_contact || '미입력'}`
      : `'${app.applicant_team_name}' 팀의 신청을 수락하시겠습니까?`;

    Alert.alert(alertTitle, alertMsg, [
      { text: '취소', style: 'cancel' },
      {
        text: '수락',
        onPress: async () => {
          setActionLoading(true);
          try {
            if (!isMercenaryApp) {
              await supabase.from('matches').update({ status: 'matched', away_team_name: app.applicant_team_name }).eq('id', selectedMatch.id);
              setMatches(prev => prev.map(m => m.id === selectedMatch.id ? { ...m, status: 'matched', away_team_name: app.applicant_team_name } : m));
            }
            
            await supabase.from('match_applications').update({ status: 'accepted' }).eq('id', app.id);
            
            if (isMercenaryApp) {
              await supabase.from('notifications').insert({
                user_id: app.applicant_user_id,
                title: '🎉 [용병 참가 확정!]',
                message: `'${selectedMatch.host_team_name}' 팀의 경기 용병 참가가 확정되었습니다!`,
                is_read: false,
              });
              Alert.alert('용병 확정! 🙋‍♂️', '신청 유저에게 용병 확정 알림이 발송되었습니다.');
            } else {
              await sendNotificationToTeam(selectedMatch.host_team_name, '🎉 [매칭 완료]', `'${app.applicant_team_name}' 팀과의 매칭이 확정되었습니다.`);
              await sendNotificationToTeam(app.applicant_team_name, '🎉 [매칭 완료]', `'${selectedMatch.host_team_name}' 팀과의 매칭이 성사되었습니다!`);
              Alert.alert('매칭 완료! 🏐', '매칭 확정 알림이 전송되었습니다.');
            }
            setModalVisible(false);
          } finally { setActionLoading(false); }
        },
      },
    ]);
  };

  const handleDeleteMatch = (match: MatchData) => {
    Alert.alert(
      '⚠️ 경기 완전 삭제 확인',
      '경기를 삭제하면 상대 팀의 기록과 해당 경기의 모든 데이터가 완전히 지워집니다.',
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

  const addDynamicSet = () => {
    if (dynamicScores.length >= 7) return Alert.alert('알림', '최대 7세트까지만 입력 가능합니다.');
    setDynamicScores(prev => [...prev, { hostScore: 25, awayScore: 21 }]);
  };
  const removeDynamicSet = (index: number) => {
    setDynamicScores(prev => prev.filter((_, i) => i !== index));
  };
  const updateDynamicScore = (index: number, isHost: boolean, delta: number) => {
    setDynamicScores(prev => {
      const newScores = [...prev];
      if (isHost) newScores[index].hostScore = Math.max(0, newScores[index].hostScore + delta);
      else newScores[index].awayScore = Math.max(0, newScores[index].awayScore + delta);
      return newScores;
    });
  };
  const setDirectDynamicScore = (index: number, isHost: boolean, val: number) => {
    setDynamicScores(prev => {
      const newScores = [...prev];
      if (isHost) newScores[index].hostScore = val;
      else newScores[index].awayScore = val;
      return newScores;
    });
  };

  const addPastDynamicSet = () => {
    if (pastDynamicScores.length >= 7) return Alert.alert('알림', '최대 7세트까지만 입력 가능합니다.');
    setPastDynamicScores(prev => [...prev, { hostScore: 25, awayScore: 21 }]);
  };
  const removePastDynamicSet = (index: number) => {
    setPastDynamicScores(prev => prev.filter((_, i) => i !== index));
  };
  const updatePastDynamicScore = (index: number, isHost: boolean, delta: number) => {
    setPastDynamicScores(prev => {
      const newScores = [...prev];
      if (isHost) newScores[index].hostScore = Math.max(0, newScores[index].hostScore + delta);
      else newScores[index].awayScore = Math.max(0, newScores[index].awayScore + delta);
      return newScores;
    });
  };
  const setDirectPastDynamicScore = (index: number, isHost: boolean, val: number) => {
    setPastDynamicScores(prev => {
      const newScores = [...prev];
      if (isHost) newScores[index].hostScore = val;
      else newScores[index].awayScore = val;
      return newScores;
    });
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

    const formattedScores = convertScoresToString(dynamicScores);

    setActionLoading(true);
    try {
      const updateData = {
        status: 'pending_result',
        winner_team: winner,
        result_submitter_team: myTeamInMatch,
        submitted_by_name: currentUserName,
        set_scores: formattedScores,
        host_roster: selectedHostRoster.join(','),
        away_roster: selectedAwayRoster.join(','),
        host_youtube_url: hostYoutube.trim() || null,
        away_youtube_url: awayYoutube.trim() || null,
      };

      await supabase.from('matches').update(updateData).eq('id', selectedMatchForResult.id);
      setMatches(prev => prev.map(m => m.id === selectedMatchForResult.id ? { ...m, ...updateData } : m));

      const resultMsg = winner === 'draw' ? '무승부' : `'${winner}' 승리`;
      const scoreMsg = formattedScores ? ` (${formattedScores})` : '';
      
      if (otherTeam) {
        await sendNotificationToTeam(
          otherTeam, 
          '⚠️ [경기 결과 수정 승인 요청]', 
          `'${myTeamInMatch}'팀이 경기 결과를 [${resultMsg}]${scoreMsg}로 수정했습니다. 동의해 주세요.`
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
                await supabase.from('matches').update({
                  status: 'completed',
                  approved_by_name: currentUserName,
                }).eq('id', match.id);
                setMatches(prev => prev.map(m => m.id === match.id ? { ...m, status: 'completed', approved_by_name: currentUserName } : m));
                
                const otherTeam = myTeams.includes(match.host_team_name) ? match.away_team_name : match.host_team_name;
                if (otherTeam) {
                  await sendNotificationToTeam(otherTeam, '✅ [결과 승인 완료]', `상대 팀이 결과를 승인하여 공식 랭킹에 정식 반영되었습니다.`);
                }
                Alert.alert('승인 완료', '공식 전적으로 랭킹에 반영되었습니다.');
                setMainTab('completed'); 
              } else {
                await supabase.from('matches').delete().eq('id', match.id);
                setMatches(prev => prev.filter(m => m.id !== match.id));
                
                const otherTeam = myTeams.includes(match.host_team_name) ? match.away_team_name : match.host_team_name;
                if (otherTeam) {
                  await sendNotificationToTeam(otherTeam, '❌ [결과 거절]', `상대 팀이 제출된 경기 결과를 거절하여 기록이 삭제되었습니다.`);
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

    const formattedScores = convertScoresToString(pastDynamicScores);

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
          match_time: '이전 경기 수동 입력',
          location: isRegisteredTeam ? '공식 수동 기록' : '비공식 친선 경기',
          format: isRegisteredTeam ? '공식전' : '친선전',
          description: isRegisteredTeam ? '상대팀의 승인을 기다리고 있습니다.' : '미등록 팀과의 비공식 친선 경기입니다. (랭킹 제외)',
          status: matchStatus,
          winner_team: pastWinner,
          result_submitter_team: pastHostTeam,
          submitted_by_name: currentUserName,
          set_scores: formattedScores,
          host_roster: currentUserId ? currentUserId : null,
          host_youtube_url: pastHostYoutube.trim() || null,
          away_youtube_url: pastAwayYoutube.trim() || null,
        })
        .select().single();

      if (error) throw error;

      const resultMsg = pastWinner === 'draw' ? '무승부' : `'${pastWinner}' 승리`;

      if (isRegisteredTeam) {
        await sendNotificationToTeam(pastAwayTeam, '⚠️ [과거 기록 승인 요청]', `'${pastHostTeam}'팀이 과거 경기 결과를 [${resultMsg}]로 등록했습니다. 앱에서 승인해주세요.`);
        Alert.alert('요청 완료', '상대 팀(등록팀)에게 결과 승인 요청을 보냈습니다.');
      } else {
        Alert.alert('친선 경기 기록 완료', '미등록 팀과의 경기이므로 랭킹 승점에는 포함되지 않는 친선 기록으로 저장되었습니다.');
      }

      if (newMatch) setMatches(prev => [newMatch, ...prev]);

      setPastMatchModalVisible(false);
      setPastHostTeam(''); setPastAwayTeam(''); setPastMatchDate(''); setPastWinner(''); setPastDynamicScores([]);
      setPastHostYoutube(''); setPastAwayYoutube('');
      
      if (!isRegisteredTeam) setMainTab('completed'); 
    } catch (err: any) { Alert.alert('오류', err.message); } 
    finally { setActionLoading(false); }
  };

  const filteredAwayTeams = allTeams.filter((t) => t !== pastHostTeam && t.toLowerCase().includes(pastAwayTeam.toLowerCase()));
  const changeMonthCalendar = (delta: number) => {
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
          <TouchableOpacity onPress={() => changeMonthCalendar(-1)} style={styles.calNavBtn}><Text style={styles.calNavText}>‹</Text></TouchableOpacity>
          <Text style={styles.calTitleText}>{calYear}년 {calMonth}월</Text>
          <TouchableOpacity onPress={() => changeMonthCalendar(1)} style={styles.calNavBtn}><Text style={styles.calNavText}>›</Text></TouchableOpacity>
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
        <Text style={styles.headerTitle}>내 경기 목록 ({currentSeason.seasonCode})</Text>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]} onPress={() => { setPastDynamicScores([]); setPastHostYoutube(''); setPastAwayYoutube(''); setPastMatchModalVisible(true); }}>
            <Text style={[styles.addBtnText, { color: '#B45309' }]}>📝 이전 경기 기록</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/create-match')}><Text style={styles.addBtnText}>+ 경기 등록</Text></TouchableOpacity>
        </View>
      </View>

      <View style={styles.monthSelectorBar}>
        <TouchableOpacity onPress={() => changeListMonth(-1)} style={styles.monthSelectorBtn}>
          <Text style={styles.monthSelectorArrow}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.monthSelectorText}>{listYear}년 {listMonth}월 매치 (총 {currentMonthMatches.length}건)</Text>
        <TouchableOpacity onPress={() => changeListMonth(1)} style={styles.monthSelectorBtn}>
          <Text style={styles.monthSelectorArrow}>›</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.mainTabContainer}>
        <TouchableOpacity 
          style={[styles.mainTabBtn, mainTab === 'active' && styles.mainTabBtnActive]} 
          onPress={() => setMainTab('active')}
        >
          <Text style={[styles.mainTabText, mainTab === 'active' && styles.mainTabTextActive]}>🔥 진행 중 ({activeCount})</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.mainTabBtn, mainTab === 'completed' && styles.mainTabBtnActive]} 
          onPress={() => setMainTab('completed')}
        >
          <Text style={[styles.mainTabText, mainTab === 'completed' && styles.mainTabTextActive]}>✅ 종료됨 ({completedCount})</Text>
        </TouchableOpacity>
      </View>

      {mainTab === 'active' && (
        <View style={styles.filterChipRow}>
          <TouchableOpacity 
            style={[styles.filterChip, matchFilterType === 'all' && styles.filterChipActive]}
            onPress={() => setMatchFilterType('all')}
          >
            <Text style={[styles.filterChipText, matchFilterType === 'all' && styles.filterChipTextActive]}>🌐 전체 매치</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterChip, matchFilterType === 'teamOnly' && styles.filterChipActive]}
            onPress={() => setMatchFilterType('teamOnly')}
          >
            <Text style={[styles.filterChipText, matchFilterType === 'teamOnly' && styles.filterChipTextActive]}>🛡️ 팀 매칭</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.filterChip, matchFilterType === 'mercenary' && styles.filterChipActiveMercenary]}
            onPress={() => setMatchFilterType('mercenary')}
          >
            <Text style={[styles.filterChipText, matchFilterType === 'mercenary' && styles.filterChipTextActiveMercenary]}>🙋‍♂️ 용병 모집중</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.searchContainer}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput style={styles.searchInput} placeholder="팀 이름이나 장소를 검색하세요" value={searchQuery} onChangeText={setSearchQuery} />
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

      {mainTab === 'completed' && (
        <View style={styles.subFilterContainer}>
          <TouchableOpacity 
            style={[styles.subFilterChip, completedFilter === 'all' && styles.subFilterChipActive]}
            onPress={() => setCompletedFilter('all')}
          >
            <Text style={[styles.subFilterText, completedFilter === 'all' && styles.subFilterTextActive]}>전체 경기</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.subFilterChip, completedFilter === 'myTeam' && styles.subFilterChipActive]}
            onPress={() => setCompletedFilter('myTeam')}
          >
            <Text style={[styles.subFilterText, completedFilter === 'myTeam' && styles.subFilterTextActive]}>🛡️ 내 소속팀 경기</Text>
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.primary} />}>
        {loading ? <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} /> : 
          filteredMatches.length === 0 ? (
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>
                {mainTab === 'active' 
                  ? `${listMonth}월에 진행 중인 매치가 없습니다. (종료된 매치는 상단 '종료됨' 탭을 누르세요)` 
                  : `${listMonth}월에 종료된 매치 기록이 없습니다.`}
              </Text>
            </View>
          ) : (
          filteredMatches.map((match) => {
            const isHost = myTeams.includes(match.host_team_name);
            const isAway = match.away_team_name && myTeams.includes(match.away_team_name);
            const myApp = myApplications.find((app) => app.match_id === match.id);
            const myMercenaryApp = myApplications.find((app) => app.match_id === match.id && app.applicant_user_id === currentUserId && app.application_type === 'mercenary');
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
                  <View style={{ flexDirection: 'row', gap: 4 }}>
                    {match.need_mercenary && (
                      <View style={styles.mercenaryBadge}>
                        <Text style={styles.mercenaryBadgeText}>🙋‍♂️ 용병 구함</Text>
                      </View>
                    )}
                    <View style={[
                      styles.statusBadge, 
                      isCompleted ? styles.statusCompleted : isFriendly ? styles.statusFriendly : isPending ? styles.statusPending : isMatched ? styles.statusMatched : styles.statusOpen
                    ]}>
                      <Text style={[
                        styles.statusText, 
                        isCompleted ? styles.statusTextCompleted : isFriendly ? styles.statusFriendly : isPending ? styles.statusTextPending : isMatched ? styles.statusTextMatched : styles.statusTextOpen
                      ]}>
                        {isCompleted ? '공식종료' : isFriendly ? '친선종료' : isPending ? '결과확인중' : isMatched ? '매칭완료' : '모집중'}
                      </Text>
                    </View>
                  </View>
                </View>

                {match.need_mercenary && match.mercenary_details ? (
                  <View style={styles.mercenaryInfoBox}>
                    <Text style={styles.mercenaryInfoTitle}>🙋‍♂️ 용병 모집 조건:</Text>
                    <Text style={styles.mercenaryInfoText}>{match.mercenary_details}</Text>
                  </View>
                ) : null}

                <View style={styles.matchDetails}>
                  <View style={styles.detailRow}><Text style={styles.detailIcon}>📅</Text><Text style={styles.detailText}>{match.match_date} ({match.match_time})</Text></View>
                  <View style={styles.detailRow}><Text style={styles.detailIcon}>📍</Text><Text style={styles.detailText}>[{match.region || '천안'}] {match.location}</Text></View>
                </View>

                {match.description ? (
                  <View style={styles.descriptionBox}>
                    <Text style={styles.descriptionText}>"{match.description}"</Text>
                  </View>
                ) : null}

                {(match.host_youtube_url || match.away_youtube_url) ? (
                  <View style={{ marginTop: 10, gap: 6 }}>
                    {match.host_youtube_url ? (
                      <TouchableOpacity style={styles.youtubeBarBtn} onPress={() => handleOpenYoutube(match.host_youtube_url!)}>
                        <Text style={styles.youtubeBarBtnText}>🎥 [{match.host_team_name}] 영상 보기 ▶</Text>
                      </TouchableOpacity>
                    ) : null}
                    {match.away_youtube_url ? (
                      <TouchableOpacity style={[styles.youtubeBarBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]} onPress={() => handleOpenYoutube(match.away_youtube_url!)}>
                        <Text style={[styles.youtubeBarBtnText, { color: '#1D4ED8' }]}>🎥 [{match.away_team_name || '상대팀'}] 영상 보기 ▶</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                ) : null}

                <View style={{ marginTop: 12 }}>
                  {(isCompleted || isFriendly) && (
                    <View style={{ gap: 8 }}>
                      <View style={styles.completedBanner}>
                        <Text style={styles.completedBannerText}>
                          🏆 전적: {match.winner_team === 'draw' ? '무승부' : `${match.winner_team} 승리!`}
                        </Text>
                        {match.set_scores ? (
                          <Text style={styles.setScoreText}>📊 세트 점수: {match.set_scores}</Text>
                        ) : null}
                      </View>

                      {/* 🎁 종료된 내 경기에 [상대팀 매너 평가 & 칭찬 포도알] 버튼 노출 */}
                      {isMyMatch && (
                        <TouchableOpacity
                          style={styles.evaluationBtn}
                          onPress={() => openEvaluationModal(match)}
                          disabled={actionLoading}
                        >
                          <Text style={styles.evaluationBtnText}>
                            🎁 상대팀 매너 평가 & 칭찬 포도알 보내기
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

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
                          <TouchableOpacity style={[styles.resultInputBtn, { flex: 1.2, backgroundColor: '#3B82F6' }]} onPress={() => { setSelectedMatchForResult(match); setDynamicScores(parseScoresToArray(match.set_scores)); fetchMatchTeamMembers(match.host_team_name, match.away_team_name); setHostYoutube(match.host_youtube_url || ''); setAwayYoutube(match.away_youtube_url || ''); setResultModalVisible(true); }}>
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

                  {isMatched && (
                    <View style={{ gap: 10 }}>
                      <View style={styles.matchedBanner}><Text style={styles.matchedBannerText}>🎉 매칭 완료! 경기 후 결과를 입력해 주세요.</Text></View>
                      {isMyMatch && (
                        <TouchableOpacity style={styles.resultInputBtn} onPress={() => { setSelectedMatchForResult(match); setDynamicScores([]); fetchMatchTeamMembers(match.host_team_name, match.away_team_name); setHostYoutube(match.host_youtube_url || ''); setAwayYoutube(match.away_youtube_url || ''); setResultModalVisible(true); }}>
                          <Text style={styles.resultInputBtnText}>🏆 경기 결과/영상 등록하기</Text>
                        </TouchableOpacity>
                      )}
                      {isAway && (
                        <TouchableOpacity style={styles.cancelAppBtn} onPress={() => handleCancelApplication(match)}>
                          <Text style={styles.cancelAppBtnText}>🚨 매칭 취소하기 (포기)</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}

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

                      {!isHost && match.need_mercenary && (
                        myMercenaryApp ? (
                          <View style={styles.appliedRow}>
                            <View style={[styles.appliedBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                              <Text style={[styles.appliedBadgeText, { color: '#B45309' }]}>🙋‍♂️ 용병 신청 완료</Text>
                            </View>
                            <TouchableOpacity style={styles.cancelAppBtn} onPress={() => handleCancelApplication(match)}>
                              <Text style={styles.cancelAppBtnText}>🚨 취소</Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity style={styles.applyMercenaryBtn} onPress={() => handleOpenMercenaryModal(match)}>
                            <Text style={styles.applyMercenaryBtnText}>🙋‍♂️ 용병(게스트) 참가 신청하기</Text>
                          </TouchableOpacity>
                        )
                      )}

                      {myApp && myApp.application_type !== 'mercenary' ? (
                        <View style={styles.appliedRow}>
                          <View style={styles.appliedBadge}>
                            <Text style={styles.appliedBadgeText}>✅ 팀 신청 완료 ({myApp.applicant_team_name})</Text>
                          </View>
                          <TouchableOpacity style={styles.cancelAppBtn} onPress={() => handleCancelApplication(match)}>
                            <Text style={styles.cancelAppBtnText}>🚨 신청 취소</Text>
                          </TouchableOpacity>
                        </View>
                      ) : (
                        availableNonHostTeams.length > 0 && (
                          <TouchableOpacity style={styles.applyBtn} onPress={() => handleApplyMatch(match)}>
                            <Text style={styles.applyBtnText}>
                              {isHost ? '✨ 내 다른 소속 팀으로 참가 신청' : '🛡️ 팀 단위 참가 신청하기'}
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
        )}
      </ScrollView>

      {/* 모달 1: 용병 참가 신청 연락처 입력 모달 */}
      <Modal visible={mercenaryModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {targetMercenaryMatch && (
              <>
                <Text style={styles.modalTitle}>🙋‍♂️ 용병(게스트) 참가 신청</Text>
                <Text style={styles.modalSub}>
                  주최 팀: <Text style={{ fontWeight: '800', color: Colors.primary }}>{targetMercenaryMatch.host_team_name}</Text>
                </Text>

                <View style={styles.infoNoticeBox}>
                  <Text style={styles.infoNoticeTitle}>💡 노쇼 방지 연락처 입력 안내</Text>
                  <Text style={styles.infoNoticeText}>
                    • 당일 노쇼 방지를 위해 주최자가 연락 가능한 수단을 입력해 주세요.{'\n'}
                    • 전화번호나 카카오톡 오픈채팅 링크/ID를 작성하시면 됩니다.{'\n'}
                    • 작성된 연락처는 수락 전 주최 팀만 확인할 수 있습니다.
                  </Text>
                </View>

                <Text style={styles.inputLabel}>내 연락처 / 카카오톡 ID</Text>
                <TextInput
                  style={[styles.textInput, { marginBottom: 16 }]}
                  placeholder="예: 010-1234-5678 또는 카카오톡 ID/링크"
                  placeholderTextColor="#94A3B8"
                  value={mercenaryContactInput}
                  onChangeText={setMercenaryContactInput}
                  autoFocus
                />

                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.closeBtn, { flex: 1, marginTop: 0 }]}
                    onPress={() => setMercenaryModalVisible(false)}
                  >
                    <Text style={styles.closeBtnText}>취소</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.applyMercenaryBtn, { flex: 2 }]}
                    onPress={handleSubmitMercenaryApplication}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.applyMercenaryBtnText}>🚀 연락처 제출 & 용병 신청</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* 모달 2: 경기 결과 & 세트 점수 모달 */}
      <Modal visible={resultModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🏆 경기 결과 & 영상 입력</Text>
            <Text style={styles.modalSub}>세트 스코어와 영상 링크는 모두 선택 사항입니다.</Text>
            {selectedMatchForResult && (
              <ScrollView style={{ maxHeight: 420, marginVertical: 10 }} showsVerticalScrollIndicator={false}>
                
                <Text style={styles.inputLabel}>🎥 경기 영상 링크 첨부 (선택)</Text>
                <TextInput
                  style={[styles.textInput, { marginBottom: 8 }]}
                  placeholder={`[주최팀] ${selectedMatchForResult.host_team_name} 영상 URL`}
                  placeholderTextColor="#94A3B8"
                  value={hostYoutube}
                  onChangeText={setHostYoutube}
                  autoCapitalize="none"
                />
                {selectedMatchForResult.away_team_name ? (
                  <TextInput
                    style={[styles.textInput, { marginBottom: 10 }]}
                    placeholder={`[상대팀] ${selectedMatchForResult.away_team_name} 영상 URL`}
                    placeholderTextColor="#94A3B8"
                    value={awayYoutube}
                    onChangeText={setAwayYoutube}
                    autoCapitalize="none"
                  />
                ) : (
                  <View style={{marginBottom: 10}} />
                )}

                <Text style={[styles.inputLabel, { marginTop: 0 }]}>📊 세트 점수 기록 (선택)</Text>
                <View style={styles.scoreCalcBox}>
                  {dynamicScores.map((ds, idx) => (
                    <View key={idx} style={[styles.setRow, idx > 0 && { marginTop: 16 }]}>
                      <View style={{ alignItems: 'center' }}>
                        <Text style={styles.setLabel}>{idx + 1}세트</Text>
                        <TouchableOpacity style={{ marginTop: 4 }} onPress={() => removeDynamicSet(idx)}>
                          <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '800' }}>[X 삭제]</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={styles.teamScoreCol}>
                        <Text style={styles.teamScoreLabel}>{selectedMatchForResult.host_team_name}</Text>
                        <View style={styles.stepperRow}>
                          <TouchableOpacity style={styles.stepBtn} onPress={() => updateDynamicScore(idx, true, -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                          <Text style={styles.scoreValText}>{ds.hostScore}</Text>
                          <TouchableOpacity style={styles.stepBtn} onPress={() => updateDynamicScore(idx, true, 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                        </View>
                        <View style={styles.quickScoreRow}>
                          <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectDynamicScore(idx, true, 25)}><Text style={styles.quickBtnText}>25</Text></TouchableOpacity>
                          <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectDynamicScore(idx, true, 21)}><Text style={styles.quickBtnText}>21</Text></TouchableOpacity>
                        </View>
                      </View>
                      <Text style={styles.vsColon}>:</Text>
                      <View style={styles.teamScoreCol}>
                        <Text style={styles.teamScoreLabel}>{selectedMatchForResult.away_team_name || '상대팀'}</Text>
                        <View style={styles.stepperRow}>
                          <TouchableOpacity style={styles.stepBtn} onPress={() => updateDynamicScore(idx, false, -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                          <Text style={styles.scoreValText}>{ds.awayScore}</Text>
                          <TouchableOpacity style={styles.stepBtn} onPress={() => updateDynamicScore(idx, false, 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                        </View>
                        <View style={styles.quickScoreRow}>
                          <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectDynamicScore(idx, false, 25)}><Text style={styles.quickBtnText}>25</Text></TouchableOpacity>
                          <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectDynamicScore(idx, false, 21)}><Text style={styles.quickBtnText}>21</Text></TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  ))}
                  <TouchableOpacity style={styles.toggleSet3Btn} onPress={addDynamicSet}>
                    <Text style={styles.toggleSet3Text}>➕ 세트 스코어 추가하기</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.inputLabel}>👥 [{selectedMatchForResult.host_team_name}] 출전 멤버 (체크)</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 }}>
                  {hostMembers.map(m => {
                    const isChecked = selectedHostRoster.includes(m.user_id);
                    return (
                      <TouchableOpacity key={m.user_id} style={[styles.rosterChip, isChecked && styles.rosterChipActive]} onPress={() => toggleRosterMember(m.user_id, true)}>
                        <Text style={[styles.rosterChipText, isChecked && styles.rosterChipTextActive]}>{isChecked ? '✅ ' : '⬜ '}{m.full_name}</Text>
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
                          <TouchableOpacity key={m.user_id} style={[styles.rosterChip, isChecked && styles.rosterChipActive]} onPress={() => toggleRosterMember(m.user_id, false)}>
                            <Text style={[styles.rosterChipText, isChecked && styles.rosterChipTextActive]}>{isChecked ? '✅ ' : '⬜ '}{m.full_name}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </>
                ) : null}

                <Text style={[styles.inputLabel, { marginTop: 6 }]}>🥇 최종 승리 팀 선택 (필수)</Text>
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

      {/* 모달 3: 이전 경기 수동 입력 모달 */}
      <Modal visible={pastModalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>📜 이전 경기 결과 수동 입력</Text>
            
            <View style={styles.infoNoticeBox}>
              <Text style={styles.infoNoticeTitle}>💡 미등록 경기 수동 기록 안내</Text>
              <Text style={styles.infoNoticeText}>
                • 앱 출시 이전 경기나 미등록 팀과의 경기 전적을 직접 기록할 수 있습니다.{'\n'}
                • 상대팀이 미등록 팀인 경우 우선 <Text style={{fontWeight: '800', color: Colors.primary}}>친선 기록</Text>으로 보관됩니다.{'\n'}
                • 추후 해당 팀이 가입 후 승인하면 <Text style={{fontWeight: '800', color: Colors.primary}}>공식 랭킹 전적</Text>으로 소급 변경됩니다.
              </Text>
            </View>

            <ScrollView style={{ maxHeight: 380, marginVertical: 10 }} showsVerticalScrollIndicator={false} nestedScrollEnabled={true}>
              <Text style={styles.inputLabel}>1. 내 출전 팀 선택</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 14 }}>
                {myTeams.map((t) => {
                  const isSelected = pastHostTeam === t;
                  return (
                    <TouchableOpacity key={t} style={[styles.teamSelectChip, isSelected && styles.teamSelectChipActive]} onPress={() => setPastHostTeam(t)}>
                      <Text style={[styles.teamSelectChipText, isSelected && styles.teamSelectChipTextActive]}>🛡️ {t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              
              <Text style={styles.inputLabel}>2. 상대 팀명</Text>
              <View style={{ position: 'relative', zIndex: 10, marginBottom: 14 }}>
                <TextInput style={styles.textInput} placeholder="미등록 팀 입력 시 친선경기로 자동 분류됩니다" value={pastAwayTeam} onChangeText={(txt) => { setPastAwayTeam(txt); setShowAwayDropdown(true); }} onFocus={() => setShowAwayDropdown(true)} />
                {showAwayDropdown && pastAwayTeam.length > 0 && filteredAwayTeams.length > 0 && (
                  <View style={styles.dropdownBox}>
                    <ScrollView style={{ maxHeight: 120 }} nestedScrollEnabled={true}>
                      {filteredAwayTeams.map((t) => (
                        <TouchableOpacity key={t} style={styles.dropdownItem} onPress={() => { setPastAwayTeam(t); setShowAwayDropdown(false); }}>
                          <Text style={styles.dropdownItemText}>🛡️ {t} (공식 등록팀)</Text>
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

              <Text style={[styles.inputLabel, { marginTop: 10 }]}>4. 경기 영상 링크 (선택)</Text>
              <TextInput
                style={[styles.textInput, { marginBottom: 8 }]}
                placeholder={`[주최팀] ${pastHostTeam || '내 팀'} 영상 URL`}
                placeholderTextColor="#94A3B8"
                value={pastHostYoutube}
                onChangeText={setPastHostYoutube}
                autoCapitalize="none"
              />
              <TextInput
                style={[styles.textInput, { marginBottom: 14 }]}
                placeholder={`[상대팀] ${pastAwayTeam || '상대팀'} 영상 URL`}
                placeholderTextColor="#94A3B8"
                value={pastAwayYoutube}
                onChangeText={setPastAwayYoutube}
                autoCapitalize="none"
              />

              <Text style={[styles.inputLabel, { marginTop: 0 }]}>5. 세부 세트 스코어 (생략 가능)</Text>
              <View style={styles.scoreCalcBox}>
                {pastDynamicScores.map((ds, idx) => (
                  <View key={idx} style={[styles.setRow, idx > 0 && { marginTop: 16 }]}>
                    <View style={{ alignItems: 'center' }}>
                      <Text style={styles.setLabel}>{idx + 1}세트</Text>
                      <TouchableOpacity style={{ marginTop: 4 }} onPress={() => removePastDynamicSet(idx)}>
                        <Text style={{ fontSize: 11, color: '#EF4444', fontWeight: '800' }}>[X 삭제]</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.teamScoreCol}>
                      <Text style={styles.teamScoreLabel}>{pastHostTeam || '내 팀'}</Text>
                      <View style={styles.stepperRow}>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => updatePastDynamicScore(idx, true, -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                        <Text style={styles.scoreValText}>{ds.hostScore}</Text>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => updatePastDynamicScore(idx, true, 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                      </View>
                      <View style={styles.quickScoreRow}>
                        <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectPastDynamicScore(idx, true, 25)}><Text style={styles.quickBtnText}>25</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectPastDynamicScore(idx, true, 21)}><Text style={styles.quickBtnText}>21</Text></TouchableOpacity>
                      </View>
                    </View>
                    <Text style={styles.vsColon}>:</Text>
                    <View style={styles.teamScoreCol}>
                      <Text style={styles.teamScoreLabel}>{pastAwayTeam || '상대팀'}</Text>
                      <View style={styles.stepperRow}>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => updatePastDynamicScore(idx, false, -1)}><Text style={styles.stepBtnText}>-1</Text></TouchableOpacity>
                        <Text style={styles.scoreValText}>{ds.awayScore}</Text>
                        <TouchableOpacity style={styles.stepBtn} onPress={() => updatePastDynamicScore(idx, false, 1)}><Text style={styles.stepBtnText}>+1</Text></TouchableOpacity>
                      </View>
                      <View style={styles.quickScoreRow}>
                        <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectPastDynamicScore(idx, false, 25)}><Text style={styles.quickBtnText}>25</Text></TouchableOpacity>
                        <TouchableOpacity style={styles.quickBtn} onPress={() => setDirectPastDynamicScore(idx, false, 21)}><Text style={styles.quickBtnText}>21</Text></TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
                <TouchableOpacity style={styles.toggleSet3Btn} onPress={addPastDynamicSet}>
                  <Text style={styles.toggleSet3Text}>➕ 세트 스코어 추가하기</Text>
                </TouchableOpacity>
              </View>

              {pastHostTeam && pastAwayTeam ? (
                <>
                  <Text style={styles.inputLabel}>6. 경기 승리 팀 선택</Text>
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

      {/* 모달 4: 참가 신청 현황 모달 */}
      <Modal visible={modalVisible} animationType="slide" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>참가 신청 현황</Text>
            {matchApplicants.length === 0 ? (
              <Text style={{ textAlign:'center', marginVertical:20, color:'#94A3B8' }}>아직 신청자가 없습니다.</Text>
            ) : (
              matchApplicants.map(app => {
                const isMercenary = app.application_type === 'mercenary';
                return (
                  <View key={app.id} style={styles.applicantRow}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.applicantTeamName}>
                        {isMercenary ? `🙋‍♂️ ${app.applicant_team_name}` : `🛡️ ${app.applicant_team_name}`}
                      </Text>
                      {isMercenary && (
                        <Text style={{ fontSize: 12, color: '#D97706', marginTop: 2, fontWeight: '700' }}>
                          📞 연락처: {app.applicant_contact || '미입력'}
                        </Text>
                      )}
                    </View>
                    <TouchableOpacity style={[styles.acceptBtn, isMercenary && { backgroundColor: '#D97706' }]} onPress={() => handleAcceptApplicant(app)}>
                      <Text style={styles.acceptBtnText}>수락</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setModalVisible(false)}><Text style={styles.closeBtnText}>닫기</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 모달 5: 출전 팀 선택 모달 */}
      <Modal visible={teamSelectModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>출전 팀 선택</Text>
            <Text style={styles.modalSub}>어느 팀 소속으로 참가 신청하시겠습니까?</Text>
            <View style={{ marginVertical: 16, gap: 10 }}>
              {availableTeamsToApply.map((teamName) => (
                <TouchableOpacity key={teamName} style={styles.winnerSelectBtn} onPress={() => matchToApply && confirmApply(matchToApply, teamName)}>
                  <Text style={styles.winnerSelectText}>🛡️ {teamName}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={styles.closeBtn} onPress={() => setTeamSelectModalVisible(false)}><Text style={styles.closeBtnText}>취소</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 🎁 매너 평가 & 칭찬 포도알 모달 연동 */}
      <MatchEvaluationModal
        visible={evalModalVisible}
        onClose={() => setEvalModalVisible(false)}
        matchId={evalTargetMatchId}
        evaluatorId={currentUserId || ''}
        targetTeamName={evalTargetTeamName}
        matchMembers={evalMatchMembers}
        onEvaluationComplete={() => {
          fetchData(); // 평가 후 새로고침
        }}
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
  addBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#BFDBFE' },
  addBtnText: { color: '#1D4ED8', fontWeight: '800', fontSize: 13 },
  
  monthSelectorBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F8FAFC', paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' },
  monthSelectorBtn: { paddingHorizontal: 16, paddingVertical: 4, backgroundColor: '#FFFFFF', borderRadius: 8, borderWidth: 1, borderColor: '#CBD5E1' },
  monthSelectorArrow: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  monthSelectorText: { fontSize: 15, fontWeight: '800', color: Colors.text },

  mainTabContainer: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 10, marginBottom: 4, gap: 8 },
  mainTabBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: '#F1F5F9', borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0' },
  mainTabBtnActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  mainTabText: { fontSize: 14, fontWeight: '700', color: '#64748B' },
  mainTabTextActive: { color: '#FFFFFF', fontWeight: '800' },

  filterChipRow: { flexDirection: 'row', paddingHorizontal: 16, marginTop: 8, marginBottom: 2, gap: 6 },
  filterChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  filterChipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  filterChipActiveMercenary: { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
  filterChipText: { fontSize: 12, fontWeight: '700', color: '#64748B' },
  filterChipTextActive: { color: '#1D4ED8' },
  filterChipTextActiveMercenary: { color: '#B45309' },

  subFilterContainer: { flexDirection: 'row', paddingHorizontal: 16, marginBottom: 10, gap: 8 },
  subFilterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0' },
  subFilterChipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  subFilterText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  subFilterTextActive: { color: '#1D4ED8', fontWeight: '800' },

  searchContainer: { flexDirection: 'row', alignItems: 'center', backgroundColor: Colors.surface, marginHorizontal: 16, marginTop: 6, marginBottom: 10, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: Colors.border },
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
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
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

  mercenaryBadge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: '#FDE68A' },
  mercenaryBadgeText: { fontSize: 11, fontWeight: '800', color: '#B45309' },
  mercenaryInfoBox: { backgroundColor: '#FEFCE8', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 10 },
  mercenaryInfoTitle: { fontSize: 12, fontWeight: '800', color: '#B45309' },
  mercenaryInfoText: { fontSize: 13, color: '#92400E', fontWeight: '600', marginTop: 2 },

  matchDetails: { backgroundColor: '#F8FAFC', borderRadius: 12, padding: 14, gap: 8 },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  detailIcon: { fontSize: 15 },
  detailText: { fontSize: 14, color: Colors.text, fontWeight: '500' },
  descriptionBox: { marginTop: 14, paddingLeft: 10, borderLeftWidth: 3, borderLeftColor: '#93C5FD' },
  descriptionText: { fontSize: 13, color: '#64748B', fontStyle: 'italic' },

  youtubeBarBtn: { backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
  youtubeBarBtnText: { color: '#DC2626', fontSize: 13, fontWeight: '800' },

  hostManageBtn: { flex: 1, backgroundColor: '#F1F5F9', borderRadius: 12, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#CBD5E1' },
  hostManageBtnText: { color: Colors.primary, fontSize: 14, fontWeight: '700' },
  deleteBtn: { backgroundColor: '#FEF2F2', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: '#FCA5A5', justifyContent: 'center', alignItems: 'center' },
  deleteBtnText: { color: '#DC2626', fontSize: 14, fontWeight: '700' },
  resultInputBtn: { backgroundColor: '#2563EB', borderRadius: 12, paddingVertical: 14, alignItems: 'center', flex: 1 },
  resultInputBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  
  applyBtn: { backgroundColor: '#0EA5E9', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  applyBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  applyMercenaryBtn: { backgroundColor: '#D97706', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  applyMercenaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },

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
  emptyBox: { padding: 30, alignItems: 'center', backgroundColor: Colors.surface, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, marginTop: 20 },
  emptyText: { color: Colors.textMuted, fontSize: 14, fontWeight: '600', textAlign: 'center', lineHeight: 20 },
  
  infoNoticeBox: { backgroundColor: '#FEFCE8', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#FDE68A', marginBottom: 12 },
  infoNoticeTitle: { fontSize: 13, fontWeight: '800', color: '#92400E', marginBottom: 4 },
  infoNoticeText: { fontSize: 12, color: '#B45309', lineHeight: 18, fontWeight: '500' },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: Colors.surface, borderRadius: 20, padding: 20, width: '100%', elevation: 5 },
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
  inputLabel: { fontSize: 13, fontWeight: '700', color: '#475569', marginBottom: 6, marginTop: 10 },
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

  scoreCalcBox: { backgroundColor: '#F8FAFC', borderRadius: 14, padding: 14, borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 10 },
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
  toggleSet3Btn: { backgroundColor: '#FFFFFF', borderStyle: 'dashed', borderWidth: 1, borderColor: '#93C5FD', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginTop: 10 },
  toggleSet3Text: { fontSize: 13, fontWeight: '800', color: '#2563EB' },

  rosterChip: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0' },
  rosterChipActive: { backgroundColor: '#EFF6FF', borderColor: '#3B82F6' },
  rosterChipText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  rosterChipTextActive: { color: '#1D4ED8', fontWeight: '800' },

  teamSelectChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1.5, borderColor: '#CBD5E1', marginRight: 8, marginBottom: 8 },
  teamSelectChipActive: { backgroundColor: '#2563EB', borderColor: '#1D4ED8' },
  teamSelectChipText: { fontSize: 14, fontWeight: '800', color: '#334155' },
  teamSelectChipTextActive: { color: '#FFFFFF' },

  /* 🎁 평가 버튼 전용 스타일 */
  evaluationBtn: { backgroundColor: '#9333EA', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 6 },
  evaluationBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});