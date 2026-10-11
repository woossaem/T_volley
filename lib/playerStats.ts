import { isSameName } from './nameUtils';
import { listMatchSetRows } from './matchSets';
import { parseMatchScoreLogs, resolvePlayerSetPlay, type ScoreLogLike } from './rankingService';
import { isAnonymousSlotId, isMemberUserId, listHasUser, parseRosterUserIds, safeIncludes } from './roster';
import { attributeTimelineEvents, courtsBySetFromRoster } from './slotAttribution';

export interface PlayerCareerStats {
  points: number;
  faults: number;
  setsPlayed: number;
  setWins: number;
  setDraws: number;
  setLosses: number;
  setWinRate: number;
  matchesPlayed: number;
  matchWins: number;
  matchDraws: number;
  matchLosses: number;
  matchWinRate: number;
}

export type SetSide = 'host' | 'away';
export type SetOutcome = 'win' | 'loss' | 'draw';

export type PlayerEventLike = ScoreLogLike & {
  match_id?: string;
  player_id?: string | null;
  event_type?: string;
  is_canceled?: boolean;
  set_index?: number;
  host_score?: number;
  away_score?: number;
};

const EMPTY_STATS: PlayerCareerStats = {
  points: 0,
  faults: 0,
  setsPlayed: 0,
  setWins: 0,
  setDraws: 0,
  setLosses: 0,
  setWinRate: 0,
  matchesPlayed: 0,
  matchWins: 0,
  matchDraws: 0,
  matchLosses: 0,
  matchWinRate: 0,
};

export function evaluateSetOutcome(hostScore: number, awayScore: number, playedAs: SetSide): SetOutcome {
  const host = Number(hostScore) || 0;
  const away = Number(awayScore) || 0;
  if (host > away) return playedAs === 'host' ? 'win' : 'loss';
  if (away > host) return playedAs === 'away' ? 'win' : 'loss';
  return 'draw';
}

export function formatSetRecordLabel(wins: number, draws: number, losses: number): string {
  return draws > 0 ? `${wins}승 ${draws}무 ${losses}패` : `${wins}승 ${losses}패`;
}

/** 경기 승수와 세트 승수 혼동 방지 */
export function formatSetWinAppearance(setWins: number, setsPlayed: number): string {
  return `${setWins}세트 승 (${setsPlayed}세트 출전)`;
}

export type SetFormMark = 'WIN' | 'DRAW' | 'LOSS';

/** 출전 세트 결과를 최근 순으로 모은다. rankingService 파싱 본체는 호출만 한다. */
export function collectPlayerSetForm(
  matches: any[],
  userId: string,
  playerName?: string | null,
): SetFormMark[] {
  const form: SetFormMark[] = [];
  if (!userId) return form;
  (matches || []).forEach((match) => {
    const logs = parseMatchScoreLogs(match);
    readMatchSets(match, logs).forEach((set) => {
      const play = resolvePlayerSetPlay(match, set.set_number, userId, playerName, logs);
      if (!play.played) return;
      const outcome = evaluateSetOutcome(set.host_score, set.away_score, play.side || 'host');
      form.push(outcome === 'win' ? 'WIN' : outcome === 'draw' ? 'DRAW' : 'LOSS');
    });
  });
  return form;
}

export function emptyPlayerCareerStats(): PlayerCareerStats {
  return { ...EMPTY_STATS };
}

export function isScoringEvent(eventType?: string | null) {
  return eventType === 'score' || eventType === 'fault' || eventType === 'manual';
}

export function isPersonalKill(eventType?: string | null) {
  return eventType === 'score';
}

export function isPersonalFault(eventType?: string | null) {
  return eventType === 'fault';
}

function resultAgainstWinner(match: any, side: SetSide): 'win' | 'loss' | 'draw' | null {
  const winner = String(match?.winner_team || '').trim();
  if (!winner) return null;
  if (winner === 'draw' || winner === '무승부') return 'draw';
  const myTeam = side === 'away' ? match?.away_team_name : match?.host_team_name;
  const otherTeam = side === 'away' ? match?.host_team_name : match?.away_team_name;
  const hostLabel = side === 'host' && (winner === 'A팀' || winner === '홈팀');
  const awayLabel = side === 'away' && (winner === 'B팀' || winner === '어웨이팀');
  if (hostLabel || awayLabel || isSameName(winner, myTeam)) return 'win';
  if (isSameName(winner, otherTeam) || winner === 'A팀' || winner === 'B팀' || winner === '홈팀' || winner === '어웨이팀') {
    return 'loss';
  }
  return 'loss';
}

