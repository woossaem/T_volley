import { Colors, TEAM_COLORS } from '../constants/Colors';
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
  Animated,
  useWindowDimensions,
} from 'react-native';
import {
  abandonScoreboardAudioFocus,
  HEADSET_BUTTON_HINT,
  requestScoreboardAudioFocus,
  stopBluetoothSco,
  stopForegroundService,
  triggerVoiceRecognition,
} from '../lib/bluetoothVoiceRoute';
import { formatVoiceConfirm, parseVoiceCommand } from '../lib/voiceParser';
import { setupHeadsetRemote } from '../lib/headsetRemote';
import { speakKorean } from '../lib/voiceSpeak';
import { getAudioState, releaseVoiceEngine, subscribeAudioState, type AudioMachineState } from '../lib/voiceListen';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../lib/supabase';
import { sendNotificationToTeam } from '../lib/notificationService';
import { isGuestBindPending, isSoloGuestMatch } from '../lib/guestMatch';
import { asArray, safeInset, safeLockPortrait, safeStyleNumber } from '../lib/nativeSafe';
import { MatchEvent } from '../components/ScoreTimeline';
import ScoreTimeline from '../components/ScoreTimeline';
import { overlayActionCodes, readActionCode } from '../lib/timelineBadge';
import PlayerActionModal, { Member, ScoreKind, type LineupApplyPayload } from '../components/PlayerActionModal';
import MatchPostgameReportModal from '../components/MatchPostgameReportModal';
import FormationModal from '../components/FormationModal';
import FirstServeModal from '../components/FirstServeModal';
import { MomentumLevelBar } from '../components/SetFlowGauges';
import { ANONYMOUS_PLAYER_NAME, assignedUserId, clampLineCount, DEFAULT_LINE_COUNT, displaySlotPlayerName, ensureTempIdsInCourt, isRegisteredUserId, isTempSlotId, listHasUser, parseSetFormation, parseSetFormationMap, parseSetRosterMap, persistCourtSlots, resolveFormationForSet, resolveFormationFromSources, safeIncludes, safeNameText, seedNextSetFormation, teamsInclude, type SetFormation } from '../lib/roster';
import { parseServeSetupMap, resolveServePossession, shiftServeSetupMap, slotIndexForServeLabel, type ServeSetupMap, type ServeTeam } from '../lib/serveRotation';
import { getSafeDisplayName, getSafeTeamName } from '../lib/utils';
import { appendMatchScoreLog } from '../lib/retroactiveBinding';
import { updateMatchIgnoringUnknownColumns, extractMissingColumn, isUnknownColumnError } from '../lib/matchWrite';
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
  fetchSetScoreFromDb,
  listMatchSetsReadOnly,
  writeLiveSetLineup,
  isMatchRecordingFinished,
  type MatchSetRecord,
} from '../lib/matchSets';
import {
  attributeTimelineEvents,
  courtsBySetFromRoster,
  findSlotIndexForPlayer,
  positionSlotToIndex,
  toPositionSlot,
} from '../lib/slotAttribution';

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
  onOpenLineup?: () => void;
  spectatorCourtFlip?: boolean;
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
  is_swapped?: boolean | null;
  serve_setup?: unknown;
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
    position_slot: log?.position_slot ?? log?.positionSlot ?? null,
    host_score: Number(log?.host_score) || 0,
    away_score: Number(log?.away_score) || 0,
    is_canceled: !!log?.is_canceled,
    created_at: log?.created_at ?? null,
    action_code: readActionCode(log) || null,
  };
}

function normalizeMatchEvent(row: any, fallbackId = ''): MatchEvent | null {
  if (!row) return null;
  const id = row.id != null && String(row.id) !== '' ? String(row.id) : fallbackId;
  if (!id) return null;
  return {
    id,
    match_id: row.match_id,
    set_index: setIndexFromScoreLog(row),
    event_type: row.event_type,
    team_type: row.team_type,
    player_id: row.player_id ?? null,
    player_name: row.player_name ?? null,
    sub_out_id: row.sub_out_id ?? null,
    sub_out_name: row.sub_out_name ?? null,
    position_slot: row.position_slot ?? row.positionSlot ?? null,
    host_score: Number(row.host_score) || 0,
    away_score: Number(row.away_score) || 0,
    is_canceled: !!row.is_canceled,
    created_at: row.created_at ?? null,
    action_code: readActionCode(row) || null,
    ...(row.set_number != null ? { set_number: Number(row.set_number) } : {}),
  } as MatchEvent;
}

function rowsToMatchEvents(rows: any[], matchId: string): MatchEvent[] {
  return asArray<any>(rows)
    .map((row, i) => normalizeMatchEvent(row, `ev-${matchId}-${i}`))
    .filter(Boolean) as MatchEvent[];
}

/** 경기 리포트와 동일: match_events 원본 → 없으면 matches.score_logs */
async function fetchMatchTimelineEvents(matchId: string): Promise<MatchEvent[]> {
  const [ordered, matchRow] = await Promise.all([
    supabase
      .from('match_events')
      .select('*')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true }),
    supabase.from('matches').select('score_logs').eq('id', matchId).maybeSingle(),
  ]);
  const logs = asArray<any>((matchRow.data as any)?.score_logs);
  let rows = !ordered.error ? asArray<any>(ordered.data) : [];
  if (ordered.error) {
    const unordered = await supabase.from('match_events').select('*').eq('match_id', matchId);
    if (!unordered.error) rows = asArray<any>(unordered.data);
  }
  const fromTable = overlayActionCodes(rowsToMatchEvents(rows, matchId), logs);
  if (fromTable.length > 0) return fromTable;
  return mergeEventsWithScoreLogs([], logs, matchId, false);
}

function mergeEventsWithScoreLogs(tableEvents: MatchEvent[], scoreLogs: any[], matchId: string, tableOk = false): MatchEvent[] {
  const table = asArray<any>(tableEvents).map((row, i) => normalizeMatchEvent(row, `ev-${i}`)).filter(Boolean) as MatchEvent[];
  if (tableOk) return table;
  const mapped = (Array.isArray(scoreLogs) ? scoreLogs : []).map((log, i) => (
    mapScoreLogToEvent(log, matchId, `log-${i}`)
  ));
  if (table.length === 0) return mapped;
  const ids = new Set(table.map((e) => String(e.id)));
  const extras = mapped.filter((e) => !ids.has(String(e.id)));
  return extras.length ? [...table, ...extras] : table;
}

function scoreFromMatchSetRow(
  setRow?: { hostScore?: number; awayScore?: number; host_score?: number; away_score?: number } | null,
): { host: number; away: number } | null {
  if (!setRow) return null;
  return {
    host: Number(setRow.hostScore ?? setRow.host_score) || 0,
    away: Number(setRow.awayScore ?? setRow.away_score) || 0,
  };
}

async function updateMatchSetScoreNow(
  matchId: string,
  setIndex: number,
  host: number,
  away: number,
): Promise<{ host: number; away: number }> {
  const setNumber = Math.max(1, setIndex + 1);
  const hostScore = Number(host) || 0;
  const awayScore = Number(away) || 0;
  const { data: existing } = await supabase
    .from('match_sets')
    .select('id')
    .eq('match_id', matchId)
    .eq('set_number', setNumber)
    .maybeSingle();
  if (existing?.id) {
    const { error } = await supabase
      .from('match_sets')
      .update({ host_score: hostScore, away_score: awayScore })
      .eq('id', existing.id)
      .eq('match_id', matchId)
      .eq('set_number', setNumber);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('match_sets').insert({
      match_id: matchId,
      set_number: setNumber,
      host_score: hostScore,
      away_score: awayScore,
      is_closed: false,
    });
    if (error) throw error;
  }
  return { host: hostScore, away: awayScore };
}

