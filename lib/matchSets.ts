import { supabase } from './supabase';
import { parseSetFormationMap, parseSetRosterMap, type SetFormation, type SetRosterMap } from './roster';

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
  hostBackCount?: number;
  awayFrontCount?: number;
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
}

const BEST_OF_FIVE_WINS = 3;
export const MAX_SETS = 5;

let matchSetsTableAvailable = true;

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return value.split(',').map((s) => s.trim()).filter(Boolean);
    }
  }
  return [];
}

export function parseSetScoresString(scoreStr: string | null | undefined): { host: number; away: number }[] {
  if (!scoreStr || !String(scoreStr).trim()) return [];
  return String(scoreStr).split(',').map((chunk) => {
    const [h, a] = chunk.trim().split(':').map(Number);
    return { host: h || 0, away: a || 0 };
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
      ? { court: set.hostLineup || [], bench: set.hostBench || [], late: set.hostLate || [], frontCount: set.hostFrontCount, backCount: set.hostBackCount }
      : { court: set.awayLineup || [], bench: set.awayBench || [], late: set.awayLate || [], frontCount: set.awayFrontCount, backCount: set.awayBackCount };
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

export function isBestOfFiveDecided(sets: Array<{ hostScore: number; awayScore: number }>): boolean {
  const { host, away } = countSetWins(sets);
  return host >= BEST_OF_FIVE_WINS || away >= BEST_OF_FIVE_WINS;
}

export function isMatchRecordingFinished(match: { status?: string; winner_team?: string | null } | null | undefined): boolean {
  if (!match) return false;
  if (['completed', 'pending_result', 'friendly'].includes(match.status || '')) return true;
  if (match.status === 'intramural' && !!match.winner_team) return true;
  return false;
}

function overlayLiveScoresFromEvents(sets: MatchSetRecord[], events: MatchEventLike[]): MatchSetRecord[] {
  if (!events.length) return sets;
  return sets.map((set, idx) => {
    if (set.isClosed) return set;
    const valid = events.filter(
      (e) => e.set_index === idx && !e.is_canceled && e.event_type !== 'sub'
    );
    if (valid.length === 0) return set;
    const last = valid[valid.length - 1];
    return {
      ...set,
      hostScore: last.host_score || 0,
      awayScore: last.away_score || 0,
    };
  });
}

function liveIndexFromSets(sets: MatchSetRecord[], matchFinished: boolean): number {
  if (sets.length === 0) return 0;
  if (matchFinished || isBestOfFiveDecided(sets.filter((s) => s.isClosed))) {
    return Math.max(0, sets.filter((s) => s.isClosed).length - 1, 0);
  }
  const openIdx = sets.findIndex((s) => !s.isClosed);
  if (openIdx >= 0) return openIdx;
  return Math.min(Math.max(0, sets.length - 1), MAX_SETS - 1);
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
  if (finished || decided) return sets;

  const eventSetIndexes = events
    .filter((e) => !e.is_canceled)
    .map((e) => e.set_index ?? 0);
  const maxEventSet = eventSetIndexes.length > 0 ? Math.max(...eventSetIndexes) : -1;

  const pushLiveSet = (idx: number) => {
    if (idx >= MAX_SETS) return;
    if (sets.some((s) => s.setNumber === idx + 1)) return;
    sets.push({
      setNumber: idx + 1,
      hostScore: 0,
      awayScore: 0,
      hostLineup: hostRoster[idx] || hostRoster[0] || [],
      awayLineup: awayRoster[idx] || awayRoster[0] || [],
      isClosed: false,
    });
  };

  if (sets.length === 0) {
    pushLiveSet(0);
  } else if (maxEventSet >= sets.length) {
    for (let idx = sets.length; idx <= Math.min(maxEventSet, MAX_SETS - 1); idx += 1) {
      pushLiveSet(idx);
    }
  } else if (maxEventSet === sets.length - 1) {
    sets[sets.length - 1] = { ...sets[sets.length - 1], isClosed: false };
  } else if (match?.status === 'intramural' && !match?.winner_team && maxEventSet < 0) {
    sets[sets.length - 1] = { ...sets[sets.length - 1], isClosed: false };
  } else if (!sets.some((s) => !s.isClosed) && sets.length < MAX_SETS) {
    pushLiveSet(sets.length);
  }

  return sets;
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
    hostBackCount: hostForm[idx]?.backCount || hostForm[0]?.backCount,
    awayFrontCount: awayForm[idx]?.frontCount || awayForm[0]?.frontCount,
    awayBackCount: awayForm[idx]?.backCount || awayForm[0]?.backCount,
    isClosed: true,
  }));

  appendLiveSetsFromEvents(sets, match, events, hostRoster, awayRoster);
  const overlayed = overlayLiveScoresFromEvents(sets, events);
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
          hostBackCount: hostForm[idx]?.backCount || hostForm[0]?.backCount,
          awayFrontCount: awayForm[idx]?.frontCount || awayForm[0]?.frontCount,
          awayBackCount: awayForm[idx]?.backCount || awayForm[0]?.backCount,
          isClosed: !!row.is_closed,
        };
      });
      appendLiveSetsFromEvents(sets, match, events, hostRoster, awayRoster);
      const finished = isMatchRecordingFinished(match);
      const overlayed = overlayLiveScoresFromEvents(sets, events);
      return {
        match,
        sets: overlayed,
        liveSetIndex: liveIndexFromSets(overlayed, finished),
      };
    }
  }

  return snapshotFromLegacy(match, events);
}

