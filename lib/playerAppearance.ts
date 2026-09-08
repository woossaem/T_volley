import { isSameName, resolveTeamNameOrNull } from './nameUtils';
import { readMatchSets } from './playerStats';
import {
  listHasUser,
  parseRosterUserIds,
  parseSetFormation,
  safeIncludes,
} from './roster';
import {
  parseMatchScoreLogs,
  resolvePlayerSetPlay,
  resolveSetLineups,
  scoreLogIsCanceled,
  scoreLogMatchesPlayer,
  scoreLogSide,
  type ScoreLogLike,
  type SetPlaySide,
} from './rankingService';
import { bareTeamName } from './teamStatus';

function rosterOnSide(match: any, userId: string, side: SetPlaySide): boolean {
  const roster = side === 'host' ? match?.host_roster : match?.away_roster;
  const merc = side === 'host' ? match?.host_mercenary_roster : match?.away_mercenary_roster;
  return (
    listHasUser(parseRosterUserIds(roster), userId)
    || safeIncludes(roster, userId)
    || listHasUser(parseRosterUserIds(merc), userId)
    || safeIncludes(merc, userId)
  );
}

export function isMercenaryOnMatch(match: any, userId: string): boolean {
  if (!userId || !match) return false;
  return (
    listHasUser(parseRosterUserIds(match.host_mercenary_roster), userId)
    || listHasUser(parseRosterUserIds(match.away_mercenary_roster), userId)
  );
}

export function matchTeamNameOnSide(match: any, side: SetPlaySide): string {
  return side === 'away'
    ? String(match?.away_team_name ?? '').trim()
    : String(match?.host_team_name ?? '').trim();
}

export function isSameTeamLabel(a: unknown, b: unknown): boolean {
  return isSameName(
    bareTeamName(resolveTeamNameOrNull(a) || ''),
    bareTeamName(resolveTeamNameOrNull(b) || ''),
  );
}

export function playerAppearedForTeam(
  match: any,
  userId: string,
  teamName: string,
  playerName?: string | null,
  extraLogs?: ScoreLogLike[],
): boolean {
  if (!userId || !match || !teamName) return false;
  if (!playerAppearedInMatch(match, userId, playerName, extraLogs)) return false;
  const side = resolvePlayerMatchSide(match, userId, playerName, extraLogs);
  if (!side) {
    return isSameTeamLabel(match?.host_team_name, teamName) || isSameTeamLabel(match?.away_team_name, teamName);
  }
  return isSameTeamLabel(matchTeamNameOnSide(match, side), teamName);
}

/** 라인업 → score_logs/match_events 이중 폴백으로 출전 여부 판정 */
export function playerAppearedInMatch(
  match: any,
  userId: string,
  playerName?: string | null,
  extraLogs?: ScoreLogLike[],
): boolean {
  if (!userId || !match) return false;
  const logs = parseMatchScoreLogs(match, extraLogs);
  const setRows = readMatchSets(match, logs);
  if (setRows.some((set) => resolvePlayerSetPlay(match, set.set_number, userId, playerName, logs).played)) {
    return true;
  }
  return rosterOnSide(match, userId, 'host') || rosterOnSide(match, userId, 'away');
}

export function resolvePlayerMatchSide(
  match: any,
  userId: string,
  playerName?: string | null,
  extraLogs?: ScoreLogLike[],
): SetPlaySide | null {
  if (!userId || !match) return null;
  const logs = parseMatchScoreLogs(match, extraLogs);
  const setRows = readMatchSets(match, logs);
  for (const set of setRows) {
    const play = resolvePlayerSetPlay(match, set.set_number, userId, playerName, logs);
    if (play.played && play.side) return play.side;
  }
  if (rosterOnSide(match, userId, 'host')) return 'host';
  if (rosterOnSide(match, userId, 'away')) return 'away';
  return null;
}

export function collectTeammateIds(
  match: any,
  userId: string,
  playerName?: string | null,
  extraLogs?: ScoreLogLike[],
): string[] {
  if (!userId || !match) return [];
  const side = resolvePlayerMatchSide(match, userId, playerName, extraLogs);
  if (!side) return [];

  const ids = new Set<string>();
  const roster = side === 'host' ? match.host_roster : match.away_roster;
  parseRosterUserIds(roster).forEach((id) => {
    if (id && id !== userId) ids.add(id);
  });

  const logs = parseMatchScoreLogs(match, extraLogs);
  readMatchSets(match, logs).forEach((set) => {
    const play = resolvePlayerSetPlay(match, set.set_number, userId, playerName, logs);
    if (!play.played) return;
    const lineups = resolveSetLineups(match, set.set_number);
    const mates = (play.side || side) === 'away' ? lineups.away : lineups.host;
    mates.forEach((id) => {
      if (id && id !== userId) ids.add(id);
    });
  });

  logs.forEach((log) => {
    if (!log || scoreLogIsCanceled(log)) return;
    if (scoreLogSide(log) !== side) return;
    if (scoreLogMatchesPlayer(log, userId, playerName)) return;
    const id = String(log.player_id ?? log.playerId ?? '').trim();
    if (id && id !== userId) ids.add(id);
  });

  return Array.from(ids);
}

/** 세트 라인업 슬롯을 인덱스 보존한 채 읽는다. rankingService 파싱 본체는 사용하지 않는다. */
export function rawSetLineupSlots(
  match: any,
  setNumber: number,
  side: SetPlaySide,
): Array<string | null> {
  const idx = Math.max(0, setNumber - 1);
  const rows = Array.isArray(match?.match_sets)
    ? match.match_sets
    : (Array.isArray(match?.sets) ? match.sets : []);
  const row = rows.find((s: any) => Number(s?.set_number ?? s?.setNumber) === setNumber) || rows[idx];
  const raw = side === 'host'
    ? (row?.host_lineup ?? row?.hostLineup)
    : (row?.away_lineup ?? row?.awayLineup);
  if (Array.isArray(raw)) {
    return raw.map((id) => {
      if (id == null || id === '') return null;
      const s = String(id).trim();
      return s && s !== 'null' && s !== 'undefined' ? s : null;
    });
  }
  const roster = side === 'host' ? match?.host_roster : match?.away_roster;
  return parseSetFormation(roster, idx).court || [];
}
