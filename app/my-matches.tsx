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
import MatchResultModal from '../components/MatchResultModal';
import PastMatchRegisterModal from '../components/PastMatchRegisterModal';
import MatchCommentModal from '../components/MatchCommentModal';
import MatchCard, { MatchData, ApplicationData } from '../components/MatchCard';
import { buildTeamStatusByName, isActiveTeamStatus } from '../lib/teamStatus';
import { parseSetRosterMap, safeIncludes, safeNameText, teamsInclude, nameIncludesQuery } from '../lib/roster';
import {
  dynamicScoresFromSets,
  fetchMatchSets,
  recordsFromDynamicScores,
  rosterMapFromSets,
  upsertMatchSets,
} from '../lib/matchSets';

interface MemberInfo {
  user_id: string;
  full_name: string;
}

const REGIONS = ['전체', '천안', '아산', '기타'];

interface DynamicSetScore {
  hostScore: number;
  awayScore: number;
}

type SetRosterMap = { [setIndex: number]: string[] };

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
  const [teamStatusByName, setTeamStatusByName] = useState<Record<string, string>>({});
  
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

  const [expandedMercenaryMatchIds, setExpandedMercenaryMatchIds] = useState<string[]>([]);

  const [selectedMatch, setSelectedMatch] = useState<MatchData | null>(null);
  const [matchApplicants, setMatchApplicants] = useState<ApplicationData[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  const [mercenaryModalVisible, setMercenaryModalVisible] = useState(false);
  const [targetMercenaryMatch, setTargetMercenaryMatch] = useState<MatchData | null>(null);
  const [mercenaryContactInput, setMercenaryContactInput] = useState('');

  const [resultModalVisible, setResultModalVisible] = useState(false);
  const [isRosterOnlyMode, setIsRosterOnlyMode] = useState(false);
  const [selectedMatchForResult, setSelectedMatchForResult] = useState<MatchData | null>(null);
  const [selectedWinner, setSelectedWinner] = useState<string>('');
  const [hostMembers, setHostMembers] = useState<MemberInfo[]>([]);
  const [awayMembers, setAwayMembers] = useState<MemberInfo[]>([]);
  const [hostSetRosters, setHostSetRosters] = useState<SetRosterMap>({});
  const [awaySetRosters, setAwaySetRosters] = useState<SetRosterMap>({});
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

  const [evalModalVisible, setEvalModalVisible] = useState(false);
  const [evalTargetMatchId, setEvalTargetMatchId] = useState('');
  const [evalTargetTeamName, setEvalTargetTeamName] = useState('');
  const [evalMatchMembers, setEvalMatchMembers] = useState<MemberInfo[]>([]);

  const [selectedUserIdForModal, setSelectedUserIdForModal] = useState<string | null>(null);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [targetCommentMatch, setTargetCommentMatch] = useState<MatchData | null>(null);
  const [fetchingComments, setFetchingComments] = useState(false);
  const [commentsList, setCommentsList] = useState<CommentData[]>([]);
  const [commentInput, setCommentInput] = useState('');
  const [availableBadges, setAvailableBadges] = useState<BadgeOption[]>([]);
  const [selectedBadge, setSelectedBadge] = useState<BadgeOption | null>(null);

  const toggleMercenaryDetails = (matchId: string) => {
    setExpandedMercenaryMatchIds(prev =>
      prev.includes(matchId) ? prev.filter(id => id !== matchId) : [...prev, matchId]
    );
  };

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

      const { data: teamsData } = await supabase.from('teams').select('id, name, status');
      if (teamsData) {
        const parsed = teamsData.map((t: any) => ({
          name: parseTeamName(t.name),
          status: t.status || 'active',
        })).filter((t: any) => t.name);
        setTeamStatusByName(buildTeamStatusByName(parsed));
        setAllTeams(parsed.filter((t: any) => isActiveTeamStatus(t.status)).map((t: any) => t.name));
      }

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

  const openEvaluationModal = async (match: MatchData) => {
    if (!currentUserId) return;
    const isHost = teamsInclude(myTeams, match.host_team_name);
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

  const openUserProfileModal = (uId: string) => {
    setSelectedUserIdForModal(uId);
    setProfileModalVisible(true);
  };

  const handleOpenYoutube = (url?: string) => {
    if (!url) return;
    Linking.openURL(url).catch(() => Alert.alert('오류', '올바른 유튜브 링크가 아니거나 연결할 수 없습니다.'));
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

  const parseRoster = (rosterStr: string | null | undefined): SetRosterMap => parseSetRosterMap(rosterStr);

  const fetchMatchTeamMembers = async (
    hostTeamName: string,
    awayTeamName?: string,
    existingHostRosterStr?: string,
    existingAwayRosterStr?: string
  ) => {
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

      setHostSetRosters(parseRoster(existingHostRosterStr));
      setAwaySetRosters(parseRoster(existingAwayRosterStr));
    } catch (err) { console.error('팀원 조회 실패:', err); }
  };

  const handleToggleSetRoster = (setIndex: number, userId: string, isHost: boolean) => {
    const currentMap = isHost ? { ...hostSetRosters } : { ...awaySetRosters };
    const currentSetList = currentMap[setIndex] || [];
    
    let updatedSetList: string[];
    if (safeIncludes(currentSetList, userId)) {
      updatedSetList = currentSetList.filter(id => id !== userId);
    } else {
      updatedSetList = [...currentSetList, userId];
    }
    
    currentMap[setIndex] = updatedSetList;

    if (setIndex === 0) {
      dynamicScores.forEach((_, idx) => {
        if (idx > 0 && (!currentMap[idx] || currentMap[idx].length === 0)) {
          currentMap[idx] = updatedSetList;
        }
      });
    }

    if (isHost) setHostSetRosters(currentMap);
    else setAwaySetRosters(currentMap);
  };

  const openCommentModal = async (match: MatchData) => {
    setTargetCommentMatch(match);
    setCommentModalVisible(true);
    setFetchingComments(true);
    setCommentInput('');

    const badges: BadgeOption[] = [];
    if (teamsInclude(myTeams, match.host_team_name)) {
      badges.push({ type: 'host', teamName: match.host_team_name, label: `👑 주최팀 (${match.host_team_name})` });
    }
    if (match.away_team_name && teamsInclude(myTeams, match.away_team_name)) {
      badges.push({ type: 'applicant', teamName: match.away_team_name, label: `⚔️ 상대팀 (${match.away_team_name})` });
    }
    const myApps = myApplications.filter(a => a.match_id === match.id);
    myApps.forEach(app => {
      if (app.application_type === 'mercenary') {
        badges.push({ type: 'mercenary', label: '🙋‍♂️ 용병 신청자' });
      } else if (app.application_type === 'team' && !badges.find(b => b.teamName === app.applicant_team_name)) {
        badges.push({ type: 'applicant', teamName: app.applicant_team_name, label: `🛡️ 신청팀 (${app.applicant_team_name})` });
      }
    });
    badges.push({ type: 'general', label: '👤 티볼리 유저' });
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
          full_name: item.profiles?.full_name || '선생님',
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
        const newComment = {
          id: data.id,
          match_id: data.match_id,
          user_id: data.user_id,
          content: data.content,
          created_at: data.created_at,
          full_name: data.profiles?.full_name || currentUserName,
          badgeType: data.badge_type,
          badgeLabel: data.badge_label,
        };
        setCommentsList(prev => [...prev, newComment]);
      }
      setCommentInput('');

      if (targetCommentMatch.host_team_name && selectedBadge.type !== 'host') {
         await sendNotificationToTeam(targetCommentMatch.host_team_name, '💬 [매치 소통 댓글]', `'${targetCommentMatch.host_team_name}' 주최 경기에 새로운 댓글이 달렸습니다.`);
      }
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setActionLoading(false);
    }
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

    const isHost = teamsInclude(myTeams, match.host_team_name);
    const isAway = match.away_team_name ? teamsInclude(myTeams, match.away_team_name) : false;
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
      nameIncludesQuery(match.host_team_name, query) ||
      (match.away_team_name && nameIncludesQuery(match.away_team_name, query)) ||
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
    const myApp = myApplications.find(a => a.match_id === match.id && (teamsInclude(myTeams, a.applicant_team_name) || a.applicant_user_id === currentUserId));
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
      : `'${app.applicant_team_name}' 팀의 신청을 수락하시겠습니까?\n\n※ 주의: 매칭 확정 시 기존에 전광판에서 조작했던 모든 테스트(연습) 기록은 0:0 백지 상태로 자동 초기화됩니다.`;

    Alert.alert(alertTitle, alertMsg, [
      { text: '취소', style: 'cancel' },
      {
        text: '수락',
        onPress: async () => {
          setActionLoading(true);
          try {
            if (!isMercenaryApp) {
              await supabase.from('match_events').delete().eq('match_id', selectedMatch.id);

              await supabase.from('matches').update({ 
                status: 'matched', 
                away_team_name: app.applicant_team_name,
                set_scores: null,
                recorder_host_id: null,
                recorder_away_id: null
              }).eq('id', selectedMatch.id);
              
              setMatches(prev => prev.map(m => m.id === selectedMatch.id ? { 
                ...m, 
                status: 'matched', 
                away_team_name: app.applicant_team_name,
                set_scores: null,
                recorder_host_id: null,
                recorder_away_id: null
              } : m));
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
              Alert.alert('매칭 완료! 🏐', '매칭이 성사되어 공식 전광판 기록이 초기화되었습니다. 깨끗한 0:0 상태로 실제 경기를 진행하세요!');
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

  const handleSaveResult = async () => {
    if (!selectedMatchForResult) return;
    if (!selectedWinner) return Alert.alert('알림', '최종 승리 팀을 선택해 주세요.');
    
    const myTeamInMatch = teamsInclude(myTeams, selectedMatchForResult.host_team_name)
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
        winner_team: selectedWinner,
        result_submitter_team: myTeamInMatch,
        submitted_by_name: currentUserName,
        set_scores: formattedScores,
        host_roster: JSON.stringify(hostSetRosters),
        away_roster: JSON.stringify(awaySetRosters),
        host_youtube_url: hostYoutube.trim() || null,
        away_youtube_url: awayYoutube.trim() || null,
      };

      await supabase.from('matches').update(updateData).eq('id', selectedMatchForResult.id);
      await upsertMatchSets(
        selectedMatchForResult.id,
        recordsFromDynamicScores(dynamicScores, hostSetRosters, awaySetRosters, true),
      );
      setMatches(prev => prev.map(m => m.id === selectedMatchForResult.id ? { ...m, ...updateData } : m));

      const resultMsg = selectedWinner === 'draw' ? '무승부' : `'${selectedWinner}' 승리`;
      const scoreMsg = formattedScores ? ` (${formattedScores})` : '';
      
      if (otherTeam) {
        await sendNotificationToTeam(
          otherTeam, 
          '⚠️ [경기 결과 수정 승인 요청]', 
          `'${myTeamInMatch}'팀 (${currentUserName} 선생님) 이 경기 결과를 [${resultMsg}]${scoreMsg}로 제출했습니다. 동의해 주세요.`
        );
      }

      Alert.alert('수정 전달 완료', `'${currentUserName}' 선생님의 명의로 상대 팀에 승인 요청이 전송되었습니다.`);
      setResultModalVisible(false);
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally { 
      setActionLoading(false); 
    }
  };

  const handleSaveRosterOnly = async () => {
    if (!selectedMatchForResult) return;

    const nowTimeStr = new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

    setActionLoading(true);
    try {
      const updateData = {
        host_roster: JSON.stringify(hostSetRosters),
        away_roster: JSON.stringify(awaySetRosters),
        roster_updated_by_name: currentUserName,
        roster_updated_at: nowTimeStr,
      };

      await supabase.from('matches').update(updateData).eq('id', selectedMatchForResult.id);
      await upsertMatchSets(
        selectedMatchForResult.id,
        recordsFromDynamicScores(
          dynamicScores.length > 0 ? dynamicScores : [{ hostScore: 0, awayScore: 0 }],
          hostSetRosters,
          awaySetRosters,
          false,
        ),
      );
      setMatches(prev => prev.map(m => m.id === selectedMatchForResult.id ? { ...m, ...updateData } : m));

      const myTeam = teamsInclude(myTeams, selectedMatchForResult.host_team_name) ? selectedMatchForResult.host_team_name : selectedMatchForResult.away_team_name;
      if (myTeam) {
        await sendNotificationToTeam(
          myTeam,
          '👥 [출전 명단 수정 완료]',
          `'${currentUserName}' 님이 출전 명단을 변경했습니다. (${nowTimeStr})`
        );
      }

      Alert.alert('명단 변경 완료! ✨', `출전 명단이 즉시 반영되었습니다.\n(최근 수정: ${nowTimeStr} ${currentUserName} 선생님)`);
      setResultModalVisible(false);
    } catch (err: any) {
      Alert.alert('오류', err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const hydrateResultFromSsot = async (match: MatchData, fallbackScores: DynamicSetScore[]) => {
    try {
      const snapshot = await fetchMatchSets(match.id);
      const scores = dynamicScoresFromSets(snapshot.sets);
      setDynamicScores(scores.length > 0 ? scores : fallbackScores);
      const hostMap = rosterMapFromSets(snapshot.sets, 'host');
      const awayMap = rosterMapFromSets(snapshot.sets, 'away');
      await fetchMatchTeamMembers(
        safeNameText(match.host_team_name),
        match.away_team_name ? safeNameText(match.away_team_name) : undefined,
        JSON.stringify(hostMap),
        JSON.stringify(awayMap),
      );
    } catch {
      const parsedScores = parseScoresToArray(match.set_scores);
      setDynamicScores(parsedScores.length > 0 ? parsedScores : fallbackScores);
      await fetchMatchTeamMembers(
        safeNameText(match.host_team_name),
        match.away_team_name ? safeNameText(match.away_team_name) : undefined,
        match.host_roster,
        match.away_roster,
      );
    }
  };

  const openRosterOnlyModal = async (match: MatchData) => {
    setSelectedMatchForResult(match);
    setIsRosterOnlyMode(true);
    await hydrateResultFromSsot(match, [{ hostScore: 0, awayScore: 0 }]);
    setResultModalVisible(true);
  };

  const openResultModal = async (match: MatchData) => {
    setSelectedMatchForResult(match);
    setIsRosterOnlyMode(false);
    setSelectedWinner(match.winner_team || '');
    await hydrateResultFromSsot(match, [{ hostScore: 25, awayScore: 21 }]);
    setHostYoutube(match.host_youtube_url || '');
    setAwayYoutube(match.away_youtube_url || '');
    setResultModalVisible(true);
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
                
                const otherTeam = teamsInclude(myTeams, match.host_team_name) ? match.away_team_name : match.host_team_name;
                if (otherTeam) {
                  await sendNotificationToTeam(otherTeam, '✅ [결과 승인 완료]', `상대 팀이 결과를 승인하여 공식 랭킹에 정식 반영되었습니다.`);
                }
                Alert.alert('승인 완료', '공식 전적으로 랭킹에 반영되었습니다.');
                setMainTab('completed'); 
              } else {
                await supabase.from('matches').delete().eq('id', match.id);
                setMatches(prev => prev.filter(m => m.id !== match.id));
                
                const otherTeam = teamsInclude(myTeams, match.host_team_name) ? match.away_team_name : match.host_team_name;
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
          host_roster: currentUserId ? JSON.stringify({ 0: [currentUserId] }) : null,
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
        {loading ? (
          <ActivityIndicator color={Colors.primary} size="large" style={{ marginTop: 40 }} />
        ) : filteredMatches.length === 0 ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>
              {mainTab === 'active' 
                ? `${listMonth}월에 진행 중인 매치가 없습니다. (종료된 매치는 상단 '종료됨' 탭을 누르세요)` 
                : `${listMonth}월에 종료된 매치 기록이 없습니다.`}
            </Text>
          </View>
        ) : (
          filteredMatches.map((match) => (
            <MatchCard
              key={match.id}
              match={match}
              myTeams={myTeams}
              myApplications={myApplications}
              currentUserId={currentUserId}
              expandedMercenaryMatchIds={expandedMercenaryMatchIds}
              actionLoading={actionLoading}
              onToggleMercenaryDetails={toggleMercenaryDetails}
              onOpenCommentModal={openCommentModal}
              onOpenYoutube={handleOpenYoutube}
              onOpenEvaluationModal={openEvaluationModal}
              onOpenResultModal={openResultModal}
              onOpenRosterOnlyModal={openRosterOnlyModal}
              onApproveResult={handleApproveResult}
              onCancelApplication={handleCancelApplication}
              onOpenApplicantModal={openApplicantModal}
              onDeleteMatch={handleDeleteMatch}
              onOpenMercenaryModal={handleOpenMercenaryModal}
              onApplyMatch={handleApplyMatch}
              teamStatusByName={teamStatusByName}
            />
          ))
        )}
      </ScrollView>

      <StickyAdBanner />

      <MatchResultModal
        visible={resultModalVisible}
        onClose={() => setResultModalVisible(false)}
        match={selectedMatchForResult}
        isRosterOnlyMode={isRosterOnlyMode}
        hostYoutube={hostYoutube}
        onChangeHostYoutube={setHostYoutube}
        awayYoutube={awayYoutube}
        onChangeAwayYoutube={setAwayYoutube}
        dynamicScores={dynamicScores}
        onAddSet={() => setDynamicScores(prev => [...prev, { hostScore: 25, awayScore: 21 }])}
        onRemoveSet={(idx) => setDynamicScores(prev => prev.filter((_, i) => i !== idx))}
        onUpdateScore={(idx, isHost, delta) => {
          setDynamicScores(prev => {
            const arr = [...prev];
            if (isHost) arr[idx].hostScore = Math.max(0, arr[idx].hostScore + delta);
            else arr[idx].awayScore = Math.max(0, arr[idx].awayScore + delta);
            return arr;
          });
        }}
        hostMembers={hostMembers}
        awayMembers={awayMembers}
        hostSetRosters={hostSetRosters}
        awaySetRosters={awaySetRosters}
        onToggleSetRoster={handleToggleSetRoster}
        onRosterMapsChange={(host, away) => {
          setHostSetRosters(host);
          setAwaySetRosters(away);
        }}
        selectedWinner={selectedWinner}
        onSelectWinner={setSelectedWinner}
        onSaveResult={handleSaveResult}
        onSaveRosterOnly={handleSaveRosterOnly}
        actionLoading={actionLoading}
      />

      <PastMatchRegisterModal
        visible={pastModalVisible}
        onClose={() => setPastMatchModalVisible(false)}
        myTeams={myTeams}
        pastHostTeam={pastHostTeam}
        onSelectPastHostTeam={setPastHostTeam}
        pastAwayTeam={pastAwayTeam}
        onChangePastAwayTeam={(txt) => { setPastAwayTeam(txt); setShowAwayDropdown(true); }}
        showAwayDropdown={showAwayDropdown}
        onShowAwayDropdown={setShowAwayDropdown}
        filteredAwayTeams={filteredAwayTeams}
        pastMatchDate={pastMatchDate}
        onSelectPastMatchDate={setPastMatchDate}
        pastHostYoutube={pastHostYoutube}
        onChangePastHostYoutube={setPastHostYoutube}
        pastAwayYoutube={pastAwayYoutube}
        onChangePastAwayYoutube={setPastAwayYoutube}
        pastDynamicScores={pastDynamicScores}
        onAddPastSet={() => {
          if (pastDynamicScores.length >= 7) return Alert.alert('알림', '최대 7세트까지만 가능합니다.');
          setPastDynamicScores(prev => [...prev, { hostScore: 25, awayScore: 21 }]);
        }}
        onRemovePastSet={(idx) => setPastDynamicScores(prev => prev.filter((_, i) => i !== idx))}
        onUpdatePastScore={(idx, isHost, delta) => {
          setPastDynamicScores(prev => {
            const arr = [...prev];
            if (isHost) arr[idx].hostScore = Math.max(0, arr[idx].hostScore + delta);
            else arr[idx].awayScore = Math.max(0, arr[idx].awayScore + delta);
            return arr;
          });
        }}
        pastWinner={pastWinner}
        onSelectPastWinner={setPastWinner}
        onRegisterPastMatch={handleRegisterPastMatch}
        actionLoading={actionLoading}
      />

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

      <MatchEvaluationModal
        visible={evalModalVisible}
        onClose={() => setEvalModalVisible(false)}
        matchId={evalTargetMatchId}
        evaluatorId={currentUserId || ''}
        targetTeamName={evalTargetTeamName}
        matchMembers={evalMatchMembers}
        onEvaluationComplete={fetchData}
      />

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
        onOpenUserProfile={openUserProfileModal}
      />

      <UserProfileModal
        visible={profileModalVisible}
        userId={selectedUserIdForModal}
        onClose={() => {
          setProfileModalVisible(false);
          setSelectedUserIdForModal(null);
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

  applyMercenaryBtn: { backgroundColor: '#D97706', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  applyMercenaryBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
});