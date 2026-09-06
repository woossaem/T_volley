import {
  ANONYMOUS_PLAYER_NAME,
  assignedUserId,
  isAnonymousSlotId,
  listHasUser,
  parseRosterUserIds,
  parseSetRosterMap,
} from './roster';

export type ScoreLogLike = {
  setNumber?: number | null;
  set_number?: number | null;
  set?: number | null;
  set_index?: number | null;
  setIndex?: number | null;
  player_id?: string | null;
  playerId?: string | null;
  playerName?: string | null;
  player_name?: string | null;
  name?: string | null;
  team_type?: string | null;
  teamType?: string | null;
  team?: string | null;
  side?: string | null;
  event_type?: string | null;
  is_canceled?: boolean | null;
  isCanceled?: boolean | null;
};

export type SetPlaySide = 'host' | 'away';

export type SetPlayResult = {
  played: boolean;
  side: SetPlaySide | null;
  source: 'lineup' | 'score_logs' | null;
};

const ANON_NAMES = new Set([
  ANONYMOUS_PLAYER_NAME,
  '무기명',
  'anonymous',
  'anon',
  '무명',
  '익명',
]);

function normName(value?: string | null): string {
  return String(value ?? '').trim();
}

export function isAnonymousScoreName(name?: string | null): boolean {
  const n = normName(name);
  if (!n) return true;
  return ANON_NAMES.has(n) || ANON_NAMES.has(n.toLowerCase());
}

function readLogPlayerId(log: ScoreLogLike): string {
  return String(log.player_id ?? log.playerId ?? '').trim();
}

function readLogPlayerName(log: ScoreLogLike): string {
  return normName(log.playerName ?? log.player_name ?? log.name);
}

/** 무기명/anonymous/null 로그는 어떤 선수 출전에도 매핑하지 않는다. */
export function isAnonymousScoreLog(log?: ScoreLogLike | null): boolean {
  if (!log) return true;
  const id = readLogPlayerId(log);
  const name = readLogPlayerName(log);
  const idMissing = !id || isAnonymousSlotId(id);
  const nameAnon = isAnonymousScoreName(name);
  return idMissing && nameAnon;
}

export function scoreLogSetNumber(log: ScoreLogLike): number | null {
  const numbered = log.setNumber ?? log.set_number ?? log.set;
  if (numbered != null && Number.isFinite(Number(numbered)) && Number(numbered) >= 1) {
    return Number(numbered);
  }
  const idx = log.set_index ?? log.setIndex;
  if (idx != null && Number.isFinite(Number(idx))) return Number(idx) + 1;
  return null;
}

export function scoreLogIsCanceled(log: ScoreLogLike): boolean {
  return !!(log.is_canceled ?? log.isCanceled);
}

function asLogArray(raw: unknown): ScoreLogLike[] {
  if (raw == null || raw === '') return [];
  if (Array.isArray(raw)) return raw.filter((item) => item && typeof item === 'object');
  if (typeof raw === 'string') {
    try {
      return asLogArray(JSON.parse(raw));
    } catch {
      return [];
    }
  }
  if (typeof raw === 'object') {
    const rec = raw as Record<string, unknown>;
    if (Array.isArray(rec.logs)) return asLogArray(rec.logs);
    if (Array.isArray(rec.events)) return asLogArray(rec.events);
    if (Array.isArray(rec.score_logs)) return asLogArray(rec.score_logs);
    if (Array.isArray(rec.scoreLogs)) return asLogArray(rec.scoreLogs);
    const nested: ScoreLogLike[] = [];
    Object.entries(rec).forEach(([key, value]) => {
      if (!Array.isArray(value)) return;
      const keyNum = Number(key);
      value.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const log = item as ScoreLogLike;
        if (scoreLogSetNumber(log) == null && Number.isFinite(keyNum)) {
          nested.push({
            ...log,
            setNumber: keyNum >= 1 ? keyNum : keyNum + 1,
          });
        } else {
          nested.push(log);
        }
      });
    });
    return nested;
  }
  return [];
}

function lineupIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => assignedUserId(item == null ? null : String(item)))
      .filter((id): id is string => !!id);
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      return lineupIds(JSON.parse(trimmed));
    } catch {
      return trimmed
        .split(',')
        .map((s) => assignedUserId(s.trim()))
        .filter((id): id is string => !!id);
    }
  }
  return parseRosterUserIds(value).filter((id) => !isAnonymousSlotId(id));
}

function rawMatchSets(match: any): any[] {
  if (Array.isArray(match?.match_sets)) return match.match_sets;
  if (Array.isArray(match?.sets)) return match.sets;
  return [];
}

export function parseMatchScoreLogs(match: any, extraLogs?: ScoreLogLike[]): ScoreLogLike[] {
  const fromColumn = [
    ...asLogArray(match?.score_logs),
    ...asLogArray(match?.scoreLogs),
  ];
  const fromEvents = [
    ...(Array.isArray(match?.match_events) ? match.match_events : []),
    ...(Array.isArray(match?.events) ? match.events : []),
    ...(extraLogs || []),
  ];
  return [...fromColumn, ...fromEvents];
}

