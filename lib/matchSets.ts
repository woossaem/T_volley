import { supabase } from './supabase';
import { assignedUserId, parseSetFormationMap, parseSetRosterMap, persistCourtSlots, type SetFormation, type SetRosterMap } from './roster';

export type { SetRosterMap };

export interface MatchSetRecord {
  setNumber: number;
  hostScore: number;
  awayScore: number;
  hostLineup: string[];
  awayLineup: string[];
  hostBench?: string[];
  hostLate?: string[];
  awayBench?: string[];
  awayLate?: string[];
  hostFrontCount?: number;
  hostMiddleCount?: number;
  hostBackCount?: number;
  awayFrontCount?: number;
  awayMiddleCount?: number;
  awayBackCount?: number;
  isClosed: boolean;
}

export interface MatchSetsSnapshot {
  match: any | null;
  sets: MatchSetRecord[];
  liveSetIndex: number;
}

export interface MatchEventLike {
  set_index?: number;
  event_type?: string;
  is_canceled?: boolean;
  host_score?: number;
  away_score?: number;
  player_id?: string | null;
  player_name?: string | null;
  team_type?: string | null;
}

const BEST_OF_FIVE_WINS = 3;
export const MAX_SETS = 12;
export const DEFAULT_WINNING_SCORE = 21;
export const DEFAULT_LOSING_SCORE = 19;

export function makeDefaultQuickSetScore(): { hostScore: number; awayScore: number } {
  return { hostScore: DEFAULT_WINNING_SCORE, awayScore: DEFAULT_LOSING_SCORE };
}

export function normalizeSetRecords(sets: MatchSetRecord[]): MatchSetRecord[] {
  return [...sets]
    .sort((a, b) => (Number(a.setNumber) || 0) - (Number(b.setNumber) || 0))
    .map((s, i) => ({ ...s, setNumber: i + 1 }));
}

let matchSetsTableAvailable = true;