export async function upsertMatchSets(matchId: string, sets: MatchSetRecord[]): Promise<void> {
  const closed = sets.filter((s) => s.isClosed);
  const scored = sets.filter((s) => s.isClosed || s.hostScore > 0 || s.awayScore > 0);
  const payload = {
    set_scores: formatSetScoresString(closed.length > 0 ? closed : scored),
    host_roster: JSON.stringify(formationMapFromSets(sets, 'host')),
    away_roster: JSON.stringify(formationMapFromSets(sets, 'away')),
  };

  await supabase.from('matches').update(payload).eq('id', matchId);

  if (!matchSetsTableAvailable) return;

  try {
    const maxSet = Math.max(0, ...sets.map((s) => s.setNumber));
    if (maxSet > 0) {
      await supabase.from('match_sets').delete().eq('match_id', matchId).gt('set_number', maxSet);
    } else {
      await supabase.from('match_sets').delete().eq('match_id', matchId);
    }

    if (sets.length === 0) return;

    const rows = sets.map((s) => ({
      match_id: matchId,
      set_number: s.setNumber,
      host_score: s.hostScore,
      away_score: s.awayScore,
      host_lineup: s.hostLineup,
      away_lineup: s.awayLineup,
      is_closed: s.isClosed,
      updated_at: new Date().toISOString(),
    }));

    const { error } = await supabase.from('match_sets').upsert(rows, { onConflict: 'match_id,set_number' });
    if (error) matchSetsTableAvailable = false;
  } catch {
    matchSetsTableAvailable = false;
  }
}

export function recordsFromDynamicScores(
  scores: Array<{ hostScore: number; awayScore: number }>,
  hostRosters: SetRosterMap,
  awayRosters: SetRosterMap,
  allClosed: boolean,
): MatchSetRecord[] {
  return scores.map((s, idx) => ({
    setNumber: idx + 1,
    hostScore: s.hostScore,
    awayScore: s.awayScore,
    hostLineup: hostRosters[idx] || [],
    awayLineup: awayRosters[idx] || [],
    isClosed: allClosed || idx < scores.length - 1,
  }));
}

export async function deleteSetAndReindex(matchId: string, setIndex: number): Promise<void> {
  const { data: eventRows } = await supabase
    .from('match_events')
    .select('id, set_index')
    .eq('match_id', matchId);

  const events = eventRows || [];
  const toDelete = events.filter((e) => Number(e.set_index) === setIndex).map((e) => e.id);
  const toShift = events.filter((e) => Number(e.set_index) > setIndex);

  if (toDelete.length > 0) {
    await supabase.from('match_events').delete().in('id', toDelete);
  }
  await Promise.all(
    toShift.map((e) =>
      supabase.from('match_events').update({ set_index: Number(e.set_index) - 1 }).eq('id', e.id)
    )
  );
}

export function dynamicScoresFromSets(sets: MatchSetRecord[]): Array<{ hostScore: number; awayScore: number }> {
  return sets.map((s) => ({ hostScore: s.hostScore, awayScore: s.awayScore }));
}