function resolveSetRosters(args: {
  isHost: boolean;
  isIntramural: boolean;
  match: MatchRecord | null;
  hostMembers: Member[];
  awayMembers: Member[];
  matchSets: MatchSetRecord[];
  currentSetIndex: number;
}): { court: Member[]; bench: Member[]; late: Member[]; formation: SetFormation } {
  const { isHost, isIntramural, match, hostMembers, awayMembers, matchSets, currentSetIndex } = args;
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

  const hasFormation = rawCourt.some((id) => !!assignedUserId(id)) || benchIds.length > 0 || lateIds.length > 0;
  if (!hasFormation) {
    const emptyCourt = Array.from({ length: slotTotal }, () => ({ user_id: '', full_name: '' }));
    return { court: emptyCourt, bench: baseMembers, late: [] as Member[], formation };
  }

  const slots = [...rawCourt];
  while (slots.length < slotTotal) slots.push('');
  const court = slots.slice(0, slotTotal).map((id) => {
    const real = baseMembers.find((m) => m.user_id === id || listHasUser([id], m.user_id) || safeIncludes(id, m.user_id));
    if (real) return real;
    const kept = assignedUserId(id);
    if (!kept) return { user_id: '', full_name: '' };
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
}

function findSpokenMember(members: Member[], spoken: string): Member | null {
  const target = spoken.replace(/\s+/g, '').toLowerCase();
  if (target.length < 2) return null;
  const unique: Member[] = [];
  const seen = new Set<string>();
  members.forEach((member) => {
    const key = member?.user_id || getSafeDisplayName(member);
    if (!key || seen.has(key)) return;
    seen.add(key);
    unique.push(member);
  });
  const nameOf = (member: Member) => (getSafeDisplayName(member) || '').replace(/\s+/g, '').toLowerCase();
  const exact = unique.filter((member) => nameOf(member) === target);
  if (exact.length === 1) return exact[0];
  const partial = unique.filter((member) => {
    const name = nameOf(member);
    return name.length >= 2 && (name.includes(target) || target.includes(name));
  });
  return partial.length === 1 ? partial[0] : null;
}

export default function ScoreboardScreen(props: ScoreboardScreenProps = {}) {
  const router = useRouter();
  const params = useLocalSearchParams<{ matchId: string }>();
  const paramMatchId = Array.isArray(params.matchId) ? params.matchId[0] : params.matchId;
  const matchId = props.matchId || paramMatchId;
  const isSpectatorForced = props.isSpectator === true;
  const onOpenLineup = props.onOpenLineup;
  const spectatorCourtFlip = props.spectatorCourtFlip === true;

  useEffect(() => {
    activateKeepAwakeAsync().catch(() => {});
    return () => {
      try {
        void Promise.resolve(deactivateKeepAwake()).catch(() => {});
      } catch {}
    };
  }, []);

  const { session } = useAuth();
  const { width: windowWidth } = useWindowDimensions();
  const isPcWeb = Platform.OS === 'web' && windowWidth >= 1024;
  const scoreFontSize = useMemo(() => {
    if (!isPcWeb) return 160;
    const boardW = isSpectatorForced
      ? Math.min(1200, Math.max(320, windowWidth - 472))
      : Math.min(1200, windowWidth);
    const fitted = Math.floor((boardW / 2) * 0.88);
    return Math.max(160, Math.min(416, fitted));
  }, [isPcWeb, isSpectatorForced, windowWidth]);
  const scoreLineHeight = Math.round(scoreFontSize * 1.03);
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
  const [finishSetConfirmVisible, setFinishSetConfirmVisible] = useState(false);
  const [reportModalVisible, setReportModalVisible] = useState(false);
  const [timelineEpoch, setTimelineEpoch] = useState(0);
  const [pendingDeleteSet, setPendingDeleteSet] = useState<number | null>(null);
  const [pendingDeleteEvent, setPendingDeleteEvent] = useState<MatchEvent | null>(null);
  const [formationVisible, setFormationVisible] = useState(false);
  const [formationTeam, setFormationTeam] = useState<'host' | 'away'>('host');
  const [serveSetupMap, setServeSetupMap] = useState<ServeSetupMap>({});
  const [audioState, setAudioState] = useState<AudioMachineState>('IDLE');
  const [voiceArmed, setVoiceArmed] = useState(false);
  const voicePulse = useRef(new Animated.Value(1)).current;
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const voiceListening = audioState === 'LISTENING';
  const voiceMicLive = voiceArmed || audioState !== 'IDLE';

  useEffect(() => {
    if (!voiceListening) {
      voicePulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(voicePulse, { toValue: 0.35, duration: 420, useNativeDriver: true }),
        Animated.timing(voicePulse, { toValue: 1, duration: 420, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [voiceListening, voicePulse]);

  const isInitialLoadRef = useRef(true);
  const didAutofillSet1Ref = useRef(false);
  const matchClosedRef = useRef(false);
  const hydrateGenRef = useRef(0);
  const finishSetBusyRef = useRef(false);
  const spectatorFollowLiveRef = useRef(true);
  const currentSetIndexRef = useRef(currentSetIndex);
  currentSetIndexRef.current = currentSetIndex;

  const setHistoryRef = useRef(setHistory);
  setHistoryRef.current = setHistory;

  const eventsRef = useRef(events);
  eventsRef.current = events;

  const scoresRef = useRef(currentScores);
  scoresRef.current = currentScores;

  const myRoleRef = useRef(myRole);
  myRoleRef.current = myRole;

  const persistOptimisticEvent = async (
    tempEvent: MatchEvent,
    payload: Record<string, unknown>,
  ): Promise<MatchEvent> => {
    let nextPayload: Record<string, unknown> = { ...payload };
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data, error } = await supabase
        .from('match_events')
        .insert(nextPayload)
        .select('*')
        .maybeSingle();
      if (!error) {
        const persisted = normalizeMatchEvent(data, tempEvent.id) || tempEvent;
        if (!persisted.action_code && tempEvent.action_code) persisted.action_code = tempEvent.action_code;
        if (!persisted.created_at && tempEvent.created_at) persisted.created_at = tempEvent.created_at;
        setEvents((prev) => {
          const next = prev.map((event) => event.id === tempEvent.id ? persisted : event);
          eventsRef.current = next;
          return next;
        });
        return persisted;
      }
      if (!isUnknownColumnError(error)) {
        console.error('match_events 저장 실패:', error);
        return tempEvent;
      }
      const missing = extractMissingColumn(error);
      if (missing && missing in nextPayload) {
        const { [missing]: _dropped, ...rest } = nextPayload;
        nextPayload = rest;
        continue;
      }
      console.error('match_events 저장 실패:', error);
      return tempEvent;
    }
    return tempEvent;
  };

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
      if (Platform.OS === 'web') return undefined;

      let cancelled = false;
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      let rafId = 0;

      const lockLandscapeWhenReady = () => {
        timeoutId = setTimeout(() => {
          if (cancelled || matchClosedRef.current) return;
          void (async () => {
            try {
              if (Platform.OS === 'web') return;
              await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
            } catch (error) {
              console.warn('[Scoreboard] orientation lock skipped:', error);
            } finally {
              // 락 실패가 Unhandled Rejection / 라우터 이탈로 번지지 않게 화면을 유지한다.
            }
          })();
        }, 100);
      };

      try {
        rafId = requestAnimationFrame(lockLandscapeWhenReady);
      } catch {
        lockLandscapeWhenReady();
      }

      return () => {
        cancelled = true;
        try {
          if (rafId) cancelAnimationFrame(rafId);
        } catch {
          // ignore
        }
        if (timeoutId != null) clearTimeout(timeoutId);
        void (async () => {
          try {
            if (Platform.OS === 'web') return;
            await ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT);
          } catch (error) {
            console.warn('[Scoreboard] orientation restore skipped:', error);
          } finally {
            // 복구 실패여도 이전 화면으로 튕기지 않는다.
          }
        })();
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

  const applySetScoreToState = useCallback((setIndex: number, score: { host: number; away: number }) => {
    if (setIndex === currentSetIndexRef.current) {
      setCurrentScores({ host: score.host, away: score.away });
    }
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
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!matchId || !isSpectatorForced) return;
      let cancelled = false;
      const loadLiveScoreFromDb = async () => {
        const idx = currentSetIndexRef.current;
        const { data, error } = await supabase
          .from('match_sets')
          .select('host_score, away_score, set_number')
          .eq('match_id', matchId)
          .eq('set_number', idx + 1)
          .maybeSingle();
        if (cancelled || error || !data) return;
        applySetScoreToState(idx, {
          host: Number((data as any).host_score) || 0,
          away: Number((data as any).away_score) || 0,
        });
      };
      void loadLiveScoreFromDb();
      return () => {
        cancelled = true;
      };
    }, [matchId, applySetScoreToState, isSpectatorForced])
  );

  const persistRecalculatedSetScore = async (allEvents: MatchEvent[], setIndex: number) => {
    if (!matchId) return lastScoreForSetFromEvents(allEvents, setIndex);
    const computed = lastScoreForSetFromEvents(allEvents, setIndex);
    try {
      await updateMatchSetScoreNow(matchId, setIndex, computed.host, computed.away);
    } catch (e) {
      console.error('match_sets 점수 동기화 실패:', e);
    }
    const fromDb = await fetchSetScoreFromDb(matchId, setIndex);
    const score = fromDb || computed;
    applySetScoreToState(setIndex, score);
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
        setServeSetupMap(parseServeSetupMap((data as MatchRecord).serve_setup));
        if (!isSpectatorForced && typeof (data as MatchRecord).is_swapped === 'boolean') {
          setIsSwapped(!!(data as MatchRecord).is_swapped);
        }
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

        // 웹 관전은 아래 Realtime/폴링의 fetchMatchTimelineEvents 가 SSOT.
        // 여기서 setEvents 하면 늦은 fetchMatchDetails 가 타임라인을 빈 배열로 덮는다.
        if (!isSpectatorForced) {
          const fromTable = await fetchMatchTimelineEvents(matchId);
          setEvents(fromTable);
        }

        const applyIdx = currentSetIndexRef.current;
        const { data: liveSetRow } = await supabase
          .from('match_sets')
          .select('host_score, away_score, set_number')
          .eq('match_id', matchId)
          .eq('set_number', applyIdx + 1)
          .maybeSingle();
        applySetScoreToState(applyIdx, {
          host: Number((liveSetRow as any)?.host_score) || 0,
          away: Number((liveSetRow as any)?.away_score) || 0,
        });
      }
    } catch (err: any) {
      console.error('스코어보드 실패:', err);
    } finally {
      setLoading(false);
    }
  }, [matchId, currentUserId, isSpectatorForced, applySetScoreToState]);

  useEffect(() => {
    fetchMatchDetails();

    const pullSpectatorEvents = async () => {
      if (!isSpectatorForced || !matchId) return;
      const next = await fetchMatchTimelineEvents(matchId);
      eventsRef.current = next;
      setEvents(next);
    };

    const matchChannel = supabase.channel(`match_${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'matches', filter: `id=eq.${matchId}` }, async (payload) => {
        const updated = (payload?.new || {}) as MatchRecord;
        if (!updated?.id) return;
        setMatch(updated);
        setServeSetupMap(parseServeSetupMap((updated as MatchRecord).serve_setup));
        if (!isSpectatorForced && typeof (updated as MatchRecord).is_swapped === 'boolean') {
          setIsSwapped(!!(updated as MatchRecord).is_swapped);
        }

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

        void pullSpectatorEvents();
      })
      .subscribe();

    if (!isSpectatorForced) {
      return () => {
        supabase.removeChannel(matchChannel);
      };
    }

    const pullEventsFromDb = pullSpectatorEvents;

    const pullSpectatorSets = async () => {
      if (!matchId) return;
      const listed = await listMatchSetsReadOnly(matchId);
      const loaded = normalizeSetRecords(listed.length > 0 ? listed : [makeInitialLiveSet()]);
      setMatchSets(loaded);
      const closedStrs = loaded.filter((s) => s.isClosed).map((s) => `${s.hostScore}:${s.awayScore}`);
      setSetScoresHistory(closedStrs);
      setHistoryRef.current = closedStrs;
      const openIdxs = loaded.map((s, i) => (s.isClosed ? -1 : i)).filter((i) => i >= 0);
      const liveIdx = openIdxs.length > 0 ? openIdxs[openIdxs.length - 1] : Math.max(0, loaded.length - 1);
      const selectedIdx = currentSetIndexRef.current;
      const selectedStillExists = selectedIdx >= 0 && selectedIdx < loaded.length;
      const shouldFollowLive = spectatorFollowLiveRef.current || !selectedStillExists;
      const displayIdx = shouldFollowLive ? liveIdx : selectedIdx;
      if (!selectedStillExists) spectatorFollowLiveRef.current = true;
      currentSetIndexRef.current = displayIdx;
      setCurrentSetIndex(displayIdx);
      const live = loaded[displayIdx] || loaded[0];
      setCurrentScores({
        host: Number(live?.hostScore) || 0,
        away: Number(live?.awayScore) || 0,
      });
    };

    let setsPullTimer: ReturnType<typeof setTimeout> | null = null;
    const schedulePullSpectatorSets = () => {
      if (setsPullTimer) clearTimeout(setsPullTimer);
      setsPullTimer = setTimeout(() => { void pullSpectatorSets(); }, 80);
    };

    const applyRealtimeSetScore = (row?: {
      set_number?: number;
      host_score?: number;
      away_score?: number;
      is_closed?: boolean;
    }) => {
      if (row) {
        const setNumber = Number(row.set_number);
        const host = Number(row.host_score) || 0;
        const away = Number(row.away_score) || 0;
        if (Number.isFinite(setNumber) && setNumber === currentSetIndexRef.current + 1 && row.is_closed !== true) {
          setCurrentScores({ host, away });
        }
      }
      schedulePullSpectatorSets();
      void pullEventsFromDb();
    };

    const eventChannel = supabase.channel(`events_${matchId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'match_events', filter: `match_id=eq.${matchId}` }, () => {
        void pullEventsFromDb();
      })
      .subscribe();

    const setScoreChannel = supabase.channel(`match_sets_${matchId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'match_sets', filter: `match_id=eq.${matchId}` }, (payload) => {
        applyRealtimeSetScore(payload?.new as any);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'match_sets', filter: `match_id=eq.${matchId}` }, (payload) => {
        applyRealtimeSetScore(payload?.new as any);
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'match_sets', filter: `match_id=eq.${matchId}` }, () => {
        schedulePullSpectatorSets();
        void pullEventsFromDb();
      })
      .subscribe();

    void pullSpectatorSets();
    void pullEventsFromDb();
    const pollMs = Platform.OS === 'web' ? 1500 : 0;
    const pollId = pollMs > 0 ? setInterval(() => {
      void pullSpectatorSets();
      void pullEventsFromDb();
    }, pollMs) : null;

    return () => {
      if (setsPullTimer) clearTimeout(setsPullTimer);
      if (pollId) clearInterval(pollId);
      supabase.removeChannel(matchChannel);
      supabase.removeChannel(eventChannel);
      supabase.removeChannel(setScoreChannel);
    };
  }, [matchId, fetchMatchDetails, isSpectatorForced]);

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

  const handleScoreConfirm = async (player: Member | null, kind: ScoreKind = 'kill', positionSlot: number | null = null) => {
    setActionModalVisible(false);
    const savedSlot = positionSlot ?? null;
    
    if (actionMode === 'edit' && editingEventId) {
      const eventType = kind === 'fault' ? 'fault' : 'score';
      const keepId = player?.user_id && (isRegisteredUserId(player.user_id) || isTempSlotId(player.user_id)) ? player.user_id : null;
      const savedPlayerId = keepId;
      const savedPlayerName = isRegisteredUserId(keepId) ? getSafeDisplayName(player) : displaySlotPlayerName(keepId, getSafeDisplayName(player));
      setEvents(prev => prev.map(e => e.id === editingEventId ? { ...e, player_id: savedPlayerId, player_name: savedPlayerName, event_type: eventType, position_slot: savedSlot ?? e.position_slot } : e));
      await supabase.from('match_events').update({
        player_id: savedPlayerId,
        player_name: savedPlayerName,
        event_type: eventType,
        ...(savedSlot != null ? { position_slot: savedSlot } : {}),
      }).eq('id', editingEventId);
      return;
    }

    await persistRally(actionTeam, kind, player, savedSlot);
  };

  const persistRally = async (
    scoringTeam: 'host' | 'away',
    kind: ScoreKind,
    player: Member | null,
    positionSlot: number | null,
    actionCode?: string | null,
  ) => {
    const savedSlot = positionSlot ?? null;
    const scores = scoresRef.current;
    const newHostScore = scoringTeam === 'host' ? scores.host + 1 : scores.host;
    const newAwayScore = scoringTeam === 'away' ? scores.away + 1 : scores.away;
    const eventType = kind === 'fault' ? 'fault' : 'score';
    const savedAction = actionCode || (kind === 'fault' ? 'FAULT' : 'SCORE');
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
      position_slot: savedSlot,
      host_score: newHostScore,
      away_score: newAwayScore,
      is_canceled: false,
      action_code: savedAction,
      created_at: new Date().toISOString(),
    };
    setEvents(prev => {
      const next = [...prev, tempEvent];
      eventsRef.current = next;
      return next;
    });

    const scoreLog = {
      match_id: matchId,
      set_index: currentSetIndex,
      set_number: currentSetIndex + 1,
      event_type: eventType,
      team_type: scoringTeam,
      player_id: savedPlayerId,
      player_name: savedPlayerName,
      position_slot: savedSlot,
      host_score: newHostScore,
      away_score: newAwayScore,
      is_canceled: false,
      action_code: savedAction,
    };
    const persistedEvent = await persistOptimisticEvent(tempEvent, scoreLog);
    if (matchId) await appendMatchScoreLog(matchId, {
      ...scoreLog,
      id: persistedEvent.id,
    });
    if (matchId) {
      try {
        const saved = await updateMatchSetScoreNow(matchId, currentSetIndex, newHostScore, newAwayScore);
        applySetScoreToState(currentSetIndex, saved);
      } catch (e) {
        console.error('match_sets 점수 UPDATE 실패:', e);
      }
    }
    return persistedEvent;
  };

  const persistRallyRef = useRef(persistRally);
  persistRallyRef.current = persistRally;

  const voiceUndoRef = useRef<Array<
    | { kind: 'event'; eventId: string }
    | { kind: 'court' }
    | { kind: 'sub'; eventId: string; team: 'host' | 'away'; rosterBefore: string }
  >>([]);
  const voiceBridgeRef = useRef<(transcript: string) => Promise<string | null>>(async () => null);

  const processVoiceCommand = async (transcript: string): Promise<string | null> => {
    const spoken = await voiceBridgeRef.current(transcript);
    return spoken && spoken.trim() ? spoken.trim() : null;
  };

  const applyVoiceTextRef = useRef(processVoiceCommand);
  applyVoiceTextRef.current = processVoiceCommand;
  const voiceStopRef = useRef<null | (() => void)>(null);
  const voiceBusyRef = useRef(false);
  const triggerVoiceRecognitionRef = useRef<() => void>(() => {});

  useEffect(() => {
    return subscribeAudioState((state) => {
      setAudioState(state);
      if (state === 'IDLE') {
        voiceBusyRef.current = false;
        setVoiceArmed(false);
        setVoiceHint(null);
        return;
      }
      voiceBusyRef.current = true;
      if (state !== 'LISTENING') setVoiceHint(null);
    });
  }, []);

  const runVoiceRecognition = () => {
    if (matchClosedRef.current) return;
    if (myRoleRef.current === 'spectator' || !myRoleRef.current) return;
    const phase = getAudioState();
    if (phase === 'LISTENING' || (voiceBusyRef.current && phase === 'IDLE')) {
      voiceBusyRef.current = false;
      setVoiceArmed(false);
      setVoiceHint(null);
      try { voiceStopRef.current?.(); } catch {}
      return;
    }
    if (phase !== 'IDLE') return;
    voiceBusyRef.current = true;
    setVoiceArmed(true);
    setVoiceHint(HEADSET_BUTTON_HINT);
    let cancelPrepare = false;
    voiceStopRef.current = () => {
      cancelPrepare = true;
      voiceBusyRef.current = false;
    };
    void triggerVoiceRecognition({
      onStatus: (message) => {
        setVoiceHint(message);
        if (message == null && getAudioState() === 'IDLE') {
          voiceBusyRef.current = false;
          setVoiceArmed(false);
        }
      },
      onFinal: (text) => applyVoiceTextRef.current(text),
      onDenied: (message) => {
        voiceBusyRef.current = false;
        setVoiceArmed(false);
        setVoiceHint(null);
        speakKorean(message);
      },
    }).then((stop) => {
      if (cancelPrepare || !voiceBusyRef.current) {
        try { stop(); } catch {}
        voiceBusyRef.current = false;
        setVoiceArmed(false);
        setVoiceHint(null);
        return;
      }
      voiceStopRef.current = () => {
        try { stop(); } catch {}
      };
    });
  };
  triggerVoiceRecognitionRef.current = runVoiceRecognition;

  useEffect(() => {
    if (Platform.OS === 'web' || isSpectatorForced) return;
    if (!myRole || myRole === 'spectator') return;

    let alive = true;
    let unsub = () => {};

    requestScoreboardAudioFocus();
    setupHeadsetRemote(() => {
      if (!alive) return;
      triggerVoiceRecognitionRef.current();
    }).then((u) => {
      if (!alive) {
        u();
        void stopForegroundService();
        return;
      }
      unsub = u;
    });

    return () => {
      alive = false;
      try { unsub(); } catch {}
      try { voiceStopRef.current?.(); } catch {}
      voiceStopRef.current = null;
      voiceBusyRef.current = false;
      try { setVoiceHint(null); } catch {}
      try { void releaseVoiceEngine(); } catch {}
      try { stopBluetoothSco(); } catch {}
      try { void stopForegroundService(); } catch {}
    };
  }, [isSpectatorForced, myRole]);

  useEffect(() => {
    if (Platform.OS !== 'web') {
      try { requestScoreboardAudioFocus(); } catch {}
      try { void releaseVoiceEngine(); } catch {}
    }
    return () => {
      try { voiceStopRef.current?.(); } catch {}
      voiceStopRef.current = null;
      voiceBusyRef.current = false;
      try { setVoiceHint(null); } catch {}
      try { void releaseVoiceEngine(); } catch {}
      try { stopBluetoothSco(); } catch {}
      try { abandonScoreboardAudioFocus(); } catch {}
      try { void stopForegroundService(); } catch {}
    };
  }, []);

  const persistSubstitutionEvent = async (outMember: Member, inMember: Member, positionSlot: number | null) => {
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
      position_slot: positionSlot,
      host_score: currentScores.host,
      away_score: currentScores.away,
      is_canceled: false,
    };
    setEvents((prev) => {
      const next = [...prev, tempEvent];
      eventsRef.current = next;
      return next;
    });
    const subLog = {
      match_id: matchId,
      set_index: currentSetIndex,
      set_number: currentSetIndex + 1,
      event_type: 'sub',
      team_type: actionTeam,
      player_id: inMember.user_id,
      player_name: getSafeDisplayName(inMember),
      sub_out_id: outMember.user_id,
      sub_out_name: getSafeDisplayName(outMember),
      position_slot: positionSlot,
      host_score: currentScores.host,
      away_score: currentScores.away,
      is_canceled: false,
    };
    const persistedEvent = await persistOptimisticEvent(tempEvent, subLog);
    if (matchId) await appendMatchScoreLog(matchId, {
      ...subLog,
      id: persistedEvent.id,
    });
  };

  const persistCurrentSetLineupOnly = async (
    side: 'host' | 'away',
    court: Array<string | null | undefined>,
    bench?: string[],
  ) => {
    const courtSlots = persistCourtSlots((court || []).map((id) => id ?? null));
    const setNumber = currentSetIndex + 1;
    setMatchSets((prev) => prev.map((s) => {
      if (s.setNumber !== setNumber) return s;
      return side === 'host'
        ? { ...s, hostLineup: courtSlots, ...(bench ? { hostBench: bench } : {}) }
        : { ...s, awayLineup: courtSlots, ...(bench ? { awayBench: bench } : {}) };
    }));
    if (matchId) await writeLiveSetLineup(matchId, currentSetIndex, side, courtSlots);
  };

  const reattributeAfterLineupChange = async (hostRoster?: unknown, awayRoster?: unknown) => {
    const attributed = attributeTimelineEvents(
      eventsRef.current,
      courtsBySetFromRoster(hostRoster ?? match?.host_roster),
      courtsBySetFromRoster(awayRoster ?? match?.away_roster),
      (id, fallback) => {
        const hit = [...(hostMembers || []), ...(awayMembers || [])].find((m) => m.user_id === id);
        return hit ? getSafeDisplayName(hit) : displaySlotPlayerName(id, fallback);
      },
    );
    const prev = eventsRef.current;
    eventsRef.current = attributed;
    setEvents(attributed);
    const changed = attributed.filter((ev, i) => (
      !!prev[i]
      && (prev[i].player_id !== ev.player_id || prev[i].player_name !== ev.player_name)
      && !!ev.id
      && !String(ev.id).startsWith('temp-')
    ));
    await Promise.all(changed.map((ev) => supabase.from('match_events').update({
      player_id: ev.player_id ?? null,
      player_name: ev.player_name ?? null,
    }).eq('id', ev.id)));
    if (matchId) {
      const scoreLogs = attributed.map((e) => ({
        id: e.id,
        match_id: matchId,
        set_index: e.set_index,
        set_number: Number(e.set_index) + 1,
        event_type: e.event_type,
        team_type: e.team_type,
        player_id: e.player_id,
        player_name: e.player_name,
        sub_out_id: e.sub_out_id,
        sub_out_name: e.sub_out_name,
        position_slot: e.position_slot ?? null,
        host_score: e.host_score,
        away_score: e.away_score,
        is_canceled: e.is_canceled,
      }));
      await updateMatchIgnoringUnknownColumns(matchId, { score_logs: scoreLogs });
    }
  };

  const persistServeSetup = async (nextMap: ServeSetupMap) => {
    setServeSetupMap(nextMap);
    setMatch((prev) => prev ? { ...prev, serve_setup: nextMap } : prev);
    if (matchId) await updateMatchIgnoringUnknownColumns(matchId, { serve_setup: nextMap });
  };

  const persistCourtSwap = async () => {
    if (isSpectatorForced) return;
    const next = !isSwapped;
    setIsSwapped(next);
    setMatch((prev) => prev ? { ...prev, is_swapped: next } : prev);
    if (myRole === 'spectator') return;
    if (matchId) await updateMatchIgnoringUnknownColumns(matchId, { is_swapped: next });
  };

  const handleConfirmFirstServe = async (team: ServeTeam, startLabel: string) => {
    const startSlot = slotIndexForServeLabel(startLabel);
    await persistServeSetup({
      ...serveSetupMap,
      [currentSetIndex]: { team, startSlot, startLabel },
    });
  };

  const handleSubConfirm = async (outMember: Member, inMember: Member) => {
    setActionModalVisible(false);
    if (myRole === 'spectator') return;
    const isHost = actionTeam === 'host';
    const targetRosterStr = isHost ? match?.host_roster : match?.away_roster;

    const formMap = parseSetFormationMap(targetRosterStr);
    const currentForm = formMap[currentSetIndex] || parseSetFormation(targetRosterStr, currentSetIndex);
    const courtIds = (currentForm.court.length > 0 ? currentForm.court : (parseSetRosterMap(targetRosterStr)[currentSetIndex] || parseSetRosterMap(targetRosterStr)[0] || []));
    const slotIndex0 = findSlotIndexForPlayer(courtIds.map((id) => assignedUserId(id)), outMember.user_id);
    const updatedCourt = courtIds.map((id) => {
      if (id && (id === outMember.user_id || safeIncludes(id, outMember.user_id))) return inMember.user_id;
      return id;
    });
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
    const updatePayload = isHost
      ? { host_roster: updatedRosterJson }
      : { away_roster: updatedRosterJson };

    setMatch((prev) => prev ? { ...prev, ...updatePayload } : prev);
    await persistSubstitutionEvent(outMember, inMember, toPositionSlot(slotIndex0));
    await supabase.from('matches').update(updatePayload).eq('id', matchId);
    await persistCurrentSetLineupOnly(isHost ? 'host' : 'away', updatedCourt, updatedBench);
    await reattributeAfterLineupChange(
      isHost ? updatedRosterJson : match?.host_roster,
      !isHost ? updatedRosterJson : match?.away_roster,
    );
  };

  const handleLineupApply = async (payload: LineupApplyPayload) => {
    if (myRole === 'spectator') return;
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
    const courtSlots = persistCourtSlots(payload.courtIds);
    formMap[currentSetIndex] = {
      court: courtSlots,
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
    if (payload.sub) {
      const prevCourt = (currentForm.court || []).map((id) => assignedUserId(id));
      const slotIndex0 = findSlotIndexForPlayer(prevCourt, payload.sub.out.user_id)
        ?? findSlotIndexForPlayer(payload.courtIds.map((id) => assignedUserId(id)), payload.sub.in.user_id);
      await persistSubstitutionEvent(payload.sub.out, payload.sub.in, toPositionSlot(slotIndex0));
    }
    await supabase.from('matches').update(updatePayload).eq('id', matchId);
    await persistCurrentSetLineupOnly(isHost ? 'host' : 'away', courtSlots, benchIds);
    await reattributeAfterLineupChange(
      isHost ? updatedRosterJson : match?.host_roster,
      !isHost ? updatedRosterJson : match?.away_roster,
    );
  };

  const persistSetsFromHistory = async (
    history: string[],
    extraLive?: { host: number; away: number } | null,
    rosterOverride?: { host?: ReturnType<typeof parseRosterJson>; away?: ReturnType<typeof parseRosterJson> },
    formationOverride?: { host?: { [idx: number]: SetFormation }; away?: { [idx: number]: SetFormation } },
    retainTrailingSets = true,
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
    if (retainTrailingSets) {
      const already = records.length;
      matchSets.slice(already).forEach((s, i) => {
        if (already + i >= MAX_SETS) return;
        records.push({ ...s, setNumber: already + i + 1 });
      });
    }
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
          tableEvents = rowsToMatchEvents(evData, matchId);
        }
      } catch {}

      if (hydrateGenRef.current !== gen || currentSetIndexRef.current !== idx) return;

      if (!isSpectatorForced) {
        setEvents((prev) => {
          if (tableOk) {
            if (tableEvents.length === 0 && prev.length > 0) return prev;
            const pending = prev.filter((e) => String(e.id).startsWith('temp-'));
            const ids = new Set(tableEvents.map((e) => e.id));
            const merged = pending.length
              ? [...tableEvents, ...pending.filter((e) => !ids.has(e.id))]
              : tableEvents;
            eventsRef.current = merged;
            return merged;
          }
          if (scoreLogs.length === 0) return prev;
          const merged = mergeEventsWithScoreLogs(prev, scoreLogs, matchId, false);
          eventsRef.current = merged;
          return merged;
        });
      }

      const fromDb = scoreFromMatchSetRow(setRow || matchSets.find((s) => s.setNumber === idx + 1));
      if (fromDb) setCurrentScores(fromDb);
    } catch (e) {
      console.error('세트 하이드레이션 실패:', e);
    }
  }, [matchId, matchSets, isSpectatorForced]);

  const flushScoreLogsSnapshot = async (allEvents?: MatchEvent[]) => {
    if (!matchId) return;
    const source = allEvents || eventsRef.current;
    const scoreLogs = source.map((e) => ({
      id: e.id,
      match_id: matchId,
      set_index: e.set_index,
      set_number: Number(e.set_index) + 1,
      event_type: e.event_type,
      team_type: e.team_type,
      player_id: e.player_id,
      player_name: e.player_name,
      sub_out_id: e.sub_out_id,
      sub_out_name: e.sub_out_name,
      position_slot: e.position_slot ?? null,
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
    await persistSetsFromHistory(updatedHistory, null, undefined, undefined, false);
    await flushScoreLogsSnapshot();
    return updatedHistory;
  };

  const focusLastPlayedSet = (history: string[]) => {
    if (history.length === 0) return;
    const idx = history.length - 1;
    const [host, away] = String(history[idx]).split(':').map(Number);
    currentSetIndexRef.current = idx;
    setCurrentSetIndex(idx);
    setCurrentScores({ host: host || 0, away: away || 0 });
  };

  const changeCurrentSet = (idx: number) => {
    const fromIdx = currentSetIndexRef.current;
    if (isSpectatorForced) {
      const normalized = normalizeSetRecords(matchSets.length > 0 ? matchSets : [makeInitialLiveSet()]);
      const openIdxs = normalized.map((s, i) => (s.isClosed ? -1 : i)).filter((i) => i >= 0);
      const liveIdx = openIdxs.length > 0 ? openIdxs[openIdxs.length - 1] : Math.max(0, normalized.length - 1);
      spectatorFollowLiveRef.current = idx === liveIdx;
    }
    if (matchId && fromIdx !== idx && !isSpectatorForced) {
      void updateMatchSetScoreNow(matchId, fromIdx, currentScores.host, currentScores.away);
      void flushScoreLogsSnapshot(eventsRef.current);
    }
    setCurrentSetIndex(idx);
    currentSetIndexRef.current = idx;
    resetSetUiState();
    const localSet = matchSets.find((s) => s.setNumber === idx + 1);
    const fromSets = scoreFromMatchSetRow(localSet);
    if (fromSets) setCurrentScores(fromSets);
    else setCurrentScores({ host: 0, away: 0 });
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
      const nextServe = shiftServeSetupMap(serveSetupMap, removedIndex);
      setServeSetupMap(nextServe);
      setMatch((prev) => prev ? {
        ...prev,
        set_scores: nextHistory.join(', ') || null,
        host_roster: JSON.stringify(nextHostForm),
        away_roster: JSON.stringify(nextAwayForm),
        serve_setup: nextServe,
      } : prev);
      if (matchId) void updateMatchIgnoringUnknownColumns(matchId, { serve_setup: nextServe });

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
    const targetSetIndex = Math.max(0, Number(target.set_index) || 0);
    const nextEvents = events.filter((e) => e.id !== target.id);
    eventsRef.current = nextEvents;
    setEvents(nextEvents);
    recalcScores(nextEvents, currentSetIndex);
    resetSetUiState();
    if (!String(target.id).startsWith('temp-')) {
      await supabase.from('match_events').delete().eq('id', target.id);
    }
    const nextScore = lastScoreForSetFromEvents(nextEvents, targetSetIndex);
    if (matchId) {
      try {
        const saved = await updateMatchSetScoreNow(matchId, targetSetIndex, nextScore.host, nextScore.away);
        applySetScoreToState(targetSetIndex, saved);
      } catch (e) {
        console.error('match_sets 점수 재계산 UPDATE 실패:', e);
      }
      await flushScoreLogsSnapshot(nextEvents);
    }
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
          eventsRef.current = newEvents;
          setEvents(newEvents);
          recalcScores(newEvents, currentSetIndex);
          await supabase.from('match_events').update({ is_canceled: true }).eq('id', lastEvent.id);
          const nextScore = lastScoreForSetFromEvents(newEvents, currentSetIndex);
          if (matchId) {
            try {
              const saved = await updateMatchSetScoreNow(matchId, currentSetIndex, nextScore.host, nextScore.away);
              applySetScoreToState(currentSetIndex, saved);
            } catch (e) {
              console.error('match_sets 점수 Undo UPDATE 실패:', e);
            }
            await flushScoreLogsSnapshot(newEvents);
          }
        }
      }
    ]);
  };

  const executeFinishSet = async () => {
    if (myRole === 'spectator' || finishSetBusyRef.current) return;
    finishSetBusyRef.current = true;
    setFinishSetConfirmVisible(false);
    setActionLoading(true);
    try {
      if (matchId) {
        await updateMatchSetScoreNow(matchId, currentSetIndex, currentScores.host, currentScores.away);
        await supabase
          .from('match_sets')
          .update({
            host_score: currentScores.host,
            away_score: currentScores.away,
            is_closed: true,
          })
          .eq('match_id', matchId)
          .eq('set_number', currentSetIndex + 1);
      }

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
    } catch (err: any) {
      Alert.alert('오류', err?.message || '세트 마감에 실패했습니다.');
    } finally {
      finishSetBusyRef.current = false;
      setActionLoading(false);
    }
  };

  const handleFinishSet = () => {
    if (myRole === 'spectator' || actionLoading) return;
    if (Platform.OS === 'web') {
      setFinishSetConfirmVisible(true);
      return;
    }
    Alert.alert(
      `${currentSetIndex + 1}세트를 마감하시겠습니까?`,
      `현재 점수 [${displayHostName} ${currentScores.host} : ${currentScores.away} ${displayAwayName}]`,
      [
        { text: '취소', style: 'cancel' },
        { text: '확인', onPress: () => { void executeFinishSet(); } },
      ],
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
      focusLastPlayedSet(finalHistory);

      const updateData = {
        set_scores: finalHistory.join(', ') || null,
        winner_team: winner,
        recorder_host_id: null,
        recorder_away_id: null,
      };
      const result = await updateMatchIgnoringUnknownColumns(matchId, updateData);
      if (result.error) throw result.error;
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
      focusLastPlayedSet(finalHistory);

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

      const result = await updateMatchIgnoringUnknownColumns(matchId, updateData);
      if (result.error) throw result.error;
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

  voiceBridgeRef.current = async (transcript: string) => {
    if (matchClosedRef.current) return null;
    if (!myRoleRef.current || myRoleRef.current === 'spectator') return null;

    const preview = parseVoiceCommand(transcript);
    if (!preview.ok) return null;
    const rosterSide = preview.teamId || 'host';
    const rosters = resolveSetRosters({
      isHost: rosterSide === 'host',
      isIntramural,
      match,
      hostMembers,
      awayMembers,
      matchSets,
      currentSetIndex,
    });
    const parsed = parseVoiceCommand(transcript, {
      frontCount: rosters.formation.frontCount,
      middleCount: rosters.formation.middleCount,
      backCount: rosters.formation.backCount,
    });
    if (!parsed.ok) return null;

    const canSide = (team: 'host' | 'away' | null) => {
      if (team === 'away') return canControlAway;
      if (team === 'host') return canControlHost;
      return canControlHost || canControlAway;
    };
    if ((parsed.kind === 'STAT' || parsed.kind === 'SUB') && !canSide(parsed.teamId)) return null;
    if ((parsed.kind === 'COURT_FLIP' || parsed.kind === 'SET_CLOSE' || parsed.kind === 'MATCH_END' || parsed.kind === 'UNDO') && !(canControlHost || canControlAway)) {
      return null;
    }

    const pushUndo = (item: (typeof voiceUndoRef.current)[number]) => {
      voiceUndoRef.current = [...voiceUndoRef.current, item].slice(-12);
    };

    const cancelVoiceEvent = async (eventId: string) => {
      const newEvents = eventsRef.current.map((event) => (
        event.id === eventId ? { ...event, is_canceled: true } : event
      ));
      eventsRef.current = newEvents;
      setEvents(newEvents);
      recalcScores(newEvents, currentSetIndex);
      if (eventId && !String(eventId).startsWith('temp-')) {
        await supabase.from('match_events').update({ is_canceled: true }).eq('id', eventId);
      }
      const nextScore = lastScoreForSetFromEvents(newEvents, currentSetIndex);
      if (matchId) {
        try {
          const saved = await updateMatchSetScoreNow(matchId, currentSetIndex, nextScore.host, nextScore.away);
          applySetScoreToState(currentSetIndex, saved);
        } catch (error) {
          console.error('음성 취소 점수 반영 실패:', error);
        }
        await flushScoreLogsSnapshot(newEvents);
      }
    };

    if (parsed.kind === 'UNDO') {
      const last = voiceUndoRef.current.pop();
      if (!last) return null;
      if (last.kind === 'court') {
        await persistCourtSwap();
      } else if (last.kind === 'sub') {
        const updatePayload = last.team === 'host'
          ? { host_roster: last.rosterBefore }
          : { away_roster: last.rosterBefore };
        setMatch((prev) => prev ? { ...prev, ...updatePayload } : prev);
        if (matchId) await supabase.from('matches').update(updatePayload).eq('id', matchId);
        const restored = parseSetFormation(last.rosterBefore, currentSetIndex);
        await persistCurrentSetLineupOnly(last.team, restored.court, restored.bench);
        await cancelVoiceEvent(last.eventId);
        await reattributeAfterLineupChange(
          last.team === 'host' ? last.rosterBefore : match?.host_roster,
          last.team === 'away' ? last.rosterBefore : match?.away_roster,
        );
      } else {
        await cancelVoiceEvent(last.eventId);
      }
      return formatVoiceConfirm(parsed);
    }

    if (parsed.kind === 'COURT_FLIP') {
      await persistCourtSwap();
      pushUndo({ kind: 'court' });
      return formatVoiceConfirm(parsed);
    }

    if (parsed.kind === 'SET_CLOSE') {
      await executeFinishSet();
      return formatVoiceConfirm(parsed);
    }

    if (parsed.kind === 'MATCH_END') {
      if (isIntramural) {
        const live = `${currentScores.host}:${currentScores.away}`;
        const history = currentSetIndex < setHistoryRef.current.length
          ? setHistoryRef.current.map((score, index) => (index === currentSetIndex ? live : score))
          : [...setHistoryRef.current, live];
        let hostWins = 0;
        let awayWins = 0;
        history.forEach((score) => {
          const [hostScore, awayScore] = String(score).split(':').map(Number);
          if ((hostScore || 0) > (awayScore || 0)) hostWins += 1;
          else if ((awayScore || 0) > (hostScore || 0)) awayWins += 1;
        });
        const winner = hostWins > awayWins
          ? (match?.host_team_name || 'draw')
          : awayWins > hostWins
            ? (match?.away_team_name || 'draw')
            : 'draw';
        await handleConfirmIntramuralFinish(winner);
      } else {
        await processOfficialMatchFinish();
      }
      return formatVoiceConfirm(parsed);
    }

    const slotTeam = parsed.teamId === 'away' ? 'away' : 'host';
    const sideRosters = rosterSide === slotTeam
      ? rosters
      : resolveSetRosters({
        isHost: slotTeam === 'host',
        isIntramural,
        match,
        hostMembers,
        awayMembers,
        matchSets,
        currentSetIndex,
      });
    const slotIndex = positionSlotToIndex(parsed.positionSlot);

    if (parsed.kind === 'SUB') {
      const pool = slotTeam === 'host' || isIntramural ? hostMembers : awayMembers;
      const incoming = findSpokenMember(
        [...(pool || []), ...sideRosters.court, ...sideRosters.bench, ...sideRosters.late],
        parsed.playerName || '',
      );
      if (!incoming?.user_id || slotIndex == null) return null;
      const rosterStr = slotTeam === 'host' ? match?.host_roster : match?.away_roster;
      const rosterBefore = String(rosterStr || '');
      const formMap = parseSetFormationMap(rosterStr);
      const currentForm = formMap[currentSetIndex] || parseSetFormation(rosterStr, currentSetIndex);
      const courtIds = [...(currentForm.court.length > 0 ? currentForm.court : [])];
      while (courtIds.length <= slotIndex) courtIds.push(null);
      const incomingId = incoming.user_id;
      if (assignedUserId(courtIds[slotIndex]) === incomingId) {
        return `${parsed.spokenPosition}에는 이미 ${getSafeDisplayName(incoming)} 선수가 있습니다`;
      }
      const cleared = courtIds.map((id) => (assignedUserId(id) === incomingId ? null : id));
      const outId = assignedUserId(cleared[slotIndex]);
      cleared[slotIndex] = incomingId;
      const outMember = outId
        ? ([...(pool || []), ...sideRosters.court].find((member) => member.user_id === outId)
          || { user_id: outId, full_name: displaySlotPlayerName(outId, '교체') })
        : null;
      const updatedBench = [...(currentForm.bench || [])]
        .filter((id) => assignedUserId(id) !== incomingId)
        .concat(outId ? [outId] : []);
      formMap[currentSetIndex] = {
        court: cleared,
        bench: updatedBench,
        late: (currentForm.late || []).filter((id) => {
          const real = assignedUserId(id);
          return real !== incomingId && real !== outId;
        }),
        frontCount: currentForm.frontCount,
        middleCount: currentForm.middleCount,
        backCount: currentForm.backCount,
      };
      const carried = seedNextSetFormation(formMap, currentSetIndex, true);
      const updatedRosterJson = JSON.stringify(carried);
      const updatePayload = slotTeam === 'host'
        ? { host_roster: updatedRosterJson }
        : { away_roster: updatedRosterJson };
      setMatch((prev) => prev ? { ...prev, ...updatePayload } : prev);
      const scores = scoresRef.current;
      const tempEvent: MatchEvent = {
        id: `temp-${Date.now()}`,
        match_id: matchId,
        set_index: currentSetIndex,
        event_type: 'sub',
        team_type: slotTeam,
        player_id: incoming.user_id,
        player_name: getSafeDisplayName(incoming),
        sub_out_id: outMember?.user_id || null,
        sub_out_name: outMember ? getSafeDisplayName(outMember) : null,
        position_slot: parsed.positionSlot,
        host_score: scores.host,
        away_score: scores.away,
        is_canceled: false,
      };
      setEvents((prev) => {
        const next = [...prev, tempEvent];
        eventsRef.current = next;
        return next;
      });
      const subLog = {
        match_id: matchId,
        set_index: currentSetIndex,
        set_number: currentSetIndex + 1,
        event_type: 'sub',
        team_type: slotTeam,
        player_id: incoming.user_id,
        player_name: getSafeDisplayName(incoming),
        sub_out_id: outMember?.user_id || null,
        sub_out_name: outMember ? getSafeDisplayName(outMember) : null,
        position_slot: parsed.positionSlot,
        host_score: scores.host,
        away_score: scores.away,
        is_canceled: false,
      };
      const persisted = await persistOptimisticEvent(tempEvent, subLog);
      if (matchId) await appendMatchScoreLog(matchId, { ...subLog, id: persisted.id });
      if (matchId) await supabase.from('matches').update(updatePayload).eq('id', matchId);
      await persistCurrentSetLineupOnly(slotTeam, cleared, updatedBench);
      await reattributeAfterLineupChange(
        slotTeam === 'host' ? updatedRosterJson : match?.host_roster,
        slotTeam === 'away' ? updatedRosterJson : match?.away_roster,
      );
      pushUndo({ kind: 'sub', eventId: persisted.id, team: slotTeam, rosterBefore });
      return formatVoiceConfirm(parsed);
    }

    const player = slotIndex != null ? (sideRosters.court[slotIndex] || null) : null;
    if (parsed.kind === 'STAT' && parsed.statType) {
      const keepId = player?.user_id && (isRegisteredUserId(player.user_id) || isTempSlotId(player.user_id))
        ? player.user_id
        : null;
      const savedPlayerName = keepId
        ? (isRegisteredUserId(keepId) ? getSafeDisplayName(player) : displaySlotPlayerName(keepId, getSafeDisplayName(player)))
        : (parsed.positionCode || '');
      const scores = scoresRef.current;
      const eventType = parsed.statType;
      const tempEvent: MatchEvent = {
        id: `temp-${Date.now()}`,
        match_id: matchId,
        set_index: currentSetIndex,
        event_type: eventType,
        team_type: slotTeam,
        player_id: keepId,
        player_name: savedPlayerName,
        position_slot: parsed.positionSlot,
        host_score: scores.host,
        away_score: scores.away,
        is_canceled: false,
        action_code: parsed.actionCode,
        created_at: new Date().toISOString(),
      };
      setEvents((prev) => {
        const next = [...prev, tempEvent];
        eventsRef.current = next;
        return next;
      });
      const statLog = {
        match_id: matchId,
        set_index: currentSetIndex,
        set_number: currentSetIndex + 1,
        event_type: eventType,
        team_type: slotTeam,
        player_id: keepId,
        player_name: savedPlayerName,
        position_slot: parsed.positionSlot,
        host_score: scores.host,
        away_score: scores.away,
        is_canceled: false,
        ...(parsed.actionCode ? { action_code: parsed.actionCode } : {}),
      };
      const persisted = await persistOptimisticEvent(tempEvent, statLog);
      if (matchId) await appendMatchScoreLog(matchId, { ...statLog, id: persisted.id });
      pushUndo({ kind: 'event', eventId: persisted.id });
      return formatVoiceConfirm(parsed);
    }

    if (parsed.kind === 'SCORE' || parsed.kind === 'FAULT') {
      const scoreKind: ScoreKind = parsed.kind === 'FAULT' ? 'fault' : 'kill';
      const scoringTeam: 'host' | 'away' = scoreKind === 'fault'
        ? (slotTeam === 'host' ? 'away' : 'host')
        : slotTeam;
      if (!canSide(scoringTeam)) return null;
      const persisted = await persistRallyRef.current(scoringTeam, scoreKind, player, parsed.positionSlot, parsed.actionCode);
      if (persisted?.id) pushUndo({ kind: 'event', eventId: persisted.id });
      return formatVoiceConfirm(parsed);
    }

    return null;
  };

  const handleOpenEditModal = () => {
    if (myRole === 'spectator') return;
    setTempHostScore(currentScores.host);
    setTempAwayScore(currentScores.away);
    setEditModalVisible(true);
  };

  const handleSaveManualScores = async () => {
    if (!matchId) return;
    setCurrentScores({ host: tempHostScore, away: tempAwayScore });
    const tempEvent: MatchEvent = {
      id: `temp-${Date.now()}`,
      match_id: matchId,
      set_index: currentSetIndex,
      event_type: 'manual',
      team_type: 'host',
      host_score: tempHostScore,
      away_score: tempAwayScore,
      is_canceled: false,
    };
    setEvents((prev) => {
      const next = [...prev, tempEvent];
      eventsRef.current = next;
      return next;
    });
    const manualLog = {
      match_id: matchId,
      set_index: currentSetIndex,
      set_number: currentSetIndex + 1,
      event_type: 'manual',
      team_type: 'host',
      host_score: tempHostScore,
      away_score: tempAwayScore,
      is_canceled: false,
    };
    const persistedEvent = await persistOptimisticEvent(tempEvent, manualLog);
    if (matchId) await appendMatchScoreLog(matchId, {
      ...manualLog,
      id: persistedEvent.id,
    });
    if (currentSetIndex >= setHistoryRef.current.length) {
      await persistSetsFromHistory(setHistoryRef.current, { host: tempHostScore, away: tempAwayScore });
    } else {
      const nextHistory = [...setHistoryRef.current];
      nextHistory[currentSetIndex] = `${tempHostScore}:${tempAwayScore}`;
      setSetScoresHistory(nextHistory);
      setHistoryRef.current = nextHistory;
      const result = await updateMatchIgnoringUnknownColumns(matchId, {
        set_scores: nextHistory.join(', '),
      });
      if (result.error) throw result.error;
    }
    if (matchId) {
      const saved = await updateMatchSetScoreNow(matchId, currentSetIndex, tempHostScore, tempAwayScore);
      applySetScoreToState(currentSetIndex, saved);
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

  const boardSwapped = isSpectatorForced
    ? (!!match?.is_swapped) === spectatorCourtFlip
    : isSwapped;

  const leftTeamData = boardSwapped
    ? { key: 'away' as const, name: displayAwayName, score: safeStyleNumber(currentScores?.away), canControl: canControlAway && myRole !== 'spectator', isHost: false }
    : { key: 'host' as const, name: displayHostName, score: safeStyleNumber(currentScores?.host), canControl: canControlHost && myRole !== 'spectator', isHost: true };

  const rightTeamData = boardSwapped
    ? { key: 'host' as const, name: displayHostName, score: safeStyleNumber(currentScores?.host), canControl: canControlHost && myRole !== 'spectator', isHost: true }
    : { key: 'away' as const, name: displayAwayName, score: safeStyleNumber(currentScores?.away), canControl: canControlAway && myRole !== 'spectator', isHost: false };

  const isMyHostTeam = match && teamsInclude(myTeams, match.host_team_name);
  const isMyAwayTeam = !!(match?.away_team_name && teamsInclude(myTeams, match.away_team_name));

  const getSetRosters = (isHost: boolean) => resolveSetRosters({
    isHost,
    isIntramural,
    match,
    hostMembers,
    awayMembers,
    matchSets,
    currentSetIndex,
  });

  const openFormation = (team: 'host' | 'away') => {
    if (isSpectatorForced || myRole === 'spectator') return;
    setFormationTeam(team);
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
        forceFillGuests: false,
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
    await reattributeAfterLineupChange(
      isHost ? updatedRosterJson : match?.host_roster,
      !isHost ? updatedRosterJson : match?.away_roster,
    );
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
        forceFillGuests: false,
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
        forceFillGuests: false,
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
    await reattributeAfterLineupChange(hostJson, awayJson);
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
  const serveLayoutTeam = serveSetupMap[currentSetIndex]?.team === 'away' ? awayRosterView : hostRosterView;
  const servePossession = resolveServePossession({
    events: events || [],
    setIndex: currentSetIndex,
    setup: serveSetupMap[currentSetIndex],
    hostCourt: hostRosterView.court,
    awayCourt: awayRosterView.court,
    frontCount: serveLayoutTeam.formation.frontCount,
    middleCount: serveLayoutTeam.formation.middleCount,
    backCount: serveLayoutTeam.formation.backCount,
  });
  const serveTeamName = servePossession
    ? (servePossession.team === 'host' ? displayHostName : displayAwayName)
    : '';
  const serveBadgeText = servePossession
    ? `[서브: ${serveTeamName} | ${servePossession.positionLabel}${servePossession.playerName ? ` ${servePossession.playerName}` : ''}]`
    : '';
  const showFirstServeModal = !isSpectatorForced
    && !!myRole
    && myRole !== 'spectator'
    && !roleModalVisible
    && !isMatchRecordingFinished(match)
    && !serveSetupMap[currentSetIndex];
  const attributedEvents = attributeTimelineEvents(
    events || [],
    courtsBySetFromRoster(match?.host_roster),
    courtsBySetFromRoster(match?.away_roster),
    (id, fallback) => {
      const hit = [...(hostMembers || []), ...(awayMembers || [])].find((m) => m.user_id === id);
      return hit ? getSafeDisplayName(hit) : displaySlotPlayerName(id, fallback);
    },
  );
  const liveSetEvents = attributedEvents.filter((e) => {
    if (Number(e?.set_index) === currentSetIndex) return true;
    const setNumber = Number((e as any)?.set_number);
    return Number.isFinite(setNumber) && setNumber === currentSetIndex + 1;
  });
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
                    <TouchableOpacity style={[styles.roleBtn, { backgroundColor: TEAM_COLORS.host }]} onPress={() => handleSelectRole('host_recorder')}>
                      <Text style={styles.roleBtnText}>
                        {match?.recorder_host_id === currentUserId ? `⚡ 🔵 ${displayHostName} 기록자로 계속하기` : `⚡ 🔵 ${displayHostName} 기록자로 참여`}
                      </Text>
                    </TouchableOpacity>
                  )}
                  {isMyAwayTeam && (!match?.recorder_away_id || match?.recorder_away_id === currentUserId) && (
                    <TouchableOpacity style={[styles.roleBtn, { backgroundColor: TEAM_COLORS.away }]} onPress={() => handleSelectRole('away_recorder')}>
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
        {voiceHint || voiceListening ? (
          <View style={styles.voiceListenBanner} pointerEvents="none">
            <Text style={styles.voiceListenText}>{voiceHint || HEADSET_BUTTON_HINT}</Text>
          </View>
        ) : null}
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
                const setHost = isCurrent ? currentScores.host : Number(setRow.hostScore) || 0;
                const setAway = isCurrent ? currentScores.away : Number(setRow.awayScore) || 0;
                const setLabel = Platform.OS === 'web' ? `${idx + 1}세트 (${setHost}:${setAway})` : `${idx + 1}세트`;
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
                        {setLabel}
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
            {!!myRole && myRole !== 'spectator' && (
              <Animated.View style={{ opacity: voicePulse }}>
                <TouchableOpacity
                  style={[styles.voiceBtnSlim, voiceMicLive && styles.voiceBtnSlimActive]}
                  onPress={() => triggerVoiceRecognitionRef.current()}
                  hitSlop={8}
                >
                  <Text style={styles.voiceBtnTextSlim}>{voiceMicLive ? '🎤' : '🎧'} 음성</Text>
                </TouchableOpacity>
              </Animated.View>
            )}
            {myRole !== 'spectator' && (
              <TouchableOpacity style={styles.leaveRoleBtnSlim} onPress={handleLeaveRole} hitSlop={8}>
                <Text style={styles.leaveRoleBtnTextSlim}>반납</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.reportBtnSlim} onPress={() => setReportModalVisible(true)} hitSlop={8}>
              <Text style={styles.reportBtnTextSlim}>📊 경기 리포트</Text>
            </TouchableOpacity>
            {!isSpectatorForced ? (
              <TouchableOpacity style={styles.switchCourtBtnSlim} onPress={() => { void persistCourtSwap(); }} hitSlop={8}>
                <Text style={styles.switchCourtBtnTextSlim}>🔄 코트 변경</Text>
              </TouchableOpacity>
            ) : null}
            {onOpenLineup ? (
              <TouchableOpacity style={styles.lineupBtnSlim} onPress={onOpenLineup} hitSlop={8}>
                <Text style={styles.lineupBtnTextSlim}>📋 라인업</Text>
              </TouchableOpacity>
            ) : null}
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
              <TouchableOpacity style={styles.glassBtnCompact} onPress={() => openFormation(leftTeamData.key)} hitSlop={8}>
                <Text style={styles.glassBtnText}>📐 포메이션</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.glassBtnCompact}
                onPress={() => openActionModal(leftTeamData.key, 'sub')}
                hitSlop={8}
              >
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
              <Text style={[styles.bigScoreNumber, { fontSize: scoreFontSize, lineHeight: scoreLineHeight }]}>{leftTeamData.score}</Text>
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
              <TouchableOpacity style={styles.glassBtnCompact} onPress={() => openFormation(rightTeamData.key)} hitSlop={8}>
                <Text style={styles.glassBtnText}>📐 포메이션</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.glassBtnCompact}
                onPress={() => openActionModal(rightTeamData.key, 'sub')}
                hitSlop={8}
              >
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
              <Text style={[styles.bigScoreNumber, { fontSize: scoreFontSize, lineHeight: scoreLineHeight }]}>{rightTeamData.score}</Text>
              {rightTeamData.canControl ? (
                <Text style={styles.editHintText}>터치하여 +1점 득점</Text>
              ) : (
                <Text style={styles.spectatorHintText}>👁️ 관전 모드 (점수 확인)</Text>
              )}
            </View>
          </TouchableOpacity>
        </View>
        {serveBadgeText ? (
          <View pointerEvents="none" style={[styles.serveBottomWrap, isSpectatorForced && styles.serveBottomWrapSpectator]}>
            <View style={[styles.serveBadge, isSpectatorForced && styles.serveBadgeSpectator]}>
              <Text style={[styles.serveBadgeText, isSpectatorForced && styles.serveBadgeTextSpectator]} numberOfLines={1}>
                {serveBadgeText}
              </Text>
            </View>
          </View>
        ) : null}
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
        leftTeamKey={leftTeamData.key}
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
        courtSide={formationTeam === leftTeamData.key ? 'left' : 'right'}
        lockedOutIds={(formationTeam === 'host' ? awayFormationInitial.court : hostFormationInitial.court) || []}
        teamSide={formationTeam}
        matchId={matchId}
        statsTeamName={isIntramural
          ? getSafeTeamName(match?.host_team_name || match)
          : (formationTeam === 'host' ? displayHostName : displayAwayName)}
        sharePlayerPool={isIntramural}
        teamAName={displayHostName}
        teamBName={displayAwayName}
        peerInitial={formationTeam === 'host' ? awayFormationInitial : hostFormationInitial}
        peerMembers={isIntramural ? (hostMembers || []) : (formationTeam === 'host' ? (awayMembers || []) : (hostMembers || []))}
        onSaveDual={isIntramural ? handleSaveDualFormation : undefined}
        onClose={() => setFormationVisible(false)}
        onSave={handleSaveFormation}
        usedMatchIds={[
          ...collectFormationIds(match?.host_roster),
          ...collectFormationIds(match?.away_roster),
          ...(events || []).flatMap((e) => [e?.player_id, e?.sub_out_id]),
        ]}
      />

      <FirstServeModal
        visible={showFirstServeModal}
        setNumber={currentSetIndex + 1}
        hostName={displayHostName}
        awayName={displayAwayName}
        onConfirm={(team, startLabel) => { void handleConfirmFirstServe(team, startLabel); }}
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

      <Modal visible={finishSetConfirmVisible} animationType="fade" transparent={true} onRequestClose={() => setFinishSetConfirmVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>{currentSetIndex + 1}세트를 마감하시겠습니까?</Text>
            <Text style={styles.modalSub}>
              현재 점수 [{displayHostName} {currentScores.host} : {currentScores.away} {displayAwayName}]
            </Text>
            <View style={styles.modalBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setFinishSetConfirmVisible(false)}
                disabled={actionLoading}
              >
                <Text style={styles.modalCancelBtnText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={() => { void executeFinishSet(); }}
                disabled={actionLoading}
              >
                <Text style={styles.modalSaveBtnText}>확인</Text>
              </TouchableOpacity>
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
              <TouchableOpacity style={[styles.finishChoiceBtn, { backgroundColor: TEAM_COLORS.host }]} onPress={() => handleConfirmFinishChoice(isIntramural ? displayHostName : (match?.host_team_name || displayHostName))} activeOpacity={0.85}>
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontWeight: '900', textAlign: 'center' }}>🥇 🔵 {displayHostName} 승리</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.finishChoiceBtn, { backgroundColor: TEAM_COLORS.away }]} onPress={() => handleConfirmFinishChoice(isIntramural ? displayAwayName : (match?.away_team_name || displayAwayName))} activeOpacity={0.85}>
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

      {voiceHint ? (
        <View style={styles.voiceBottomBanner} pointerEvents="none">
          <Text style={styles.voiceBottomBannerText}>{voiceHint}</Text>
        </View>
      ) : null}

      {reportModalVisible && match && (
        <MatchPostgameReportModal
          visible={reportModalVisible}
          onClose={() => {
            setReportModalVisible(false);
            if (!isSpectatorForced) router.back();
          }}
          match={match}
          initialEvents={attributedEvents}
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
  headerBlock: { minHeight: 38, flexShrink: 0, backgroundColor: '#0F172A', borderBottomWidth: 1, borderBottomColor: '#1E293B', overflow: 'visible' },
  voiceListenBanner: {
    alignSelf: 'center',
    backgroundColor: '#1D4ED8',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
    marginTop: 4,
  },
  voiceListenText: { color: '#F8FAFC', fontSize: 12, fontWeight: '800' },
  voiceBtnSlim: { backgroundColor: '#1D4ED8', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4 },
  voiceBtnSlimActive: { backgroundColor: '#DC2626' },
  voiceBtnTextSlim: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
  voiceBottomBanner: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 16,
    zIndex: 30,
    backgroundColor: '#1E3A8A',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  voiceBottomBannerText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', textAlign: 'center' },
  headerSlim: { minHeight: 38, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 6, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 4 },
  headerSlimLeft: { flexDirection: 'row', alignItems: 'center', gap: 6, flexGrow: 1, flexShrink: 1, minWidth: 120 },
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
  recorderLine: { fontSize: 11, color: '#E2E8F0', fontWeight: '800', textAlign: 'left', marginRight: 2, flexShrink: 1, maxWidth: 140 },
  headerSlimRight: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    flexShrink: 0,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingVertical: 0,
    ...(Platform.OS === 'web' ? { overflowX: 'auto' as any } : {}),
  },
  reportBtnSlim: { backgroundColor: '#FEFCE8', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#FDE047', flexShrink: 0 },
  reportBtnTextSlim: { color: '#A16207', fontWeight: '800', fontSize: 10.5 },
  leaveRoleBtnSlim: { backgroundColor: '#FEF2F2', paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#FECACA', flexShrink: 0 },
  leaveRoleBtnTextSlim: { color: '#DC2626', fontWeight: '800', fontSize: 10.5 },
  switchCourtBtnSlim: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#F1F5F9', borderRadius: 8, flexShrink: 0 },
  switchCourtBtnTextSlim: { color: '#334155', fontWeight: '800', fontSize: 11 },
  lineupBtnSlim: { paddingHorizontal: 8, paddingVertical: 4, backgroundColor: '#1E3A8A', borderRadius: 8, flexShrink: 0 },
  lineupBtnTextSlim: { color: '#DBEAFE', fontWeight: '800', fontSize: 11 },
  scoreboardMainGrid: { flex: 1, minHeight: 160, flexDirection: 'row', width: '100%', backgroundColor: '#020617', position: 'relative' },
  serveBottomWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 12,
    alignItems: 'center',
    alignSelf: 'center',
    zIndex: 18,
  },
  serveBottomWrapSpectator: {
    bottom: 24,
  },
  serveBadge: {
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    maxWidth: '84%',
  },
  serveBadgeSpectator: {
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  serveBadgeText: { color: '#FDE68A', fontSize: 12, fontWeight: '900', textAlign: 'center' },
  serveBadgeTextSpectator: { fontSize: 18, lineHeight: 22 },
  teamCourtHalf: { flex: 1, flexShrink: 0, minWidth: 0, position: 'relative', padding: 0, margin: 0 },
  hostCourtBg: { backgroundColor: TEAM_COLORS.host },
  awayCourtBg: { backgroundColor: TEAM_COLORS.away },
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
  glassBtnDisabled: { opacity: 0.35 },
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
  footerStack: { flexShrink: 0, minHeight: 116, backgroundColor: '#0F172A', overflow: 'visible', zIndex: 30 },
  momentumRow: { height: 16, minHeight: 16, flexShrink: 0, backgroundColor: '#0F172A', justifyContent: 'center' },
  bottomControlBar: { height: 100, flexShrink: 0, flexDirection: 'row', paddingVertical: 0, backgroundColor: '#0F172A', borderTopWidth: 1, borderTopColor: '#1E293B', alignItems: 'center', overflow: 'visible', zIndex: 5 },
  timelineChipRow: { flex: 1, height: 100, minWidth: 0, overflow: 'visible', zIndex: 6 },
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