function asStringArray(value: unknown): string[] {
  const toSlot = (item: unknown) => {
    if (item == null || item === '') return '';
    const s = String(item).trim();
    if (!s || s === 'null' || s === 'undefined') return '';
    return s;
  };
  if (Array.isArray(value)) return value.map(toSlot);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(toSlot);
    } catch {
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export function listMatchSetRows(match: any): Array<{ setNumber: number; host_score: number; away_score: number }> {
  const raw = Array.isArray(match?.match_sets)
    ? match.match_sets
    : Array.isArray(match?.sets)
    ? match.sets
    : [];

  const fromTable: Array<{ host: number; away: number }> = [];
  if (raw.length > 0) {
    raw.forEach((s: any, i: number) => {
      const idx = Math.max(0, (Number(s?.set_number ?? s?.setNumber ?? i + 1) || i + 1) - 1);
      while (fromTable.length <= idx) fromTable.push({ host: 0, away: 0 });
      fromTable[idx] = {
        host: Number(s?.host_score ?? s?.hostScore ?? s?.host) || 0,
        away: Number(s?.away_score ?? s?.awayScore ?? s?.away) || 0,
      };
    });
  } else {
    fromTable.push(...parseSetScoresString(match?.set_scores));
  }

  const attachedEvents = match?.match_events || match?.events || [];
  const merged = mergeSetRowsWithEvents(fromTable, attachedEvents);

  return merged.map((s, i) => ({
    setNumber: i + 1,
    host_score: s.host,
    away_score: s.away,
  }));
}

export function extractMatchSetScores(match: any): { host: number; away: number }[] {
  return listMatchSetRows(match).map((s) => ({ host: s.host_score, away: s.away_score }));
}

/** 리포트 모달과 동일: match_events 마지막 점수로 세트별 host/away 복원 */
/** 해당 세트의 남은(미취소) 득점 이벤트를 재계산. 로그 0개면 0:0 */
export function lastScoreForSetFromEvents(events: MatchEventLike[], setIndex: number): { host: number; away: number } {
  let host = 0;
  let away = 0;
  (events || []).forEach((e) => {
    if (!e || e.is_canceled || e.event_type === 'sub') return;
    if (Number(e.set_index) !== setIndex) return;
    if (e.event_type === 'manual') {
      host = Number(e.host_score) || 0;
      away = Number(e.away_score) || 0;
      return;
    }
    if (e.event_type === 'score' || e.event_type === 'fault') {
      if (e.team_type === 'away') away += 1;
      else host += 1;
    }
  });
  return { host, away };
}

function asHostAwayScore(row: { host_score?: number; away_score?: number } | null | undefined): { host: number; away: number } {
  return {
    host: Number(row?.host_score) || 0,
    away: Number(row?.away_score) || 0,
  };
}

/** 화면 점수의 Single Source of Truth: match_sets.host_score / away_score */
export async function fetchSetScoreFromDb(
  matchId: string,
  setIndex: number,
): Promise<{ host: number; away: number } | null> {
  const setNumber = Math.max(1, setIndex + 1);
  if (matchSetsTableAvailable) {
    try {
      const { data, error } = await supabase
        .from('match_sets')
        .select('host_score, away_score')
        .eq('match_id', matchId)
        .eq('set_number', setNumber)
        .maybeSingle();
      if (!error && data) return asHostAwayScore(data as any);
      if (error) matchSetsTableAvailable = false;
    } catch {
      matchSetsTableAvailable = false;
    }
  }
  const { data: matchRow } = await supabase.from('matches').select('set_scores').eq('id', matchId).maybeSingle();
  const parts = parseSetScoresString(matchRow?.set_scores);
  if (parts[setIndex]) return parts[setIndex];
  return { host: 0, away: 0 };
}

/**
 * 라이브 세트 점수만 match_sets 에 UPDATE/INSERT 한다.
 * 다른 세트 행을 지우거나 라인업을 다시 쓰지 않는다.
 */
export async function writeLiveSetScore(
  matchId: string,
  setIndex: number,
  score: { host: number; away: number },
): Promise<{ host: number; away: number }> {
  const setNumber = Math.max(1, setIndex + 1);
  const host = Number(score.host) || 0;
  const away = Number(score.away) || 0;

  if (matchSetsTableAvailable) {
    try {
      const { data: existing, error: readError } = await supabase
        .from('match_sets')
        .select('id')
        .eq('match_id', matchId)
        .eq('set_number', setNumber)
        .maybeSingle();
      if (readError) {
        matchSetsTableAvailable = false;
      } else if (existing) {
        const { error } = await supabase
          .from('match_sets')
          .update({ host_score: host, away_score: away })
          .eq('match_id', matchId)
          .eq('set_number', setNumber);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('match_sets').insert({
          match_id: matchId,
          set_number: setNumber,
          host_score: host,
          away_score: away,
          is_closed: false,
        });
        if (error) throw error;
      }
    } catch (err) {
      if (matchSetsTableAvailable) throw err;
    }
  }

  const saved = await fetchSetScoreFromDb(matchId, setIndex);
  return saved || { host, away };
}

/**
 * 선수 교체 시 현재 세트의 라인업만 UPDATE/INSERT 한다.
 * match_sets 전체 DELETE/재삽입을 하지 않으므로 match_events 타임라인을 보존한다.
 */
export async function writeLiveSetLineup(
  matchId: string,
  setIndex: number,
  side: 'host' | 'away',
  lineup: string[],
): Promise<void> {
  const setNumber = Math.max(1, setIndex + 1);
  const column = side === 'host' ? 'host_lineup' : 'away_lineup';
  const court = persistCourtSlots(lineup);
  if (!matchSetsTableAvailable) return;
  try {
    const { data: existing, error: readError } = await supabase
      .from('match_sets')
      .select('id')
      .eq('match_id', matchId)
      .eq('set_number', setNumber)
      .maybeSingle();
    if (readError) {
      matchSetsTableAvailable = false;
      return;
    }
    if (existing?.id) {
      const { error } = await supabase
        .from('match_sets')
        .update({ [column]: court })
        .eq('id', existing.id);
      if (error) console.warn('[writeLiveSetLineup] update failed:', error.message);
      return;
    }
    const { error } = await supabase.from('match_sets').insert({
      match_id: matchId,
      set_number: setNumber,
      host_score: 0,
      away_score: 0,
      [column]: court,
      is_closed: false,
    });
    if (error) console.warn('[writeLiveSetLineup] insert failed:', error.message);
  } catch (err) {
    console.warn('[writeLiveSetLineup] skipped:', err);
  }
}

/**
 * 점수 취소/타임라인 삭제 후 해당 세트만 재계산해 match_sets + matches.set_scores 에 반영.
 * winner_team / 다른 세트 라인업은 건드리지 않는다.
 */
export async function syncSetScoreFromRemainingEvents(
  matchId: string,
  events: MatchEventLike[],
  setIndex: number,
): Promise<{ host: number; away: number }> {
  const score = lastScoreForSetFromEvents(events, setIndex);
  return writeLiveSetScore(matchId, setIndex, score);
}

export function lastScoresBySetFromEvents(events: MatchEventLike[]): { host: number; away: number }[] {
  const last = new Map<number, { host: number; away: number }>();
  (events || []).forEach((e) => {
    if (!e || e.is_canceled || e.event_type === 'sub') return;
    const idx = Number(e.set_index ?? 0);
    if (!Number.isFinite(idx) || idx < 0) return;
    last.set(idx, {
      host: Number(e.host_score) || 0,
      away: Number(e.away_score) || 0,
    });
  });
  if (last.size === 0) return [];
  const max = Math.max(...Array.from(last.keys()));
  const out: { host: number; away: number }[] = [];
  for (let i = 0; i <= max; i += 1) {
    out.push(last.get(i) || { host: 0, away: 0 });
  }
  return out;
}

export function mergeSetRowsWithEvents(
  existing: Array<{ host: number; away: number }>,
  events: MatchEventLike[],
): Array<{ host: number; away: number }> {
  const fromEvents = lastScoresBySetFromEvents(events);
  const activeSets = new Set<number>();
  (events || []).forEach((e) => {
    if (!e || e.is_canceled || e.event_type === 'sub') return;
    const idx = Number(e.set_index ?? 0);
    if (Number.isFinite(idx) && idx >= 0) activeSets.add(idx);
  });
  const max = Math.max(existing.length, fromEvents.length);
  const next: Array<{ host: number; away: number }> = [];
  for (let i = 0; i < max; i += 1) {
    const row = existing[i];
    const ev = fromEvents[i];
    if (activeSets.has(i)) next.push(ev || { host: 0, away: 0 });
    else if (row) next.push(row);
    else if (ev) next.push(ev);
  }
  return next;
}

/** 경기 마감 시 setHistory + 현재 세트 + match_sets + match_events 를 모두 모아 닫힌 세트 목록을 만든다. */
export function collectClosedSetScores(input: {
  history: string[];
  currentSetIndex: number;
  currentScores: { host: number; away: number };
  matchSets?: Array<{ hostScore?: number; awayScore?: number; host_score?: number; away_score?: number }>;
  events?: MatchEventLike[];
}): string[] {
  const fromHistory = parseSetScoresString((input.history || []).join(', '));
  const fromSets = (input.matchSets || []).map((s) => ({
    host: Number(s.hostScore ?? s.host_score) || 0,
    away: Number(s.awayScore ?? s.away_score) || 0,
  }));
  const fromEvents = lastScoresBySetFromEvents(input.events || []);
  const max = Math.max(
    fromHistory.length,
    fromSets.length,
    fromEvents.length,
    (Number(input.currentSetIndex) || 0) + 1,
    0,
  );

  const slots: Array<{ host: number; away: number }> = [];
  for (let i = 0; i < max; i += 1) {
    let pick = { host: 0, away: 0 };
    if (i === input.currentSetIndex) {
      pick = {
        host: Number(input.currentScores?.host) || 0,
        away: Number(input.currentScores?.away) || 0,
      };
    } else if (fromHistory[i] && (fromHistory[i].host > 0 || fromHistory[i].away > 0)) {
      pick = fromHistory[i];
    } else if (fromSets[i] && (fromSets[i].host > 0 || fromSets[i].away > 0)) {
      pick = fromSets[i];
    } else if (fromEvents[i] && (fromEvents[i].host > 0 || fromEvents[i].away > 0)) {
      pick = fromEvents[i];
    } else {
      pick = fromHistory[i] || fromSets[i] || fromEvents[i] || pick;
    }
    if (pick.host === 0 && pick.away === 0) {
      if (fromEvents[i] && (fromEvents[i].host > 0 || fromEvents[i].away > 0)) pick = fromEvents[i];
      else if (fromSets[i] && (fromSets[i].host > 0 || fromSets[i].away > 0)) pick = fromSets[i];
    }
    slots.push(pick);
  }

  while (slots.length > 1) {
    const i = slots.length - 1;
    const last = slots[i];
    const scored =
      last.host > 0 ||
      last.away > 0 ||
      (fromEvents[i] && (fromEvents[i].host > 0 || fromEvents[i].away > 0)) ||
      (fromSets[i] && (fromSets[i].host > 0 || fromSets[i].away > 0));
    if (!scored && i !== input.currentSetIndex) slots.pop();
    else break;
  }

  return slots.map((s) => `${s.host}:${s.away}`);
}

function setsNeedEventRepair(sets: MatchSetRecord[], events: MatchEventLike[]): boolean {
  const fromEvents = lastScoresBySetFromEvents(events);
  if (fromEvents.length > sets.length) return true;
  return sets.some((s, i) => {
    const ev = fromEvents[i];
    return !!ev && (ev.host > 0 || ev.away > 0) && s.hostScore === 0 && s.awayScore === 0;
  });
}

export function parseSetScoresString(scoreStr: string | null | undefined): { host: number; away: number }[] {
  if (!scoreStr || !String(scoreStr).trim()) return [];
  return String(scoreStr)
    .split(',')
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .map((chunk) => {
      const parts = chunk.split(/[:\-]/);
      const host = Number(parts[0]);
      const away = Number(parts[1]);
      return {
        host: Number.isFinite(host) ? host : 0,
        away: Number.isFinite(away) ? away : 0,
      };
    });
}

export function formatSetScoresString(sets: Array<{ hostScore: number; awayScore: number }>): string | null {
  if (!sets.length) return null;
  return sets.map((s) => `${s.hostScore}:${s.awayScore}`).join(', ');
}

export function parseRosterJson(rosterStr: unknown): SetRosterMap {
  return parseSetRosterMap(rosterStr);
}

export function rosterMapFromSets(sets: MatchSetRecord[], side: 'host' | 'away'): SetRosterMap {
  const map: SetRosterMap = {};
  sets.forEach((set, idx) => {
    map[idx] = side === 'host' ? set.hostLineup : set.awayLineup;
  });
  return map;
}

export function formationMapFromSets(sets: MatchSetRecord[], side: 'host' | 'away'): { [idx: number]: SetFormation } {
  const map: { [idx: number]: SetFormation } = {};
  sets.forEach((set, idx) => {
    map[idx] = side === 'host'
      ? { court: set.hostLineup || [], bench: set.hostBench || [], late: set.hostLate || [], frontCount: set.hostFrontCount, middleCount: set.hostMiddleCount, backCount: set.hostBackCount }
      : { court: set.awayLineup || [], bench: set.awayBench || [], late: set.awayLate || [], frontCount: set.awayFrontCount, middleCount: set.awayMiddleCount, backCount: set.awayBackCount };
  });
  return map;
}

export function countSetWins(sets: Array<{ hostScore: number; awayScore: number }>): { host: number; away: number } {
  let host = 0;
  let away = 0;
  sets.forEach((s) => {
    if (s.hostScore > s.awayScore) host += 1;
    else if (s.awayScore > s.hostScore) away += 1;
  });
  return { host, away };
}

/** 무승부 여부와 관계없이 세트 스코어를 `1:1 (21:18, 18:21)` 형태로 항상 노출 */
export function formatSetScoreDisplay(setScores?: string | null): string | null {
  const raw = setScores != null ? String(setScores).trim() : '';
  if (!raw) return null;
  const parsed = parseSetScoresString(raw);
  if (parsed.length === 0) return raw;
  const tally = countSetWins(parsed.map((s) => ({ hostScore: s.host, awayScore: s.away })));
  const details = parsed.map((s) => `${s.host}:${s.away}`).join(', ');
  return `${tally.host}:${tally.away} (${details})`;
}

/** match_sets + match_events 로 세트 점수를 복원해 카드/통계에 붙인다. */
export async function hydrateMatchesWithSetScores<T extends { id?: string; set_scores?: string | null }>(
  matches: T[],
): Promise<T[]> {
  const ids = matches.map((m) => m.id).filter(Boolean) as string[];
  if (ids.length === 0) return matches;

  try {
    const { data: setData } = await supabase
      .from('match_sets')
      .select('match_id, set_number, host_score, away_score, host_lineup, away_lineup')
      .in('match_id', ids)
      .order('set_number', { ascending: true });

    const eventsByMatch = new Map<string, MatchEventLike[]>();
    for (let i = 0; i < ids.length; i += 80) {
      const chunk = ids.slice(i, i + 80);
      const { data: evRows } = await supabase
        .from('match_events')
        .select('match_id, set_index, event_type, is_canceled, host_score, away_score, player_id, player_name, team_type')
        .in('match_id', chunk)
        .eq('is_canceled', false);
      (evRows || []).forEach((e: any) => {
        const list = eventsByMatch.get(e.match_id) || [];
        list.push(e);
        eventsByMatch.set(e.match_id, list);
      });
    }

    const byMatch = new Map<string, Array<{ host: number; away: number; host_lineup?: unknown; away_lineup?: unknown }>>();
    (setData || []).forEach((row: any) => {
      const list = byMatch.get(row.match_id) || [];
      const idx = Math.max(0, (Number(row.set_number) || 1) - 1);
      while (list.length <= idx) list.push({ host: 0, away: 0 });
      list[idx] = {
        host: Number(row.host_score) || 0,
        away: Number(row.away_score) || 0,
        host_lineup: row.host_lineup,
        away_lineup: row.away_lineup,
      };
      byMatch.set(row.match_id, list);
    });

    return matches.map((m) => {
      if (!m.id) return m;
      const origSets = Array.isArray((m as any).match_sets) ? (m as any).match_sets : [];
      const fromTable = byMatch.get(m.id) || parseSetScoresString((m as any).set_scores).map((s) => ({
        host: s.host,
        away: s.away,
      }));
      const merged = mergeSetRowsWithEvents(fromTable, eventsByMatch.get(m.id) || []);
      if (merged.length === 0) return m;
      const tableSets = byMatch.get(m.id) || [];
      const use = merged.map((s, i) => {
        const fromHydrate = tableSets[i];
        const fromOrig = origSets.find((row: any) => Number(row?.set_number ?? row?.setNumber) === i + 1) || origSets[i];
        const hostLineup = fromHydrate?.host_lineup ?? fromOrig?.host_lineup ?? fromOrig?.hostLineup;
        const awayLineup = fromHydrate?.away_lineup ?? fromOrig?.away_lineup ?? fromOrig?.awayLineup;
        return {
          set_number: i + 1,
          setNumber: i + 1,
          host_score: s.host,
          away_score: s.away,
          hostScore: s.host,
          awayScore: s.away,
          host_lineup: hostLineup,
          away_lineup: awayLineup,
          hostLineup,
          awayLineup,
        };
      });
      return {
        ...m,
        set_scores: formatSetScoresString(use.map((s) => ({ hostScore: s.host_score, awayScore: s.away_score }))),
        match_sets: use,
        sets: use,
        match_events: eventsByMatch.get(m.id) || (m as any).match_events,
      };
    });
  } catch {
    return matches;
  }
}

export function isBestOfFiveDecided(sets: Array<{ hostScore: number; awayScore: number }>): boolean {
  const { host, away } = countSetWins(sets);
  return host >= BEST_OF_FIVE_WINS || away >= BEST_OF_FIVE_WINS;
}

export function isMatchRecordingFinished(match: { status?: string; winner_team?: string | null } | null | undefined): boolean {
  if (!match) return false;
  if (['completed', 'pending_result', 'friendly', 'submitted'].includes(match.status || '')) return true;
  if (match.status === 'intramural' && !!match.winner_team) return true;
  return false;
}

function overlayLiveScoresFromEvents(sets: MatchSetRecord[], _events: MatchEventLike[]): MatchSetRecord[] {
  return sets;
}

export function liveIndexFromSets(sets: MatchSetRecord[], matchFinished: boolean): number {
  if (sets.length === 0) return 0;
  if (matchFinished || isBestOfFiveDecided(sets.filter((s) => s.isClosed))) {
    return Math.max(0, sets.filter((s) => s.isClosed).length - 1, 0);
  }
  const openIdx = sets.findIndex((s) => !s.isClosed);
  if (openIdx >= 0) return openIdx;
  return Math.max(0, sets.length - 1);
}

/** 관전 전광판용. SELECT 만 하고 upsert 하지 않는다. */
export async function listMatchSetsReadOnly(matchId: string): Promise<MatchSetRecord[]> {
  const { data: setRows, error } = await supabase
    .from('match_sets')
    .select('set_number, host_score, away_score, host_lineup, away_lineup, is_closed')
    .eq('match_id', matchId)
    .order('set_number', { ascending: true });
  if (error || !setRows || setRows.length === 0) return [];
  return normalizeSetRecords(setRows.map((row: any) => ({
    setNumber: Number(row.set_number) || 1,
    hostScore: Number(row.host_score) || 0,
    awayScore: Number(row.away_score) || 0,
    hostLineup: asStringArray(row.host_lineup),
    awayLineup: asStringArray(row.away_lineup),
    isClosed: !!row.is_closed,
  })));
}

function pushEmptySet(
  sets: MatchSetRecord[],
  idx: number,
  closed: boolean,
  hostRoster: SetRosterMap,
  awayRoster: SetRosterMap,
) {
  if (idx >= MAX_SETS) return;
  if (sets.some((s, i) => (s.setNumber || i + 1) === idx + 1)) return;
  sets.push({
    setNumber: idx + 1,
    hostScore: 0,
    awayScore: 0,
    hostLineup: hostRoster[idx] || hostRoster[0] || [],
    awayLineup: awayRoster[idx] || awayRoster[0] || [],
    isClosed: closed,
  });
}

/** 미진행(점수·이벤트 없는) 트레일링 세트를 걷어내 1세트만 남기거나, 세트마감으로 연 라이브 세트 1개만 유지 */
export function trimUnplayedTrailingSets(
  sets: MatchSetRecord[],
  events: MatchEventLike[],
  matchFinished: boolean,
): MatchSetRecord[] {
  if (matchFinished || sets.length <= 1) {
    return sets.length === 0 ? sets : sets.map((s, i) => ({ ...s, setNumber: i + 1 }));
  }
  const next = [...sets];
  while (next.length > 1) {
    const last = next[next.length - 1];
    const idx = next.length - 1;
    const hasEvents = events.some((e) => !e.is_canceled && (e.set_index ?? 0) === idx);
    const hasScore = last.hostScore > 0 || last.awayScore > 0;
    const liveCount = next.filter((s) => !s.isClosed).length;
    if (!hasEvents && !hasScore && (last.isClosed || liveCount > 1)) {
      next.pop();
      continue;
    }
    break;
  }
  return next.map((s, i) => ({ ...s, setNumber: i + 1 }));
}

export function makeInitialLiveSet(hostRoster: SetRosterMap = {}, awayRoster: SetRosterMap = {}): MatchSetRecord {
  return {
    setNumber: 1,
    hostScore: 0,
    awayScore: 0,
    hostLineup: hostRoster[0] || [],
    awayLineup: awayRoster[0] || [],
    isClosed: false,
  };
}

function appendLiveSetsFromEvents(
  sets: MatchSetRecord[],
  match: any,
  events: MatchEventLike[],
  hostRoster: SetRosterMap,
  awayRoster: SetRosterMap,
): MatchSetRecord[] {
  const finished = isMatchRecordingFinished(match);
  const decided = isBestOfFiveDecided(sets.filter((s) => s.isClosed));
  const closedAll = finished || decided;

  const eventSetIndexes = events
    .filter((e) => !e.is_canceled)
    .map((e) => e.set_index ?? 0);
  const maxEventSet = eventSetIndexes.length > 0 ? Math.max(...eventSetIndexes) : -1;

  if (maxEventSet >= 0) {
    for (let idx = 0; idx <= Math.min(maxEventSet, MAX_SETS - 1); idx += 1) {
      const hasEvents = events.some((e) => !e.is_canceled && (e.set_index ?? 0) === idx);
      if (hasEvents) pushEmptySet(sets, idx, closedAll, hostRoster, awayRoster);
    }
  }

  if (sets.length === 0) {
    pushEmptySet(sets, 0, closedAll, hostRoster, awayRoster);
  }

  return trimUnplayedTrailingSets(sets, events, closedAll);
}

function snapshotFromLegacy(match: any, events: MatchEventLike[]): MatchSetsSnapshot {
  const parsed = parseSetScoresString(match?.set_scores);
  const hostRoster = parseRosterJson(match?.host_roster);
  const awayRoster = parseRosterJson(match?.away_roster);
  const hostForm = parseSetFormationMap(match?.host_roster);
  const awayForm = parseSetFormationMap(match?.away_roster);
  const finished = isMatchRecordingFinished(match);

  const sets: MatchSetRecord[] = parsed.map((s, idx) => ({
    setNumber: idx + 1,
    hostScore: s.host,
    awayScore: s.away,
    hostLineup: hostRoster[idx] || hostRoster[0] || [],
    awayLineup: awayRoster[idx] || awayRoster[0] || [],
    hostBench: hostForm[idx]?.bench || hostForm[0]?.bench || [],
    hostLate: hostForm[idx]?.late || hostForm[0]?.late || [],
    awayBench: awayForm[idx]?.bench || awayForm[0]?.bench || [],
    awayLate: awayForm[idx]?.late || awayForm[0]?.late || [],
    hostFrontCount: hostForm[idx]?.frontCount || hostForm[0]?.frontCount,
    hostMiddleCount: hostForm[idx]?.middleCount || hostForm[0]?.middleCount,
    hostBackCount: hostForm[idx]?.backCount || hostForm[0]?.backCount,
    awayFrontCount: awayForm[idx]?.frontCount || awayForm[0]?.frontCount,
    awayMiddleCount: awayForm[idx]?.middleCount || awayForm[0]?.middleCount,
    awayBackCount: awayForm[idx]?.backCount || awayForm[0]?.backCount,
    isClosed: true,
  }));

  const normalized = normalizeSetRecords(appendLiveSetsFromEvents(sets, match, events, hostRoster, awayRoster));
  const overlayed = overlayLiveScoresFromEvents(normalized, events);
  return {
    match,
    sets: overlayed,
    liveSetIndex: liveIndexFromSets(overlayed, finished),
  };
}

export async function fetchMatchSets(matchId: string): Promise<MatchSetsSnapshot> {
  const { data: match, error: matchError } = await supabase.from('matches').select('*').eq('id', matchId).maybeSingle();
  if (matchError) throw matchError;

  const { data: eventData } = await supabase
    .from('match_events')
    .select('set_index, event_type, is_canceled, host_score, away_score')
    .eq('match_id', matchId)
    .order('created_at', { ascending: true });
  const events = (eventData || []) as MatchEventLike[];

  if (matchSetsTableAvailable) {
    const { data: setRows, error: setError } = await supabase
      .from('match_sets')
      .select('*')
      .eq('match_id', matchId)
      .order('set_number', { ascending: true });

    if (setError) {
      matchSetsTableAvailable = false;
    } else if (setRows && setRows.length > 0) {
      const hostRoster = parseRosterJson(match?.host_roster);
      const awayRoster = parseRosterJson(match?.away_roster);
      const hostForm = parseSetFormationMap(match?.host_roster);
      const awayForm = parseSetFormationMap(match?.away_roster);
      const sets: MatchSetRecord[] = setRows.map((row: any) => {
        const idx = Math.max(0, (row.set_number || 1) - 1);
        return {
          setNumber: row.set_number,
          hostScore: row.host_score || 0,
          awayScore: row.away_score || 0,
          hostLineup: asStringArray(row.host_lineup).length > 0 ? asStringArray(row.host_lineup) : (hostRoster[idx] || []),
          awayLineup: asStringArray(row.away_lineup).length > 0 ? asStringArray(row.away_lineup) : (awayRoster[idx] || []),
          hostBench: hostForm[idx]?.bench || hostForm[0]?.bench || [],
          hostLate: hostForm[idx]?.late || hostForm[0]?.late || [],
          awayBench: awayForm[idx]?.bench || awayForm[0]?.bench || [],
          awayLate: awayForm[idx]?.late || awayForm[0]?.late || [],
          hostFrontCount: hostForm[idx]?.frontCount || hostForm[0]?.frontCount,
          hostMiddleCount: hostForm[idx]?.middleCount || hostForm[0]?.middleCount,
          hostBackCount: hostForm[idx]?.backCount || hostForm[0]?.backCount,
          awayFrontCount: awayForm[idx]?.frontCount || awayForm[0]?.frontCount,
          awayMiddleCount: awayForm[idx]?.middleCount || awayForm[0]?.middleCount,
          awayBackCount: awayForm[idx]?.backCount || awayForm[0]?.backCount,
          isClosed: !!row.is_closed,
        };
      });
      const normalized = normalizeSetRecords(appendLiveSetsFromEvents(sets, match, events, hostRoster, awayRoster));
      const finished = isMatchRecordingFinished(match);
      const overlayed = overlayLiveScoresFromEvents(normalized, events);
      const repaired = finished && setsNeedEventRepair(overlayed, events)
        ? overlayed.map((s) => ({ ...s, isClosed: true }))
        : overlayed;
      const synced = normalizeSetRecords(repaired);
      const needsRenumber = sets.some((s, i) => s.setNumber !== i + 1);
      if (repaired !== overlayed || needsRenumber) {
        await upsertMatchSets(matchId, synced);
      }
      return {
        match,
        sets: synced,
        liveSetIndex: liveIndexFromSets(synced, finished),
      };
    }
  }

  const legacy = snapshotFromLegacy(match, events);
  if (isMatchRecordingFinished(match) && setsNeedEventRepair(legacy.sets, events)) {
    const repaired = legacy.sets.map((s) => ({ ...s, isClosed: true }));
    await upsertMatchSets(matchId, repaired);
    return { ...legacy, sets: repaired, liveSetIndex: liveIndexFromSets(repaired, true) };
  }
  return legacy;
}

export async function upsertMatchSets(matchId: string, sets: MatchSetRecord[]): Promise<void> {
  const normalized = normalizeSetRecords(sets);
  const closed = normalized.filter((s) => s.isClosed);
  const payload = {
    set_scores: formatSetScoresString(closed),
    host_roster: JSON.stringify(formationMapFromSets(normalized, 'host')),
    away_roster: JSON.stringify(formationMapFromSets(normalized, 'away')),
  };

  await supabase.from('matches').update(payload).eq('id', matchId);

  if (!matchSetsTableAvailable) return;

  try {
    await supabase.from('match_sets').delete().eq('match_id', matchId);

    if (normalized.length === 0) return;

    const rows = normalized.map((s) => ({
      match_id: matchId,
      set_number: s.setNumber,
      host_score: s.hostScore,
      away_score: s.awayScore,
      host_lineup: s.hostLineup,
      away_lineup: s.awayLineup,
      is_closed: s.isClosed,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('match_sets').insert(rows);
    if (error) matchSetsTableAvailable = false;
  } catch {
    matchSetsTableAvailable = false;
  }
}

export function deepCloneLineup(lineup: unknown): string[] {
  const src = Array.isArray(lineup) ? lineup : [];
  return JSON.parse(JSON.stringify(src));
}

function lineupHasAssignedPlayers(lineup: unknown): boolean {
  if (!Array.isArray(lineup) || lineup.length === 0) return false;
  return lineup.some((id) => !!assignedUserId(id == null ? null : String(id)));
}

/**
 * 저장 직전: 2·3세트 라인업이 비어 있으면 1세트를 Deep Copy 한다.
 * 사용자가 2·3세트 명단을 직접 배정한 경우 그 값을 유지한다.
 */
export function carrySet1LineupsToEmptySet2And3(
  hostRosters: SetRosterMap,
  awayRosters: SetRosterMap,
): { hostRosters: SetRosterMap; awayRosters: SetRosterMap } {
  const cloneMap = (src: SetRosterMap): SetRosterMap => {
    const next: SetRosterMap = {};
    Object.keys(src || {}).forEach((key) => {
      next[Number(key)] = deepCloneLineup(src[Number(key)]);
    });
    return next;
  };

  const host = cloneMap(hostRosters);
  const away = cloneMap(awayRosters);
  const host1 = deepCloneLineup(host[0]);
  const away1 = deepCloneLineup(away[0]);

  [1, 2].forEach((idx) => {
    if (!lineupHasAssignedPlayers(host[idx]) && lineupHasAssignedPlayers(host1)) {
      host[idx] = deepCloneLineup(host1);
    }
    if (!lineupHasAssignedPlayers(away[idx]) && lineupHasAssignedPlayers(away1)) {
      away[idx] = deepCloneLineup(away1);
    }
  });

  return { hostRosters: host, awayRosters: away };
}

export function recordsFromDynamicScores(
  scores: Array<{ hostScore: number; awayScore: number }>,
  hostRosters: SetRosterMap,
  awayRosters: SetRosterMap,
  allClosed: boolean,
): MatchSetRecord[] {
  const { hostRosters: host, awayRosters: away } = carrySet1LineupsToEmptySet2And3(hostRosters, awayRosters);
  return scores.map((s, idx) => ({
    setNumber: idx + 1,
    hostScore: s.hostScore,
    awayScore: s.awayScore,
    hostLineup: deepCloneLineup(host[idx] || []),
    awayLineup: deepCloneLineup(away[idx] || []),
    isClosed: allClosed || idx < scores.length - 1,
  }));
}

function shiftFormationMap<T>(map: { [idx: number]: T }, removedIndex: number): { [idx: number]: T } {
  const next: { [idx: number]: T } = {};
  Object.keys(map).forEach((key) => {
    const n = Number(key);
    if (n === removedIndex) return;
    next[n > removedIndex ? n - 1 : n] = map[n];
  });
  return next;
}

/** 세트 삭제 후 남은 세트를 1부터 재인덱싱하고 match_sets / events / matches 캐시를 동기화.
 *  targetSetNumber 는 1-based set_number (배열 index 아님). */
export async function deleteSetAndReindex(matchId: string, targetSetNumber: number): Promise<MatchSetRecord[]> {
  const setIndex = Math.max(0, targetSetNumber - 1);
  const { data: eventRows } = await supabase
    .from('match_events')
    .select('id, set_index')
    .eq('match_id', matchId);

  const events = eventRows || [];
  const toDelete = events.filter((e) => Number(e.set_index) === setIndex).map((e) => e.id);
  const toShift = events
    .filter((e) => Number(e.set_index) > setIndex)
    .sort((a, b) => Number(a.set_index) - Number(b.set_index));

  if (toDelete.length > 0) {
    await supabase.from('match_events').delete().in('id', toDelete);
  }
  for (const e of toShift) {
    await supabase.from('match_events').update({ set_index: Number(e.set_index) - 1 }).eq('id', e.id);
  }

  const { data: match } = await supabase.from('matches').select('*').eq('id', matchId).maybeSingle();
  const hostForm = shiftFormationMap(parseSetFormationMap(match?.host_roster), setIndex);
  const awayForm = shiftFormationMap(parseSetFormationMap(match?.away_roster), setIndex);

  const toRecord = (row: any, i: number): MatchSetRecord => ({
    setNumber: i + 1,
    hostScore: Number(row.host_score ?? row.hostScore ?? row.host) || 0,
    awayScore: Number(row.away_score ?? row.awayScore ?? row.away) || 0,
    hostLineup: asStringArray(row.host_lineup ?? row.hostLineup).length > 0
      ? asStringArray(row.host_lineup ?? row.hostLineup)
      : persistCourtSlots(hostForm[i]?.court),
    awayLineup: asStringArray(row.away_lineup ?? row.awayLineup).length > 0
      ? asStringArray(row.away_lineup ?? row.awayLineup)
      : persistCourtSlots(awayForm[i]?.court),
    hostBench: hostForm[i]?.bench || [],
    hostLate: hostForm[i]?.late || [],
    awayBench: awayForm[i]?.bench || [],
    awayLate: awayForm[i]?.late || [],
    hostFrontCount: hostForm[i]?.frontCount,
    hostMiddleCount: hostForm[i]?.middleCount,
    hostBackCount: hostForm[i]?.backCount,
    awayFrontCount: awayForm[i]?.frontCount,
    awayMiddleCount: awayForm[i]?.middleCount,
    awayBackCount: awayForm[i]?.backCount,
    isClosed: row.is_closed ?? row.isClosed ?? true,
  });

  let remaining: MatchSetRecord[] = [];
  let loadedFromTable = false;

  if (matchSetsTableAvailable) {
    const { data: setRows, error: setError } = await supabase
      .from('match_sets')
      .select('*')
      .eq('match_id', matchId)
      .order('set_number', { ascending: true });

    if (setError) {
      matchSetsTableAvailable = false;
    } else if (setRows && setRows.length > 0) {
      loadedFromTable = true;
      const sorted = [...setRows].sort(
        (a: any, b: any) => (Number(a.set_number) || 0) - (Number(b.set_number) || 0)
      );
      const kept = sorted.filter((_, i) => i !== setIndex);
      remaining = normalizeSetRecords(kept.map((row: any, i: number) => toRecord(row, i)));
    }
  }

  if (!loadedFromTable) {
    const parsed = parseSetScoresString(match?.set_scores);
    remaining = parsed
      .filter((_, i) => i !== setIndex)
      .map((s, i) => toRecord({ host: s.host, away: s.away, isClosed: true }, i));
  }

  remaining = normalizeSetRecords(remaining);

  await supabase.from('match_sets').delete().eq('match_id', matchId);
  if (remaining.length > 0 && matchSetsTableAvailable) {
    const { error: insertError } = await supabase.from('match_sets').insert(
      remaining.map((s) => ({
        match_id: matchId,
        set_number: s.setNumber,
        host_score: s.hostScore,
        away_score: s.awayScore,
        host_lineup: s.hostLineup,
        away_lineup: s.awayLineup,
        is_closed: s.isClosed,
        updated_at: new Date().toISOString(),
      }))
    );
    if (insertError) matchSetsTableAvailable = false;
  }

  const closed = remaining.filter((s) => s.isClosed);
  await supabase.from('matches').update({
    set_scores: formatSetScoresString(closed),
    host_roster: JSON.stringify(hostForm),
    away_roster: JSON.stringify(awayForm),
  }).eq('id', matchId);

  return remaining;
}

export function dynamicScoresFromSets(sets: MatchSetRecord[]): Array<{ hostScore: number; awayScore: number }> {
  return sets.map((s) => ({ hostScore: s.hostScore, awayScore: s.awayScore }));
}
