import { Colors } from '../constants/Colors';
import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  AppState,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { sendNotificationToTeam } from '../lib/notificationService';
import * as ScreenOrientation from 'expo-screen-orientation';

import ScoreTimeline, { MatchEvent } from '../components/ScoreTimeline';
import PlayerActionModal, { Member } from '../components/PlayerActionModal';
import MatchPostgameReportModal from '../components/MatchPostgameReportModal';
import { parseSetRosterMap } from '../lib/roster';

interface MatchRecord {
  id: string;
  host_team_name: string;
  away_team_name?: string;
  status: string;
  set_scores?: string | null;
  description?: string;
  recorder_host_id?: string | null;
  recorder_away_id?: string | null;
  host_roster?: string;
  away_roster?: string;
  winner_team?: string;
}

export default function ScoreboardScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ matchId: string }>();
  const matchId = params.matchId;

  const { session } = useAuth();
  const currentUserId = session?.user?.id;
  const [currentUserName, setCurrentUserName] = useState<string>('선생님');

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [match, setMatch] = useState<MatchRecord | null>(null);

  const [myTeams, setMyTeams] = useState<string[]>([]);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [myRole, setMyRole] = useState<'spectator' | 'host_recorder' | 'away_recorder' | 'integrated_recorder' | null>(null);

  const [hostRecorderName, setHostRecorderName] = useState<string>('공석');
  const [awayRecorderName, setAwayRecorderName] = useState<string>('공석');

  const [isSwapped, setIsSwapped] = useState(false);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [currentScores, setCurrentScores] = useState<{ host: number; away: number }>({ host: 0, away: 0 });
  const [setHistory, setSetScoresHistory] = useState<string[]>([]);

  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [hostMembers, setHostMembers] = useState<Member[]>([]);
  const [awayMembers, setAwayMembers] = useState<Member[]>([]);

  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionTeam, setActionTeam] = useState<'host' | 'away'>('host');
  const [actionMode, setActionMode] = useState<'score' | 'sub' | 'edit'>('score');
  const [editingEventId, setEditingEventId] = useState<string | null>(null);

  const [editModalVisible, setEditModalVisible] = useState(false);
  const [tempHostScore, setTempHostScore] = useState(0);
  const [tempAwayScore, setTempAwayScore] = useState(0);

  const [finishModalVisible, setFinishModalVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);

  const isInitialLoadRef = useRef(true);
  const currentSetIndexRef = useRef(currentSetIndex);
  currentSetIndexRef.current = currentSetIndex;

  const setHistoryRef = useRef(setHistory);
  setHistoryRef.current = setHistory;

  const myRoleRef = useRef(myRole);
  myRoleRef.current = myRole;

  useEffect(() => {
    if (currentUserId) {
      supabase.from('profiles').select('full_name').eq('id', currentUserId).maybeSingle().then(({ data }) => {
        if (data?.full_name) {
          setCurrentUserName(data.full_name);
        }
      });
    }
  }, [currentUserId]);

  useFocusEffect(
    useCallback(() => {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
      return () => {
        ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      };
    }, [])
  );

  useEffect(() => {
    const releaseRole = async (role: string | null) => {
      if (!matchId || !currentUserId) return;
      if (role === 'host_recorder' || role === 'integrated_recorder') {
        await supabase.from('matches').update({ recorder_host_id: null }).eq('id', matchId);
      } else if (role === 'away_recorder') {
        await supabase.from('matches').update({ recorder_away_id: null }).eq('id', matchId);
      }
    };

    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'background' || nextAppState === 'inactive') {
        releaseRole(myRoleRef.current);
      }
    });

    return () => {
      subscription.remove();
      releaseRole(myRoleRef.current);
    };
  }, [matchId, currentUserId]);

  const isIntramural = match?.status === 'intramural';

  const parsedIntraNames = useMemo(() => {
    if (!match?.description) return { teamA: 'A팀', teamB: 'B팀' };
    const m = match.description.match(/^\[(.*?)\ VS (.*?)\]/);
    if (m) return { teamA: m[1] || 'A팀', teamB: m[2] || 'B팀' };
    return { teamA: 'A팀', teamB: 'B팀' };
  }, [match?.description]);

  const displayHostName = isIntramural ? parsedIntraNames.teamA : match?.host_team_name || '홈팀';
  const displayAwayName = isIntramural ? parsedIntraNames.teamB : match?.away_team_name || '어웨이팀';

  const fetchMembers = async (tName: string) => {
    try {
      const { data: t } = await supabase.from('teams').select('id').eq('name', tName).maybeSingle();
      if (t) {
        const { data: m } = await supabase.from('team_members').select('user_id, profiles(full_name)').eq('team_id', t.id).eq('is_active', true);
        return (m || []).map((x: any) => ({ user_id: x.user_id, full_name: x.profiles?.full_name || '팀원' }));
      }
    } catch (e) {}
    return [];
  };

  const recalcScores = useCallback((allEvents: MatchEvent[], cIndex: number) => {
    const validScores = allEvents.filter(e => e.set_index === cIndex && !e.is_canceled && e.event_type !== 'sub');
    if (validScores.length > 0) {
      const last = validScores[validScores.length - 1];
      setCurrentScores({ host: last.host_score, away: last.away_score });
    } else {
      const currentHistory = setHistoryRef.current;
      if (currentHistory[cIndex]) {
        const [h, a] = currentHistory[cIndex].split(':').map(Number);
        setCurrentScores({ host: h || 0, away: a || 0 });
      } else {
        setCurrentScores({ host: 0, away: 0 });
      }
    }
  }, []);

  const fetchMatchDetails = useCallback(async () => {
    if (!matchId || !currentUserId) return;
    try {
      const { data: tmData } = await supabase.from('team_members').select('teams(name)').eq('user_id', currentUserId).eq('is_active', true);
      const teams = (tmData || []).map((tm: any) => {
        const tObj = Array.isArray(tm.teams) ? tm.teams[0] : tm.teams;
        return tObj?.name || '';
      }).filter(Boolean);
      setMyTeams(teams);

      const { data, error } = await supabase.from('matches').select('*').eq('id', matchId).single();
      if (error) throw error;

      if (data) {
        setMatch(data);
        setRoleModalVisible(true);

        const hMems = await fetchMembers(data.host_team_name);
        setHostMembers(hMems);
        if (data.status === 'intramural') setAwayMembers(hMems);
        else if (data.away_team_name) {
          const aMems = await fetchMembers(data.away_team_name);
          setAwayMembers(aMems);
        }

        if (data.recorder_host_id) {
          const { data: pData } = await supabase.from('profiles').select('full_name').eq('id', data.recorder_host_id).maybeSingle();
          if (pData?.full_name) setHostRecorderName(pData.full_name);
        } else setHostRecorderName('공석');

        if (data.recorder_away_id) {
          const { data: pData } = await supabase.from('profiles').select('full_name').eq('id', data.recorder_away_id).maybeSingle();
          if (pData?.full_name) setAwayRecorderName(pData.full_name);
        } else setAwayRecorderName('공석');

        if (data.set_scores) {
          const sets = data.set_scores.split(', ').filter(Boolean);
          setSetScoresHistory(sets);
          setHistoryRef.current = sets;
          if (isInitialLoadRef.current) {
            setCurrentSetIndex(sets.length);
            currentSetIndexRef.current = sets.length;
            isInitialLoadRef.current = false;
          }
        }

        const { data: evData } = await supabase.from('match_events').select('*').eq('match_id', matchId).order('created_at', { ascending: true });
        if (evData) {
          setEvents(evData);
          recalcScores(evData, currentSetIndexRef.current);
        }
      }
    } catch (err: any) {
      console.error('스코어보드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [matchId, currentUserId, recalcScores]);

  useEffect(() => {
    fetchMatchDetails();

    const matchChannel = supabase.channel(`match_${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, async (payload) => {
        const updated = payload.new as MatchRecord;
        setMatch(updated);
        
        if (updated.set_scores) {
          const sets = updated.set_scores.split(', ').filter(Boolean);
          setSetScoresHistory(sets);
          setHistoryRef.current = sets;
        }

        if (updated.recorder_host_id) {
          const { data: pData } = await supabase.from('profiles').select('full_name').eq('id', updated.recorder_host_id).maybeSingle();
          if (pData?.full_name) setHostRecorderName(pData.full_name);
        } else { setHostRecorderName('공석'); }

        if (updated.recorder_away_id) {
          const { data: pData } = await supabase.from('profiles').select('full_name').eq('id', updated.recorder_away_id).maybeSingle();
          if (pData?.full_name) setAwayRecorderName(pData.full_name);
        } else { setAwayRecorderName('공석'); }
      })
      .subscribe();

    const eventChannel = supabase.channel(`events_${matchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` }, async () => {
        const { data } = await supabase.from('match_events').select('*').eq('match_id', matchId).order('created_at', { ascending: true });
        if (data) {
          setEvents(data);
          recalcScores(data, currentSetIndexRef.current);
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(matchChannel);
      supabase.removeChannel(eventChannel);
    };
  }, [matchId, fetchMatchDetails, recalcScores]);

  const isSingleRecorderMode = isIntramural || myRole === 'integrated_recorder' || 
    (myRole === 'host_recorder' && !match?.recorder_away_id) || 
    (myRole === 'away_recorder' && !match?.recorder_host_id);

  const canControlHost = myRole === 'integrated_recorder' || myRole === 'host_recorder' || isSingleRecorderMode;
  const canControlAway = myRole === 'integrated_recorder' || myRole === 'away_recorder' || isSingleRecorderMode;

  const handleSelectRole = async (role: 'spectator' | 'host_recorder' | 'away_recorder' | 'integrated_recorder') => {
    if (!matchId || !currentUserId) return;
    setActionLoading(true);
    try {
      if (role === 'integrated_recorder' || role === 'host_recorder') {
        setHostRecorderName(currentUserName);
        setMatch(prev => prev ? { ...prev, recorder_host_id: currentUserId } : prev);
        await supabase.from('matches').update({ recorder_host_id: currentUserId }).eq('id', matchId);
      } else if (role === 'away_recorder') {
        setAwayRecorderName(currentUserName);
        setMatch(prev => prev ? { ...prev, recorder_away_id: currentUserId } : prev);
        await supabase.from('matches').update({ recorder_away_id: currentUserId }).eq('id', matchId);
      }
      setMyRole(role);
      setRoleModalVisible(false);
    } catch (err: any) {
      Alert.alert('오류', '권한 설정 실패');
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeaveRole = async () => {
    if (!myRole || myRole === 'spectator' || !matchId || !currentUserId) return;
    Alert.alert('기록 내려놓기', '기록자 권한을 반납하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '반납', onPress: async () => {
          setActionLoading(true);
          try {
            if (myRole === 'host_recorder' || myRole === 'integrated_recorder') {
              setHostRecorderName('공석');
              await supabase.from('matches').update({ recorder_host_id: null }).eq('id', matchId);
            } else if (myRole === 'away_recorder') {
              setAwayRecorderName('공석');
              await supabase.from('matches').update({ recorder_away_id: null }).eq('id', matchId);
            }
            setMyRole('spectator');
          } catch (e) {} finally { setActionLoading(false); }
        }
      }
    ]);
  };

  const openActionModal = (team: 'host' | 'away', mode: 'score' | 'sub') => {
    if (myRole === 'spectator') return;
    setActionTeam(team);
    setActionMode(mode);
    setActionModalVisible(true);
  };

  const handleEditEventTrigger = (event: MatchEvent) => {
    if (myRole === 'spectator') return;
    setActionTeam(event.team_type);
    setActionMode('edit');
    setEditingEventId(event.id);
    setActionModalVisible(true);
  };

  const handleScoreConfirm = async (player: Member | null) => {
    setActionModalVisible(false);
    
    if (actionMode === 'edit' && editingEventId) {
      setEvents(prev => prev.map(e => e.id === editingEventId ? { ...e, player_id: player?.user_id || null, player_name: player?.full_name || null } : e));
      await supabase.from('match_events').update({
        player_id: player?.user_id || null,
        player_name: player?.full_name || null
      }).eq('id', editingEventId);
      return;
    }

    const isHost = actionTeam === 'host';
    const newHostScore = isHost ? currentScores.host + 1 : currentScores.host;
    const newAwayScore = !isHost ? currentScores.away + 1 : currentScores.away;

    setCurrentScores({ host: newHostScore, away: newAwayScore });
    
    const tempEvent: MatchEvent = {
      id: `temp-${Date.now()}`,
      match_id: matchId,
      set_index: currentSetIndex,
      event_type: 'score',
      team_type: actionTeam,
      player_id: player?.user_id || null,
      player_name: player?.full_name || null,
      host_score: newHostScore,
      away_score: newAwayScore,
      is_canceled: false
    };
    setEvents(prev => [...prev, tempEvent]);

    await supabase.from('match_events').insert({
      match_id: matchId,
      set_index: currentSetIndex,
      event_type: 'score',
      team_type: actionTeam,
      player_id: player?.user_id || null,
      player_name: player?.full_name || null,
      host_score: newHostScore,
      away_score: newAwayScore
    });
  };

  const handleSubConfirm = async (outMember: Member, inMember: Member) => {
    setActionModalVisible(false);
    const isHost = actionTeam === 'host';
    const targetRosterStr = isHost ? match?.host_roster : match?.away_roster;

    const rosterMap = parseSetRosterMap(targetRosterStr);

    const currentSetList: string[] = rosterMap[currentSetIndex] || rosterMap[0] || [];
    const updatedSetList = currentSetList
      .filter(id => id !== outMember.user_id)
      .concat(inMember.user_id);

    rosterMap[currentSetIndex] = updatedSetList;
    const updatedRosterJson = JSON.stringify(rosterMap);

    const tempEvent: MatchEvent = {
      id: `temp-${Date.now()}`,
      match_id: matchId,
      set_index: currentSetIndex,
      event_type: 'sub',
      team_type: actionTeam,
      player_id: inMember.user_id,
      player_name: inMember.full_name,
      sub_out_id: outMember.user_id,
      sub_out_name: outMember.full_name,
      host_score: currentScores.host,
      away_score: currentScores.away,
      is_canceled: false
    };
    setEvents(prev => [...prev, tempEvent]);

    const updatePayload = isHost 
      ? { host_roster: updatedRosterJson }
      : { away_roster: updatedRosterJson };

    setMatch(prev => prev ? { ...prev, ...updatePayload } : prev);

    await supabase.from('matches').update(updatePayload).eq('id', matchId);
    await supabase.from('match_events').insert({
      match_id: matchId,
      set_index: currentSetIndex,
      event_type: 'sub',
      team_type: actionTeam,
      player_id: inMember.user_id,
      player_name: inMember.full_name,
      sub_out_id: outMember.user_id,
      sub_out_name: outMember.full_name,
      host_score: currentScores.host,
      away_score: currentScores.away
    });
  };

  const handleUndoEvent = async () => {
    if (myRole === 'spectator' || actionLoading) return;
    const validEvents = events.filter(e => e.set_index === currentSetIndex && !e.is_canceled);
    if (validEvents.length === 0) return;
    const lastEvent = validEvents[validEvents.length - 1];

    Alert.alert('기록 취소', '직전 기록을 취소(음영 처리)하시겠습니까?', [
      { text: '닫기', style: 'cancel' },
      {
        text: '취소 진행',
        style: 'destructive',
        onPress: async () => {
          const newEvents = events.map(e => e.id === lastEvent.id ? { ...e, is_canceled: true } : e);
          setEvents(newEvents);
          recalcScores(newEvents, currentSetIndex);
          await supabase.from('match_events').update({ is_canceled: true }).eq('id', lastEvent.id);
        }
      }
    ]);
  };

  const handleFinishSet = async () => {
    if (myRole === 'spectator') return;
    Alert.alert(
      `🏁 ${currentSetIndex + 1}세트 마감`,
      `현재 점수 [${displayHostName} ${currentScores.host} : ${currentScores.away} ${displayAwayName}]\n${currentSetIndex + 1}세트를 마감하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '세트 마감', onPress: async () => {
            setActionLoading(true);
            try {
              const newSetScoreStr = `${currentScores.host}:${currentScores.away}`;
              const updatedHistory = [...setHistory, newSetScoreStr];
              const formattedSetScores = updatedHistory.join(', ');

              await supabase.from('matches').update({ set_scores: formattedSetScores }).eq('id', matchId);
              const nextIndex = updatedHistory.length;
              setCurrentSetIndex(nextIndex);
              currentSetIndexRef.current = nextIndex;
              setCurrentScores({ host: 0, away: 0 });
            } catch (err: any) {} finally { setActionLoading(false); }
          }
        }
      ]
    );
  };

  const handleOpenFinishMatch = () => {
    if (myRole === 'spectator') return;

    if (isIntramural) {
      setFinishModalVisible(true);
    } else {
      Alert.alert(
        '🏆 경기 최종 마감',
        '현재까지의 점수를 포함하여 경기를 마감하시겠습니까?\n마감 시 상대 팀에 결과 승인 요청이 전달됩니다.',
        [
          { text: '취소', style: 'cancel' },
          { text: '최종 마감', onPress: () => processOfficialMatchFinish() }
        ]
      );
    }
  };

  const handleConfirmIntramuralFinish = async (winner: string) => {
    setActionLoading(true);
    try {
      let finalHistory = [...setHistory];
      if (currentScores.host > 0 || currentScores.away > 0) {
        finalHistory.push(`${currentScores.host}:${currentScores.away}`);
      }
      const formattedSetScores = finalHistory.join(', ');

      await supabase.from('matches').update({
        set_scores: formattedSetScores,
        winner_team: winner,
        recorder_host_id: null,
        recorder_away_id: null,
      }).eq('id', matchId);

      Alert.alert('내전 마감 완료! ⚔️', '팀 내전 전적이 정상 기록되었습니다.', [
        { text: '확인', onPress: () => setReportModalVisible(true) }
      ]);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setActionLoading(false);
      setFinishModalVisible(false);
    }
  };

  const processOfficialMatchFinish = async () => {
    setActionLoading(true);
    try {
      let finalHistory = [...setHistory];
      if (currentScores.host > 0 || currentScores.away > 0) {
        finalHistory.push(`${currentScores.host}:${currentScores.away}`);
      }
      const formattedSetScores = finalHistory.join(', ');

      const myTeamInMatch = match && myTeams.includes(match.host_team_name)
        ? match.host_team_name
        : match?.away_team_name;

      const otherTeam = myTeamInMatch === match?.host_team_name ? match?.away_team_name : match?.host_team_name;

      let winningTeam = 'draw';
      let hostSetWins = 0, awaySetWins = 0;
      finalHistory.forEach(s => {
        const [h, a] = s.split(':').map(Number);
        if (h > a) hostSetWins++;
        else if (a > h) awaySetWins++;
      });
      if (hostSetWins > awaySetWins) winningTeam = match?.host_team_name || '';
      else if (awaySetWins > hostSetWins) winningTeam = match?.away_team_name || '';

      await supabase.from('matches').update({
        status: 'pending_result',
        set_scores: formattedSetScores,
        winner_team: winningTeam,
        result_submitter_team: myTeamInMatch,
        submitted_by_name: currentUserName,
        recorder_host_id: null,
        recorder_away_id: null,
      }).eq('id', matchId);

      if (otherTeam) {
        await sendNotificationToTeam(
          otherTeam,
          '⚠️ [경기 결과 승인 요청]',
          `'${myTeamInMatch}'팀에서 전광판 경기를 마감하고 결과 승인을 요청했습니다.`
        );
      }

      Alert.alert('마감 전달 완료 🏆', '상대 팀에 결과 승인 요청을 전달했습니다.', [
        { text: '확인', onPress: () => setReportModalVisible(true) }
      ]);
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleOpenEditModal = () => {
    if (myRole === 'spectator') return;
    setTempHostScore(currentScores.host);
    setTempAwayScore(currentScores.away);
    setEditModalVisible(true);
  };

  const handleSaveManualScores = async () => {
    setCurrentScores({ host: tempHostScore, away: tempAwayScore });
    await supabase.from('match_events').insert({
      match_id: matchId,
      set_index: currentSetIndex,
      event_type: 'manual',
      team_type: 'host',
      host_score: tempHostScore,
      away_score: tempAwayScore
    });
    setEditModalVisible(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={Colors.primary} />
        <Text style={styles.loadingText}>실시간 전광판 스코어보드를 준비 중입니다...</Text>
      </SafeAreaView>
    );
  }

  const leftTeamData = isSwapped
    ? { key: 'away' as const, name: displayAwayName, score: currentScores.away, canControl: canControlAway && myRole !== 'spectator', isHost: false }
    : { key: 'host' as const, name: displayHostName, score: currentScores.host, canControl: canControlHost && myRole !== 'spectator', isHost: true };

  const rightTeamData = isSwapped
    ? { key: 'host' as const, name: displayHostName, score: currentScores.host, canControl: canControlHost && myRole !== 'spectator', isHost: true }
    : { key: 'away' as const, name: displayAwayName, score: currentScores.away, canControl: canControlAway && myRole !== 'spectator', isHost: false };

  const isMyHostTeam = match && myTeams.includes(match.host_team_name);
  const isMyAwayTeam = match?.away_team_name && myTeams.includes(match.away_team_name);

  const getSetRosters = (isHost: boolean) => {
    const rosterRaw = isHost ? match?.host_roster : match?.away_roster;
    const baseMembers = isHost || isIntramural ? hostMembers : awayMembers;
    const rosterMap = parseSetRosterMap(rosterRaw);
    const setRoster: string[] = rosterMap[currentSetIndex] || rosterMap[0] || [];

    if (Array.isArray(setRoster) && setRoster.length > 0) {
      const court = baseMembers.filter(m => setRoster.includes(m.user_id));
      const bench = baseMembers.filter(m => !setRoster.includes(m.user_id));
      return { court, bench };
    }

    return { court: baseMembers, bench: [] };
  };

  const isHostMaster = match?.recorder_host_id && !match?.recorder_away_id;
  const isAwayMaster = !match?.recorder_host_id && match?.recorder_away_id;
  const masterName = isHostMaster ? hostRecorderName : awayRecorderName;

  const headerCenterText = isIntramural 
    ? `⚡ 내전 통합 기록: ${hostRecorderName}`
    : (isHostMaster || isAwayMaster) 
      ? `⚡ [${isHostMaster ? displayHostName : displayAwayName}] 통합 기록 중: ${masterName} | 상대 기록 대기`
      : `🔵 기록: ${hostRecorderName} | 🔴 기록: ${awayRecorderName}`;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right', 'bottom']}>
      <Modal visible={roleModalVisible && myRole === null} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.roleModalContent}>
            <Text style={styles.modalTitle}>🏟️ 스코어보드 접속 모드 선택</Text>

            <View style={styles.recorderStatusBox}>
              <Text style={styles.recorderStatusTitle}>현재 기록자 현황</Text>
              {isIntramural ? (
                <Text style={styles.recorderStatusText}>
                  ⚡ 통합 기록자: <Text style={{ color: match?.recorder_host_id ? '#38BDF8' : '#94A3B8' }}>{match?.recorder_host_id ? hostRecorderName : '공석 (참여 가능)'}</Text>
                </Text>
              ) : (
                <>
                  <Text style={styles.recorderStatusText}>
                    🔵 {displayHostName}: <Text style={{ color: match?.recorder_host_id ? '#38BDF8' : '#94A3B8' }}>{match?.recorder_host_id ? hostRecorderName : '공석'}</Text>
                  </Text>
                  <Text style={styles.recorderStatusText}>
                    🔴 {displayAwayName}: <Text style={{ color: match?.recorder_away_id ? '#FB7185' : '#94A3B8' }}>{match?.recorder_away_id ? awayRecorderName : '공석'}</Text>
                  </Text>
                  {(isHostMaster || isAwayMaster) && (
                    <Text style={{ fontSize: 11, color: '#38BDF8', marginTop: 4, fontWeight: '800' }}>
                      ※ 현재 '{masterName}' 선생님이 양 팀 기록을 통합 조작 중입니다.
                    </Text>
                  )}
                </>
              )}
            </View>

            <View style={{ gap: 10, marginBottom: 16, width: '100%' }}>
              {isIntramural ? (
                <TouchableOpacity style={[styles.roleBtn, { backgroundColor: '#7E22CE' }]} onPress={() => handleSelectRole('integrated_recorder')}>
                  <Text style={styles.roleBtnText}>⚡ 통합 기록자 (A/B 전체 조작)</Text>
                </TouchableOpacity>
              ) : (
                <>
                  {isMyHostTeam && (!match?.recorder_host_id || match?.recorder_host_id === currentUserId) && (
                    <TouchableOpacity style={[styles.roleBtn, { backgroundColor: '#0284C7' }]} onPress={() => handleSelectRole('host_recorder')}>
                      <Text style={styles.roleBtnText}>
                        {match?.recorder_host_id === currentUserId ? `⚡ 🔵 ${displayHostName} 기록자로 계속하기` : `⚡ 🔵 ${displayHostName} 기록자로 참여`}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {isMyAwayTeam && (!match?.recorder_away_id || match?.recorder_away_id === currentUserId) && (
                    <TouchableOpacity style={[styles.roleBtn, { backgroundColor: '#BE123C' }]} onPress={() => handleSelectRole('away_recorder')}>
                      <Text style={styles.roleBtnText}>
                        {match?.recorder_away_id === currentUserId ? `⚡ 🔴 ${displayAwayName} 기록자로 계속하기` : `⚡ 🔴 ${displayAwayName} 기록자로 참여`}
                      </Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              
              <TouchableOpacity style={[styles.roleBtn, { backgroundColor: '#334155' }]} onPress={() => { setMyRole('spectator'); setRoleModalVisible(false); }}>
                <Text style={styles.roleBtnText}>👁️ 일반 관전자로 입장 (점수 확인만)</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.roleCancelBtn} onPress={() => router.back()}>
              <Text style={styles.roleCancelBtnText}>✕ 스코어보드 나가기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <View style={styles.headerSlim}>
        <View style={styles.headerSlimLeft}>
          <TouchableOpacity style={styles.backBtnSlim} onPress={() => router.back()} hitSlop={10}>
            <Text style={styles.backTextSlim}>‹</Text>
          </TouchableOpacity>

          <View style={styles.setTabNavRow}>
            {[0, 1, 2, 3, 4].map(idx => {
              if (idx > setHistory.length) return null;
              const isCurrent = idx === currentSetIndex;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.setNavPill, isCurrent && styles.setNavPillActive]}
                  onPress={() => {
                    setCurrentSetIndex(idx);
                    currentSetIndexRef.current = idx;
                    recalcScores(events, idx);
                  }}
                >
                  <Text style={[styles.setNavPillText, isCurrent && styles.setNavPillTextActive]}>
                    {idx + 1}세트 {isCurrent ? '(LIVE)' : ''}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {setHistory.length > 0 && (
            <Text style={styles.setHistoryCompact} numberOfLines={1}>
              {setHistory.map((s, i) => `${i + 1}세트 ${s}`).join(' · ')}
            </Text>
          )}
        </View>

        <View style={styles.headerSlimCenter}>
          <Text style={styles.recorderInfoTextSlim} numberOfLines={1}>
            {headerCenterText}
          </Text>
        </View>

        <View style={styles.headerSlimRight}>
          {events.length > 0 && (
            <TouchableOpacity style={styles.reportBtnSlim} onPress={() => setReportModalVisible(true)}>
              <Text style={styles.reportBtnTextSlim}>📊 분석 리포트</Text>
            </TouchableOpacity>
          )}

          {myRole !== 'spectator' && (
            <TouchableOpacity style={styles.leaveRoleBtnSlim} onPress={handleLeaveRole}>
              <Text style={styles.leaveRoleBtnTextSlim}>🚪 반납</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.switchCourtBtnSlim} onPress={() => setIsSwapped(prev => !prev)}>
            <Text style={styles.switchCourtBtnTextSlim}>🔄 코트체인지</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.scoreboardMainGrid}>
        <View style={[styles.teamCourtHalf, leftTeamData.isHost ? styles.hostCourtBg : styles.awayCourtBg]}>
          <View style={styles.courtTopRow}>
            <Text style={styles.courtTeamName} numberOfLines={1}>{leftTeamData.name}</Text>
            {leftTeamData.canControl && (
              <View style={styles.stackedUtilityBtns}>
                <TouchableOpacity style={styles.glassBtnCompact} onPress={() => handleOpenEditModal()}>
                  <Text style={styles.glassBtnText}>✏️ 점수 보정</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.glassBtnCompact} onPress={() => openActionModal(leftTeamData.key, 'sub')}>
                  <Text style={styles.glassBtnText}>🔄 선수 교체</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <TouchableOpacity 
            style={styles.bigScoreTouchArea} 
            onPress={() => { if (leftTeamData.canControl) openActionModal(leftTeamData.key, 'score'); }} 
            disabled={!leftTeamData.canControl}
            activeOpacity={0.8}
          >
            <Text style={styles.bigScoreNumber}>{leftTeamData.score}</Text>
            {leftTeamData.canControl ? (
              <Text style={styles.editHintText}>터치하여 +1점 득점</Text>
            ) : (
              <Text style={styles.spectatorHintText}>👁️ 관전 모드 (점수 확인)</Text>
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.centerDividerLine} />

        <View style={[styles.teamCourtHalf, rightTeamData.isHost ? styles.hostCourtBg : styles.awayCourtBg]}>
          <View style={styles.courtTopRow}>
            <Text style={styles.courtTeamName} numberOfLines={1}>{rightTeamData.name}</Text>
            {rightTeamData.canControl && (
              <View style={styles.stackedUtilityBtns}>
                <TouchableOpacity style={styles.glassBtnCompact} onPress={() => handleOpenEditModal()}>
                  <Text style={styles.glassBtnText}>✏️ 점수 보정</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.glassBtnCompact} onPress={() => openActionModal(rightTeamData.key, 'sub')}>
                  <Text style={styles.glassBtnText}>🔄 선수 교체</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
          <TouchableOpacity 
            style={styles.bigScoreTouchArea} 
            onPress={() => { if (rightTeamData.canControl) openActionModal(rightTeamData.key, 'score'); }} 
            disabled={!rightTeamData.canControl}
            activeOpacity={0.8}
          >
            <Text style={styles.bigScoreNumber}>{rightTeamData.score}</Text>
            {rightTeamData.canControl ? (
              <Text style={styles.editHintText}>터치하여 +1점 득점</Text>
            ) : (
              <Text style={styles.spectatorHintText}>👁️ 관전 모드 (점수 확인)</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.bottomControlBar}>
        <View style={styles.timelineArea}>
          <ScoreTimeline 
            events={events} 
            canControl={myRole !== 'spectator'} 
            displayHostName={displayHostName} 
            displayAwayName={displayAwayName}
            currentSetIndex={currentSetIndex}
            onEditEvent={handleEditEventTrigger} 
          />
        </View>

        {myRole !== 'spectator' && (
          <View style={styles.actionButtonsArea}>
            <TouchableOpacity style={styles.undoBtn} onPress={handleUndoEvent}>
              <Text style={styles.undoBtnText}>↺ 취소 (Undo)</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.finishSetBtn} onPress={handleFinishSet}>
              <Text style={styles.finishSetBtnText}>🏁 세트 마감</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.finishMatchBtn} onPress={handleOpenFinishMatch}>
              <Text style={styles.finishMatchBtnText}>🏆 경기 최종 종료</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <PlayerActionModal
        visible={actionModalVisible}
        mode={actionMode}
        teamName={actionTeam === 'host' ? displayHostName : displayAwayName}
        courtMembers={getSetRosters(actionTeam === 'host').court}
        benchMembers={getSetRosters(actionTeam === 'host').bench}
        onClose={() => { setActionModalVisible(false); if (actionMode === 'score') handleScoreConfirm(null); }}
        onScoreConfirm={handleScoreConfirm}
        onSubConfirm={handleSubConfirm}
      />

      <Modal visible={editModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>✏️ 점수 수동 보정</Text>
            <Text style={styles.modalSub}>오입력된 점수를 직접 수정하세요.</Text>
            <View style={styles.manualScoreGrid}>
              <View style={styles.manualTeamCol}>
                <Text style={styles.manualTeamName}>🔵 {displayHostName}</Text>
                <View style={styles.stepperRow}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setTempHostScore(prev => Math.max(0, prev - 1))}><Text style={styles.stepBtnText}>-</Text></TouchableOpacity>
                  <Text style={styles.manualScoreVal}>{tempHostScore}</Text>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setTempHostScore(prev => prev + 1)}><Text style={styles.stepBtnText}>+</Text></TouchableOpacity>
                </View>
              </View>
              <Text style={styles.manualColon}>:</Text>
              <View style={styles.manualTeamCol}>
                <Text style={styles.manualTeamName}>🔴 {displayAwayName}</Text>
                <View style={styles.stepperRow}>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setTempAwayScore(prev => Math.max(0, prev - 1))}><Text style={styles.stepBtnText}>-</Text></TouchableOpacity>
                  <Text style={styles.manualScoreVal}>{tempAwayScore}</Text>
                  <TouchableOpacity style={styles.stepBtn} onPress={() => setTempAwayScore(prev => prev + 1)}><Text style={styles.stepBtnText}>+</Text></TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setEditModalVisible(false)}><Text style={styles.modalCancelBtnText}>취소</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalSaveBtn} onPress={handleSaveManualScores}><Text style={styles.modalSaveBtnText}>점수 반영</Text></TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={finishModalVisible} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>🏆 팀 내전 경기 최종 마감</Text>
            <Text style={styles.modalSub}>오늘의 팀 내전 연습경기 결과를 선택하여 확정하세요.</Text>
            <View style={{ gap: 8, marginVertical: 14 }}>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#0284C7', paddingVertical: 14 }]} onPress={() => handleConfirmIntramuralFinish(displayHostName)}>
                <Text style={styles.modalSaveBtnText}>🥇 🔵 [{displayHostName}] 승리</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#BE123C', paddingVertical: 14 }]} onPress={() => handleConfirmIntramuralFinish(displayAwayName)}>
                <Text style={styles.modalSaveBtnText}>🥇 🔴 [{displayAwayName}] 승리</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalCancelBtn, { paddingVertical: 14, backgroundColor: '#334155' }]} onPress={() => handleConfirmIntramuralFinish('draw')}>
                <Text style={[styles.modalCancelBtnText, { color: '#FFFFFF' }]}>🤝 무승부 (연습경기 마감)</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setFinishModalVisible(false)}><Text style={styles.modalCancelBtnText}>취소</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>

      {reportModalVisible && match && (
        <MatchPostgameReportModal
          visible={reportModalVisible}
          onClose={() => {
            setReportModalVisible(false);
            router.back();
          }}
          match={match}
          initialEvents={events}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#020617' },
  loadingContainer: { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94A3B8', marginTop: 12, fontSize: 13, fontWeight: '700' },
  headerSlim: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 4, backgroundColor: '#0F172A', borderBottomWidth: 1, borderBottomColor: '#1E293B', height: 42 },
  headerSlimLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1.5 },
  backBtnSlim: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  backTextSlim: { fontSize: 26, color: '#FFFFFF', lineHeight: 26 },
  setTabNavRow: { flexDirection: 'row', gap: 4 },
  setNavPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: '#1E293B' },
  setNavPillActive: { backgroundColor: '#2563EB' },
  setNavPillText: { fontSize: 10.5, fontWeight: '700', color: '#94A3B8' },
  setNavPillTextActive: { color: '#FFFFFF', fontWeight: '900' },
  setHistoryCompact: { fontSize: 10, color: '#38BDF8', fontWeight: '700', marginLeft: 4 },
  headerSlimCenter: { flex: 2, alignItems: 'center', justifyContent: 'center' },
  recorderInfoTextSlim: { fontSize: 11, color: '#CBD5E1', fontWeight: '800' },
  headerSlimRight: { flexDirection: 'row', gap: 4, flex: 1.2, justifyContent: 'flex-end', alignItems: 'center' },
  reportBtnSlim: { backgroundColor: '#FEFCE8', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#FDE047' },
  reportBtnTextSlim: { color: '#A16207', fontWeight: '800', fontSize: 10.5 },
  leaveRoleBtnSlim: { backgroundColor: '#FEF2F2', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#FECACA' },
  leaveRoleBtnTextSlim: { color: '#DC2626', fontWeight: '800', fontSize: 10.5 },
  switchCourtBtnSlim: { backgroundColor: '#1E293B', paddingHorizontal: 6, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#334155' },
  switchCourtBtnTextSlim: { color: '#38BDF8', fontWeight: '800', fontSize: 10.5 },
  scoreboardMainGrid: { flex: 1, flexDirection: 'row', backgroundColor: '#020617' },
  teamCourtHalf: { flex: 1, paddingHorizontal: 12, paddingTop: 6, paddingBottom: 10, justifyContent: 'space-between' },
  hostCourtBg: { backgroundColor: '#0284C7' },
  awayCourtBg: { backgroundColor: '#BE123C' },
  centerDividerLine: { width: 2, backgroundColor: '#1E293B' },
  courtTopRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', width: '100%', zIndex: 10 },
  courtTeamName: { fontSize: 22, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.5, marginTop: 2 },
  stackedUtilityBtns: { flexDirection: 'column', gap: 4, alignItems: 'flex-end' },
  glassBtnCompact: { backgroundColor: 'rgba(0, 0, 0, 0.25)', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)', alignItems: 'center' },
  glassBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  bigScoreTouchArea: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: -50, width: '100%' },
  bigScoreNumber: { fontSize: 195, fontWeight: '900', color: '#FFFFFF', letterSpacing: -6, lineHeight: 180 },
  editHintText: { fontSize: 12, color: 'rgba(255, 255, 255, 0.85)', fontWeight: '800', marginTop: -5 },
  spectatorHintText: { fontSize: 11, color: 'rgba(255, 255, 255, 0.5)', fontWeight: '700', marginTop: -5 },
  bottomControlBar: { flexDirection: 'row', paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#0F172A', borderTopWidth: 1, borderTopColor: '#1E293B', alignItems: 'center' },
  timelineArea: { flex: 1, marginRight: 10 },
  actionButtonsArea: { flexDirection: 'row', gap: 6 },
  undoBtn: { backgroundColor: '#334155', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: '#475569' },
  undoBtnText: { color: '#F8FAFC', fontSize: 12, fontWeight: '800' },
  finishSetBtn: { backgroundColor: '#2563EB', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  finishSetBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  finishMatchBtn: { backgroundColor: '#9333EA', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  finishMatchBtnText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#1E293B', borderRadius: 18, padding: 20, width: 400, maxWidth: '100%', borderWidth: 1, borderColor: '#334155' },
  roleModalContent: { backgroundColor: '#0F172A', borderRadius: 20, padding: 20, width: 400, maxWidth: '100%', borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  modalTitle: { fontSize: 17, fontWeight: '900', color: '#FFFFFF', marginBottom: 4 },
  modalSub: { fontSize: 12, color: '#94A3B8', marginBottom: 12 },
  recorderStatusBox: { width: '100%', backgroundColor: '#1E293B', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#334155', marginBottom: 16 },
  recorderStatusTitle: { fontSize: 11, fontWeight: '800', color: '#94A3B8', marginBottom: 4 },
  recorderStatusText: { fontSize: 13, fontWeight: '800', color: '#F8FAFC', marginBottom: 2 },
  roleBtn: { width: '100%', paddingVertical: 14, borderRadius: 10, borderWidth: 1, borderColor: '#475569', alignItems: 'center' },
  roleBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  roleCancelBtn: { width: '100%', paddingVertical: 12, borderRadius: 10, backgroundColor: '#334155', borderWidth: 1, borderColor: '#475569', alignItems: 'center', marginTop: 6 },
  roleCancelBtnText: { color: '#F8FAFC', fontSize: 13, fontWeight: '800' },
  manualScoreGrid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: '#0F172A', padding: 16, borderRadius: 12, marginBottom: 14 },
  manualTeamCol: { alignItems: 'center' },
  manualTeamName: { fontSize: 14, fontWeight: '800', color: '#F8FAFC', marginBottom: 8 },
  stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  stepBtn: { backgroundColor: '#334155', width: 38, height: 38, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  stepBtnText: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  manualScoreVal: { fontSize: 28, fontWeight: '900', color: '#38BDF8', minWidth: 32, textAlign: 'center' },
  manualColon: { fontSize: 28, fontWeight: '900', color: '#64748B' },
  modalBtnRow: { flexDirection: 'row', gap: 8 },
  modalCancelBtn: { flex: 1, backgroundColor: '#334155', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalCancelBtnText: { color: '#94A3B8', fontWeight: '800', fontSize: 13 },
  modalSaveBtn: { flex: 2, backgroundColor: '#2563EB', paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  modalSaveBtnText: { color: '#FFFFFF', fontWeight: '900', fontSize: 13 },
});