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
  StatusBar,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { sendNotificationToTeam } from '../lib/notificationService';
import { isGuestBindPending, isSoloGuestMatch } from '../lib/guestMatch';
import { asArray, safeInset, safeLockLandscape, safeLockPortrait, safeStyleNumber } from '../lib/nativeSafe';
import { MatchEvent } from '../components/ScoreTimeline';
import ScoreTimeline from '../components/ScoreTimeline';
import PlayerActionModal, { Member, ScoreKind, type LineupApplyPayload } from '../components/PlayerActionModal';
import MatchPostgameReportModal from '../components/MatchPostgameReportModal';
import FormationModal from '../components/FormationModal';
import { MomentumLevelBar } from '../components/SetFlowGauges';
import { ANONYMOUS_PLAYER_NAME, assignedUserId, clampLineCount, DEFAULT_LINE_COUNT, displaySlotPlayerName, ensureTempIdsInCourt, isRegisteredUserId, isTempSlotId, listHasUser, parseSetFormation, parseSetFormationMap, parseSetRosterMap, persistCourtSlots, resolveFormationForSet, resolveFormationFromSources, safeIncludes, safeNameText, seedNextSetFormation, teamsInclude, type SetFormation } from '../lib/roster';
import { getSafeDisplayName, getSafeTeamName } from '../lib/utils';
import { appendMatchScoreLog } from '../lib/retroactiveBinding';
import { updateMatchIgnoringUnknownColumns } from '../lib/matchWrite';
import { resolveTeamName } from '../lib/nameUtils';
import {
  MAX_SETS,
  collectClosedSetScores,
  deleteSetAndReindex,
  fetchMatchSets,
  makeInitialLiveSet,
  normalizeSetRecords,
  parseRosterJson,
  upsertMatchSets,
  lastScoreForSetFromEvents,
  syncSetScoreFromRemainingEvents,
  type MatchSetRecord,
} from '../lib/matchSets';

const safeNativeCall = async (action: () => Promise<any>) => {
  if (Platform.OS === 'web') return;
  try {
    await action();
  } catch (e) {
    console.warn('[Native Safe Guard] bypassed:', e);
  }
};

type ScoreboardScreenProps = {
  matchId?: string;
  isSpectator?: boolean;
};

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
  score_logs?: any[] | null;
  is_guest_match?: boolean | null;
  away_team_id?: string | null;
}

function setIndexFromScoreLog(log: any): number {
  if (log?.set_index != null && log.set_index !== '') return Number(log.set_index) || 0;
  return Math.max(0, (Number(log?.set_number) || 1) - 1);
}

function mapScoreLogToEvent(log: any, matchId: string, fallbackId: string): MatchEvent {
  return {
    id: String(log?.id || fallbackId),
    match_id: matchId,
    set_index: setIndexFromScoreLog(log),
    event_type: log?.event_type,
    team_type: log?.team_type,
    player_id: log?.player_id ?? null,
    player_name: log?.player_name ?? null,
    host_score: Number(log?.host_score) || 0,
    away_score: Number(log?.away_score) || 0,
    is_canceled: !!log?.is_canceled,
  };
}

function mergeEventsWithScoreLogs(tableEvents: MatchEvent[], scoreLogs: any[], matchId: string): MatchEvent[] {
  const mapped = (Array.isArray(scoreLogs) ? scoreLogs : []).map((log, i) => (
    mapScoreLogToEvent(log, matchId, `log-${i}`)
  ));
  const table = Array.isArray(tableEvents) ? tableEvents : [];
  if (table.length === 0) return mapped;
  const ids = new Set(table.map((e) => String(e.id)));
  const extras = mapped.filter((e) => !ids.has(String(e.id)));
  return extras.length ? [...table, ...extras] : table;
}

function pickHydratedSetScore(
  setRow?: { hostScore?: number; awayScore?: number; host_score?: number; away_score?: number } | null,
  fromEvents?: { host: number; away: number } | null,
): { host: number; away: number } | null {
  if (!setRow && !fromEvents) return null;
  const host = Number(setRow?.hostScore ?? setRow?.host_score);
  const away = Number(setRow?.awayScore ?? setRow?.away_score);
  const rowScore = setRow ? { host: host || 0, away: away || 0 } : null;
  if (rowScore && (rowScore.host > 0 || rowScore.away > 0)) return rowScore;
  if (fromEvents && (fromEvents.host > 0 || fromEvents.away > 0)) return fromEvents;
  return rowScore || fromEvents || null;
}