export function readMatchSets(
  match: any,
  events?: ScoreLogLike[],
): Array<{ set_number: number; host_score: number; away_score: number }> {
  return listMatchSetRows({
    ...match,
    match_events: match?.match_events || match?.events || events,
  }).map((s) => ({
    set_number: s.setNumber,
    host_score: s.host_score,
    away_score: s.away_score,
  }));
}

export function addMatchPlayerStats(
  acc: PlayerCareerStats,
  userId: string,
  match: any,
  events: ScoreLogLike[],
  playerName?: string | null,
): PlayerCareerStats {
  if (!isMemberUserId(userId) || !match) return acc;

  const inHost = listHasUser(parseRosterUserIds(match.host_roster), userId) || safeIncludes(match.host_roster, userId);
  const inAway = listHasUser(parseRosterUserIds(match.away_roster), userId) || safeIncludes(match.away_roster, userId);
  const inHostMerc = listHasUser(parseRosterUserIds(match.host_mercenary_roster), userId) || safeIncludes(match.host_mercenary_roster, userId);
  const inAwayMerc = listHasUser(parseRosterUserIds(match.away_mercenary_roster), userId) || safeIncludes(match.away_mercenary_roster, userId);

  const setRows = readMatchSets(match, events);
  const hasSetPlay = setRows.some((set) =>
    resolvePlayerSetPlay(match, set.set_number, userId, playerName, events).played,
  );

  if (!inHost && !inAway && !inHostMerc && !inAwayMerc && !hasSetPlay) return acc;

  let playedThisMatch = false;
  let setWinsThisMatch = 0;
  let setLossesThisMatch = 0;
  let lastSide: SetSide | null = null;

  setRows.forEach((set) => {
    const appearance = resolvePlayerSetPlay(match, set.set_number, userId, playerName, events);
    if (!appearance.played) return;
    const playedAs: SetSide | null = appearance.side;

    playedThisMatch = true;
    if (playedAs) lastSide = playedAs;
    acc.setsPlayed += 1;
    if (!playedAs) return;

    const myScore = playedAs === 'host' ? set.host_score : set.away_score;
    const oppScore = playedAs === 'host' ? set.away_score : set.host_score;
    if (myScore > oppScore) {
      acc.setWins += 1;
      setWinsThisMatch += 1;
    } else if (myScore < oppScore) {
      acc.setLosses += 1;
      setLossesThisMatch += 1;
    } else {
      acc.setDraws += 1;
    }
  });

  if (playedThisMatch) {
    acc.matchesPlayed += 1;
    const fromWinner = lastSide ? resultAgainstWinner(match, lastSide) : null;
    const outcome = fromWinner
      ?? (setWinsThisMatch > setLossesThisMatch ? 'win' : setLossesThisMatch > setWinsThisMatch ? 'loss' : 'draw');
    if (outcome === 'win') acc.matchWins += 1;
    else if (outcome === 'loss') acc.matchLosses += 1;
    else acc.matchDraws += 1;
  }

  const attributedEvents = attributeTimelineEvents(
    events,
    courtsBySetFromRoster(match.host_roster),
    courtsBySetFromRoster(match.away_roster),
  );
  attributedEvents.forEach((e) => {
    if (!e || e.is_canceled) return;
    const eventPlayerId = String(e.player_id ?? e.playerId ?? '').trim();
    if (!eventPlayerId || isAnonymousSlotId(eventPlayerId) || eventPlayerId !== userId) return;
    if (isPersonalKill(e.event_type)) acc.points += 1;
    if (isPersonalFault(e.event_type)) acc.faults += 1;
  });

  acc.setWinRate = acc.setsPlayed > 0 ? Math.round((acc.setWins / acc.setsPlayed) * 100) : 0;
  acc.matchWinRate = acc.matchesPlayed > 0 ? Math.round((acc.matchWins / acc.matchesPlayed) * 100) : 0;
  return acc;
}

export function finalizePlayerStats(acc: PlayerCareerStats): PlayerCareerStats {
  acc.setWinRate = acc.setsPlayed > 0 ? Math.round((acc.setWins / acc.setsPlayed) * 100) : 0;
  acc.matchWinRate = acc.matchesPlayed > 0 ? Math.round((acc.matchWins / acc.matchesPlayed) * 100) : 0;
  return acc;
}