export function scoreLogMatchesPlayer(
  log: ScoreLogLike,
  playerId: string,
  playerName?: string | null,
): boolean {
  if (!playerId || isAnonymousScoreLog(log)) return false;
  const logId = readLogPlayerId(log);
  if (logId && !isAnonymousSlotId(logId) && logId === playerId) return true;
  const logName = readLogPlayerName(log);
  const targetName = normName(playerName);
  if (logName && targetName && !isAnonymousScoreName(logName) && logName === targetName) return true;
  return false;
}

function inferSideFromValue(value?: string | null): SetPlaySide | null {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return null;
  if (v === 'host' || v === 'home' || v === 'a' || v === 'a팀') return 'host';
  if (v === 'away' || v === 'guest' || v === 'b' || v === 'b팀') return 'away';
  return null;
}

export function scoreLogSide(log: ScoreLogLike): SetPlaySide | null {
  return inferSideFromValue(log.team_type)
    || inferSideFromValue(log.teamType)
    || inferSideFromValue(log.team)
    || inferSideFromValue(log.side);
}

export function playerScoreLogInSet(
  logs: ScoreLogLike[],
  setNumber: number,
  playerId: string,
  playerName?: string | null,
): { appeared: boolean; side: SetPlaySide | null } {
  let side: SetPlaySide | null = null;
  let appeared = false;
  (logs || []).forEach((log) => {
    if (!log || scoreLogIsCanceled(log)) return;
    if (scoreLogSetNumber(log) !== setNumber) return;
    if (!scoreLogMatchesPlayer(log, playerId, playerName)) return;
    appeared = true;
    if (!side) side = scoreLogSide(log);
  });
  return { appeared, side };
}

export function setLineupsAreEmpty(match: any, setNumber: number): boolean {
  const lineups = resolveSetLineups(match, setNumber);
  return lineups.host.length === 0 && lineups.away.length === 0;
}

/** match_sets.host_lineup / away_lineup 을 우선하고, 비어 있으면 roster 맵으로 보완 */
export function resolveSetLineups(match: any, setNumber: number): { host: string[]; away: string[] } {
  const idx = Math.max(0, setNumber - 1);
  const rows = rawMatchSets(match);
  const row = rows.find((s: any) => Number(s?.set_number ?? s?.setNumber) === setNumber) || rows[idx];
  const hostFromSet = lineupIds(row?.host_lineup ?? row?.hostLineup);
  const awayFromSet = lineupIds(row?.away_lineup ?? row?.awayLineup);
  const hostMap = parseSetRosterMap(match?.host_roster);
  const awayMap = parseSetRosterMap(match?.away_roster);
  return {
    host: hostFromSet.length > 0 ? hostFromSet : (hostMap[idx] || hostMap[0] || []),
    away: awayFromSet.length > 0 ? awayFromSet : (awayMap[idx] || awayMap[0] || []),
  };
}

export function collectLineupPlayerIds(match: any): string[] {
  const ids = new Set<string>();
  rawMatchSets(match).forEach((row: any) => {
    lineupIds(row?.host_lineup ?? row?.hostLineup).forEach((id) => ids.add(id));
    lineupIds(row?.away_lineup ?? row?.awayLineup).forEach((id) => ids.add(id));
  });
  parseRosterUserIds(match?.host_roster).forEach((id) => ids.add(id));
  parseRosterUserIds(match?.away_roster).forEach((id) => ids.add(id));
  return Array.from(ids);
}

export function collectScoreLogPlayerIds(match: any, extraLogs?: ScoreLogLike[]): string[] {
  const ids = new Set<string>();
  parseMatchScoreLogs(match, extraLogs).forEach((log) => {
    if (scoreLogIsCanceled(log) || isAnonymousScoreLog(log)) return;
    const id = readLogPlayerId(log);
    if (id && !isAnonymousSlotId(id)) ids.add(id);
  });
  return Array.from(ids);
}

/**
 * 세트 출전 판정:
 * 1) match_sets host_lineup / away_lineup (또는 roster 보완)
 * 2) 라인업에 없어도 matches.score_logs(및 동일 의미의 득점 로그)에 해당 세트 행동이 있으면 출전
 * 무기명 로그는 무시한다.
 */
export function resolvePlayerSetPlay(
  match: any,
  setNumber: number,
  playerId: string,
  playerName?: string | null,
  extraLogs?: ScoreLogLike[],
): SetPlayResult {
  if (!playerId || !match) return { played: false, side: null, source: null };

  const lineups = resolveSetLineups(match, setNumber);
  const onHost = listHasUser(lineups.host, playerId);
  const onAway = listHasUser(lineups.away, playerId);
  if (onHost || onAway) {
    return { played: true, side: onHost ? 'host' : 'away', source: 'lineup' };
  }

  const hit = playerScoreLogInSet(
    parseMatchScoreLogs(match, extraLogs),
    setNumber,
    playerId,
    playerName,
  );
  if (hit.appeared) {
    return { played: true, side: hit.side, source: 'score_logs' };
  }

  return { played: false, side: null, source: null };
}