export default function ScoreboardScreen(props: ScoreboardScreenProps = {}) {
  const router = useRouter();
  const params = useLocalSearchParams<{ matchId: string }>();
  const paramMatchId = Array.isArray(params.matchId) ? params.matchId[0] : params.matchId;
  const matchId = props.matchId || paramMatchId;
  const isSpectatorForced = props.isSpectator === true;

  const { session } = useAuth();
  const insets = useSafeAreaInsets();
  const safeTop = typeof insets.top === 'number' && !Number.isNaN(insets.top) ? insets.top : 0;
  const safeBottom = typeof insets.bottom === 'number' && !Number.isNaN(insets.bottom) ? insets.bottom : 0;
  const currentUserId = session?.user?.id;
  const [currentUserName, setCurrentUserName] = useState<string>('선생님');

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [match, setMatch] = useState<MatchRecord | null>(null);

  const [myTeams, setMyTeams] = useState<string[]>([]);
  const [roleModalVisible, setRoleModalVisible] = useState(false);
  const [myRole, setMyRole] = useState<'spectator' | 'host_recorder' | 'away_recorder' | 'integrated_recorder' | null>(
    isSpectatorForced ? 'spectator' : null,
  );

  const [hostRecorderName, setHostRecorderName] = useState<string>('공석');
  const [awayRecorderName, setAwayRecorderName] = useState<string>('공석');

  const [isSwapped, setIsSwapped] = useState(false);
  const [currentSetIndex, setCurrentSetIndex] = useState(0);
  const [currentScores, setCurrentScores] = useState<{ host: number; away: number }>({ host: 0, away: 0 });
  const [setHistory, setSetScoresHistory] = useState<string[]>([]);
  const [matchSets, setMatchSets] = useState<MatchSetRecord[]>([]);

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
  const [timelineEpoch, setTimelineEpoch] = useState(0);
  const [pendingDeleteSet, setPendingDeleteSet] = useState<number | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<MatchEvent | null>(null);
  const [formationVisible, setFormationVisible] = useState(false);
  const [formationTeam] = useState<'host' | 'away'>('host');

  const isInitialLoadRef = useRef(true);
  const didAutofillSet1Ref = useRef(false);
  const matchClosedRef = useRef(false);
  const hydrateGenRef = useRef(0);
  const currentSetIndexRef = useRef(currentSetIndex);
  currentSetIndexRef.current = currentSetIndex;

  const setHistoryRef = useRef(setHistory);
  setHistoryRef.current = setHistory;

  const myRoleRef = useRef(myRole);
  myRoleRef.current = myRole;

  useEffect(() => {
    if (currentUserId) {
      supabase.from('profiles').select('*').eq('id', currentUserId).maybeSingle().then(({ data }) => {
        const next = getSafeDisplayName(data || session?.user?.user_metadata);
        if (next) setCurrentUserName(next);
      });
    }
  }, [currentUserId]);

  useFocusEffect(
    useCallback(() => {
      if (Platform.OS === 'web') return;
      if (!matchClosedRef.current) {
        void safeNativeCall(() => safeLockLandscape());
      }
      return () => {
        void safeNativeCall(() => safeLockPortrait());
      };
    }, [])
  );

  const resetSetUiState = useCallback(() => {
    setTimelineEpoch((n) => n + 1);
    setActionModalVisible(false);
    setEditingEventId(null);
    setPendingDeleteEvent(null);
  }, []);

  const openPostMatchReport = useCallback(async () => {
    matchClosedRef.current = true;
    setFinishModalVisible(false);
    setActionModalVisible(false);
    setEditModalVisible(false);
    await safeNativeCall(() => safeLockPortrait());
    setReportModalVisible(true);
  }, []);

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

  const displayHostName = isIntramural ? getSafeTeamName(parsedIntraNames.teamA) : getSafeTeamName(match?.host_team_name || match);
  const displayAwayName = isIntramural ? getSafeTeamName(parsedIntraNames.teamB) : getSafeTeamName(match?.away_team_name);

  const fetchMembers = async (tName: string) => {
    try {
      const { data: t } = await supabase.from('teams').select('id').eq('name', tName).maybeSingle();
      if (t) {
        const { data: m } = await supabase.from('team_members').select('user_id, profiles(*)').eq('team_id', t.id).eq('is_active', true);
        return (m || []).map((x: any) => ({ user_id: x.user_id, full_name: getSafeDisplayName(x.profiles || x) }));
      }
    } catch (e) {}
    return [];
  };

  const recalcScores = useCallback((allEvents: MatchEvent[], cIndex: number) => {
    const idx = Number(cIndex);
    const next = lastScoreForSetFromEvents(allEvents, idx);
    setCurrentScores({ host: next.host, away: next.away });
  }, []);

  const persistRecalculatedSetScore = async (allEvents: MatchEvent[], setIndex: number) => {
    if (!matchId) return lastScoreForSetFromEvents(allEvents, setIndex);
    const score = await syncSetScoreFromRemainingEvents(matchId, allEvents, setIndex).catch(() => (
      lastScoreForSetFromEvents(allEvents, setIndex)
    ));
    setCurrentScores((prev) => (setIndex === currentSetIndexRef.current ? { host: score.host, away: score.away } : prev));
    setMatchSets((prev) => prev.map((s) => (
      s.setNumber === setIndex + 1 ? { ...s, hostScore: score.host, awayScore: score.away } : s
    )));
    setMatch((prev) => {
      if (!prev) return prev;
      const parts = String(prev.set_scores || '').split(',').map((c) => c.trim()).filter(Boolean);
      while (parts.length <= setIndex) parts.push('0:0');
      parts[setIndex] = `${score.host}:${score.away}`;
      return { ...prev, set_scores: parts.join(', ') };
    });
    if (setIndex < setHistoryRef.current.length) {
      const nextHistory = [...setHistoryRef.current];
      nextHistory[setIndex] = `${score.host}:${score.away}`;
      setSetScoresHistory(nextHistory);
      setHistoryRef.current = nextHistory;
    }
    return score;
  };

  const fetchMatchDetails = useCallback(async () => {
    if (!matchId) return;
    if (!currentUserId && !isSpectatorForced) return;
    try {
      if (currentUserId) {
        const { data: tmData } = await supabase.from('team_members').select('teams(name)').eq('user_id', currentUserId).eq('is_active', true);
        const teams = (tmData || []).map((tm: any) => {
          const tObj = Array.isArray(tm.teams) ? tm.teams[0] : tm.teams;
          return tObj?.name || '';
        }).filter(Boolean);
        setMyTeams(teams);
      }

      const { data, error } = await supabase.from('matches').select('*').eq('id', matchId).single();
      if (error) throw error;

      if (data) {
        setMatch(data);
        if (isSpectatorForced) {
          setMyRole('spectator');
          setRoleModalVisible(false);
        } else {
          setRoleModalVisible(true);
        }

        const hMems = await fetchMembers(safeNameText(data.host_team_name));
        setHostMembers(hMems);
        if (data.status === 'intramural') setAwayMembers(hMems);
        else if (data.away_team_name) {
          const aMems = await fetchMembers(safeNameText(data.away_team_name));
          setAwayMembers(aMems);
        }

        if (data.recorder_host_id) {
          const { data: pData } = await supabase.from('profiles').select('*').eq('id', data.recorder_host_id).maybeSingle();
          if (pData) setHostRecorderName(getSafeDisplayName(pData));
        } else setHostRecorderName('공석');

        if (data.recorder_away_id) {
          const { data: pData } = await supabase.from('profiles').select('*').eq('id', data.recorder_away_id).maybeSingle();
          if (pData) setAwayRecorderName(getSafeDisplayName(pData));
        } else setAwayRecorderName('공석');

        const snapshot = await fetchMatchSets(matchId);
        const loadedSets = normalizeSetRecords(snapshot.sets.length > 0 ? snapshot.sets : [makeInitialLiveSet()]);
        setMatchSets(loadedSets);
        const closed = loadedSets.filter((s) => s.isClosed);
        const closedStrs = closed.map((s) => `${s.hostScore}:${s.awayScore}`);
        setSetScoresHistory(closedStrs);
        setHistoryRef.current = closedStrs;

        if (isInitialLoadRef.current) {
          const liveIdx = snapshot.liveSetIndex;
          setCurrentSetIndex(liveIdx);
          currentSetIndexRef.current = liveIdx;
          isInitialLoadRef.current = false;
        }

        const { data: evData } = await supabase.from('match_events').select('*').eq('match_id', matchId).order('created_at', { ascending: true });
        const scoreLogs = asArray((data as any)?.score_logs);
        const mergedEvents = mergeEventsWithScoreLogs(asArray<MatchEvent>(evData), scoreLogs, matchId);
        setEvents(mergedEvents);

        const applyIdx = currentSetIndexRef.current;
        const setRec = loadedSets.find((s) => s.setNumber === applyIdx + 1) || loadedSets[applyIdx];
        const picked = pickHydratedSetScore(setRec, lastScoreForSetFromEvents(mergedEvents, applyIdx));
        if (picked) setCurrentScores(picked);
      }
    } catch (err: any) {
      console.error('스코어보드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [matchId, currentUserId, isSpectatorForced, recalcScores]);

  useEffect(() => {
    fetchMatchDetails();

    const matchChannel = supabase.channel(`match_${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, async (payload) => {
        const updated = (payload?.new || {}) as MatchRecord;
        if (!updated?.id) return;
        setMatch(updated);

        if (updated.set_scores != null) {
          const parts = String(updated.set_scores).split(',').map((c) => c.trim()).filter(Boolean);
          const closedCount = setHistoryRef.current.length;
          if (parts.length <= closedCount) {
            setSetScoresHistory(parts);
            setHistoryRef.current = parts;
          }
        }

        if (updated.recorder_host_id) {
          const { data: pData } = await supabase.from('profiles').select('*').eq('id', updated.recorder_host_id).maybeSingle();
          if (pData) setHostRecorderName(getSafeDisplayName(pData));
        } else { setHostRecorderName('공석'); }

        if (updated.recorder_away_id) {
          const { data: pData } = await supabase.from('profiles').select('*').eq('id', updated.recorder_away_id).maybeSingle();
          if (pData) setAwayRecorderName(getSafeDisplayName(pData));
        } else { setAwayRecorderName('공석'); }
      })
      .subscribe();

    const eventChannel = supabase.channel(`events_${matchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` }, async () => {
        const { data } = await supabase.from('match_events').select('*').eq('match_id', matchId).order('created_at', { ascending: true });
        const nextEvents = asArray<MatchEvent>(data);
        if (nextEvents.length > 0) {
          setEvents(nextEvents);
          const idx = currentSetIndexRef.current;
          const hasSetEvents = nextEvents.some((e: any) => Number(e?.set_index) === idx);
          if (hasSetEvents) recalcScores(nextEvents, idx);
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

  const handleScoreConfirm = async (player: Member | null, kind: ScoreKind = 'kill') => {
    setActionModalVisible(false);
    
    if (actionMode === 'edit' && editingEventId) {
      const eventType = kind === 'fault' ? 'fault' : 'score';
      const keepId = player?.user_id && (isRegisteredUserId(player.user_id) || isTempSlotId(player.user_id)) ? player.user_id : null;
      const savedPlayerId = keepId;
      const savedPlayerName = isRegisteredUserId(keepId) ? getSafeDisplayName(player) : displaySlotPlayerName(keepId, getSafeDisplayName(player));
      setEvents(prev => prev.map(e => e.id === editingEventId ? { ...e, player_id: savedPlayerId, player_name: savedPlayerName, event_type: eventType } : e));
      await supabase.from('match_events').update({
        player_id: savedPlayerId,
        player_name: savedPlayerName,
        event_type: eventType,
      }).eq('id', editingEventId);
      return;
    }

    const scoringTeam = actionTeam;
    const newHostScore = scoringTeam === 'host' ? currentScores.host + 1 : currentScores.host;
    const newAwayScore = scoringTeam === 'away' ? currentScores.away + 1 : currentScores.away;
    const eventType = kind === 'fault' ? 'fault' : 'score';
    const keepId = player?.user_id && (isRegisteredUserId(player.user_id) || isTempSlotId(player.user_id)) ? player.user_id : null;
    const savedPlayerId = keepId;
    const savedPlayerName = isRegisteredUserId(keepId) ? getSafeDisplayName(player) : displaySlotPlayerName(keepId, getSafeDisplayName(player));

    setCurrentScores({ host: newHostScore, away: newAwayScore });
    
    const tempEvent: MatchEvent = {
      id: `temp-${Date.now()}`,
      match_id: matchId,
      set_index: currentSetIndex,
      event_type: eventType,
      team_type: scoringTeam,
      player_id: savedPlayerId,
      player_name: savedPlayerName,
      host_score: newHostScore,
      away_score: newAwayScore,
      is_canceled: false
    };
    setEvents(prev => [...prev, tempEvent]);

    const scoreLog = {
      match_id: matchId,
      set_index: currentSetIndex,
      set_number: currentSetIndex + 1,
      event_type: eventType,
      team_type: scoringTeam,
      player_id: savedPlayerId,
      player_name: savedPlayerName,
      host_score: newHostScore,
      away_score: newAwayScore,
      is_canceled: false,
    };
    await supabase.from('match_events').insert(scoreLog);
    if (matchId) await appendMatchScoreLog(matchId, scoreLog);
    if (currentSetIndex >= setHistory.length) {
      await persistSetsFromHistory(setHistory, { host: newHostScore, away: newAwayScore });
    }
  };

  const handleSubConfirm = async (outMember: Member, inMember: Member) => {
    setActionModalVisible(false);
    const isHost = actionTeam === 'host';
    const targetRosterStr = isHost ? match?.host_roster : match?.away_roster;

    const formMap = parseSetFormationMap(targetRosterStr);
    const currentForm = formMap[currentSetIndex] || parseSetFormation(targetRosterStr, currentSetIndex);
    const courtIds = (currentForm.court.length > 0 ? currentForm.court : (parseSetRosterMap(targetRosterStr)[currentSetIndex] || parseSetRosterMap(targetRosterStr)[0] || []));
    const updatedCourt = courtIds
      .filter((id) => id !== outMember.user_id && !safeIncludes(id, outMember.user_id))
      .concat(inMember.user_id);
    const updatedBench = (currentForm.bench || [])
      .filter((id) => id !== inMember.user_id && !safeIncludes(id, inMember.user_id))
      .concat(outMember.user_id);
    formMap[currentSetIndex] = {
      court: updatedCourt,
      bench: updatedBench,
      late: (currentForm.late || []).filter((id) => id !== inMember.user_id && id !== outMember.user_id),
      frontCount: currentForm.frontCount,
      middleCount: currentForm.middleCount,
      backCount: currentForm.backCount,
    };
    const carried = seedNextSetFormation(formMap, currentSetIndex, true);
    const updatedRosterJson = JSON.stringify(carried);

    const tempEvent: MatchEvent = {
      id: `temp-${Date.now()}`,
      match_id: matchId,
      set_index: currentSetIndex,
      event_type: 'sub',
      team_type: actionTeam,
      player_id: inMember.user_id,
      player_name: getSafeDisplayName(inMember),
      sub_out_id: outMember.user_id,
      sub_out_name: getSafeDisplayName(outMember),
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
    await persistSetsFromHistory(
      setHistory,
      { host: currentScores.host, away: currentScores.away },
      {
        host: parseRosterJson(isHost ? updatedRosterJson : match?.host_roster),
        away: parseRosterJson(!isHost ? updatedRosterJson : match?.away_roster),
      },
    );
    await supabase.from('match_events').insert({
      match_id: matchId,
      set_index: currentSetIndex,
      event_type: 'sub',
      team_type: actionTeam,
      player_id: inMember.user_id,
      player_name: getSafeDisplayName(inMember),
      sub_out_id: outMember.user_id,
      sub_out_name: getSafeDisplayName(outMember),
      host_score: currentScores.host,
      away_score: currentScores.away
    });
  };

  const handleLineupApply = async (payload: LineupApplyPayload) => {
    const isHost = actionTeam === 'host';
    const targetRosterStr = isHost ? match?.host_roster : match?.away_roster;
    const formMap = parseSetFormationMap(targetRosterStr);
    const currentForm = formMap[currentSetIndex] || parseSetFormation(targetRosterStr, currentSetIndex);
    const occupied = new Set(
      [...payload.courtIds, ...payload.benchIds].map((id) => assignedUserId(id)).filter((id): id is string => !!id)
    );
    const guestPool: string[] = [];
    Object.values(formMap).forEach((f) => {
      [...(f.court || []), ...(f.bench || []), ...(f.late || [])].forEach((id) => {
        const real = assignedUserId(id);
        if (real && isTempSlotId(real) && !occupied.has(real)) guestPool.push(real);
      });
    });
    const benchIds = [...new Set([...payload.benchIds, ...guestPool])];
    formMap[currentSetIndex] = {
      court: persistCourtSlots(payload.courtIds),
      bench: benchIds,
      late: (currentForm.late || []).filter((id) => {
        const real = assignedUserId(id);
        return !!real && !occupied.has(real) && !benchIds.includes(real);
      }),
      frontCount: currentForm.frontCount,
      middleCount: currentForm.middleCount,
      backCount: currentForm.backCount,
    };
    const carried = seedNextSetFormation(formMap, currentSetIndex, true);
    const updatedRosterJson = JSON.stringify(carried);
    const updatePayload = isHost
      ? { host_roster: updatedRosterJson }
      : { away_roster: updatedRosterJson };
    setMatch((prev) => prev ? { ...prev, ...updatePayload } : prev);
    await supabase.from('matches').update(updatePayload).eq('id', matchId);
    await persistSetsFromHistory(
      setHistory,
      { host: currentScores.host, away: currentScores.away },
      {
        host: parseRosterJson(isHost ? updatedRosterJson : match?.host_roster),
        away: parseRosterJson(!isHost ? updatedRosterJson : match?.away_roster),
      },
    );
    if (payload.sub) {
      const { out: outMember, in: inMember } = payload.sub;
      const tempEvent: MatchEvent = {
        id: `temp-${Date.now()}`,
        match_id: matchId,
        set_index: currentSetIndex,
        event_type: 'sub',
        team_type: actionTeam,
        player_id: inMember.user_id,
        player_name: getSafeDisplayName(inMember),
        sub_out_id: outMember.user_id,
        sub_out_name: getSafeDisplayName(outMember),
        host_score: currentScores.host,
        away_score: currentScores.away,
        is_canceled: false,
      };
      setEvents((prev) => [...prev, tempEvent]);
      await supabase.from('match_events').insert({
        match_id: matchId,
        set_index: currentSetIndex,
        event_type: 'sub',
        team_type: actionTeam,
        player_id: inMember.user_id,
        player_name: getSafeDisplayName(inMember),
        sub_out_id: outMember.user_id,
        sub_out_name: getSafeDisplayName(outMember),
        host_score: currentScores.host,
        away_score: currentScores.away,
      });
    }
  };

  const persistSetsFromHistory = async (
    history: string[],
    extraLive?: { host: number; away: number } | null,
    rosterOverride?: { host?: ReturnType<typeof parseRosterJson>; away?: ReturnType<typeof parseRosterJson> },
    formationOverride?: { host?: { [idx: number]: SetFormation }; away?: { [idx: number]: SetFormation } },
  ) => {
    if (!matchId) return;
    const hostForm = formationOverride?.host || parseSetFormationMap(match?.host_roster);
    const awayForm = formationOverride?.away || parseSetFormationMap(match?.away_roster);
    const hostRoster = rosterOverride?.host || parseRosterJson(match?.host_roster);
    const awayRoster = rosterOverride?.away || parseRosterJson(match?.away_roster);
    const records: MatchSetRecord[] = history.map((s, idx) => {
      const [h, a] = String(s).split(':').map(Number);
      const hostF = resolveFormationForSet(hostForm, idx);
      const awayF = resolveFormationForSet(awayForm, idx);
      return {
        setNumber: idx + 1,
        hostScore: h || 0,
        awayScore: a || 0,
        hostLineup: hostF.court.length > 0 ? persistCourtSlots(hostF.court) : (hostRoster[idx] || []),
        awayLineup: awayF.court.length > 0 ? persistCourtSlots(awayF.court) : (awayRoster[idx] || []),
        hostBench: hostF.bench || [],
        hostLate: hostF.late || [],
        awayBench: awayF.bench || [],
        awayLate: awayF.late || [],
        hostFrontCount: hostF.frontCount,
        hostMiddleCount: hostF.middleCount,
        hostBackCount: hostF.backCount,
        awayFrontCount: awayF.frontCount,
        awayMiddleCount: awayF.middleCount,
        awayBackCount: awayF.backCount,
        isClosed: true,
      };
    });
    if (extraLive) {
      const liveIdx = records.length;
      if (liveIdx < MAX_SETS) {
        const hostF = resolveFormationForSet(hostForm, liveIdx);
        const awayF = resolveFormationForSet(awayForm, liveIdx);
        records.push({
          setNumber: liveIdx + 1,
          hostScore: extraLive.host,
          awayScore: extraLive.away,
          hostLineup: hostF.court.length > 0 ? persistCourtSlots(hostF.court) : (hostRoster[liveIdx] || hostRoster[0] || []),
          awayLineup: awayF.court.length > 0 ? persistCourtSlots(awayF.court) : (awayRoster[liveIdx] || awayRoster[0] || []),
          hostBench: hostF.bench || [],
          hostLate: hostF.late || [],
          awayBench: awayF.bench || [],
          awayLate: awayF.late || [],
          hostFrontCount: hostF.frontCount,
          hostMiddleCount: hostF.middleCount,
          hostBackCount: hostF.backCount,
          awayFrontCount: awayF.frontCount,
          awayMiddleCount: awayF.middleCount,
          awayBackCount: awayF.backCount,
          isClosed: false,
        });
      }
    }
    const already = records.length;
    matchSets.slice(already).forEach((s, i) => {
      if (already + i >= MAX_SETS) return;
      records.push({ ...s, setNumber: already + i + 1 });
    });
    const synced = normalizeSetRecords(records);
    await upsertMatchSets(matchId, synced);
    setMatchSets(synced);
  };

  const collectFormationIds = (roster: unknown): string[] => {
    const ids: string[] = [];
    Object.values(parseSetFormationMap(roster)).forEach((f) => {
      [...(f.court || []), ...(f.bench || []), ...(f.late || [])].forEach((id) => {
        const real = assignedUserId(id);
        if (real) ids.push(real);
      });
    });
    return ids;
  };

  const autofillSet1GuestsIfNeeded = async () => {
    if (!matchId || !match || didAutofillSet1Ref.current) return;
    if (currentSetIndexRef.current !== 0) return;
    const hostForm = parseSetFormation(match?.host_roster, 0);
    const awayForm = parseSetFormation(match?.away_roster, 0);
    const hostHasFormation = (hostForm.court || []).length > 0 || !!hostForm.frontCount || !!hostForm.middleCount;
    const awayHasFormation = (awayForm.court || []).length > 0 || !!awayForm.frontCount || !!awayForm.middleCount;
    if (!hostHasFormation && !awayHasFormation) return;

    const used = [
      ...collectFormationIds(match?.host_roster),
      ...collectFormationIds(match?.away_roster),
      ...(events || []).flatMap((e) => [e?.player_id, e?.sub_out_id]),
    ];
    const nextHostCourt = hostHasFormation
      ? ensureTempIdsInCourt(hostForm.court, {
        side: 'host',
        setIndex: 0,
        frontCount: hostForm.frontCount,
        middleCount: hostForm.middleCount,
        backCount: hostForm.backCount,
        usedIds: used,
      })
      : hostForm.court;
    const nextAwayCourt = awayHasFormation
      ? ensureTempIdsInCourt(awayForm.court, {
        side: 'away',
        setIndex: 0,
        frontCount: awayForm.frontCount,
        middleCount: awayForm.middleCount,
        backCount: awayForm.backCount,
        usedIds: [...used, ...nextHostCourt],
      })
      : awayForm.court;

    const hostChanged = persistCourtSlots(hostForm.court).join('|') !== persistCourtSlots(nextHostCourt).join('|');
    const awayChanged = persistCourtSlots(awayForm.court).join('|') !== persistCourtSlots(nextAwayCourt).join('|');
    didAutofillSet1Ref.current = true;
    if (!hostChanged && !awayChanged) return;

    const hostMap = parseSetFormationMap(match?.host_roster);
    const awayMap = parseSetFormationMap(match?.away_roster);
    if (hostChanged) {
      hostMap[0] = { ...hostForm, court: nextHostCourt };
    }
    if (awayChanged) {
      awayMap[0] = { ...awayForm, court: nextAwayCourt };
    }
    const hostCarried = seedNextSetFormation(hostMap, 0, true);
    const awayCarried = seedNextSetFormation(awayMap, 0, true);
    const hostJson = JSON.stringify(hostCarried);
    const awayJson = JSON.stringify(awayCarried);
    setMatch((prev) => prev ? { ...prev, host_roster: hostJson, away_roster: awayJson } : prev);
    await supabase.from('matches').update({ host_roster: hostJson, away_roster: awayJson }).eq('id', matchId);
    await persistSetsFromHistory(
      setHistoryRef.current,
      { host: currentScores.host, away: currentScores.away },
      { host: parseRosterJson(hostJson), away: parseRosterJson(awayJson) },
      { host: hostCarried, away: awayCarried },
    );
  };

  useEffect(() => {
    didAutofillSet1Ref.current = false;
  }, [matchId]);

  useEffect(() => {
    if (isSpectatorForced) return;
    if (loading || !matchId || !match) return;
    void autofillSet1GuestsIfNeeded();
  }, [loading, matchId, match?.id, isSpectatorForced]);

  const closeLiveSetIntoHistory = (history: string[]) => {
    return collectClosedSetScores({
      history,
      currentSetIndex,
      currentScores,
      matchSets,
      events,
    });
  };

  const hydrateSetFromDb = useCallback(async (idx: number) => {
    if (!matchId) return;
    const gen = ++hydrateGenRef.current;
    try {
      let setRow: { host_score?: number; away_score?: number } | null = null;
      try {
        const { data, error } = await supabase
          .from('match_sets')
          .select('host_score, away_score, set_number')
          .eq('match_id', matchId)
          .eq('set_number', idx + 1)
          .maybeSingle();
        if (!error && data) setRow = data;
      } catch {}

      let scoreLogs: any[] = [];
      try {
        const { data: matchRow, error } = await supabase
          .from('matches')
          .select('score_logs')
          .eq('id', matchId)
          .maybeSingle();
        if (!error) {
          scoreLogs = asArray((matchRow as any)?.score_logs);
        }
      } catch {}

      let tableEvents: MatchEvent[] = [];
      let tableOk = false;
      try {
        const { data: evData, error } = await supabase
          .from('match_events')
          .select('*')
          .eq('match_id', matchId)
          .order('created_at', { ascending: true });
        if (!error) {
          tableOk = true;
          tableEvents = asArray<MatchEvent>(evData);
        }
      } catch {}

      if (hydrateGenRef.current !== gen || currentSetIndexRef.current !== idx) return;

      let merged: MatchEvent[] = [];
      setEvents((prev) => {
        if (!tableOk && scoreLogs.length === 0) {
          merged = prev;
          return prev;
        }
        merged = mergeEventsWithScoreLogs(tableOk ? tableEvents : prev, scoreLogs, matchId);
        return merged;
      });

      const localSet = matchSets.find((s) => s.setNumber === idx + 1);
      const picked = pickHydratedSetScore(setRow || localSet, lastScoreForSetFromEvents(merged, idx));
      if (picked) setCurrentScores(picked);
    } catch (e) {
      console.error('세트 하이드레이션 실패:', e);
    }
  }, [matchId, matchSets]);

  const flushScoreLogsSnapshot = async () => {
    if (!matchId) return;
    const scoreLogs = events.map((e) => ({
      id: e.id,
      set_index: e.set_index,
      set_number: Number(e.set_index) + 1,
      event_type: e.event_type,
      team_type: e.team_type,
      player_id: e.player_id,
      player_name: e.player_name,
      host_score: e.host_score,
      away_score: e.away_score,
      is_canceled: e.is_canceled,
    }));
    await updateMatchIgnoringUnknownColumns(matchId, { score_logs: scoreLogs });
  };

  const commitActiveSetBeforeFinish = async (): Promise<string[]> => {
    const setEvents = events.filter((e) => Number(e.set_index) === currentSetIndex && !e.is_canceled);
    const hasScore = (currentScores.host || 0) > 0 || (currentScores.away || 0) > 0;
    const hasLogs = setEvents.length > 0;
    let updatedHistory = closeLiveSetIntoHistory(setHistory);
    if (hasScore || hasLogs) {
      const liveScore = `${currentScores.host}:${currentScores.away}`;
      if (currentSetIndex < updatedHistory.length) {
        updatedHistory = updatedHistory.map((s, idx) => (idx === currentSetIndex ? liveScore : s));
      } else {
        updatedHistory = [...updatedHistory, liveScore];
      }
    }
    await persistSetsFromHistory(updatedHistory, null);
    await flushScoreLogsSnapshot();
    return updatedHistory;
  };

  const changeCurrentSet = (idx: number) => {
    setCurrentSetIndex(idx);
    currentSetIndexRef.current = idx;
    resetSetUiState();
    const localSet = matchSets.find((s) => s.setNumber === idx + 1);
    const picked = pickHydratedSetScore(localSet, lastScoreForSetFromEvents(events, idx));
    if (picked) setCurrentScores(picked);
    void hydrateSetFromDb(idx);
  };

  const visibleSets = useMemo(() => {
    const rows = matchSets.length > 0 ? matchSets : [makeInitialLiveSet()];
    return normalizeSetRecords(rows).slice(0, MAX_SETS);
  }, [matchSets]);

  const handleAddSet = async () => {
    if (myRole === 'spectator' || !matchId) return;
    const normalized = normalizeSetRecords(matchSets.length > 0 ? matchSets : [makeInitialLiveSet()]);
    if (normalized.length >= MAX_SETS) {
      Alert.alert('알림', `최대 ${MAX_SETS}세트까지 추가할 수 있습니다.`);
      return;
    }
    setActionLoading(true);
    try {
      const fromIdx = Math.max(0, normalized.length - 1);
      const hostCarried = seedNextSetFormation(parseSetFormationMap(match?.host_roster), fromIdx, true);
      const awayCarried = seedNextSetFormation(parseSetFormationMap(match?.away_roster), fromIdx, true);
      const nextIdx = normalized.length;
      const hostF = resolveFormationForSet(hostCarried, nextIdx);
      const awayF = resolveFormationForSet(awayCarried, nextIdx);
      const nextSet: MatchSetRecord = {
        setNumber: nextIdx + 1,
        hostScore: 0,
        awayScore: 0,
        hostLineup: hostF.court.length > 0 ? persistCourtSlots(hostF.court) : [],
        awayLineup: awayF.court.length > 0 ? persistCourtSlots(awayF.court) : [],
        hostBench: hostF.bench || [],
        hostLate: hostF.late || [],
        awayBench: awayF.bench || [],
        awayLate: awayF.late || [],
        hostFrontCount: hostF.frontCount,
        hostMiddleCount: hostF.middleCount,
        hostBackCount: hostF.backCount,
        awayFrontCount: awayF.frontCount,
        awayMiddleCount: awayF.middleCount,
        awayBackCount: awayF.backCount,
        isClosed: false,
      };
      const nextSets = [...normalized, nextSet];
      setMatch((prev) => prev ? {
        ...prev,
        host_roster: JSON.stringify(hostCarried),
        away_roster: JSON.stringify(awayCarried),
      } : prev);
      setMatchSets(nextSets);
      await upsertMatchSets(matchId, nextSets);
      setCurrentSetIndex(nextIdx);
      currentSetIndexRef.current = nextIdx;
      setCurrentScores({ host: 0, away: 0 });
      resetSetUiState();
    } catch (e: any) {
      Alert.alert('오류', e?.message || '세트 추가에 실패했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestDeleteSet = (targetSetNumber: number) => {
    if (myRole === 'spectator') return;
    setPendingDeleteSet(targetSetNumber);
  };

  const handleConfirmDeleteSet = async () => {
    const targetSetNumber = pendingDeleteSet;
    setPendingDeleteSet(null);
    if (targetSetNumber == null || !matchId) return;
    setActionLoading(true);
    try {
      const remainingSets = await deleteSetAndReindex(matchId, targetSetNumber);
      const updatedSets = normalizeSetRecords(
        remainingSets.length > 0 ? remainingSets : [makeInitialLiveSet()]
      );
      setMatchSets(updatedSets);
      await upsertMatchSets(matchId, updatedSets);
      const nextHistory = updatedSets.filter((s) => s.isClosed).map((s) => `${s.hostScore}:${s.awayScore}`);
      const removedIndex = targetSetNumber - 1;
      const remainingEvents = events
        .filter((e) => Number(e.set_index) !== removedIndex)
        .map((e) => Number(e.set_index) > removedIndex ? { ...e, set_index: Number(e.set_index) - 1 } : e);
      setEvents(remainingEvents);
      setSetScoresHistory(nextHistory);
      setHistoryRef.current = nextHistory;

      const hostForm = parseSetFormationMap(match?.host_roster);
      const awayForm = parseSetFormationMap(match?.away_roster);
      const shiftForm = (form: { [k: number]: SetFormation }) => {
        const next: { [k: number]: SetFormation } = {};
        Object.keys(form).forEach((key) => {
          const n = Number(key);
          if (n === removedIndex) return;
          next[n > removedIndex ? n - 1 : n] = form[n];
        });
        return next;
      };
      const nextHostForm = shiftForm(hostForm);
      const nextAwayForm = shiftForm(awayForm);
      setMatch((prev) => prev ? {
        ...prev,
        set_scores: nextHistory.join(', ') || null,
        host_roster: JSON.stringify(nextHostForm),
        away_roster: JSON.stringify(nextAwayForm),
      } : prev);

      const nextIdx = Math.max(0, Math.min(removedIndex > 0 ? removedIndex - 1 : 0, Math.max(0, updatedSets.length - 1)));
      setCurrentSetIndex(nextIdx);
      currentSetIndexRef.current = nextIdx;
      recalcScores(remainingEvents, nextIdx);
      resetSetUiState();
    } catch (e: any) {
      Alert.alert('오류', e?.message || '세트 삭제에 실패했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  const handlePressTimelineEvent = (event: MatchEvent) => {
    if (myRole === 'spectator') return;
    setPendingDeleteEvent(event);
  };

  const handleConfirmDeleteEvent = async () => {
    const target = pendingDeleteEvent;
    setPendingDeleteEvent(null);
    if (!target) return;
    if (String(target.id).startsWith('temp-')) {
      const nextEvents = events.filter((e) => e.id !== target.id);
      setEvents(nextEvents);
      recalcScores(nextEvents, currentSetIndex);
      await persistRecalculatedSetScore(nextEvents, Math.max(0, Number(target.set_index) || 0));
      return;
    }
    const nextEvents = events.filter((e) => e.id !== target.id);
    setEvents(nextEvents);
    const targetSetIndex = Math.max(0, Number(target.set_index) || 0);
    recalcScores(nextEvents, currentSetIndex);
    resetSetUiState();
    await supabase.from('match_events').delete().eq('id', target.id);
    await persistRecalculatedSetScore(nextEvents, targetSetIndex);
  };

  const handleUndoEvent = async () => {
    if (myRole === 'spectator' || actionLoading) return;
    const validEvents = events.filter(e => Number(e.set_index) === currentSetIndex && !e.is_canceled);
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
          await persistRecalculatedSetScore(newEvents, currentSetIndex);
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
              let updatedHistory = [...setHistory];
              if (currentSetIndex < updatedHistory.length) {
                updatedHistory[currentSetIndex] = `${currentScores.host}:${currentScores.away}`;
              } else {
                updatedHistory.push(`${currentScores.host}:${currentScores.away}`);
              }

              const canAdvance = updatedHistory.length < MAX_SETS;
              const hostCarried = seedNextSetFormation(parseSetFormationMap(match?.host_roster), currentSetIndex, true);
              const awayCarried = seedNextSetFormation(parseSetFormationMap(match?.away_roster), currentSetIndex, true);
              setMatch((prev) => prev ? {
                ...prev,
                host_roster: JSON.stringify(hostCarried),
                away_roster: JSON.stringify(awayCarried),
              } : prev);
              await persistSetsFromHistory(
                updatedHistory,
                canAdvance ? { host: 0, away: 0 } : null,
                undefined,
                { host: hostCarried, away: awayCarried },
              );
              await flushScoreLogsSnapshot();

              setSetScoresHistory(updatedHistory);
              setHistoryRef.current = updatedHistory;
              setMatch((prev) => prev ? { ...prev, set_scores: updatedHistory.join(', ') } : prev);

              if (canAdvance) {
                const nextIndex = updatedHistory.length;
                setCurrentSetIndex(nextIndex);
                currentSetIndexRef.current = nextIndex;
                setCurrentScores({ host: 0, away: 0 });
              } else {
                const stayIdx = Math.max(0, Math.min(currentSetIndex, updatedHistory.length - 1));
                setCurrentSetIndex(stayIdx);
                currentSetIndexRef.current = stayIdx;
              }
              resetSetUiState();
            } catch (err: any) {} finally { setActionLoading(false); }
          }
        }
      ]
    );
  };

  const handleOpenFinishMatch = () => {
    if (myRole === 'spectator') return;
    setFinishModalVisible(true);
  };

  const handleConfirmFinishChoice = async (winner: string) => {
    if (isIntramural) {
      await handleConfirmIntramuralFinish(winner);
    } else {
      await processOfficialMatchFinish(winner);
    }
  };

  const handleConfirmIntramuralFinish = async (winner: string) => {
    setActionLoading(true);
    try {
      const finalHistory = await commitActiveSetBeforeFinish();

      const updateData = {
        set_scores: finalHistory.join(', ') || null,
        winner_team: winner,
        recorder_host_id: null,
        recorder_away_id: null,
      };
      await supabase.from('matches').update(updateData).eq('id', matchId);
      setMatch((prev) => prev ? { ...prev, ...updateData } : prev);
      setSetScoresHistory(finalHistory);
      setHistoryRef.current = finalHistory;
      await openPostMatchReport();
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setActionLoading(false);
      setFinishModalVisible(false);
    }
  };

  const processOfficialMatchFinish = async (winnerOverride?: string) => {
    setActionLoading(true);
    try {
      const finalHistory = await commitActiveSetBeforeFinish();

      const myTeamInMatch = match && teamsInclude(myTeams, match.host_team_name)
        ? match.host_team_name
        : match?.away_team_name;

      const otherTeam = myTeamInMatch === match?.host_team_name ? match?.away_team_name : match?.host_team_name;

      let winningTeam = 'draw';
      let hostSetWins = 0, awaySetWins = 0;
      finalHistory.forEach(s => {
        const [h, a] = String(s).split(':').map(Number);
        if (h > a) hostSetWins++;
        else if (a > h) awaySetWins++;
      });
      if (winnerOverride) {
        winningTeam = winnerOverride;
      } else if (hostSetWins > awaySetWins) {
        winningTeam = match?.host_team_name || '';
      } else if (awaySetWins > hostSetWins) {
        winningTeam = match?.away_team_name || '';
      }

      const soloGuest = isSoloGuestMatch(match);
      const guestAwaitingAway = isGuestBindPending(match);

      const updateData = soloGuest
        ? {
          status: 'completed' as const,
          set_scores: finalHistory.join(', ') || null,
          winner_team: winningTeam,
          result_submitter_team: myTeamInMatch,
          submitted_by_name: currentUserName,
          approved_by_name: currentUserName,
          recorder_host_id: null,
          recorder_away_id: null,
        }
        : guestAwaitingAway
        ? {
          status: 'pending_result' as const,
          set_scores: finalHistory.join(', ') || null,
          winner_team: winningTeam,
          result_submitter_team: myTeamInMatch,
          submitted_by_name: currentUserName,
          recorder_host_id: null,
          recorder_away_id: null,
        }
        : {
          status: 'completed' as const,
          set_scores: finalHistory.join(', ') || null,
          winner_team: winningTeam,
          result_submitter_team: myTeamInMatch,
          submitted_by_name: currentUserName,
          approved_by_name: currentUserName,
          recorder_host_id: null,
          recorder_away_id: null,
        };

      await supabase.from('matches').update(updateData).eq('id', matchId);
      setMatch((prev) => prev ? { ...prev, ...updateData } : prev);
      setSetScoresHistory(finalHistory);
      setHistoryRef.current = finalHistory;

      if (otherTeam && !soloGuest) {
        await sendNotificationToTeam(
          otherTeam,
          guestAwaitingAway ? '⚠️ [경기 결과 승인 요청]' : '🏆 [경기 최종 종료]',
          guestAwaitingAway
            ? `'${myTeamInMatch}'팀에서 전광판 경기를 종료했습니다. 결과를 승인하거나 재수정해 주세요. (${finalHistory.join(', ') || '세트 기록 없음'})`
            : `'${myTeamInMatch}'팀에서 전광판 경기를 최종 종료했습니다. (${finalHistory.join(', ') || '세트 기록 없음'})`
        );
      }

      await openPostMatchReport();
    } catch (e: any) {
      Alert.alert('오류', e.message);
    } finally {
      setActionLoading(false);
      setFinishModalVisible(false);
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
    if (currentSetIndex >= setHistory.length) {
      await persistSetsFromHistory(setHistory, { host: tempHostScore, away: tempAwayScore });
    }
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
    ? { key: 'away' as const, name: displayAwayName, score: safeStyleNumber(currentScores?.away), canControl: canControlAway && myRole !== 'spectator', isHost: false }
    : { key: 'host' as const, name: displayHostName, score: safeStyleNumber(currentScores?.host), canControl: canControlHost && myRole !== 'spectator', isHost: true };

  const rightTeamData = isSwapped
    ? { key: 'host' as const, name: displayHostName, score: safeStyleNumber(currentScores?.host), canControl: canControlHost && myRole !== 'spectator', isHost: true }
    : { key: 'away' as const, name: displayAwayName, score: safeStyleNumber(currentScores?.away), canControl: canControlAway && myRole !== 'spectator', isHost: false };

  const isMyHostTeam = match && teamsInclude(myTeams, match.host_team_name);
  const isMyAwayTeam = !!(match?.away_team_name && teamsInclude(myTeams, match.away_team_name));

  const getSetRosters = (isHost: boolean) => {
    const rosterRaw = isHost ? match?.host_roster : match?.away_roster;
    const baseMembers = isHost || isIntramural ? (hostMembers || []) : (awayMembers || []);
    const setRow = (matchSets || [])[currentSetIndex];
    const formation = resolveFormationFromSources(
      rosterRaw,
      currentSetIndex,
      isHost ? setRow?.hostLineup : setRow?.awayLineup,
      isHost
        ? { bench: setRow?.hostBench || [], late: setRow?.hostLate || [], frontCount: setRow?.hostFrontCount, middleCount: setRow?.hostMiddleCount, backCount: setRow?.hostBackCount }
        : { bench: setRow?.awayBench || [], late: setRow?.awayLate || [], frontCount: setRow?.awayFrontCount, middleCount: setRow?.awayMiddleCount, backCount: setRow?.awayBackCount },
    );
    const frontCount = clampLineCount(formation.frontCount, DEFAULT_LINE_COUNT);
    const middleCount = clampLineCount(formation.middleCount, DEFAULT_LINE_COUNT);
    const backCount = clampLineCount(formation.backCount, DEFAULT_LINE_COUNT);
    const slotTotal = frontCount + middleCount + backCount;
    const rawCourt = formation.court || [];
    const benchIds = formation.bench || [];
    const lateIds = formation.late || [];

    const hasFormation = rawCourt.length > 0 || benchIds.length > 0 || lateIds.length > 0 || !!formation.frontCount || !!formation.middleCount || !!formation.backCount;
    if (!hasFormation) {
      return { court: baseMembers, bench: [] as Member[], late: [] as Member[], formation };
    }

    const slots = [...rawCourt];
    while (slots.length < slotTotal) slots.push('');
    const court = slots.slice(0, slotTotal).map((id) => {
      const real = baseMembers.find((m) => m.user_id === id || listHasUser([id], m.user_id) || safeIncludes(id, m.user_id));
      if (real) return real;
      const kept = assignedUserId(id);
      if (!kept) return { user_id: '', full_name: ANONYMOUS_PLAYER_NAME };
      return { user_id: kept, full_name: displaySlotPlayerName(kept, ANONYMOUS_PLAYER_NAME) };
    });
    const courtIds = court.map((m) => assignedUserId(m.user_id)).filter((id): id is string => !!id);
    const formMap = parseSetFormationMap(rosterRaw);
    const guestPool: string[] = [];
    Object.values(formMap).forEach((f) => {
      [...(f.court || []), ...(f.bench || []), ...(f.late || [])].forEach((id) => {
        const real = assignedUserId(id);
        if (real && isTempSlotId(real)) guestPool.push(real);
      });
    });
    const benchFromMembers = baseMembers.filter((m) => listHasUser(benchIds, m.user_id) || (!listHasUser(courtIds, m.user_id) && !listHasUser(lateIds, m.user_id)));
    const extraIds = [...new Set([...(benchIds || []), ...guestPool])]
      .map((id) => assignedUserId(id))
      .filter((id): id is string => !!id && !courtIds.includes(id) && !benchFromMembers.some((m) => m.user_id === id));
    const extraBench = extraIds.map((id) => ({ user_id: id, full_name: displaySlotPlayerName(id, ANONYMOUS_PLAYER_NAME) }));
    const bench = [...benchFromMembers, ...extraBench];
    return { court, bench, late: baseMembers.filter((m) => listHasUser(lateIds, m.user_id)), formation };
  };

  const openFormation = () => {
    if (myRole === 'spectator') return;
    setFormationVisible(true);
  };

  const handleSaveFormation = async (formation: SetFormation) => {
    const isHost = formationTeam === 'host';
    const side = isHost ? 'host' : 'away';
    const filled: SetFormation = {
      ...formation,
      court: ensureTempIdsInCourt(formation.court, {
        side,
        setIndex: currentSetIndex,
        frontCount: formation.frontCount,
        middleCount: formation.middleCount,
        backCount: formation.backCount,
        forceFillGuests: true,
        usedIds: [
          ...(formation.bench || []),
          ...(formation.late || []),
          ...(events || []).flatMap((e) => [e?.player_id, e?.sub_out_id]),
          ...Object.values(parseSetFormationMap(isHost ? match?.away_roster : match?.host_roster)).flatMap((f) => [
            ...(f.court || []),
            ...(f.bench || []),
            ...(f.late || []),
          ]),
        ],
      }),
    };
    const formMap = parseSetFormationMap(isHost ? match?.host_roster : match?.away_roster);
    formMap[currentSetIndex] = filled;
    const carried = seedNextSetFormation(formMap, currentSetIndex, true);
    const updatedRosterJson = JSON.stringify(carried);
    const updatePayload = isHost ? { host_roster: updatedRosterJson } : { away_roster: updatedRosterJson };
    setMatch((prev) => prev ? { ...prev, ...updatePayload } : prev);
    setFormationVisible(false);
    await supabase.from('matches').update(updatePayload).eq('id', matchId);
    await persistSetsFromHistory(
      setHistory,
      currentSetIndex >= setHistory.length ? { host: currentScores.host, away: currentScores.away } : null,
      {
        host: parseRosterJson(isHost ? updatedRosterJson : match?.host_roster),
        away: parseRosterJson(!isHost ? updatedRosterJson : match?.away_roster),
      },
      {
        host: isHost ? carried : parseSetFormationMap(match?.host_roster),
        away: !isHost ? carried : parseSetFormationMap(match?.away_roster),
      },
    );
    const notifyTeam = isHost
      ? resolveTeamName(match?.host_team_name, displayHostName)
      : resolveTeamName(match?.away_team_name, displayAwayName);
    if (notifyTeam) {
      await sendNotificationToTeam(
        notifyTeam,
        '[팀 라인업 작성]',
        `'${currentUserName} 선생님'이 라인업을 등록했습니다`,
        currentUserId,
      );
    }
  };

  const handleSaveDualFormation = async (hostFormation: SetFormation, awayFormation: SetFormation) => {
    const filledHost: SetFormation = {
      ...hostFormation,
      court: ensureTempIdsInCourt(hostFormation.court, {
        side: 'host',
        setIndex: currentSetIndex,
        frontCount: hostFormation.frontCount,
        middleCount: hostFormation.middleCount,
        backCount: hostFormation.backCount,
        forceFillGuests: true,
        usedIds: [
          ...(hostFormation.bench || []),
          ...(hostFormation.late || []),
          ...(awayFormation.court || []),
          ...(awayFormation.bench || []),
          ...(awayFormation.late || []),
          ...(events || []).flatMap((e) => [e?.player_id, e?.sub_out_id]),
        ],
      }),
    };
    const filledAway: SetFormation = {
      ...awayFormation,
      court: ensureTempIdsInCourt(awayFormation.court, {
        side: 'away',
        setIndex: currentSetIndex,
        frontCount: awayFormation.frontCount,
        middleCount: awayFormation.middleCount,
        backCount: awayFormation.backCount,
        forceFillGuests: true,
        usedIds: [
          ...(filledHost.court || []),
          ...(hostFormation.bench || []),
          ...(hostFormation.late || []),
          ...(awayFormation.bench || []),
          ...(awayFormation.late || []),
          ...(events || []).flatMap((e) => [e?.player_id, e?.sub_out_id]),
        ],
      }),
    };
    const hostCarried = seedNextSetFormation(
      { ...parseSetFormationMap(match?.host_roster), [currentSetIndex]: filledHost },
      currentSetIndex,
      true,
    );
    const awayCarried = seedNextSetFormation(
      { ...parseSetFormationMap(match?.away_roster), [currentSetIndex]: filledAway },
      currentSetIndex,
      true,
    );
    const hostJson = JSON.stringify(hostCarried);
    const awayJson = JSON.stringify(awayCarried);
    setMatch((prev) => prev ? { ...prev, host_roster: hostJson, away_roster: awayJson } : prev);
    setFormationVisible(false);
    await supabase.from('matches').update({ host_roster: hostJson, away_roster: awayJson }).eq('id', matchId);
    await persistSetsFromHistory(
      setHistory,
      currentSetIndex >= setHistory.length ? { host: currentScores.host, away: currentScores.away } : null,
      {
        host: parseRosterJson(hostJson),
        away: parseRosterJson(awayJson),
      },
      { host: hostCarried, away: awayCarried },
    );
    const notifyTeam = resolveTeamName(match?.host_team_name, displayHostName);
    if (notifyTeam) {
      await sendNotificationToTeam(
        notifyTeam,
        '[팀 라인업 작성]',
        `'${currentUserName} 선생님'이 라인업을 등록했습니다`,
        currentUserId,
      );
    }
  };

  const isHostMaster = match?.recorder_host_id && !match?.recorder_away_id;
  const isAwayMaster = !match?.recorder_host_id && match?.recorder_away_id;
  const masterName = isHostMaster ? hostRecorderName : awayRecorderName;

  const recorderDisplayName = isIntramural
    ? hostRecorderName
    : (isHostMaster || isAwayMaster)
      ? masterName
      : (myRole === 'away_recorder' ? awayRecorderName : hostRecorderName);
  const recorderLine = recorderDisplayName && recorderDisplayName !== '공석'
    ? `기록자: ${recorderDisplayName} 선생님`
    : '기록자: 공석';
  const hostRosterView = getSetRosters(true);
  const awayRosterView = getSetRosters(false);
  const actionRoster = actionTeam === 'host' ? hostRosterView : awayRosterView;
  const opponentRoster = actionTeam === 'host' ? awayRosterView : hostRosterView;
  const liveSetEvents = (events || []).filter((e) => Number(e?.set_index) === currentSetIndex);
  const currentSetRow = (matchSets || [])[currentSetIndex];
  const hostFormationInitial = resolveFormationFromSources(
    match?.host_roster,
    currentSetIndex,
    currentSetRow?.hostLineup,
    { bench: currentSetRow?.hostBench, late: currentSetRow?.hostLate, frontCount: currentSetRow?.hostFrontCount, middleCount: currentSetRow?.hostMiddleCount, backCount: currentSetRow?.hostBackCount },
  );
  const awayFormationInitial = resolveFormationFromSources(
    match?.away_roster,
    currentSetIndex,
    currentSetRow?.awayLineup,
    { bench: currentSetRow?.awayBench, late: currentSetRow?.awayLate, frontCount: currentSetRow?.awayFrontCount, middleCount: currentSetRow?.awayMiddleCount, backCount: currentSetRow?.awayBackCount },
  );

  return (
    <SafeAreaView
      style={[
        styles.container,
        {
          paddingTop: Platform.OS === 'android' ? safeStyleNumber(StatusBar.currentHeight, safeTop) + 2 : 0,
          paddingBottom: Math.max(safeBottom, 0),
        },
      ]}
      edges={['bottom']}
    >
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

      <View style={[styles.headerBlock, { paddingLeft: Math.max(safeInset(insets.left), 8), paddingRight: Math.max(safeInset(insets.right), 8) }]}>
        <View style={styles.headerSlim}>
          <View style={styles.headerSlimLeft}>
            <TouchableOpacity style={styles.backBtnSlim} onPress={() => router.back()} hitSlop={10}>
              <Text style={styles.backTextSlim}>‹</Text>
            </TouchableOpacity>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.setTabScroll}
              contentContainerStyle={styles.setTabNavRow}
            >
              {visibleSets.map((setRow, mapIdx) => {
                const idx = mapIdx;
                const isCurrent = idx === currentSetIndex;
                return (
                  <View key={`set-tab-${idx}`} style={[styles.setNavPill, isCurrent && styles.setNavPillActive]}>
                    <TouchableOpacity
                      onPress={() => changeCurrentSet(idx)}
                      onLongPress={() => handleRequestDeleteSet(idx + 1)}
                      delayLongPress={380}
                      style={styles.setNavPillHit}
                      hitSlop={8}
                    >
                      <Text style={[styles.setNavPillText, isCurrent && styles.setNavPillTextActive]}>
                        {idx + 1}세트
                      </Text>
                    </TouchableOpacity>
                    {myRole !== 'spectator' ? (
                      <TouchableOpacity
                        style={styles.setNavClose}
                        onPress={() => handleRequestDeleteSet(idx + 1)}
                        hitSlop={8}
                      >
                        <Text style={styles.setNavCloseText}>×</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                );
              })}
              {myRole !== 'spectator' && visibleSets.length < MAX_SETS ? (
                <TouchableOpacity style={styles.setNavAdd} onPress={handleAddSet} disabled={actionLoading} hitSlop={8}>
                  <Text style={styles.setNavAddText}>+</Text>
                </TouchableOpacity>
              ) : null}
            </ScrollView>
          </View>

          <View style={styles.headerSlimRight}>
            <Text style={styles.recorderLine} numberOfLines={1}>{recorderLine}</Text>
            {myRole !== 'spectator' && (
              <TouchableOpacity style={styles.leaveRoleBtnSlim} onPress={handleLeaveRole} hitSlop={8}>
                <Text style={styles.leaveRoleBtnTextSlim}>반납</Text>
              </TouchableOpacity>
            )}
            {events.length > 0 && (
              <TouchableOpacity style={styles.reportBtnSlim} onPress={() => setReportModalVisible(true)} hitSlop={8}>
                <Text style={styles.reportBtnTextSlim}>📊 경기 리포트</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.switchCourtBtnSlim} onPress={() => setIsSwapped(prev => !prev)} hitSlop={8}>
              <Text style={styles.switchCourtBtnTextSlim}>🔄 코트 변경</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <View style={styles.scoreboardMainGrid}>
        <View style={[styles.teamCourtHalf, leftTeamData.isHost ? styles.hostCourtBg : styles.awayCourtBg]}>
          <Text style={[styles.courtTeamName, { left: Math.max(safeInset(insets.left) + 8, 12) }]} numberOfLines={1}>
            {leftTeamData.name}
          </Text>
          {leftTeamData.canControl && (
            <View style={[styles.stackedUtilityBtns, styles.floatBtnsA]}>
              <TouchableOpacity style={styles.glassBtnCompact} onPress={() => handleOpenEditModal()} hitSlop={8}>
                <Text style={styles.glassBtnText}>✏️ 점수 보정</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.glassBtnCompact} onPress={openFormation} hitSlop={8}>
                <Text style={styles.glassBtnText}>📐 포메이션</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.glassBtnCompact} onPress={() => openActionModal(leftTeamData.key, 'sub')} hitSlop={8}>
                <Text style={styles.glassBtnText}>🔄 선수 교체</Text>
              </TouchableOpacity>
            </View>
          )}
          <TouchableOpacity 
            style={styles.bigScoreTouchArea} 
            onPress={() => { if (leftTeamData.canControl) openActionModal(leftTeamData.key, 'score'); }} 
            disabled={!leftTeamData.canControl}
            activeOpacity={0.8}
          >
            <View style={styles.scoreCenterWrap}>
              <Text style={styles.bigScoreNumber}>{leftTeamData.score}</Text>
              {leftTeamData.canControl ? (
                <Text style={styles.editHintText}>터치하여 +1점 득점</Text>
              ) : (
                <Text style={styles.spectatorHintText}>👁️ 관전 모드 (점수 확인)</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>

        <View style={[styles.teamCourtHalf, rightTeamData.isHost ? styles.hostCourtBg : styles.awayCourtBg]}>
          {rightTeamData.canControl && (
            <View style={[styles.stackedUtilityBtns, styles.floatBtnsB]}>
              <TouchableOpacity style={styles.glassBtnCompact} onPress={() => handleOpenEditModal()} hitSlop={8}>
                <Text style={styles.glassBtnText}>✏️ 점수 보정</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.glassBtnCompact} onPress={openFormation} hitSlop={8}>
                <Text style={styles.glassBtnText}>📐 포메이션</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.glassBtnCompact} onPress={() => openActionModal(rightTeamData.key, 'sub')} hitSlop={8}>
                <Text style={styles.glassBtnText}>🔄 선수 교체</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={[styles.courtTeamName, { right: Math.max(safeInset(insets.right) + 8, 12) }]} numberOfLines={1}>
            {rightTeamData.name}
          </Text>
          <TouchableOpacity 
            style={styles.bigScoreTouchArea} 
            onPress={() => { if (rightTeamData.canControl) openActionModal(rightTeamData.key, 'score'); }} 
            disabled={!rightTeamData.canControl}
            activeOpacity={0.8}
          >
            <View style={styles.scoreCenterWrap}>
              <Text style={styles.bigScoreNumber}>{rightTeamData.score}</Text>
              {rightTeamData.canControl ? (
                <Text style={styles.editHintText}>터치하여 +1점 득점</Text>
              ) : (
                <Text style={styles.spectatorHintText}>👁️ 관전 모드 (점수 확인)</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.footerStack}>
      <View style={[styles.momentumRow, { paddingLeft: Math.max(safeInset(insets.left), 8), paddingRight: Math.max(safeInset(insets.right), 8) }]}>
        <MomentumLevelBar events={liveSetEvents || []} />
      </View>

      <View style={[styles.bottomControlBar, { paddingLeft: Math.max(safeInset(insets.left), 8), paddingRight: Math.max(safeInset(insets.right), 8) }]}>
        <View style={styles.timelineChipRow}>
          <ScoreTimeline
            key={`live-set-${currentSetIndex}-${timelineEpoch}`}
            events={liveSetEvents}
            canControl={myRole !== 'spectator'}
            displayHostName={displayHostName}
            displayAwayName={displayAwayName}
            currentSetIndex={currentSetIndex}
            onPressEvent={handlePressTimelineEvent}
          />
        </View>

        {myRole !== 'spectator' && (
          <View style={styles.actionButtonsArea}>
            <TouchableOpacity style={styles.undoBtn} onPress={handleUndoEvent} hitSlop={8}>
              <Text style={styles.undoBtnText} numberOfLines={1}>취소</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.finishSetBtn} onPress={handleFinishSet} hitSlop={8}>
              <Text style={styles.finishSetBtnText} numberOfLines={1}>세트마감</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.finishMatchBtn} onPress={handleOpenFinishMatch} hitSlop={8}>
              <Text style={styles.finishMatchBtnText} numberOfLines={1}>경기종료</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
      </View>

      <PlayerActionModal
        visible={actionModalVisible}
        mode={actionMode}
        teamName={actionTeam === 'host' ? displayHostName : displayAwayName}
        opponentTeamName={actionTeam === 'host' ? displayAwayName : displayHostName}
        boardSide={actionTeam === leftTeamData.key ? 'left' : 'right'}
        courtMembers={actionRoster?.court || []}
        benchMembers={actionRoster?.bench || []}
        opponentCourtMembers={opponentRoster?.court || []}
        courtLayout={{
          frontCount: actionRoster.formation.frontCount,
          middleCount: actionRoster.formation.middleCount,
          backCount: actionRoster.formation.backCount,
        }}
        opponentCourtLayout={{
          frontCount: opponentRoster.formation.frontCount,
          middleCount: opponentRoster.formation.middleCount,
          backCount: opponentRoster.formation.backCount,
        }}
        usedGuestIds={[
          ...(events || []).flatMap((e) => [e?.player_id, e?.sub_out_id]),
          ...(hostRosterView?.court || []).map((m) => m?.user_id),
          ...(hostRosterView?.bench || []).map((m) => m?.user_id),
          ...(awayRosterView?.court || []).map((m) => m?.user_id),
          ...(awayRosterView?.bench || []).map((m) => m?.user_id),
        ]}
        onClose={() => { setActionModalVisible(false); setEditingEventId(null); }}
        onScoreConfirm={handleScoreConfirm}
        onSubConfirm={handleSubConfirm}
        onLineupApply={handleLineupApply}
      />

      <FormationModal
        visible={formationVisible}
        teamName={formationTeam === 'host' ? displayHostName : displayAwayName}
        members={formationTeam === 'host' || isIntramural ? (hostMembers || []) : (awayMembers || [])}
        initial={formationTeam === 'host' ? hostFormationInitial : awayFormationInitial}
        onClose={() => setFormationVisible(false)}
        onSave={handleSaveFormation}
        isSingleRecorder={isSingleRecorderMode}
        hostSide={{
          teamName: displayHostName,
          members: hostMembers || [],
          initial: hostFormationInitial,
          canEdit: canControlHost && myRole !== 'spectator',
        }}
        awaySide={{
          teamName: displayAwayName,
          members: isIntramural ? (hostMembers || []) : (awayMembers || []),
          initial: awayFormationInitial,
          canEdit: canControlAway && myRole !== 'spectator',
        }}
        onSaveDual={handleSaveDualFormation}
        usedMatchIds={[
          ...collectFormationIds(match?.host_roster),
          ...collectFormationIds(match?.away_roster),
          ...(events || []).flatMap((e) => [e?.player_id, e?.sub_out_id]),
        ]}
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
            <Text style={styles.modalTitle}>{isIntramural ? '🏆 팀 내전 경기 최종 마감' : '🏆 공식전 경기 최종 마감'}</Text>
            <Text style={styles.modalSub}>승 / 무 / 패 결과를 선택하여 경기를 확정하세요.</Text>
            <View style={{ gap: 10, marginVertical: 14, width: '100%' }}>
              <TouchableOpacity style={[styles.finishChoiceBtn, { backgroundColor: '#0284C7' }]} onPress={() => handleConfirmFinishChoice(isIntramural ? displayHostName : (match?.host_team_name || displayHostName))} activeOpacity={0.85}>
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' }}>🥇 🔵 {displayHostName} 승리</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.finishChoiceBtn, { backgroundColor: '#BE123C' }]} onPress={() => handleConfirmFinishChoice(isIntramural ? displayAwayName : (match?.away_team_name || displayAwayName))} activeOpacity={0.85}>
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' }}>🥇 🔴 {displayAwayName} 승리</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.finishChoiceBtn, { backgroundColor: '#334155' }]} onPress={() => handleConfirmFinishChoice('draw')} activeOpacity={0.85}>
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' }}>🤝 무승부</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setFinishModalVisible(false)}>
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' }}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={pendingDeleteSet !== null} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>세트 삭제</Text>
            <Text style={styles.modalSub}>
              {pendingDeleteSet !== null ? `${pendingDeleteSet}세트를 삭제하시겠습니까?` : ''}
            </Text>
            <Text style={styles.modalWarn}>해당 세트의 타임라인 기록이 함께 삭제되고, 이후 세트 번호가 당겨집니다.</Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setPendingDeleteSet(null)}>
                <Text style={styles.modalCancelBtnText}>닫기</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#BE123C' }]} onPress={handleConfirmDeleteSet}>
                <Text style={styles.modalSaveBtnText}>세트 삭제</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!pendingDeleteEvent} animationType="fade" transparent={true}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>타임라인 기록 삭제</Text>
            <Text style={styles.modalSub}>
              {pendingDeleteEvent
                ? `${pendingDeleteEvent.is_canceled ? '취소된 항목을 ' : ''}이 기록을 완전히 삭제할까요?`
                : ''}
            </Text>
            <Text style={styles.modalWarn}>
              {pendingDeleteEvent
                ? `${pendingDeleteEvent.host_score}:${pendingDeleteEvent.away_score} · ${displaySlotPlayerName(pendingDeleteEvent.player_id, pendingDeleteEvent.player_name)} · ${pendingDeleteEvent.event_type}`
                : ''}
            </Text>
            <View style={styles.modalBtnRow}>
              {pendingDeleteEvent && !pendingDeleteEvent.is_canceled && pendingDeleteEvent.event_type !== 'sub' ? (
                <TouchableOpacity
                  style={styles.modalCancelBtn}
                  onPress={() => {
                    const ev = pendingDeleteEvent;
                    setPendingDeleteEvent(null);
                    if (ev) handleEditEventTrigger(ev);
                  }}
                >
                  <Text style={styles.modalCancelBtnText}>선수 수정</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setPendingDeleteEvent(null)}>
                  <Text style={styles.modalCancelBtnText}>닫기</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[styles.modalSaveBtn, { backgroundColor: '#BE123C' }]} onPress={handleConfirmDeleteEvent}>
                <Text style={styles.modalSaveBtnText}>완전 삭제</Text>
              </TouchableOpacity>
            </View>
            {pendingDeleteEvent && !pendingDeleteEvent.is_canceled && pendingDeleteEvent.event_type !== 'sub' ? (
              <TouchableOpacity style={[styles.modalCancelBtn, { marginTop: 8 }]} onPress={() => setPendingDeleteEvent(null)}>
                <Text style={styles.modalCancelBtnText}>닫기</Text>
              </TouchableOpacity>
            ) : null}
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
  container: {
    flex: 1,
    backgroundColor: '#020617',
    overflow: 'hidden',
  },
  loadingContainer: { flex: 1, backgroundColor: '#020617', justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#94A3B8', marginTop: 12, fontSize: 13, fontWeight: '700' },
  headerBlock: { height: 38, flexShrink: 0, backgroundColor: '#0F172A', borderBottomWidth: 1, borderBottomColor: '#1E293B' },
  headerSlim: { height: 38, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 0, paddingBottom: 0 },
  headerSlimLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  backBtnSlim: { width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  backTextSlim: { fontSize: 26, color: '#FFFFFF', lineHeight: 26 },
  setTabScroll: { flexGrow: 0, flexShrink: 1 },
  setTabNavRow: { flexDirection: 'row', gap: 4, alignItems: 'center', paddingRight: 4 },
  setNavAdd: { width: 22, height: 22, borderRadius: 4, backgroundColor: '#1E293B', borderWidth: 1, borderColor: '#38BDF8', alignItems: 'center', justifyContent: 'center' },
  setNavAddText: { color: '#38BDF8', fontSize: 15, fontWeight: '900', lineHeight: 16 },
  setNavPill: { flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 2, paddingVertical: 2, borderRadius: 4, backgroundColor: '#1E293B' },
  setNavPillActive: { backgroundColor: '#2563EB' },
  setNavPillHit: { paddingVertical: 2, paddingRight: 2 },
  setNavPillText: { fontSize: 10.5, lineHeight: 14, fontWeight: '700', color: '#94A3B8' },
  setNavPillTextActive: { color: '#FFFFFF', fontWeight: '900' },
  setNavClose: { width: 16, height: 16, borderRadius: 8, alignItems: 'center', justifyContent: 'center', marginLeft: 2 },
  setNavCloseText: { color: '#FCA5A5', fontSize: 13, fontWeight: '900', lineHeight: 14 },
  recorderLine: { fontSize: 11, color: '#E2E8F0', fontWeight: '800', textAlign: 'left', marginRight: 6, flexShrink: 1 },
  headerSlimRight: { flexDirection: 'row', gap: 4, flexShrink: 1, minWidth: 0, justifyContent: 'flex-end', alignItems: 'center', paddingVertical: 0 },
  reportBtnSlim: { backgroundColor: '#FEFCE8', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#FDE047' },
  reportBtnTextSlim: { color: '#A16207', fontWeight: '800', fontSize: 10.5 },
  leaveRoleBtnSlim: { backgroundColor: '#FEF2F2', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#FECACA' },
  leaveRoleBtnTextSlim: { color: '#DC2626', fontWeight: '800', fontSize: 10.5 },
  switchCourtBtnSlim: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#F1F5F9', borderRadius: 8 },
  switchCourtBtnTextSlim: { color: '#334155', fontWeight: '800', fontSize: 11 },
  scoreboardMainGrid: { flex: 1, minHeight: 160, flexDirection: 'row', width: '100%', backgroundColor: '#020617' },
  teamCourtHalf: { flex: 1, flexShrink: 0, minWidth: 0, position: 'relative', padding: 0, margin: 0 },
  hostCourtBg: { backgroundColor: '#0284C7' },
  awayCourtBg: { backgroundColor: '#BE123C' },
  courtTeamName: {
    position: 'absolute',
    top: 8,
    zIndex: 12,
    maxWidth: '42%',
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    overflow: 'hidden',
  },
  stackedUtilityBtns: { flexDirection: 'column', gap: 3, justifyContent: 'flex-start', flexShrink: 0, zIndex: 12 },
  floatBtnsA: { position: 'absolute', top: 8, right: 8, alignItems: 'flex-end' },
  floatBtnsB: { position: 'absolute', top: 8, left: 8, alignItems: 'flex-start' },
  glassBtnCompact: { backgroundColor: 'rgba(0, 0, 0, 0.25)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.2)', alignItems: 'center', justifyContent: 'center', flexShrink: 0, minHeight: 36 },
  glassBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', lineHeight: 16, includeFontPadding: false },
  bigScoreTouchArea: { flex: 1, width: '100%', padding: 0, margin: 0, justifyContent: 'center', alignItems: 'center' },
  scoreCenterWrap: { flex: 1, justifyContent: 'center', alignItems: 'center', margin: 0, padding: 0 },
  bigScoreNumber: {
    fontSize: 160,
    lineHeight: 165,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -2,
    textAlign: 'center',
    textAlignVertical: 'center',
    ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
  },
  editHintText: { fontSize: 11, color: '#FFFFFF', fontWeight: '800', marginTop: 4, opacity: 0.8 },
  spectatorHintText: { fontSize: 11, color: '#FFFFFF', fontWeight: '700', marginTop: 4, opacity: 0.8 },
  footerStack: { flexShrink: 0, backgroundColor: '#0F172A' },
  momentumRow: { height: 14, flexShrink: 0, backgroundColor: '#0F172A', justifyContent: 'center' },
  bottomControlBar: { height: 88, flexShrink: 0, flexDirection: 'row', paddingVertical: 0, backgroundColor: '#0F172A', borderTopWidth: 1, borderTopColor: '#1E293B', alignItems: 'center' },
  timelineChipRow: { flex: 1, height: 88, minWidth: 0, overflow: 'hidden' },
  actionButtonsArea: { flexDirection: 'row', gap: 4, flexShrink: 0, flexGrow: 0, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6, paddingLeft: 8, borderLeftWidth: 1, borderLeftColor: '#1E293B', backgroundColor: '#0F172A', zIndex: 4 },
  undoBtn: { backgroundColor: '#334155', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, alignItems: 'center', borderWidth: 1, borderColor: '#475569', flexShrink: 0 },
  undoBtnText: { color: '#F8FAFC', fontSize: 11, fontWeight: '800' },
  finishSetBtn: { backgroundColor: '#2563EB', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, alignItems: 'center', flexShrink: 0 },
  finishSetBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  finishMatchBtn: { backgroundColor: '#9333EA', paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, alignItems: 'center', flexShrink: 0 },
  finishMatchBtnText: { color: '#FFFFFF', fontSize: 11, fontWeight: '900' },
  modalWarn: { fontSize: 12, color: '#FCA5A5', fontWeight: '700', marginBottom: 12, lineHeight: 16 },
  finishChoiceBtn: { width: '100%', paddingVertical: 14, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexGrow: 0, flexShrink: 0 },
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